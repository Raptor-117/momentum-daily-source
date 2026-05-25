import { useState } from 'react';
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

// ─── Tag colour presets ───────────────────────────────────────────────────────
const PRESET_COLORS = [
  '#ef4444','#f97316','#f59e0b','#eab308',
  '#84cc16','#22c55e','#10b981','#14b8a6',
  '#06b6d4','#3b82f6','#6366f1','#8b5cf6',
  '#a855f7','#ec4899','#f43f5e','#e11d48',
  '#64748b','#78716c','#374151','#0f172a',
];

// ─── Drag handle ──────────────────────────────────────────────────────────────
function DragHandle({ handleProps, theme }) {
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

// ─── Colour picker ────────────────────────────────────────────────────────────
function ColorPicker({ selected, onChange }) {
  return (
    <div className="flex flex-wrap gap-2 pt-1">
      {PRESET_COLORS.map(c => (
        <button
          key={c}
          onClick={() => onChange(c)}
          className={`w-7 h-7 rounded-full transition-all ${selected === c ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : ''}`}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  );
}

// ─── Sortable tag row ─────────────────────────────────────────────────────────
function SortableTagRow({ tag, theme, isFirst, editingTagId, setEditingTagId, onDelete, confirmId, setConfirmId, isDragOverlay }) {
  const { updateTag } = useStore();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tag.id });

  const [editForm, setEditForm] = useState({ label: tag.label, color: tag.color });
  const isEditing = editingTagId === tag.id;

  function handleSave() {
    if (!editForm.label.trim()) return;
    updateTag(tag.id, { label: editForm.label.trim(), color: editForm.color });
    setEditingTagId(null);
  }
  function handleStartEdit() {
    setEditForm({ label: tag.label, color: tag.color });
    setEditingTagId(tag.id);
    setConfirmId(null);
  }

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0 : 1 }}
      className={`${!isFirst ? 'border-t ' + theme.divider : ''} ${isDragOverlay ? 'shadow-xl rounded-xl ' + theme.card : ''}`}
    >
      {isEditing ? (
        /* ── Edit mode ── */
        <div className="px-3 py-2.5 space-y-2">
          <input
            type="text"
            value={editForm.label}
            onChange={e => setEditForm(f => ({ ...f, label: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            className={`w-full text-sm px-3 py-2 rounded-lg border outline-none ${theme.input}`}
            autoFocus
          />
          <ColorPicker selected={editForm.color} onChange={c => setEditForm(f => ({ ...f, color: c }))} />
          <div className="flex gap-2 pt-1">
            <button onClick={handleSave}                   className={`flex-1 py-1.5 rounded-lg text-xs font-semibold ${theme.btnPrimary}`}>Save</button>
            <button onClick={() => setEditingTagId(null)}  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold ${theme.btnSecondary}`}>Cancel</button>
          </div>
        </div>
      ) : (
        /* ── Normal mode ── */
        <div className="flex items-center gap-2 px-3 py-2.5">
          <DragHandle handleProps={{ ...attributes, ...listeners }} theme={theme} />
          <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
          <span className={`flex-1 text-sm font-medium ${theme.text}`}>{tag.label}</span>

          {confirmId === tag.id ? (
            <div className="flex gap-1">
              <button onClick={() => onDelete(tag.id)} className="text-xs px-2 py-1 rounded-lg bg-red-500 text-white font-medium">Delete</button>
              <button onClick={() => setConfirmId(null)} className={`text-xs px-2 py-1 rounded-lg ${theme.btnSecondary}`}>Cancel</button>
            </div>
          ) : (
            <div className="flex gap-1">
              <button onClick={handleStartEdit}            className="text-xs px-2 py-1 rounded-lg font-semibold bg-blue-100 text-blue-600 hover:bg-blue-200 transition-colors">Edit</button>
              <button onClick={() => setConfirmId(tag.id)} className="text-xs px-2 py-1 rounded-lg font-semibold bg-red-100 text-red-500 hover:bg-red-200 transition-colors">Del</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Tag manager ──────────────────────────────────────────────────────────────
function TagManager({ theme }) {
  const { tags, addTag, deleteTag, setTagOrder } = useStore();
  const [showAdd,      setShowAdd]      = useState(false);
  const [newTag,       setNewTag]       = useState({ label: '', color: PRESET_COLORS[0] });
  const [confirmId,    setConfirmId]    = useState(null);
  const [editingTagId, setEditingTagId] = useState(null);
  const [activeId,     setActiveId]     = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleAdd() {
    if (!newTag.label.trim()) return;
    addTag({ label: newTag.label.trim(), color: newTag.color });
    setNewTag({ label: '', color: PRESET_COLORS[0] });
    setShowAdd(false);
  }

  function handleDragEnd({ active, over }) {
    setActiveId(null);
    if (!over || active.id === over.id) return;
    const oldIdx = tags.findIndex(t => t.id === active.id);
    const newIdx = tags.findIndex(t => t.id === over.id);
    setTagOrder(arrayMove(tags, oldIdx, newIdx));
  }

  const activeTag = activeId ? tags.find(t => t.id === activeId) : null;

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <p className={`text-xs font-bold uppercase tracking-widest pl-1 ${theme.sectionLabel}`}>Tags</p>
        <button onClick={() => { setShowAdd(s => !s); setEditingTagId(null); }} className={`text-xs px-2.5 py-1 rounded-lg font-semibold ${theme.btnPrimary}`}>
          + Add
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className={`rounded-xl mb-3 border shadow-sm overflow-hidden ${theme.card} ${theme.cardBorder}`}>
          <div className="p-3 space-y-2">
            <input
              type="text"
              placeholder="Tag label"
              value={newTag.label}
              onChange={e => setNewTag(n => ({ ...n, label: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              className={`w-full text-sm px-3 py-2 rounded-lg border outline-none ${theme.input}`}
              autoFocus
            />
            <ColorPicker selected={newTag.color} onChange={c => setNewTag(n => ({ ...n, color: c }))} />
            <div className="flex gap-2 pt-1">
              <button onClick={handleAdd}               className={`flex-1 py-1.5 rounded-lg text-xs font-semibold ${theme.btnPrimary}`}>Add Tag</button>
              <button onClick={() => setShowAdd(false)}  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold ${theme.btnSecondary}`}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Tag list */}
      {tags.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={({ active }) => { setActiveId(active.id); setEditingTagId(null); }}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveId(null)}
        >
          <SortableContext items={tags.map(t => t.id)} strategy={verticalListSortingStrategy}>
            <div className={`rounded-xl border shadow-sm overflow-hidden ${theme.card} ${theme.cardBorder}`}>
              {tags.map((tag, idx) => (
                <SortableTagRow
                  key={tag.id}
                  tag={tag}
                  theme={theme}
                  isFirst={idx === 0}
                  editingTagId={editingTagId}
                  setEditingTagId={setEditingTagId}
                  onDelete={id => { deleteTag(id); setConfirmId(null); }}
                  confirmId={confirmId}
                  setConfirmId={setConfirmId}
                />
              ))}
            </div>
          </SortableContext>
          <DragOverlay dropAnimation={null}>
            {activeTag && (
              <SortableTagRow
                tag={activeTag}
                theme={theme}
                isFirst={false}
                editingTagId={null}
                setEditingTagId={() => {}}
                onDelete={() => {}}
                confirmId={null}
                setConfirmId={() => {}}
                isDragOverlay={true}
              />
            )}
          </DragOverlay>
        </DndContext>
      )}

      {tags.length > 1 && !editingTagId && (
        <p className={`text-xs mt-1.5 pl-1 ${theme.muted}`}>Hold and drag ⠿ to reorder</p>
      )}
      {tags.length === 0 && !showAdd && (
        <p className={`text-xs text-center py-3 ${theme.muted}`}>No tags yet</p>
      )}
    </div>
  );
}

// ─── Toggle row ───────────────────────────────────────────────────────────────
function ToggleRow({ label, description, value, onToggle, theme }) {
  return (
    <div className="flex items-center justify-between px-3 py-3">
      <div>
        <p className={`text-sm font-medium ${theme.text}`}>{label}</p>
        {description && <p className={`text-xs ${theme.muted}`}>{description}</p>}
      </div>
      <button
        onClick={onToggle}
        className={`relative w-12 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${value ? theme.toggleOn : theme.toggleOff}`}
      >
        <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${value ? 'translate-x-6' : 'translate-x-0.5'}`} />
      </button>
    </div>
  );
}

const WEEK_START_OPTIONS = [
  { label: 'Sunday',    value: 0 },
  { label: 'Monday',    value: 1 },
  { label: 'Tuesday',   value: 2 },
  { label: 'Wednesday', value: 3 },
  { label: 'Thursday',  value: 4 },
  { label: 'Friday',    value: 5 },
  { label: 'Saturday',  value: 6 },
];

// ─── Reminder row ─────────────────────────────────────────────────────────────
function ReminderRow({ notif, theme, isFirst, onUpdate, onDelete }) {
  const [confirmDel, setConfirmDel] = useState(false);
  return (
    <div className={`${!isFirst ? 'border-t ' + theme.divider : ''}`}>
      <div className="px-3 py-2.5 space-y-2">
        <div className="flex items-center gap-2">
          <input
            type="time"
            value={notif.time}
            onChange={e => onUpdate({ time: e.target.value })}
            className={`text-sm px-2 py-1 rounded-lg border outline-none flex-shrink-0 ${theme.input}`}
          />
          <button
            onClick={() => onUpdate({ enabled: !notif.enabled })}
            className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${notif.enabled ? theme.toggleOn : theme.toggleOff}`}
          >
            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${notif.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
          <div className="flex-1" />
          {confirmDel ? (
            <div className="flex gap-1">
              <button onClick={onDelete} className="text-xs px-2 py-1 rounded-lg bg-red-500 text-white font-medium">Delete</button>
              <button onClick={() => setConfirmDel(false)} className={`text-xs px-2 py-1 rounded-lg ${theme.btnSecondary}`}>Cancel</button>
            </div>
          ) : (
            <button onClick={() => setConfirmDel(true)} className="text-xs px-2 py-1 rounded-lg font-semibold bg-red-100 text-red-500 hover:bg-red-200 transition-colors">Del</button>
          )}
        </div>
        <input
          type="text"
          value={notif.message}
          onChange={e => onUpdate({ message: e.target.value })}
          placeholder="Reminder message…"
          maxLength={120}
          className={`w-full text-sm px-3 py-2 rounded-lg border outline-none ${theme.input}`}
        />
      </div>
    </div>
  );
}

// ─── Reminders section ────────────────────────────────────────────────────────
function RemindersSection({ theme }) {
  const { notifications, addNotification, updateNotification, deleteNotification } = useStore();
  const [permState, setPermState] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  );
  const MAX = 10;

  async function requestPermission() {
    const result = await Notification.requestPermission();
    setPermState(result);
  }

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <p className={`text-xs font-bold uppercase tracking-widest pl-1 ${theme.sectionLabel}`}>Reminders</p>
        {notifications.length < MAX && (
          <button
            onClick={() => addNotification({ time: '08:00', message: '' })}
            className={`text-xs px-2.5 py-1 rounded-lg font-semibold ${theme.btnPrimary}`}
          >+ Add</button>
        )}
      </div>

      {permState !== 'granted' && (
        <div className={`rounded-xl border p-3 mb-3 ${theme.card} ${theme.cardBorder}`}>
          {permState === 'unsupported' && (
            <p className={`text-xs ${theme.muted}`}>Notifications aren't supported in this browser.</p>
          )}
          {permState === 'denied' && (
            <p className={`text-xs ${theme.muted}`}>Notifications are blocked. Enable them in your device settings to use reminders.</p>
          )}
          {permState === 'default' && (
            <div>
              <p className={`text-xs mb-2 ${theme.textSub}`}>Allow notifications to receive reminders.</p>
              <button onClick={requestPermission} className={`w-full py-2 rounded-lg text-xs font-semibold ${theme.btnPrimary}`}>
                Enable Notifications
              </button>
            </div>
          )}
        </div>
      )}

      {notifications.length === 0 ? (
        <p className={`text-xs text-center py-3 ${theme.muted}`}>No reminders set</p>
      ) : (
        <div className={`rounded-xl border shadow-sm overflow-hidden ${theme.card} ${theme.cardBorder}`}>
          {notifications.map((n, idx) => (
            <ReminderRow
              key={n.id}
              notif={n}
              theme={theme}
              isFirst={idx === 0}
              onUpdate={updates => updateNotification(n.id, updates)}
              onDelete={() => deleteNotification(n.id)}
            />
          ))}
        </div>
      )}

      {notifications.length >= MAX && (
        <p className={`text-xs mt-1.5 pl-1 ${theme.muted}`}>Maximum {MAX} reminders reached.</p>
      )}
      {permState === 'granted' && notifications.some(n => n.enabled) && (
        <p className={`text-xs mt-1.5 pl-1 ${theme.muted}`}>Reminders fire while the app is open.</p>
      )}
    </div>
  );
}

