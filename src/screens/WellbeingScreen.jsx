import { useState, useEffect, useCallback, useRef } from 'react';
import {
  DndContext, closestCenter, PointerSensor, TouchSensor,
  KeyboardSensor, useSensor, useSensors, DragOverlay,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, sortableKeyboardCoordinates, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useStore } from '../store';
import { todayStr, toDateStr, formatDisplayDate, getWeekStart, MONTH_NAMES_FULL } from '../data';

const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
function offsetDate(dateStr, delta) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ─── Drag handle (journal reorder) ────────────────────────────────────────────
function JournalDragHandle({ handleProps, theme }) {
  return (
    <div
      {...handleProps}
      className={`flex-shrink-0 flex flex-col gap-0.5 cursor-grab active:cursor-grabbing touch-none px-1 py-1 rounded ${theme.muted}`}
    >
      {[0,1,2].map(i => (
        <div key={i} className="flex gap-0.5">
          <div className="w-1 h-1 rounded-full bg-current"/>
          <div className="w-1 h-1 rounded-full bg-current"/>
        </div>
      ))}
    </div>
  );
}

// ─── Emotion data ─────────────────────────────────────────────────────────────
const EMOTIONS = [
  { id: 'energised',  label: 'Energised',  emoji: '⚡' },
  { id: 'calm',       label: 'Calm',       emoji: '😌' },
  { id: 'focused',    label: 'Focused',    emoji: '🎯' },
  { id: 'tired',      label: 'Tired',      emoji: '😴' },
  { id: 'anxious',    label: 'Anxious',    emoji: '😰' },
  { id: 'happy',      label: 'Happy',      emoji: '😊' },
  { id: 'sad',        label: 'Sad',        emoji: '☁️' },
  { id: 'frustrated', label: 'Frustrated', emoji: '🔥' },
  { id: 'grateful',   label: 'Grateful',   emoji: '🌱' },
  { id: 'hopeful',    label: 'Hopeful',    emoji: '🌟' },
  { id: 'lonely',     label: 'Lonely',     emoji: '😔' },
  { id: 'proud',      label: 'Proud',      emoji: '⭐' },
];

const MAX_EMOTIONS = 3;
const DEFAULT_PROMPT_IDS = ['jp-1', 'jp-2', 'jp-3'];

function isDueOn(activity, dateStr) {
  const days = activity.scheduledDays;
  if (!days || days.length === 0) return true;
  const dow = new Date(dateStr + 'T00:00:00').getDay();
  return days.includes(dow);
}

// ─── Date navigator ───────────────────────────────────────────────────────────
function DateNav({ dateStr, onChange, theme }) {
  const today = todayStr();
  function shift(days) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + days);
    const next = toDateStr(d);
    if (next <= today) onChange(next);
  }
  const isToday    = dateStr === today;
  const displayLbl = isToday
    ? 'Today'
    : new Date(dateStr + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <div className="flex items-center justify-between mb-4 px-1">
      <button onClick={() => shift(-1)} className={`w-8 h-8 flex items-center justify-center rounded-lg text-base ${theme.btnSecondary}`}>◀</button>
      <span className={`text-sm font-semibold ${theme.text}`}>{displayLbl}</span>
      <button onClick={() => shift(1)} disabled={isToday} className={`w-8 h-8 flex items-center justify-center rounded-lg text-base disabled:opacity-30 ${theme.btnSecondary}`}>▶</button>
    </div>
  );
}