// ─── CSV parser ───────────────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = lines.slice(1).map(line => {
    const vals = [];
    let cur = '', inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { vals.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    vals.push(cur.trim());
    return headers.reduce((obj, h, i) => ({ ...obj, [h]: (vals[i] || '').replace(/^"|"$/g, '') }), {});
  }).filter(r => Object.values(r).some(v => v));
  return { headers, rows };
}

// ─── Import section ───────────────────────────────────────────────────────────
function ImportSection({ theme }) {
  const { activities, journalPrompts, importLogs, importCheckIns, importJournalEntries, importWellbeingNotes, importTasks } = useStore();
  const [results, setResults] = useState({});

  function setResult(key, msg) { setResults(r => ({ ...r, [key]: msg })); }

  function readFile(file, onParsed) {
    const reader = new FileReader();
    reader.onload = e => onParsed(e.target.result);
    reader.readAsText(file);
  }

  // ── Habit logs: wide format — date col + one col per habit name ──
  function handleHabitImport(e) {
    const file = e.target.files[0]; if (!file) return;
    readFile(file, text => {
      const { headers, rows } = parseCSV(text);
      const habitCols = headers.filter(h => h.toLowerCase() !== 'date');
      const matched = {}, skipped = [];
      habitCols.forEach(col => {
        const act = activities.find(a => a.name.toLowerCase() === col.toLowerCase());
        if (act) matched[col] = act.id;
        else skipped.push(col);
      });
      const newLogs = {};
      let count = 0;
      rows.forEach(row => {
        const date = row['date'] || row['Date'];
        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
        habitCols.forEach(col => {
          const actId = matched[col];
          if (!actId) return;
          const val = parseInt(row[col], 10);
          if (!isNaN(val) && val > 0) {
            if (!newLogs[actId]) newLogs[actId] = {};
            newLogs[actId][date] = val;
            count++;
          }
        });
      });
      importLogs(newLogs);
      const skipMsg = skipped.length ? ` · skipped: ${skipped.join(', ')}` : '';
      setResult('habits', `✓ ${count} log entries imported${skipMsg}`);
      e.target.value = '';
    });
  }

  // ── Check-ins: date, emotions (pipe-separated), notes ──
  function handleCheckInImport(e) {
    const file = e.target.files[0]; if (!file) return;
    readFile(file, text => {
      const { rows } = parseCSV(text);
      const newCI = {};
      rows.forEach(row => {
        const date = row['date'] || row['Date'];
        if (!date) return;
        const rawEmotions = row['emotions'] || row['Emotions'] || '';
        const emotions = rawEmotions.split(/[|,]/).map(e => e.trim().toLowerCase()).filter(Boolean);
        const notes = row['notes'] || row['Notes'] || '';
        if (emotions.length) newCI[date] = { emotions, notes };
      });
      importCheckIns(newCI);
      setResult('checkins', `✓ ${Object.keys(newCI).length} check-ins imported`);
      e.target.value = '';
    });
  }

  // ── Journal: date, prompt, answer ──
  function handleJournalImport(e) {
    const file = e.target.files[0]; if (!file) return;
    readFile(file, text => {
      const { rows } = parseCSV(text);
      const newEntries = {};
      let count = 0;
      rows.forEach(row => {
        const date   = row['date']   || row['Date'];
        const prompt = row['prompt'] || row['Prompt'];
        const answer = row['answer'] || row['Answer'];
        if (!date || !answer) return;
        const p = journalPrompts.find(p => p.text.toLowerCase() === (prompt || '').toLowerCase());
        const promptId = p ? p.id : `import-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        if (!newEntries[date]) newEntries[date] = {};
        newEntries[date][promptId] = answer;
        count++;
      });
      importJournalEntries(newEntries);
      setResult('journal', `✓ ${count} journal entries imported`);
      e.target.value = '';
    });
  }

  // ── Notes: date, note ──
  function handleNotesImport(e) {
    const file = e.target.files[0]; if (!file) return;
    readFile(file, text => {
      const { rows } = parseCSV(text);
      const newNotes = {};
      rows.forEach(row => {
        const date = row['date'] || row['Date'];
        const note = row['note'] || row['Note'] || row['notes'] || row['Notes'];
        if (date && note) newNotes[date] = note;
      });
      importWellbeingNotes(newNotes);
      setResult('notes', `✓ ${Object.keys(newNotes).length} notes imported`);
      e.target.value = '';
    });
  }

  // ── Tasks: title, notes, dueDate, complexity, tags, completed ──
  function handleTasksImport(e) {
    const file = e.target.files[0]; if (!file) return;
    readFile(file, text => {
      const { rows } = parseCSV(text);
      const newTasks = rows.map(row => ({
        id:         `task-import-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        title:      row['title']      || row['Title']      || '',
        notes:      row['notes']      || row['Notes']      || null,
        dueDate:    row['dueDate']    || row['due_date']   || null,
        complexity: row['complexity'] || row['Complexity'] || 'medium',
        tags:       [],
        completed:  (row['completed'] || '').toLowerCase() === 'true',
        createdAt:  new Date().toISOString().slice(0, 10),
      })).filter(t => t.title);
      importTasks(newTasks);
      setResult('tasks', `✓ ${newTasks.length} tasks imported`);
      e.target.value = '';
    });
  }

  // ── Template download helper ──
  function downloadCSV(filename, csvContent) {
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  function habitTemplate() {
    const cols   = ['date', ...activities.map(a => a.name)];
    const today  = new Date().toISOString().slice(0, 10);
    const zeroes = activities.map(() => '0').join(',');
    return `${cols.join(',')}\n${today},${zeroes}\n`;
  }

  function checkInTemplate() {
    const today = new Date().toISOString().slice(0, 10);
    return `date,emotions,notes\n${today},calm|grateful,Felt good today\n`;
  }

  function journalTemplate() {
    const today = new Date().toISOString().slice(0, 10);
    const rows = journalPrompts.map(p =>
      `${today},"${p.text}","Your answer here"`
    ).join('\n');
    return `date,prompt,answer\n${rows}\n`;
  }

  function notesTemplate() {
    const today = new Date().toISOString().slice(0, 10);
    return `date,note\n${today},Your note here\n`;
  }

  function tasksTemplate() {
    return `title,notes,dueDate,complexity,completed\nExample task,Optional notes,2026-01-31,medium,false\n`;
  }

  const IMPORTS = [
    {
      key:      'habits',
      label:    'Habit Logs',
      icon:     '☀️',
      hint:     'One row per day — columns match your habit names exactly.',
      onImport: handleHabitImport,
      onTemplate: () => downloadCSV('habit-logs-template.csv', habitTemplate()),
    },
    {
      key:      'checkins',
      label:    'Check-Ins',
      icon:     '🌿',
      hint:     'Columns: date, emotions (pipe-separated), notes.',
      onImport: handleCheckInImport,
      onTemplate: () => downloadCSV('checkins-template.csv', checkInTemplate()),
    },
    {
      key:      'journal',
      label:    'Journal',
      icon:     '📓',
      hint:     'Columns: date, prompt (exact text), answer.',
      onImport: handleJournalImport,
      onTemplate: () => downloadCSV('journal-template.csv', journalTemplate()),
    },
    {
      key:      'notes',
      label:    'Notes',
      icon:     '📝',
      hint:     'Columns: date, note.',
      onImport: handleNotesImport,
      onTemplate: () => downloadCSV('notes-template.csv', notesTemplate()),
    },
    {
      key:      'tasks',
      label:    'Tasks',
      icon:     '✅',
      hint:     'Columns: title, notes, dueDate (YYYY-MM-DD), complexity, completed.',
      onImport: handleTasksImport,
      onTemplate: () => downloadCSV('tasks-template.csv', tasksTemplate()),
    },
  ];

  return (
    <div className="mb-6">
      <p className={`text-xs font-bold uppercase tracking-widest pl-1 mb-2 ${theme.sectionLabel}`}>Import Data</p>
      <div className={`rounded-xl border shadow-sm overflow-hidden ${theme.card} ${theme.cardBorder}`}>
        {IMPORTS.map((imp, idx) => (
          <div key={imp.key} className={`px-3 py-3 ${idx > 0 ? 'border-t ' + theme.divider : ''}`}>
            <div className="flex items-center justify-between mb-1">
              <p className={`text-sm font-medium ${theme.text}`}>{imp.icon} {imp.label}</p>
              <div className="flex gap-1.5">
                <button
                  onClick={imp.onTemplate}
                  className={`text-xs px-2 py-1 rounded-lg font-semibold border ${theme.btnSecondary}`}
                  title="Download blank template CSV"
                >
                  Template
                </button>
                <label className={`text-xs px-2.5 py-1 rounded-lg font-semibold cursor-pointer ${theme.btnPrimary}`}>
                  Import
                  <input type="file" accept=".csv" className="hidden" onChange={imp.onImport} />
                </label>
              </div>
            </div>
            <p className={`text-[11px] ${theme.muted}`}>{imp.hint}</p>
            {results[imp.key] && (
              <p className={`text-xs mt-1.5 ${results[imp.key].startsWith('✓') ? 'text-green-600' : 'text-red-500'}`}>
                {results[imp.key]}
              </p>
            )}
          </div>
        ))}
        <div className={`px-3 py-2.5 border-t ${theme.divider}`}>
          <p className={`text-[11px] ${theme.muted}`}>Templates are pre-filled with your current habits & prompts. Imports merge — nothing is overwritten.</p>
        </div>
      </div>
    </div>
  );
}