// ─── Check-In tab ─────────────────────────────────────────────────────────────
// key={dateStr} on this component resets state when date changes
function CheckInTab({ theme, dateStr, gamify }) {
  const { checkIns, saveCheckIn, customEmotions, addCustomEmotion, deleteCustomEmotion } = useStore();
  const today    = todayStr();
  const existing = checkIns[dateStr] || null;
  const isPast   = dateStr < today;

  const [selected,    setSelected]    = useState(existing?.emotions || []);
  const [notes,       setNotes]       = useState(existing?.notes    || '');
  const [saved,       setSaved]       = useState(!!existing);
  const [showAddEmo,  setShowAddEmo]  = useState(false);
  const [newEmoEmoji, setNewEmoEmoji] = useState('');
  const [newEmoLabel, setNewEmoLabel] = useState('');
  const locked = saved;

  // Merge preset + custom emotions
  const allEmotions = [...EMOTIONS, ...(customEmotions || [])];

  function toggleEmotion(id) {
    if (locked) return;
    setSelected(prev => {
      if (prev.includes(id)) return prev.filter(e => e !== id);
      if (prev.length >= MAX_EMOTIONS) return prev;
      return [...prev, id];
    });
  }

  function handleSave() {
    saveCheckIn(dateStr, { emotions: selected, notes });
    setSaved(true);
  }

  function handleAddEmotion() {
    if (!newEmoLabel.trim() || !newEmoEmoji.trim()) return;
    addCustomEmotion({ label: newEmoLabel.trim(), emoji: newEmoEmoji.trim() });
    setNewEmoEmoji('');
    setNewEmoLabel('');
    setShowAddEmo(false);
  }

  return (
    <div>
      <div className="mb-4">
        <p className={`text-xs uppercase font-bold tracking-widest mb-0.5 ${theme.muted}`}>🌙 Inner Weather</p>
        <p className={`text-xs ${theme.muted}`}>
          {locked && existing ? `${selected.length} emotion${selected.length !== 1 ? 's' : ''} logged` : `Pick up to ${MAX_EMOTIONS} · ${selected.length}/${MAX_EMOTIONS} selected`}
        </p>
      </div>

      {/* Emotion grid — presets + custom */}
      <div className="grid grid-cols-4 gap-2 mb-3">
        {allEmotions.map(e => {
          const isSelected  = selected.includes(e.id);
          const isDisabled  = !isSelected && selected.length >= MAX_EMOTIONS && !locked;
          const isCustom    = !EMOTIONS.find(p => p.id === e.id);
          return (
            <div key={e.id} className="relative">
              <button
                onClick={() => toggleEmotion(e.id)}
                disabled={isDisabled || locked}
                className={`w-full flex flex-col items-center gap-1 py-3 rounded-xl border transition-all active:scale-95
                  ${isSelected
                    ? 'border-blue-500 bg-blue-500/10 shadow-sm'
                    : `${theme.card} ${theme.cardBorder} ${isDisabled ? 'opacity-40' : 'hover:border-blue-300'}`
                  }
                  ${locked && !isSelected ? 'opacity-40' : ''}
                `}
              >
                <span className="text-xl leading-none">{e.emoji}</span>
                <span className={`text-[10px] font-medium leading-tight text-center ${isSelected ? theme.tabActiveText : theme.muted}`}>
                  {e.label}
                </span>
              </button>
              {/* Delete button for custom emotions (only when not locked) */}
              {isCustom && !locked && (
                <button
                  onClick={() => { deleteCustomEmotion(e.id); setSelected(s => s.filter(id => id !== e.id)); }}
                  className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-400 text-white text-[9px] flex items-center justify-center leading-none shadow-sm"
                >×</button>
              )}
            </div>
          );
        })}
      </div>

      {/* Add custom emotion */}
      {!locked && (
        showAddEmo ? (
          <div className={`rounded-xl border p-3 mb-4 space-y-2 ${theme.card} ${theme.cardBorder}`}>
            <p className={`text-xs font-semibold ${theme.text}`}>Add your own emotion</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={newEmoEmoji}
                onChange={e => setNewEmoEmoji(e.target.value)}
                placeholder="😎"
                maxLength={2}
                autoFocus
                className={`w-14 text-center text-lg px-2 py-1.5 rounded-lg border outline-none ${theme.input}`}
              />
              <input
                type="text"
                value={newEmoLabel}
                onChange={e => setNewEmoLabel(e.target.value)}
                placeholder="Emotion name…"
                className={`flex-1 text-sm px-3 py-1.5 rounded-lg border outline-none ${theme.input}`}
              />
            </div>
            <div className="flex gap-2">
              <button onClick={handleAddEmotion} disabled={!newEmoLabel.trim() || !newEmoEmoji.trim()} className={`flex-1 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-40 ${theme.btnPrimary}`}>Add</button>
              <button onClick={() => { setShowAddEmo(false); setNewEmoEmoji(''); setNewEmoLabel(''); }} className={`flex-1 py-1.5 rounded-lg text-xs font-semibold ${theme.btnSecondary}`}>Cancel</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowAddEmo(true)} className={`w-full py-2 rounded-xl text-xs font-semibold mb-4 ${theme.btnSecondary}`}>
            + Add emotion
          </button>
        )
      )}

      {/* Notes */}
      <div className="mb-4">
        <p className={`text-xs font-bold uppercase tracking-widest mb-2 ${theme.muted}`}>Any notes?</p>
        <textarea
          value={notes}
          onChange={e => !locked && setNotes(e.target.value)}
          readOnly={locked}
          placeholder={locked && !existing ? 'No notes for this day' : 'Write freely — this is just for you…'}
          rows={4}
          className={`w-full text-sm px-3 py-3 rounded-xl border outline-none resize-none ${theme.input} ${locked ? 'opacity-70 cursor-default' : ''}`}
        />
      </div>

      {/* Actions */}
      {saved ? (
        <div className="flex gap-2">
          <div className="flex-1 py-2.5 rounded-xl text-xs font-semibold text-center bg-green-500/10 text-green-600 border border-green-200">
            ✓ {gamify ? 'Report filed' : 'Checked in'} for {formatDisplayDate(dateStr)}
          </div>
          <button onClick={() => setSaved(false)} className={`px-4 py-2.5 rounded-xl text-xs font-semibold ${theme.btnSecondary}`}>Edit</button>
        </div>
      ) : (
        <button
          onClick={handleSave}
          disabled={selected.length === 0}
          className={`w-full py-3 rounded-xl text-sm font-bold transition-all active:scale-[0.98] disabled:opacity-40 ${theme.btnPrimary}`}
        >
          {gamify ? 'File Adventure Report' : 'Save Check-In'}
        </button>
      )}
    </div>
  );
}

// ─── Inner-World combined tab ─────────────────────────────────────────────────
function InnerWorldTab({ theme, dateStr, gamify }) {
  const [subView, setSubView] = useState('checkin');
  return (
    <div>
      {/* Segmented switcher */}
      <div className={`flex gap-1 p-1 rounded-xl mb-4 ${theme.periodTabBar}`}>
        <button
          onClick={() => setSubView('checkin')}
          className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${subView === 'checkin' ? theme.periodActive : theme.periodInactive}`}
        >🌙 {gamify ? 'Report' : 'Check-In'}</button>
        <button
          onClick={() => setSubView('journal')}
          className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${subView === 'journal' ? theme.periodActive : theme.periodInactive}`}
        >📓 {gamify ? 'The Tome' : 'Journal'}</button>
      </div>
      {subView === 'checkin' && <CheckInTab  key={`ci-${dateStr}`} theme={theme} dateStr={dateStr} gamify={gamify} />}
      {subView === 'journal'  && <JournalTab key={`jn-${dateStr}`} theme={theme} dateStr={dateStr} gamify={gamify} />}
    </div>
  );
}

// ─── Journal tab ──────────────────────────────────────────────────────────────
// editMode prop: when true, shows Edit/Del controls on each prompt
function JournalPrompt({ prompt, dateStr, theme, dragHandleProps, isDragOverlay, editMode }) {
  const { journalEntries, saveJournalEntry, updateJournalPrompt, deleteJournalPrompt } = useStore();
  const [open,       setOpen]       = useState(false);
  const [editing,    setEditing]    = useState(false);
  const [editText,   setEditText]   = useState(prompt.text);
  const [confirmDel, setConfirmDel] = useState(false);

  const answer    = (journalEntries[dateStr] || {})[prompt.id] || '';
  const hasAnswer = answer.trim().length > 0;

  function handleSaveEdit() {
    if (!editText.trim()) return;
    updateJournalPrompt(prompt.id, editText.trim());
    setEditing(false);
  }
  function handleDelete() {
    deleteJournalPrompt(prompt.id);
  }

  return (
    <div className={`rounded-xl mb-2 border overflow-hidden shadow-sm ${theme.card} ${theme.cardBorder} ${isDragOverlay ? 'shadow-xl rotate-1' : ''}`}>
      {editing ? (
        /* ── Edit prompt text ── */
        <div className="p-3 space-y-2">
          <textarea
            value={editText}
            onChange={e => setEditText(e.target.value)}
            rows={2}
            className={`w-full text-sm px-3 py-2 rounded-lg border outline-none resize-none ${theme.input}`}
            autoFocus
          />
          <div className="flex gap-2">
            <button onClick={handleSaveEdit}         className={`flex-1 py-1.5 rounded-lg text-xs font-semibold ${theme.btnPrimary}`}>Save</button>
            <button onClick={() => { setEditing(false); setEditText(prompt.text); }}
                                                     className={`flex-1 py-1.5 rounded-lg text-xs font-semibold ${theme.btnSecondary}`}>Cancel</button>
          </div>
        </div>
      ) : (
        /* ── Normal view ── */
        <>
          <div className="flex items-center gap-1 px-2 py-3">
            {/* Drag handle only visible in edit mode */}
            {editMode && <JournalDragHandle handleProps={dragHandleProps || {}} theme={theme} />}
            {hasAnswer && <span className="text-green-500 text-xs flex-shrink-0">✓</span>}
            <button className="flex-1 text-left min-w-0" onClick={() => setOpen(o => !o)}>
              <p className={`text-xs font-semibold italic leading-snug ${theme.text}`}>"{prompt.text}"</p>
            </button>
            <div className="flex items-center gap-1 flex-shrink-0 ml-1">
              {/* Edit/Del only shown in editMode */}
              {editMode && (
                <>
                  <button onClick={() => { setEditing(true); setOpen(false); }}
                    className="text-xs px-2 py-1 rounded-lg font-semibold bg-blue-100 text-blue-600 hover:bg-blue-200 transition-colors">Edit</button>
                  {confirmDel ? (
                    <>
                      <button onClick={handleDelete}               className="text-xs px-2 py-1 rounded-lg font-semibold bg-red-500 text-white">Yes</button>
                      <button onClick={() => setConfirmDel(false)} className={`text-xs px-2 py-1 rounded-lg font-semibold ${theme.btnSecondary}`}>No</button>
                    </>
                  ) : (
                    <button onClick={() => setConfirmDel(true)} className="text-xs px-2 py-1 rounded-lg font-semibold bg-red-100 text-red-500 hover:bg-red-200 transition-colors">Del</button>
                  )}
                </>
              )}
              <button onClick={() => setOpen(o => !o)} className={`text-xs px-1 py-1 ${theme.muted}`}>{open ? '▾' : '▸'}</button>
            </div>
          </div>
          {open && (
            <div className={`px-3 pb-3 border-t ${theme.divider}`}>
              <textarea
                value={answer}
                onChange={e => saveJournalEntry(dateStr, prompt.id, e.target.value)}
                placeholder="Write your answer…"
                rows={3}
                className={`w-full mt-2 text-sm px-3 py-2.5 rounded-lg border outline-none resize-none ${theme.input}`}
                autoFocus
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SortableJournalPrompt(props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.prompt.id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0 : 1 }}>
      <JournalPrompt {...props} dragHandleProps={props.editMode ? { ...attributes, ...listeners } : {}} />
    </div>
  );
}

// ─── Notes tab ────────────────────────────────────────────────────────────────
function NotesTab({ theme, dateStr }) {
  const { wellbeingNotes, saveWellbeingNote } = useStore();
  const note = wellbeingNotes[dateStr] || '';

  return (
    <div>
      <div className="mb-4">
        <p className={`text-xs uppercase font-bold tracking-widest mb-0.5 ${theme.muted}`}>📝 Notes</p>
        <p className={`text-xs ${theme.muted}`}>Jot down takeaways, ideas, or anything on your mind</p>
      </div>
      <textarea
        value={note}
        onChange={e => saveWellbeingNote(dateStr, e.target.value)}
        placeholder="Write freely — podcast takeaways, ideas, reflections…"
        rows={12}
        className={`w-full text-sm px-3 py-3 rounded-xl border outline-none resize-none ${theme.input}`}
      />
      {note.trim() && (
        <p className={`text-xs mt-1.5 pl-1 ${theme.muted}`}>✓ Auto-saved</p>
      )}
    </div>
  );
}

function JournalTab({ theme, dateStr, gamify }) {
  const { journalPrompts, journalEntries, addJournalPrompt, setJournalPromptOrder } = useStore();
  const today   = todayStr();
  const isPast  = dateStr < today;

  const [showAdd,   setShowAdd]   = useState(false);
  const [newPrompt, setNewPrompt] = useState('');
  const [activeId,  setActiveId]  = useState(null);
  const [editMode,  setEditMode]  = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const dayEntries    = journalEntries[dateStr] || {};
  const answeredCount = journalPrompts.filter(p => (dayEntries[p.id] || '').trim()).length;

  function handleAddPrompt() {
    if (!newPrompt.trim()) return;
    addJournalPrompt(newPrompt.trim());
    setNewPrompt('');
    setShowAdd(false);
  }

  function handleDragEnd({ active, over }) {
    setActiveId(null);
    if (!over || active.id === over.id) return;
    const oldIdx = journalPrompts.findIndex(p => p.id === active.id);
    const newIdx = journalPrompts.findIndex(p => p.id === over.id);
    setJournalPromptOrder(arrayMove(journalPrompts, oldIdx, newIdx));
  }

  const activePrompt = activeId ? journalPrompts.find(p => p.id === activeId) : null;

  return (
    <div>
      {/* Header row with edit toggle */}
      <div className="flex items-center justify-between mb-4">
        <p className={`text-xs ${theme.muted}`}>
          {answeredCount > 0
            ? `${answeredCount} of ${journalPrompts.length} ${gamify ? 'tome entries written' : 'prompts answered'}`
            : editMode
              ? (gamify ? 'Edit mode — reorder, rename, or delete prompts' : 'Edit mode — reorder, rename, or delete prompts')
              : (gamify ? 'Your tome prompts' : 'Your anchor prompts')}
        </p>
        <button
          onClick={() => { setEditMode(e => !e); setShowAdd(false); }}
          className={`text-xs px-2.5 py-1 rounded-lg font-semibold transition-all ${editMode ? 'bg-blue-500 text-white' : theme.btnSecondary}`}
        >
          {editMode ? 'Done editing' : '✏️ Edit'}
        </button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={({ active }) => setActiveId(active.id)}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <SortableContext items={journalPrompts.map(p => p.id)} strategy={verticalListSortingStrategy}>
          {journalPrompts.map(prompt => (
            <SortableJournalPrompt
              key={prompt.id}
              prompt={prompt}
              dateStr={dateStr}
              theme={theme}
              editMode={editMode}
            />
          ))}
        </SortableContext>
        <DragOverlay dropAnimation={null}>
          {activePrompt && (
            <JournalPrompt
              prompt={activePrompt}
              dateStr={dateStr}
              theme={theme}
              isDragOverlay={true}
              dragHandleProps={{}}
              editMode={editMode}
            />
          )}
        </DragOverlay>
      </DndContext>

      {/* Add prompt — only shown in edit mode */}
      {editMode && !isPast && (
        showAdd ? (
          <div className={`rounded-xl border shadow-sm overflow-hidden mb-2 ${theme.card} ${theme.cardBorder}`}>
            <div className="p-3 space-y-2">
              <textarea
                placeholder="Your custom prompt…"
                value={newPrompt}
                onChange={e => setNewPrompt(e.target.value)}
                rows={2}
                className={`w-full text-sm px-3 py-2 rounded-lg border outline-none resize-none ${theme.input}`}
                autoFocus
              />
              <div className="flex gap-2">
                <button onClick={handleAddPrompt}                              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold ${theme.btnPrimary}`}>Add</button>
                <button onClick={() => { setShowAdd(false); setNewPrompt(''); }} className={`flex-1 py-1.5 rounded-lg text-xs font-semibold ${theme.btnSecondary}`}>Cancel</button>
              </div>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowAdd(true)} className={`w-full py-3 rounded-xl text-sm font-semibold mt-2 ${theme.btnSecondary}`}>
            {gamify ? '+ Add tome prompt' : '+ Add custom prompt'}
          </button>
        )
      )}
    </div>
  );
}

// ─── Habit stat helper ────────────────────────────────────────────────────────
// Returns { label, done } where label is what goes in the message / display
function habitStat(activity, count, weekTotal) {
  if (activity.scheduledDays && activity.scheduledDays.length > 0) {
    return { label: count > 0 ? '✓' : '✗', done: count > 0, isTick: true };
  }
  if (activity.hasTarget) {
    return { label: `${weekTotal}/${activity.weeklyTarget}`, done: weekTotal >= activity.weeklyTarget, isTick: false };
  }
  return { label: String(count), done: count > 0, isTick: false };
}

// ─── Daily Message tab ────────────────────────────────────────────────────────
function DailyMessageTab({ theme }) {
  const { activities, getCount, getWeeklyTotal, logActivity, wellbeingNotes, dailyDrafts, saveDailyDraft, weekStartDay, dailyMessageDefaults } = useStore();
  const today    = todayStr();
  const defaults = dailyMessageDefaults || {};

  const [viewDate, setViewDate] = useState(today);
  const isToday = viewDate === today;

  // Helper: get the right draft + fallback for a given date
  function draftForDate(dateStr) {
    const d = dailyDrafts[dateStr] || {};
    const prev = !d.book && !d.audio
      ? Object.entries(dailyDrafts)
          .filter(([dd]) => dd < dateStr)
          .sort(([a], [b]) => b.localeCompare(a))[0]?.[1] || {}
      : {};
    return { book: d.book || prev.book || '', audio: d.audio || prev.audio || '', notes: d.notes || '' };
  }

  const initDraft = draftForDate(today);
  const [book,   setBook]   = useState(initDraft.book  || defaults.book  || '');
  const [audio,  setAudio]  = useState(initDraft.audio || '');
  const [notes,  setNotes]  = useState(initDraft.notes || defaults.notes || '');
  const [copied, setCopied] = useState(false);

  // When viewDate changes, reload fields from that date's draft
  useEffect(() => {
    const d = draftForDate(viewDate);
    setBook(d.book  || (isToday ? defaults.book  : '') || '');
    setAudio(d.audio || '');
    setNotes(d.notes || (isToday ? defaults.notes : '') || '');
    setCopied(false);
  }, [viewDate]);

  const viewNote = wellbeingNotes[viewDate] || '';

  function updateBook(v)  { setBook(v);  saveDailyDraft(viewDate, { book: v }); }
  function updateAudio(v) { setAudio(v); saveDailyDraft(viewDate, { audio: v }); }
  function updateNotes(v) { setNotes(v); saveDailyDraft(viewDate, { notes: v }); }

  const weekStart  = getWeekStart(viewDate, weekStartDay);
  const acctHabits = activities.filter(a => a.accountability && isDueOn(a, viewDate));

  // Date navigator label
  const viewDateObj   = new Date(viewDate + 'T00:00:00');
  const viewDateLabel = isToday
    ? 'Today'
    : `${DAY_NAMES[viewDateObj.getDay()]}, ${viewDateObj.getDate()} ${MONTH_NAMES_FULL[viewDateObj.getMonth()]}`;

  // Format: DD/MM/YYYY for the message itself
  const d = new Date(viewDate + 'T00:00:00');
  const dateLabel = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;

  function buildMessage() {
    const lines = [dateLabel];
    if (book.trim())  lines.push(`📚 ${book.trim()}`);
    if (audio.trim()) lines.push(`🎧 ${audio.trim()}`);
    if (acctHabits.length) {
      lines.push('');
      acctHabits.forEach(a => {
        const count     = getCount(a.id, today);
        const weekTotal = getWeeklyTotal(a.id, weekStart);
        const { label } = habitStat(a, count, weekTotal);
        lines.push(`${a.emoji} ${a.name}: ${label}`);
      });
    }
    if (notes.trim()) {
      lines.push('');
      lines.push(notes.trim());
    }
    return lines.join('\n');
  }

  function handleCopy() {
    const msg = buildMessage();
    navigator.clipboard.writeText(msg).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      // Auto-tick the accountability habit if not already logged for viewDate
      const acctAct = activities.find(a => a.id === 'accountability');
      if (acctAct && getCount('accountability', viewDate) === 0) {
        logActivity('accountability', viewDate, 1);
      }
    });
  }

  function handleShare() {
    const msg = buildMessage();
    if (navigator.share) {
      navigator.share({ text: msg }).catch(() => {});
    } else {
      handleCopy();
    }
  }

  return (
    <div>
      {/* Date navigator */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setViewDate(d => offsetDate(d, -1))}
          className={`w-8 h-8 flex items-center justify-center rounded-lg text-base ${theme.btnSecondary}`}
        >◀</button>
        <div className="flex-1 text-center">
          <span className={`text-sm font-semibold ${isToday ? theme.hitTarget : theme.text}`}>{viewDateLabel}</span>
        </div>
        {!isToday && (
          <button
            onClick={() => setViewDate(today)}
            className={`text-xs px-2.5 py-1 rounded-lg font-semibold ${theme.btnPrimary}`}
          >Today</button>
        )}
        <button
          onClick={() => { if (!isToday) setViewDate(d => offsetDate(d, 1)); }}
          disabled={isToday}
          className={`w-8 h-8 flex items-center justify-center rounded-lg text-base disabled:opacity-30 ${theme.btnSecondary}`}
        >▶</button>
      </div>

      <div className="mb-4">
        <p className={`text-xs uppercase font-bold tracking-widest mb-0.5 ${theme.muted}`}>💬 Daily Message</p>
        <p className={`text-xs ${theme.muted}`}>
          {isToday ? 'Fill in the details — habit counts are auto-filled from today' : `Generating for ${viewDateLabel} — habit counts pulled from that day`}
        </p>
      </div>

      {/* Book + Audio */}
      <div className={`rounded-xl border shadow-sm overflow-hidden mb-3 ${theme.card} ${theme.cardBorder}`}>
        <div className="flex items-center px-3 py-2.5 gap-2">
          <span className="text-base">📚</span>
          <input
            type="text"
            value={book}
            onChange={e => updateBook(e.target.value)}
            placeholder="Book title…"
            className={`flex-1 text-sm outline-none bg-transparent ${theme.text}`}
          />
        </div>
        <div className={`flex items-center px-3 py-2.5 gap-2 border-t ${theme.divider}`}>
          <span className="text-base">🎧</span>
          <input
            type="text"
            value={audio}
            onChange={e => updateAudio(e.target.value)}
            placeholder="Audio title…"
            className={`flex-1 text-sm outline-none bg-transparent ${theme.text}`}
          />
        </div>
      </div>

      {/* Habit metrics */}
      {acctHabits.length === 0 ? (
        <div className={`rounded-xl border p-3 mb-3 text-center ${theme.card} ${theme.cardBorder}`}>
          <p className={`text-xs ${theme.muted}`}>No habits set for accountability yet — toggle them on in the Habits screen.</p>
        </div>
      ) : (
        <div className={`rounded-xl border shadow-sm overflow-hidden mb-3 ${theme.card} ${theme.cardBorder}`}>
          {acctHabits.map((a, idx) => {
            const count     = getCount(a.id, viewDate);
            const weekTotal = getWeeklyTotal(a.id, weekStart);
            const { label, done, isTick } = habitStat(a, count, weekTotal);
            const statColor = isTick
              ? (done ? 'text-green-500' : 'text-red-400')
              : (done ? 'text-green-500' : theme.muted);
            return (
              <div key={a.id} className={`flex items-center justify-between px-3 py-2.5 ${idx > 0 ? `border-t ${theme.divider}` : ''}`}>
                <span className={`text-sm ${theme.text}`}>{a.emoji} {a.name}</span>
                <span className={`text-sm font-semibold ${statColor}`}>{label}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Notes */}
      <div className={`rounded-xl border shadow-sm mb-3 ${theme.card} ${theme.cardBorder}`}>
        <textarea
          value={notes}
          onChange={e => updateNotes(e.target.value)}
          placeholder="Notes — key takeaways, wins, reflections… (optional)"
          rows={4}
          className={`w-full text-sm px-3 py-3 outline-none resize-none bg-transparent rounded-xl ${theme.text}`}
        />
        {viewNote && (
          <div className={`border-t px-3 py-2 flex items-center justify-between ${theme.divider}`}>
            <p className={`text-xs ${theme.muted}`}>You have notes saved for {isToday ? 'today' : 'this day'}</p>
            <button
              onClick={() => updateNotes(viewNote)}
              className={`text-xs px-2.5 py-1 rounded-lg font-semibold ${theme.btnSecondary}`}
            >Pull from Notes</button>
          </div>
        )}
      </div>

      {/* Message preview */}
      <div className={`rounded-xl border mb-3 p-3 ${theme.card} ${theme.cardBorder}`}>
        <p className={`text-[10px] uppercase font-bold tracking-widest mb-2 ${theme.muted}`}>Preview</p>
        <pre className={`text-xs leading-relaxed whitespace-pre-wrap font-sans ${theme.textSub}`}>{buildMessage()}</pre>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleCopy}
          className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all active:scale-[0.98] ${copied ? 'bg-green-500 text-white' : theme.btnPrimary}`}
        >
          {copied ? '✓ Copied!' : 'Copy'}
        </button>
        <button
          onClick={handleShare}
          className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all active:scale-[0.98] ${theme.btnSecondary}`}
        >
          Share ↗
        </button>
      </div>
    </div>
  );
}

// ─── Library: docx export ─────────────────────────────────────────────────────
async function exportLibraryDocx(entry) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import('docx');

  const children = [];

  // Title
  children.push(new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun({ text: entry.title || 'Untitled', bold: true, font: 'Arial', size: 32 })],
    spacing: { after: 160 },
  }));

  // Author
  if (entry.author?.trim()) {
    children.push(new Paragraph({
      children: [new TextRun({ text: `by ${entry.author}`, font: 'Arial', size: 22, italics: true })],
      spacing: { after: 80 },
    }));
  }

  // Meta
  const status = entry.status === 'completed' ? 'Completed' : 'Currently Reading';
  children.push(new Paragraph({
    children: [new TextRun({ text: `${status}  ·  Started: ${entry.dateStarted}${entry.dateCompleted ? '  ·  Finished: ' + entry.dateCompleted : ''}`, font: 'Arial', size: 18, color: '666666' })],
    spacing: { after: 400 },
  }));

  // Notes heading
  if (entry.notes?.trim()) {
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: 'Notes', bold: true, font: 'Arial', size: 26 })],
      spacing: { before: 200, after: 160 },
    }));

    // One paragraph per line, blank lines become spacers
    entry.notes.split('\n').forEach(line => {
      children.push(new Paragraph({
        children: [new TextRun({ text: line, font: 'Arial', size: 22 })],
        spacing: { after: line.trim() ? 80 : 160 },
      }));
    });
  }

  const doc = new Document({
    styles: {
      default: { document: { run: { font: 'Arial', size: 22 } } },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 32, bold: true, font: 'Arial' },
          paragraph: { spacing: { before: 0, after: 160 }, outlineLevel: 0 } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 26, bold: true, font: 'Arial' },
          paragraph: { spacing: { before: 200, after: 160 }, outlineLevel: 1 } },
      ],
    },
    sections: [{
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      children,
    }],
  });

  const blob = await Packer.toBlob(doc);
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `${(entry.title || 'book-notes').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-')}.docx`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Library card (module-level so hooks work correctly) ─────────────────────
function LibraryCard({ entry, theme, editingId, setEditingId, confirmDelId, setConfirmDelId, exporting, onExport }) {
  const { updateLibraryEntry, deleteLibraryEntry } = useStore();
  const isEditing = editingId === entry.id;

  const [localTitle,  setLocalTitle]  = useState(entry.title  || '');
  const [localAuthor, setLocalAuthor] = useState(entry.author || '');
  const [localNotes,  setLocalNotes]  = useState(entry.notes  || '');
  const [localStatus, setLocalStatus] = useState(entry.status || 'reading');
  const [savedFlash,  setSavedFlash]  = useState(false);

  const saveTimerRef  = useRef(null);
  const flashTimerRef = useRef(null);

  function doSave(title, author, notes, status) {
    if (!title.trim()) return;
    updateLibraryEntry(entry.id, {
      title, author, notes, status,
      dateCompleted: status === 'completed' && !entry.dateCompleted
        ? new Date().toISOString().slice(0, 10)
        : (status === 'reading' ? null : entry.dateCompleted),
    });
    setSavedFlash(true);
    clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setSavedFlash(false), 1500);
  }

  function scheduleAutoSave(title, author, notes, status) {
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => doSave(title, author, notes, status), 700);
  }

  function handleTitleChange(v)  { setLocalTitle(v);  scheduleAutoSave(v, localAuthor, localNotes, localStatus); }
  function handleAuthorChange(v) { setLocalAuthor(v); scheduleAutoSave(localTitle, v, localNotes, localStatus); }
  function handleNotesChange(v)  { setLocalNotes(v);  scheduleAutoSave(localTitle, localAuthor, v, localStatus); }
  function handleStatusChange(v) {
    setLocalStatus(v);
    doSave(localTitle, localAuthor, localNotes, v); // immediate on toggle
  }

  function handleDone() {
    clearTimeout(saveTimerRef.current);
    doSave(localTitle, localAuthor, localNotes, localStatus);
    setEditingId(null);
    setConfirmDelId(null);
  }

  if (isEditing) {
    return (
      <div className={`rounded-xl mb-3 border shadow-sm overflow-hidden ${theme.card} ${theme.cardBorder}`}>
        <div className="p-3 space-y-2">
          <input
            type="text"
            value={localTitle}
            onChange={e => handleTitleChange(e.target.value)}
            placeholder="Book title…"
            autoFocus
            className={`w-full text-sm font-semibold px-3 py-2 rounded-lg border outline-none ${theme.input}`}
          />
          <input
            type="text"
            value={localAuthor}
            onChange={e => handleAuthorChange(e.target.value)}
            placeholder="Author (optional)…"
            className={`w-full text-sm px-3 py-2 rounded-lg border outline-none ${theme.input}`}
          />
          <div className="flex gap-2">
            <button
              onClick={() => handleStatusChange('reading')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${localStatus === 'reading' ? theme.btnPrimary : theme.btnSecondary}`}
            >📖 Reading</button>
            <button
              onClick={() => handleStatusChange('completed')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${localStatus === 'completed' ? theme.btnPrimary : theme.btnSecondary}`}
            >✅ Completed</button>
          </div>
          <textarea
            value={localNotes}
            onChange={e => handleNotesChange(e.target.value)}
            placeholder="Your notes, takeaways, key quotes, reflections…"
            rows={10}
            className={`w-full text-sm px-3 py-2.5 rounded-lg border outline-none resize-none ${theme.input}`}
          />
          {/* Auto-save indicator */}
          <p className={`text-[10px] pl-1 ${savedFlash ? 'text-green-500' : theme.muted + ' opacity-50'}`}>
            {savedFlash ? '✓ Saved' : 'Auto-saves as you type'}
          </p>
          <div className="flex gap-2">
            <button onClick={handleDone} className={`flex-1 py-2 rounded-lg text-xs font-semibold ${theme.btnPrimary}`}>Done</button>
            <button
              onClick={() => onExport({ ...entry, title: localTitle, author: localAuthor, notes: localNotes, status: localStatus })}
              disabled={exporting === entry.id || !localTitle.trim()}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold disabled:opacity-40 ${theme.btnSecondary}`}
            >{exporting === entry.id ? 'Exporting…' : '↓ Export .docx'}</button>
          </div>
          {/* Delete — protected with explicit warning */}
          <div className={`pt-1 border-t ${theme.divider}`}>
            {confirmDelId === entry.id ? (
              <div className="space-y-1.5">
                <p className="text-xs text-red-500 font-semibold text-center">⚠️ Permanently delete this book and all its notes? This cannot be undone.</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => { deleteLibraryEntry(entry.id); setEditingId(null); setConfirmDelId(null); }}
                    className="flex-1 py-1.5 rounded-lg text-xs font-semibold bg-red-500 text-white"
                  >Yes, delete forever</button>
                  <button onClick={() => setConfirmDelId(null)} className={`flex-1 py-1.5 rounded-lg text-xs font-semibold ${theme.btnSecondary}`}>Cancel</button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelId(entry.id)}
                className="w-full py-1.5 rounded-lg text-xs font-semibold text-red-400 border border-red-100"
              >Delete entry…</button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Read view ──
  const preview = (entry.notes || '').split('\n').filter(l => l.trim()).slice(0, 2).join(' · ');
  return (
    <div
      className={`rounded-xl mb-2 border shadow-sm overflow-hidden ${theme.card} ${theme.cardBorder}`}
      onClick={() => { setEditingId(entry.id); setConfirmDelId(null); }}
      style={{ cursor: 'pointer' }}
    >
      <div className="flex items-start gap-3 px-3 py-3">
        <span className="text-2xl flex-shrink-0 mt-0.5">📚</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={`text-sm font-semibold leading-tight ${theme.text}`}>{entry.title || 'Untitled'}</p>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${entry.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-600'}`}>
              {entry.status === 'completed' ? '✅ Completed' : '📖 Reading'}
            </span>
          </div>
          {entry.author && <p className={`text-xs mt-0.5 italic ${theme.muted}`}>{entry.author}</p>}
          {preview ? (
            <p className={`text-xs mt-1 leading-snug line-clamp-2 ${theme.muted}`}>{preview}</p>
          ) : (
            <p className={`text-xs mt-1 ${theme.muted}`}>No notes yet — tap to add</p>
          )}
          <p className={`text-[10px] mt-1.5 ${theme.muted}`}>Started {entry.dateStarted}{entry.dateCompleted ? ` · Finished ${entry.dateCompleted}` : ''}</p>
        </div>
        <button
          onClick={e => { e.stopPropagation(); onExport(entry); }}
          disabled={exporting === entry.id || !entry.title?.trim()}
          className={`flex-shrink-0 text-xs px-2 py-1 rounded-lg font-semibold disabled:opacity-30 ${theme.btnSecondary}`}
          title="Export as Word doc"
        >{exporting === entry.id ? '…' : '↓'}</button>
      </div>
    </div>
  );
}

// ─── Library tab ──────────────────────────────────────────────────────────────
function LibraryTab({ theme }) {
  const { library, addLibraryEntry } = useStore();
  const [editingId,    setEditingId]    = useState(null);
  const [confirmDelId, setConfirmDelId] = useState(null);
  const [exporting,    setExporting]    = useState(null);

  const sorted = [...library].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'reading' ? -1 : 1;
    return (b.dateStarted || '').localeCompare(a.dateStarted || '');
  });
  const reading   = sorted.filter(e => e.status === 'reading');
  const completed = sorted.filter(e => e.status === 'completed');

  function handleAdd() {
    const id = `lib-${Date.now()}`;
    addLibraryEntry({ id });
    setEditingId(id);
  }

  async function handleExport(entry) {
    setExporting(entry.id);
    try { await exportLibraryDocx(entry); }
    catch (e) { console.error(e); }
    finally { setExporting(null); }
  }

  const cardProps = {
    theme, editingId, setEditingId, confirmDelId, setConfirmDelId,
    exporting, onExport: handleExport,
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className={`text-xs ${theme.muted}`}>
          {library.length === 0 ? 'Your personal book notes — tap + to add' : `${reading.length} reading · ${completed.length} completed`}
        </p>
        <button onClick={handleAdd} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${theme.btnPrimary}`}>+ Add</button>
      </div>

      {library.length === 0 && !editingId && (
        <div className={`text-center py-12 ${theme.muted}`}>
          <p className="text-4xl mb-3">📚</p>
          <p className="text-sm font-medium">No books yet</p>
          <p className="text-xs mt-1">Add a book and start capturing your notes</p>
        </div>
      )}

      {reading.length > 0 && (
        <div className="mb-1">
          {reading.length > 0 && completed.length > 0 && (
            <p className={`text-[10px] font-bold uppercase tracking-widest mb-2 pl-1 ${theme.muted}`}>Currently Reading</p>
          )}
          {reading.map(e => <LibraryCard key={e.id} entry={e} {...cardProps} />)}
        </div>
      )}

      {completed.length > 0 && (
        <div>
          {reading.length > 0 && (
            <p className={`text-[10px] font-bold uppercase tracking-widest mb-2 pl-1 mt-3 ${theme.muted}`}>Completed</p>
          )}
          {completed.map(e => <LibraryCard key={e.id} entry={e} {...cardProps} />)}
        </div>
      )}
    </div>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function WellbeingScreen({ theme, gamify }) {
  const screenTitle = gamify ? '🏕️ Tavern' : '🏛️ Sanctum';
  const [view,    setView]    = useState('innerworld');
  const [dateStr, setDateStr] = useState(todayStr());

  const TABS = [
    ['innerworld', '🌙', gamify ? 'Inner Realm' : 'Inner-World'],
    ['notes',      '📝', 'Notes'],
    ['daily',      '💬', 'Daily'],
    ['library',    '📚', 'Library'],
  ];

  return (
    <div className="pb-4">
      <div className="mb-3">
        <h1 className={`text-xl font-bold ${theme.text}`}>{screenTitle}</h1>
      </div>

      {/* Sub-tabs */}
      <div className={`flex gap-1 p-1 rounded-xl mb-3 ${theme.periodTabBar}`}>
        {TABS.map(([id, emoji, label]) => (
          <button
            key={id}
            onClick={() => setView(id)}
            className={`flex-1 flex flex-col items-center py-1.5 rounded-lg transition-all ${view === id ? theme.periodActive : theme.periodInactive}`}
          >
            <span className="text-base leading-none">{emoji}</span>
            <span className="text-[10px] font-semibold mt-0.5 leading-tight text-center">{label}</span>
          </button>
        ))}
      </div>

      {/* Date navigator — hidden on Daily and Library tabs */}
      {view !== 'daily' && view !== 'library' && <DateNav dateStr={dateStr} onChange={setDateStr} theme={theme} />}

      {view === 'innerworld' && <InnerWorldTab key={`iw-${dateStr}`} theme={theme} dateStr={dateStr} gamify={gamify} />}
      {view === 'notes'      && <NotesTab      key={`nt-${dateStr}`} theme={theme} dateStr={dateStr} />}
      {view === 'daily'      && <DailyMessageTab theme={theme} />}
      {view === 'library'    && <LibraryTab theme={theme} />}
    </div>
  );
}