// ─── Daily Message Template ───────────────────────────────────────────────────
function DailyMessageSection({ theme }) {
  const { dailyMessageDefaults, saveDailyMessageDefaults } = useStore();
  const defs = dailyMessageDefaults || {};
  const [book,  setBook]  = useState(defs.book  || '');
  const [notes, setNotes] = useState(defs.notes || '');

  function handleBook(v)  { setBook(v);  saveDailyMessageDefaults({ book: v }); }
  function handleNotes(v) { setNotes(v); saveDailyMessageDefaults({ notes: v }); }

  return (
    <div className="mb-6">
      <p className={`text-xs font-bold uppercase tracking-widest pl-1 mb-2 ${theme.sectionLabel}`}>Daily Message Defaults</p>
      <div className={`rounded-xl border shadow-sm overflow-hidden ${theme.card} ${theme.cardBorder}`}>
        <div className="flex items-center px-3 py-2.5 gap-2">
          <span className="text-base flex-shrink-0">📚</span>
          <input
            type="text"
            value={book}
            onChange={e => handleBook(e.target.value)}
            placeholder="Default book title…"
            className={`flex-1 text-sm outline-none bg-transparent ${theme.text}`}
          />
        </div>
        <div className={`border-t ${theme.divider}`}>
          <textarea
            value={notes}
            onChange={e => handleNotes(e.target.value)}
            placeholder="Default notes / signature text… (prepopulates the notes field each day)"
            rows={3}
            className={`w-full text-sm px-3 py-3 outline-none resize-none bg-transparent rounded-b-xl ${theme.text}`}
          />
        </div>
      </div>
      <p className={`text-xs mt-1.5 pl-1 ${theme.muted}`}>Pre-fills the Daily Message when no draft exists for the day yet.</p>
    </div>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function SettingsScreen({ theme }) {
  const { darkMode, toggleDarkMode, gamify, toggleGameify, weekStartDay, setWeekStartDay } = useStore();

  return (
    <div className="pb-4">
      <div className="mb-4">
        <h1 className={`text-xl font-bold ${theme.text}`}>Settings</h1>
      </div>

      {/* ── Appearance ── */}
      <div className="mb-6">
        <p className={`text-xs font-bold uppercase tracking-widest pl-1 mb-2 ${theme.sectionLabel}`}>Appearance</p>
        <div className={`rounded-xl border shadow-sm overflow-hidden ${theme.card} ${theme.cardBorder}`}>
          <ToggleRow
            label="Dark Mode"
            description={darkMode ? 'Currently on' : 'Currently off'}
            value={darkMode}
            onToggle={toggleDarkMode}
            theme={theme}
          />
          <div className={`border-t ${theme.divider}`} />
          <ToggleRow
            label="⚔️ Quest Mode"
            description={gamify ? 'Momentum Quest active' : 'Switch to Momentum Quest mode'}
            value={gamify}
            onToggle={toggleGameify}
            theme={theme}
          />
        </div>
      </div>

      {/* ── Week ── */}
      <div className="mb-6">
        <p className={`text-xs font-bold uppercase tracking-widest pl-1 mb-2 ${theme.sectionLabel}`}>Week</p>
        <div className={`rounded-xl border shadow-sm overflow-hidden ${theme.card} ${theme.cardBorder}`}>
          <div className="flex items-center justify-between px-3 py-3">
            <p className={`text-sm font-medium ${theme.text}`}>First day of the week</p>
            <select
              value={weekStartDay}
              onChange={e => setWeekStartDay(Number(e.target.value))}
              className={`text-sm px-3 py-1.5 rounded-lg border outline-none ${theme.select}`}
            >
              {WEEK_START_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── Tags ── */}
      <TagManager theme={theme} />

      {/* ── Daily Message ── */}
      <DailyMessageSection theme={theme} />

      {/* ── Reminders ── */}
      <RemindersSection theme={theme} />

      {/* ── Import ── */}
      <ImportSection theme={theme} />

    </div>
  );
}
