import { useState, useEffect, useRef } from 'react';
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
import { todayStr, getWeekStart, getWeekDays, MONTH_NAMES_FULL, calcPerfectDayStreak } from '../data';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const DAY_NAMES  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const DAY_SHORT  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const DAY_LETTER = ['S','M','T','W','T','F','S'];

function isDueOn(activity, dateStr) {
  const days = activity.scheduledDays;
  if (!days || days.length === 0) return true;
  const dow = new Date(dateStr + 'T00:00:00').getDay();
  return days.includes(dow);
}

function scheduledLabel(days) {
  if (!days || days.length === 0) return null;
  if (days.length === 7) return null;
  return days.map(d => DAY_SHORT[d]).join(' · ');
}

// ─── Day picker ───────────────────────────────────────────────────────────────
function DayPicker({ selected = [], onChange, theme }) {
  function toggle(dow) {
    onChange(selected.includes(dow) ? selected.filter(d => d !== dow) : [...selected, dow].sort((a, b) => a - b));
  }
  return (
    <div>
      <p className={`text-xs mb-1.5 ${theme.muted}`}>Scheduled days <span className={`${theme.muted} opacity-60`}>(leave empty for any day)</span></p>
      <div className="flex gap-1">
        {DAY_LETTER.map((ltr, dow) => (
          <button
            key={dow}
            onClick={() => toggle(dow)}
            className={`flex-1 h-7 rounded-lg text-xs font-semibold transition-all ${
              selected.includes(dow) ? theme.btnPrimary : theme.btnSecondary
            }`}
          >{ltr}</button>
        ))}
      </div>
    </div>
  );
}

function offsetDate(dateStr, delta) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function barColor(pct) {
  if (pct >= 100) return 'bg-green-500';
  if (pct >= 75)  return 'bg-lime-400';
  if (pct >= 50)  return 'bg-yellow-400';
  if (pct >= 25)  return 'bg-orange-400';
  return 'bg-red-400';
}

// ─── Tag pill (view mode) ─────────────────────────────────────────────────────
function TagPill({ tagId, allTags }) {
  const tag = allTags.find(t => t.id === tagId);
  if (!tag) return null;
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium text-white" style={{ backgroundColor: tag.color }}>
      {tag.label}
    </span>
  );
}

// ─── Drag handle dots ─────────────────────────────────────────────────────────
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

// ─── Habit card ───────────────────────────────────────────────────────────────
function HabitCard({ activity, allTags, theme, editMode, onDelete, onArchive, hasLogs, dragHandleProps, isDragOverlay, viewDate }) {
  const { updateActivity, getCount, getWeeklyTotal, getStreak, logActivity, weekStartDay } = useStore();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [confirmDel,   setConfirmDel]   = useState(false);
  const [localTarget,  setLocalTarget]  = useState(String(activity.weeklyTarget ?? 1));

  const targetInvalid = activity.hasTarget && (localTarget === '' || parseInt(localTarget) < 1 || isNaN(parseInt(localTarget)));

  function handleTargetChange(val) {
    setLocalTarget(val);
    const n = parseInt(val);
    if (n >= 1) updateActivity(activity.id, { weeklyTarget: n });
  }
  function handleTargetBlur() {
    if (targetInvalid) setLocalTarget(String(activity.weeklyTarget));
  }
  function toggleTag(id) {
    const cur = activity.tags || [];
    updateActivity(activity.id, { tags: cur.includes(id) ? cur.filter(t => t !== id) : [...cur, id] });
  }

  // ── EDIT MODE ──────────────────────────────────────────────────────────────
  if (editMode) {
    return (
      <div className={`rounded-xl mb-2 shadow-sm border ${theme.card} ${theme.cardBorder} ${isDragOverlay ? 'shadow-xl rotate-1' : ''}`}>
        {/* Main edit row */}
        <div className="flex items-center gap-2 p-2.5">
          <DragHandle handleProps={dragHandleProps || {}} theme={theme} />

          <input
            type="text"
            value={activity.emoji}
            onChange={e => updateActivity(activity.id, { emoji: e.target.value })}
            className={`w-10 text-center text-sm px-1 py-1.5 rounded-lg border outline-none flex-shrink-0 ${theme.input}`}
          />

          <input
            type="text"
            value={activity.name}
            onChange={e => updateActivity(activity.id, { name: e.target.value })}
            placeholder="Habit name"
            className={`flex-1 min-w-0 text-sm px-2 py-1.5 rounded-lg border outline-none ${theme.input}`}
          />

          {activity.hasTarget && (
            <div className="flex items-center gap-1 flex-shrink-0">
              <input
                type="number" min="1"
                value={localTarget}
                onChange={e => handleTargetChange(e.target.value)}
                onBlur={handleTargetBlur}
                className={`w-10 text-xs text-center px-1 py-1.5 rounded-lg border outline-none transition-colors ${
                  targetInvalid ? 'border-red-400 bg-red-50 text-red-600' : theme.input
                }`}
              />
              <span className={`text-xs ${theme.muted}`}>/wk</span>
            </div>
          )}

          <button
            onClick={() => setShowAdvanced(s => !s)}
            title="Notes, tags & settings"
            className={`text-sm px-3 py-1.5 rounded-lg flex-shrink-0 font-medium transition-colors ${showAdvanced ? theme.btnPrimary : theme.btnSecondary}`}
          >⋯</button>
        </div>

        {/* Advanced panel */}
        {showAdvanced && (
          <div className={`px-3 pb-3 pt-1 border-t space-y-2 ${theme.divider}`}>
            <textarea
              placeholder="Description (optional)"
              value={activity.notes || ''}
              onChange={e => updateActivity(activity.id, { notes: e.target.value })}
              rows={2}
              className={`w-full text-xs px-2 py-2 rounded-lg border outline-none resize-none ${theme.input}`}
            />

            <div className={`flex items-center justify-between px-2 py-2 rounded-lg ${theme.progressBg}`}>
              <div>
                <p className={`text-xs font-medium ${theme.text}`}>Weekly target</p>
                <p className={`text-xs ${theme.muted}`}>{activity.hasTarget ? 'Track toward a goal' : 'Just log occurrences'}</p>
              </div>
              <button
                onClick={() => updateActivity(activity.id, { hasTarget: !activity.hasTarget })}
                className={`relative w-10 h-5 rounded-full transition-colors duration-200 ${activity.hasTarget ? theme.toggleOn : theme.toggleOff}`}
              >
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${activity.hasTarget ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>

            <div className={`flex items-center justify-between px-2 py-2 rounded-lg ${theme.progressBg}`}>
              <div>
                <p className={`text-xs font-medium ${theme.text}`}>Daily accountability</p>
                <p className={`text-xs ${theme.muted}`}>{activity.accountability ? 'Shown in daily message' : 'Not in daily message'}</p>
              </div>
              <button
                onClick={() => updateActivity(activity.id, { accountability: !activity.accountability })}
                className={`relative w-10 h-5 rounded-full transition-colors duration-200 ${activity.accountability ? theme.toggleOn : theme.toggleOff}`}
              >
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${activity.accountability ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>

            <DayPicker
              selected={activity.scheduledDays || []}
              onChange={days => updateActivity(activity.id, { scheduledDays: days })}
              theme={theme}
            />

            {allTags.length > 0 && (
              <div>
                <p className={`text-xs mb-1.5 ${theme.muted}`}>Tags</p>
                <div className="flex flex-wrap gap-1.5">
                  {allTags.map(tag => (
                    <button
                      key={tag.id}
                      onClick={() => toggleTag(tag.id)}
                      className={`text-xs px-2.5 py-1 rounded-full font-medium border-2 transition-all ${
                        (activity.tags || []).includes(tag.id) ? 'text-white border-transparent' : 'bg-transparent border-gray-200'
                      }`}
                      style={(activity.tags || []).includes(tag.id) ? { backgroundColor: tag.color, borderColor: tag.color } : { color: tag.color }}
                    >{tag.label}</button>
                  ))}
                </div>
              </div>
            )}

            {/* Archive / Delete */}
            <div className={`pt-1 border-t ${theme.divider}`}>
              {confirmDel ? (
                <div>
                  <p className={`text-xs mb-2 ${theme.muted}`}>
                    {hasLogs
                      ? 'This habit has logged data. It will be archived (hidden) and your history kept.'
                      : 'No logs found. This will be permanently deleted.'}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { hasLogs ? onArchive(activity.id) : onDelete(activity.id); setConfirmDel(false); setShowAdvanced(false); }}
                      className="flex-1 py-1.5 rounded-lg text-xs font-semibold bg-red-500 text-white"
                    >{hasLogs ? 'Archive' : 'Delete'}</button>
                    <button onClick={() => setConfirmDel(false)} className={`flex-1 py-1.5 rounded-lg text-xs font-semibold ${theme.btnSecondary}`}>Cancel</button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDel(true)}
                  className={`w-full py-1.5 rounded-lg text-xs font-semibold text-red-500 border border-red-200 hover:bg-red-50 transition-colors`}
                >
                  {hasLogs ? 'Archive habit…' : 'Delete habit…'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── VIEW MODE ──────────────────────────────────────────────────────────────
  const weekStart = getWeekStart(viewDate, weekStartDay);
  const count     = getCount(activity.id, viewDate);
  const weekTotal = getWeeklyTotal(activity.id, weekStart);
  const streak    = getStreak(activity.id);
  const hit       = activity.hasTarget && weekTotal >= activity.weeklyTarget;
  const pct       = activity.hasTarget ? Math.round((weekTotal / activity.weeklyTarget) * 100) : 0;
  const barWidth  = Math.min(100, pct);
  const dueToday  = isDueOn(activity, viewDate);
  const schedLabel = scheduledLabel(activity.scheduledDays);

  return (
    <div className={`rounded-xl p-3 mb-2 shadow-sm border ${theme.card} ${theme.cardBorder}`}>
      <div className="flex items-center gap-2">
        <span className="text-xl flex-shrink-0">{activity.emoji}</span>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold truncate ${theme.text}`}>{activity.name}</p>
          {activity.notes && <p className={`text-xs mt-0.5 leading-snug ${theme.muted}`}>{activity.notes}</p>}
          {activity.hasTarget && dueToday && (
            <p className={`text-xs mt-0.5 ${hit ? theme.hitTarget + ' font-medium' : theme.muted}`}>
              {hit ? `✓ ${weekTotal}/${activity.weeklyTarget} this week` : `${weekTotal}/${activity.weeklyTarget} this week`}
            </p>
          )}
          {!dueToday && schedLabel && (
            <p className={`text-xs mt-0.5 ${theme.muted}`}>📅 Scheduled: {schedLabel}</p>
          )}
          {(activity.accountability || (activity.tags || []).length > 0) && (
            <div className="flex flex-wrap gap-1 mt-1">
              {activity.accountability && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-violet-100 text-violet-700 leading-none">
                  Daily
                </span>
              )}
              {allTags.filter(t => (activity.tags || []).includes(t.id)).map(t => (
                <TagPill key={t.id} tagId={t.id} allTags={allTags} />
              ))}
            </div>
          )}
        </div>

        {streak > 0 && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0 border ${theme.streakBadge}`}>
            🔥 {streak}d
          </span>
        )}

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={() => logActivity(activity.id, viewDate, -1)}
            disabled={count === 0}
            className={`w-7 h-7 rounded-lg flex items-center justify-center text-base font-bold transition-colors disabled:opacity-30 ${theme.btnSecondary}`}
          >−</button>
          <span className={`text-xl font-bold w-7 text-center tabular-nums ${count > 0 ? theme.tabActiveText : theme.muted}`}>
            {count}
          </span>
          <button
            onClick={() => logActivity(activity.id, viewDate, 1)}
            className={`w-7 h-7 rounded-lg flex items-center justify-center text-base font-bold active:scale-95 transition-all ${theme.btnPrimary}`}
          >+</button>
        </div>
      </div>

      {activity.hasTarget && dueToday && (
        <div className="flex items-center gap-2 mt-2">
          <div className={`flex-1 h-1.5 rounded-full overflow-hidden ${theme.progressBg}`}>
            <div className={`h-1.5 rounded-full transition-all duration-500 ${barColor(pct)}`} style={{ width: `${barWidth}%` }} />
          </div>
          <span className={`text-xs font-medium w-10 text-right ${pct >= 100 ? 'text-green-500 font-bold' : hit ? theme.hitTarget : theme.muted}`}>{pct}%</span>
        </div>
      )}
    </div>
  );
}

// ─── Sortable wrapper ─────────────────────────────────────────────────────────
function SortableHabitCard(props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.activity.id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0 : 1 }}>
      <HabitCard {...props} dragHandleProps={{ ...attributes, ...listeners }} />
    </div>
  );
}

// ─── Add habit form (new habits only) ────────────────────────────────────────
const BLANK_HABIT = { name: '', emoji: '📌', weeklyTarget: 1, hasTarget: true, tags: [], notes: '', accountability: false, scheduledDays: [] };

function AddHabitForm({ allTags, theme, onSave, onCancel }) {
  const [form, setForm] = useState({ ...BLANK_HABIT, weeklyTarget: '1' });

  const targetInvalid = form.hasTarget && (form.weeklyTarget === '' || parseInt(form.weeklyTarget) < 1 || isNaN(parseInt(form.weeklyTarget)));

  function toggleTag(id) {
    setForm(f => ({ ...f, tags: f.tags.includes(id) ? f.tags.filter(t => t !== id) : [...f.tags, id] }));
  }
  function handleSave() {
    if (!form.name.trim() || targetInvalid) return;
    onSave({ ...form, weeklyTarget: parseInt(form.weeklyTarget) });
  }

  return (
    <div className={`rounded-xl mb-2 border shadow-sm overflow-hidden ${theme.card} ${theme.cardBorder}`}>
      <p className={`text-xs font-bold px-3 pt-3 pb-2 border-b ${theme.textSub} ${theme.divider}`}>New Habit</p>
      <div className="p-3 space-y-2">
        <div className="flex gap-2">
          <input type="text" value={form.emoji} onChange={e => setForm(f => ({ ...f, emoji: e.target.value }))}
            className={`w-12 text-sm px-2 py-1.5 rounded-lg border outline-none text-center ${theme.input}`} placeholder="😀" />
          <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            className={`flex-1 text-sm px-2 py-1.5 rounded-lg border outline-none ${theme.input}`} placeholder="Habit name" autoFocus />
        </div>
        <textarea placeholder="Description (optional)" value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          rows={2} className={`w-full text-sm px-3 py-2 rounded-lg border outline-none resize-none ${theme.input}`} />
        <div className="flex items-center gap-1.5">
          <span className={`text-xs whitespace-nowrap ${theme.muted}`}>Target:</span>
          <input type="number" min="1" value={form.weeklyTarget} disabled={!form.hasTarget}
            onChange={e => setForm(f => ({ ...f, weeklyTarget: e.target.value }))}
            className={`w-12 text-xs px-2 py-1.5 rounded-lg border outline-none text-center disabled:opacity-30 transition-colors ${
              targetInvalid ? 'border-red-400 bg-red-50 text-red-600' : theme.input
            }`} />
          <span className={`text-xs ${theme.muted}`}>/wk</span>
          {targetInvalid && <span className="text-xs text-red-500 font-medium">required</span>}
        </div>
        <div className={`flex items-center justify-between px-2 py-2 rounded-lg ${theme.progressBg}`}>
          <div>
            <p className={`text-xs font-medium ${theme.text}`}>Weekly target</p>
            <p className={`text-xs ${theme.muted}`}>{form.hasTarget ? 'Track toward a goal' : 'Just log occurrences'}</p>
          </div>
          <button onClick={() => setForm(f => ({ ...f, hasTarget: !f.hasTarget }))}
            className={`relative w-10 h-5 rounded-full transition-colors duration-200 ${form.hasTarget ? theme.toggleOn : theme.toggleOff}`}>
            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${form.hasTarget ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </div>
        <div className={`flex items-center justify-between px-2 py-2 rounded-lg ${theme.progressBg}`}>
          <div>
            <p className={`text-xs font-medium ${theme.text}`}>Daily accountability</p>
            <p className={`text-xs ${theme.muted}`}>{form.accountability ? 'Shown in daily message' : 'Not in daily message'}</p>
          </div>
          <button onClick={() => setForm(f => ({ ...f, accountability: !f.accountability }))}
            className={`relative w-10 h-5 rounded-full transition-colors duration-200 ${form.accountability ? theme.toggleOn : theme.toggleOff}`}>
            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${form.accountability ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </div>
        <DayPicker
          selected={form.scheduledDays || []}
          onChange={days => setForm(f => ({ ...f, scheduledDays: days }))}
          theme={theme}
        />
        {allTags.length > 0 && (
          <div>
            <p className={`text-xs mb-1.5 ${theme.muted}`}>Tags</p>
            <div className="flex flex-wrap gap-1.5">
              {allTags.map(tag => (
                <button key={tag.id} onClick={() => toggleTag(tag.id)}
                  className={`text-xs px-2.5 py-1 rounded-full font-medium border-2 transition-all ${form.tags.includes(tag.id) ? 'text-white border-transparent' : 'bg-transparent border-gray-200'}`}
                  style={form.tags.includes(tag.id) ? { backgroundColor: tag.color, borderColor: tag.color } : { color: tag.color }}>
                  {tag.label}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <button onClick={handleSave} className={`flex-1 py-1.5 rounded-lg text-xs font-semibold ${theme.btnPrimary}`}>Add Habit</button>
          <button onClick={onCancel}   className={`flex-1 py-1.5 rounded-lg text-xs font-semibold ${theme.btnSecondary}`}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── Consecutive-weeks helper ─────────────────────────────────────────────────
// Counts how many weeks in a row (going back from currentWeekStart) all
// selected habits hit their weekly targets. Includes the current week if done.
function calcConsecutiveWeeks(habitIds, logs, activities, currentWeekStart) {
  let count = 0;
  let ws    = currentWeekStart;
  while (true) {
    const wDays  = getWeekDays(ws);
    const allHit = habitIds.every(id => {
      const act = activities.find(a => a.id === id);
      if (!act) return false;
      const total = wDays.reduce((s, d) => s + ((logs[id] || {})[d] || 0), 0);
      return total >= (act.weeklyTarget || 1);
    });
    if (!allHit) break;
    count++;
    ws = offsetDate(ws, -7);
    if (count > 52) break; // safety cap
  }
  return count;
}

// ─── Milestone card ───────────────────────────────────────────────────────────
// progress: { current, target, label } — optional, drives the mini bar
function MilestoneCard({ icon, label, reward, enabled, progress, onToggle, onEdit, onDelete, theme }) {
  const pct    = progress ? Math.min(100, Math.round((progress.current / progress.target) * 100)) : null;
  const done   = pct === 100;
  return (
    <div className={`px-3 py-2.5 rounded-xl border transition-opacity ${theme.progressBg} ${theme.cardBorder} ${!enabled ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-2">
        <span className="text-base flex-shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-semibold ${theme.text}`}>{label}</p>
          {reward ? (
            <p className={`text-[10px] truncate ${theme.muted}`}>🎁 {reward}</p>
          ) : (
            <p className={`text-[10px] opacity-50 ${theme.muted}`}>No reward set</p>
          )}
        </div>
        {onToggle && (
          <button
            onClick={onToggle}
            className={`relative w-8 h-4 rounded-full transition-colors duration-200 flex-shrink-0 ${enabled ? theme.toggleOn : theme.toggleOff}`}
          >
            <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform duration-200 ${enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </button>
        )}
        <button onClick={onEdit}   className={`text-xs px-2 py-1 rounded-lg font-medium flex-shrink-0 ${theme.btnSecondary}`}>Edit</button>
        <button onClick={onDelete} className="text-xs px-2 py-1 rounded-lg font-medium flex-shrink-0 bg-red-100 text-red-500">✕</button>
      </div>
      {progress && (
        <div className="mt-2 flex items-center gap-2">
          <div className={`flex-1 h-1.5 rounded-full overflow-hidden ${theme.card}`}>
            <div
              className={`h-1.5 rounded-full transition-all duration-500 ${done ? 'bg-green-500' : pct >= 75 ? 'bg-lime-400' : pct >= 50 ? 'bg-yellow-400' : pct >= 25 ? 'bg-orange-400' : 'bg-red-400'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className={`text-[10px] font-semibold tabular-nums flex-shrink-0 ${done ? 'text-green-500' : theme.muted}`}>
            {done ? '✓ Done!' : progress.label}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Multi-select filter chips ────────────────────────────────────────────────
function MultiChips({ options, selected, onToggle, theme }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(opt => (
        <button key={opt} onClick={() => onToggle(opt)}
          className={`text-xs px-2.5 py-1 rounded-full font-medium transition-all ${selected.includes(opt) ? theme.btnPrimary : theme.btnSecondary}`}
        >{opt}</button>
      ))}
    </div>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function HabitsScreen({ theme, gamify, onNavigate }) {
  const { activities, logs, tags, addActivity, deleteActivity, archiveActivity, setActivityOrder, getWeeklyTotal, weekStartDay, rewardMilestone, setRewardMilestone, milestoneSeen, setMilestoneSeen, uiPrefs, setUiPref, tasks } = useStore();
  const activeActivities = activities.filter(a => !a.archived);
  const [editMode,         setEditMode]         = useState(false);
  const [addingNew,        setAddingNew]        = useState(false);
  const [activeId,         setActiveId]         = useState(null);
  const [filterOpen,       setFilterOpen]       = useState(false);

  const habitPrefs = uiPrefs?.habits || {};
  const filterStatuses = habitPrefs.filterStatuses || [];
  const filterTags     = habitPrefs.filterTags     || [];
  function setFilterStatuses(val) { setUiPref('habits', 'filterStatuses', typeof val === 'function' ? val(filterStatuses) : val); }
  function setFilterTags(val)     { setUiPref('habits', 'filterTags',     typeof val === 'function' ? val(filterTags) : val); }
  const [viewDate,         setViewDate]         = useState(() => todayStr());
  const [milestoneTriggered, setMilestoneTriggered] = useState(null);
  const [milestoneOpen,      setMilestoneOpen]      = useState(false);
  const [milestoneModal,     setMilestoneModal]     = useState(null);
  const [todayTasksOpen,     setTodayTasksOpen]     = useState(false);
  // milestoneModal: null | { mode:'add'|'edit', type:'daily'|'weekly'|'streak', count, reward, habits, days, streakId }
  const popupShownRef = useRef(new Set()); // tracks what's been shown this page session (dedupes rapid re-renders)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const today       = todayStr();
  const isToday     = viewDate === today;

  // Today's Tasks widget — overdue + due today + urgent, non-completed
  const todayTasks = (tasks || []).filter(t => {
    if (t.completed) return false;
    const isUrgent  = t.complexity === 'critical';
    const isOverdue = t.dueDate && t.dueDate < today;
    const isDueToday = t.dueDate === today;
    return isUrgent || isOverdue || isDueToday;
  }).sort((a, b) => {
    // urgent first, then overdue, then due today
    const rank = t => (t.complexity === 'critical' ? 0 : t.dueDate < today ? 1 : 2);
    return rank(a) - rank(b);
  });

  const viewDateObj = new Date(viewDate + 'T00:00:00');
  const viewDateLabel = isToday
    ? 'Today'
    : `${DAY_NAMES[viewDateObj.getDay()]}, ${viewDateObj.getDate()} ${MONTH_NAMES_FULL[viewDateObj.getMonth()]}`;
  const weekStart = getWeekStart(viewDate, weekStartDay);

  function goBack()    { setViewDate(d => offsetDate(d, -1)); }
  function goForward() { if (!isToday) setViewDate(d => offsetDate(d, +1)); }
  function goToToday() { setViewDate(todayStr()); }

  // ── Reward milestone watchers ─────────────────────────────────────────────
  const weekDays          = getWeekDays(weekStart);
  const todayLoggedCount  = activeActivities.filter(a => (logs[a.id] || {})[today] > 0).length;
  const perfectStreak     = calcPerfectDayStreak(activeActivities, logs);
  const cwHabits          = rewardMilestone?.consecutiveWeeksHabits || [];
  const consecutiveWeeksCount = rewardMilestone?.consecutiveWeeksEnabled && cwHabits.length
    ? calcConsecutiveWeeks(cwHabits, logs, activeActivities, weekStart)
    : 0;
  const activeMilestoneCount =
    ((rewardMilestone?.enabled || rewardMilestone?.dailyCreated) ? 1 : 0) +
    ((rewardMilestone?.weeklyEnabled || (rewardMilestone?.weeklyHabits || []).length > 0) ? 1 : 0) +
    ((rewardMilestone?.consecutiveWeeksEnabled || cwHabits.length > 0) ? 1 : 0) +
    (rewardMilestone?.streakMilestones || []).length;

  // ── Milestone watchers (date-aware, persisted via store) ─────────────────────

  // Daily count milestone — resets each calendar day
  useEffect(() => {
    if (!rewardMilestone?.enabled || !rewardMilestone?.count) return;
    const target   = Number(rewardMilestone.count);
    const seenKey  = `daily-${today}`;
    if (todayLoggedCount >= target && milestoneSeen.daily !== seenKey && !popupShownRef.current.has(seenKey)) {
      popupShownRef.current.add(seenKey);
      setMilestoneSeen({ daily: seenKey });
      setMilestoneTriggered({ label: `${target} habits logged today`, reward: rewardMilestone.reward });
    }
  }, [todayLoggedCount, rewardMilestone, today, milestoneSeen]);

  // Weekly per-habit targets milestone — resets each week (keyed by weekStart)
  useEffect(() => {
    if (!rewardMilestone?.weeklyEnabled) return;
    const habitIds = rewardMilestone?.weeklyHabits || [];
    if (!habitIds.length) return;
    const allHit = habitIds.every(id => {
      const act = activeActivities.find(a => a.id === id);
      if (!act) return false;
      const weekTotal = weekDays.reduce((s, d) => s + ((logs[id] || {})[d] || 0), 0);
      return weekTotal >= (act.weeklyTarget || 1);
    });
    const seenKey = `weekly-${weekStart}`;
    if (allHit && milestoneSeen.weekly !== seenKey && !popupShownRef.current.has(seenKey)) {
      popupShownRef.current.add(seenKey);
      setMilestoneSeen({ weekly: seenKey });
      setMilestoneTriggered({ label: 'All weekly targets hit!', reward: rewardMilestone.weeklyReward });
    }
  }, [logs, rewardMilestone, weekDays, weekStart, milestoneSeen]);

  // Perfect-day streak milestones — keyed by streak milestone id + streak count
  useEffect(() => {
    if (!rewardMilestone?.streakMilestonesEnabled) return;
    const milestones  = rewardMilestone?.streakMilestones || [];
    const seenStreaks  = milestoneSeen.streaks || {};
    for (const m of milestones) {
      if (perfectStreak >= m.days && seenStreaks[m.id] !== perfectStreak) {
        const seenKey = `streak-${m.id}-${perfectStreak}`;
        if (!popupShownRef.current.has(seenKey)) {
          popupShownRef.current.add(seenKey);
          setMilestoneSeen({ streaks: { ...seenStreaks, [m.id]: perfectStreak } });
          setMilestoneTriggered({ label: `${m.days} perfect days in a row!`, reward: m.reward, isStreak: true });
          break;
        }
      }
    }
  }, [perfectStreak, rewardMilestone, milestoneSeen]);

  // Consecutive weeks milestone — fires when N weeks in a row all targets are hit
  useEffect(() => {
    if (!rewardMilestone?.consecutiveWeeksEnabled || !consecutiveWeeksCount) return;
    const target  = rewardMilestone.consecutiveWeeksTarget || 4;
    if (consecutiveWeeksCount >= target) {
      const seenKey = `consec-${weekStart}-${consecutiveWeeksCount}`;
      if (milestoneSeen.consecutiveWeeks !== seenKey && !popupShownRef.current.has(seenKey)) {
        popupShownRef.current.add(seenKey);
        setMilestoneSeen({ consecutiveWeeks: seenKey });
        setMilestoneTriggered({
          label: `${consecutiveWeeksCount} weeks in a row hitting your targets!`,
          reward: rewardMilestone.consecutiveWeeksReward,
        });
      }
    }
  }, [consecutiveWeeksCount, rewardMilestone, weekStart, milestoneSeen]);

  function saveMilestoneModal() {
    const m = milestoneModal;
    if (!m) return;
    if (m.type === 'daily') {
      setRewardMilestone({ enabled: true, dailyCreated: true, count: Number(m.count) || 5, reward: (m.reward || '').trim() });
    } else if (m.type === 'weekly') {
      setRewardMilestone({ weeklyEnabled: true, weeklyHabits: m.habits || [], weeklyReward: (m.reward || '').trim() });
    } else if (m.type === 'weeks') {
      setRewardMilestone({
        consecutiveWeeksEnabled: true,
        consecutiveWeeksHabits:  m.habits || [],
        consecutiveWeeksTarget:  Number(m.weeksTarget) || 4,
        consecutiveWeeksReward:  (m.reward || '').trim(),
      });
    } else if (m.type === 'streak') {
      const days = Number(m.days);
      if (!days || days < 1) return;
      const existing = rewardMilestone?.streakMilestones || [];
      if (m.mode === 'edit' && m.streakId) {
        setRewardMilestone({
          streakMilestonesEnabled: true,
          streakMilestones: existing
            .map(s => s.id === m.streakId ? { ...s, days, reward: (m.reward || '').trim() } : s)
            .sort((a, b) => a.days - b.days),
        });
      } else {
        const dupe = existing.find(s => s.days === days);
        setRewardMilestone({
          streakMilestonesEnabled: true,
          streakMilestones: dupe
            ? existing.map(s => s.days === days ? { ...s, reward: (m.reward || '').trim() } : s)
            : [...existing, { id: `sm-${Date.now()}`, days, reward: (m.reward || '').trim() }].sort((a, b) => a.days - b.days),
        });
      }
    }
    setMilestoneModal(null);
  }

  function deleteStreakMilestone(id) {
    const remaining = (rewardMilestone?.streakMilestones || []).filter(m => m.id !== id);
    setRewardMilestone({
      streakMilestones: remaining,
      ...(remaining.length === 0 ? { streakMilestonesEnabled: false } : {}),
    });
  }

  const statusOptions = ['Achieved', 'Behind', 'No target', 'Daily'];
  const tagOptions    = tags.map(t => t.label);

  function toggleStatus(opt) {
    setFilterStatuses(prev => {
      const next = prev.includes(opt) ? prev.filter(s => s !== opt) : [...prev, opt];
      return next.length === statusOptions.length ? [] : next;
    });
  }
  function toggleTagFilter(label) {
    setFilterTags(prev => {
      const next = prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label];
      return next.length === tagOptions.length ? [] : next;
    });
  }

  const activeFilters = (filterStatuses.length > 0 ? 1 : 0) + (filterTags.length > 0 ? 1 : 0);

  const filtered = activeActivities.filter(a => {
    if (filterStatuses.length > 0) {
      const wt = getWeeklyTotal(a.id, weekStart);
      const match =
        (filterStatuses.includes('No target') && !a.hasTarget) ||
        (filterStatuses.includes('Achieved')  && a.hasTarget && wt >= a.weeklyTarget) ||
        (filterStatuses.includes('Behind')    && a.hasTarget && wt < a.weeklyTarget) ||
        (filterStatuses.includes('Daily')     && !!a.accountability);
      if (!match) return false;
    }
    if (filterTags.length > 0) {
      const actTagLabels = (a.tags || []).map(tid => tags.find(t => t.id === tid)?.label).filter(Boolean);
      if (!filterTags.some(ft => actTagLabels.includes(ft))) return false;
    }
    return true;
  });

  function handleDragStart({ active }) { setActiveId(active.id); }
  function handleDragEnd({ active, over }) {
    setActiveId(null);
    if (!over || active.id === over.id) return;
    const oldIdx = activeActivities.findIndex(a => a.id === active.id);
    const newIdx = activeActivities.findIndex(a => a.id === over.id);
    setActivityOrder(arrayMove(activeActivities, oldIdx, newIdx));
  }
  function handleDragCancel() { setActiveId(null); }

  function exitEditMode() { setEditMode(false); setAddingNew(false); }
  function clearFilters() { setFilterStatuses([]); setFilterTags([]); }

  const activeActivity = activeId ? activeActivities.find(a => a.id === activeId) : null;

  return (
    <div className="pb-4">

      {/* Today's Tasks widget */}
      {isToday && todayTasks.length > 0 && (
        <div className={`rounded-xl border shadow-sm mb-3 overflow-hidden ${theme.card} ${theme.cardBorder}`}>
          <button
            onClick={() => setTodayTasksOpen(o => !o)}
            className={`w-full flex items-center justify-between px-3 py-2 ${todayTasksOpen ? `border-b ${theme.divider}` : ''}`}
          >
            <div className="flex items-center gap-2">
              <p className={`text-[10px] font-bold uppercase tracking-widest ${theme.muted}`}>📋 Today's Tasks</p>
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${todayTasks.some(t => t.dueDate && t.dueDate < today) ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
                {todayTasks.length}
              </span>
            </div>
            <span className={`text-xs ${theme.muted}`}>{todayTasksOpen ? '▲' : '▼'}</span>
          </button>
          {todayTasksOpen && (
            <div className="divide-y" style={{ borderColor: 'transparent' }}>
              {todayTasks.slice(0, 5).map(t => {
                const isUrgent  = t.complexity === 'critical';
                const isOverdue = t.dueDate && t.dueDate < today;
                return (
                  <div key={t.id} className={`flex items-center gap-2 px-3 py-2 border-t ${theme.divider}`}>
                    <span className="text-sm flex-shrink-0">
                      {isUrgent ? '🚨' : isOverdue ? '⚠️' : '📌'}
                    </span>
                    <span className={`text-sm flex-1 min-w-0 truncate ${theme.text}`}>{t.title}</span>
                    {isOverdue && (
                      <span className="text-[10px] font-semibold text-red-500 flex-shrink-0">Overdue</span>
                    )}
                  </div>
                );
              })}
              {todayTasks.length > 5 && (
                <div className={`px-3 py-2 border-t ${theme.divider}`}>
                  <p className={`text-xs ${theme.muted}`}>+{todayTasks.length - 5} more</p>
                </div>
              )}
              {onNavigate && (
                <div className={`px-3 py-2 border-t ${theme.divider} text-right`}>
                  <button onClick={() => onNavigate('tasks')} className={`text-xs font-semibold ${theme.tabActiveText}`}>
                    View all →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className={`text-xl font-bold ${theme.text}`}>{gamify ? '⚔ Daily Quests' : 'Habits'}</h1>
          <p className={`text-xs mt-0.5 ${theme.muted}`}>Tap + to log each time you do it</p>
        </div>
        <div className="flex gap-1.5">
          {!editMode && (
            <button
              onClick={() => setFilterOpen(o => !o)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${filterOpen || activeFilters > 0 ? theme.btnPrimary : theme.btnSecondary}`}
            >Filter{activeFilters > 0 ? ` (${activeFilters})` : ''}</button>
          )}
          {editMode ? (
            <div className="flex gap-1.5">
              <button onClick={() => setAddingNew(true)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${theme.btnPrimary}`}>+ Add</button>
              <button onClick={exitEditMode}             className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${theme.btnSecondary}`}>Done</button>
            </div>
          ) : (
            <button onClick={() => setEditMode(true)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${theme.btnSecondary}`}>Edit</button>
          )}
        </div>
      </div>

      {/* Date navigator */}
      <div className="flex items-center gap-2 mb-3">
        <button onClick={goBack} className={`w-8 h-8 flex items-center justify-center rounded-lg text-base ${theme.btnSecondary}`}>◀</button>
        <div className="flex-1 text-center">
          <span className={`text-sm font-semibold ${isToday ? theme.hitTarget : theme.text}`}>{viewDateLabel}</span>
        </div>
        {!isToday && (
          <button onClick={goToToday} className={`text-xs px-2.5 py-1 rounded-lg font-semibold ${theme.btnPrimary}`}>Today</button>
        )}
        <button onClick={goForward} disabled={isToday} className={`w-8 h-8 flex items-center justify-center rounded-lg text-base disabled:opacity-30 ${theme.btnSecondary}`}>▶</button>
      </div>

      {/* Filter panel */}
      {filterOpen && !editMode && (
        <div className={`rounded-xl p-2.5 mb-3 border ${theme.card} ${theme.cardBorder}`}>
          <div className="mb-2">
            <p className={`text-[10px] font-bold uppercase tracking-widest mb-1.5 ${theme.muted}`}>Status</p>
            <MultiChips options={statusOptions} selected={filterStatuses} onToggle={toggleStatus} theme={theme} />
          </div>
          {tags.length > 0 && (
            <div>
              <p className={`text-[10px] font-bold uppercase tracking-widest mb-1.5 ${theme.muted}`}>Tag</p>
              <MultiChips options={tagOptions} selected={filterTags} onToggle={toggleTagFilter} theme={theme} />
            </div>
          )}
          {activeFilters > 0 && (
            <button onClick={clearFilters} className="mt-2 text-xs text-blue-500 underline">Clear all</button>
          )}
        </div>
      )}

      {/* ── Milestone reward modal ── */}
      {milestoneTriggered && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6">
          <div className={`w-full max-w-xs rounded-2xl p-6 shadow-2xl text-center ${theme.card} ${theme.cardBorder} border`}>
            <div className="text-5xl mb-3">{milestoneTriggered.isStreak ? '🔥' : '🎉'}</div>
            <h2 className={`text-lg font-bold mb-1 ${theme.text}`}>
              {milestoneTriggered.isStreak
                ? (gamify ? 'Streak Legend!' : 'Streak Milestone!')
                : (gamify ? 'Quest Milestone Hit!' : 'Milestone Reached!')}
            </h2>
            <p className={`text-sm mb-2 ${theme.muted}`}>{milestoneTriggered.label}</p>
            {milestoneTriggered.reward ? (
              <p className={`text-base font-semibold mb-4 ${theme.text}`}>🎁 {milestoneTriggered.reward}</p>
            ) : (
              <p className={`text-sm mb-4 ${theme.muted}`}>Set a reward in milestone settings.</p>
            )}
            <button
              onClick={() => setMilestoneTriggered(null)}
              className={`w-full py-3 rounded-xl text-sm font-bold ${theme.btnPrimary}`}
            >
              {gamify ? 'Claim reward!' : 'Enjoy your reward 🎁'}
            </button>
          </div>
        </div>
      )}

      {/* ── Reward Milestones panel ── */}
      <div className={`rounded-xl border mb-3 overflow-hidden ${theme.card} ${theme.cardBorder}`}>
        <button
          onClick={() => setMilestoneOpen(o => !o)}
          className="w-full flex items-center justify-between px-3 py-2.5"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm">🎁</span>
            <span className={`text-xs font-semibold ${theme.text}`}>Reward Milestones</span>
            {activeMilestoneCount > 0 && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold">
                {activeMilestoneCount} active
              </span>
            )}
          </div>
          <span className={`text-xs ${theme.muted}`}>{milestoneOpen ? '▾' : '▸'}</span>
        </button>

        {milestoneOpen && (
          <div className={`border-t px-3 py-3 space-y-2 ${theme.divider}`}>

            {/* Daily milestone card — show if created, even when toggled off */}
            {(rewardMilestone?.enabled || rewardMilestone?.dailyCreated) && (() => {
              const target = rewardMilestone.count || 5;
              const total  = activeActivities.length;
              return (
                <MilestoneCard
                  icon="☀️"
                  label={`Log ${target} habits today`}
                  reward={rewardMilestone.reward}
                  enabled={rewardMilestone.enabled}
                  progress={{ current: todayLoggedCount, target, label: `${todayLoggedCount}/${target} today` }}
                  onToggle={() => setRewardMilestone({ enabled: !rewardMilestone.enabled })}
                  onEdit={() => setMilestoneModal({ mode: 'edit', type: 'daily', count: String(target), reward: rewardMilestone.reward || '', habits: [], days: '', streakId: null })}
                  onDelete={() => setRewardMilestone({ enabled: false, dailyCreated: false })}
                  theme={theme}
                />
              );
            })()}

            {/* Weekly milestone card — show if habits selected, even when toggled off */}
            {(rewardMilestone?.weeklyEnabled || (rewardMilestone?.weeklyHabits || []).length > 0) && (() => {
              const habitIds = rewardMilestone.weeklyHabits || [];
              const hitCount = habitIds.filter(id => {
                const act = activeActivities.find(a => a.id === id);
                if (!act) return false;
                const wt = weekDays.reduce((s, d) => s + ((logs[id] || {})[d] || 0), 0);
                return wt >= (act.weeklyTarget || 1);
              }).length;
              return (
                <MilestoneCard
                  icon="📅"
                  label={`Weekly: ${habitIds.length} habit${habitIds.length !== 1 ? 's' : ''} hit target`}
                  reward={rewardMilestone.weeklyReward}
                  enabled={rewardMilestone.weeklyEnabled}
                  progress={habitIds.length > 0 ? { current: hitCount, target: habitIds.length, label: `${hitCount}/${habitIds.length} habits` } : null}
                  onToggle={() => setRewardMilestone({ weeklyEnabled: !rewardMilestone.weeklyEnabled })}
                  onEdit={() => setMilestoneModal({ mode: 'edit', type: 'weekly', count: '5', reward: rewardMilestone.weeklyReward || '', habits: habitIds, days: '', streakId: null })}
                  onDelete={() => setRewardMilestone({ weeklyEnabled: false })}
                  theme={theme}
                />
              );
            })()}

            {/* Consecutive weeks milestone card — show if habits selected, even when toggled off */}
            {(rewardMilestone?.consecutiveWeeksEnabled || cwHabits.length > 0) && (() => {
              const target = rewardMilestone.consecutiveWeeksTarget || 4;
              return (
                <MilestoneCard
                  icon="🗓️"
                  label={`${target} weeks in a row`}
                  reward={rewardMilestone.consecutiveWeeksReward}
                  enabled={rewardMilestone.consecutiveWeeksEnabled}
                  progress={{ current: consecutiveWeeksCount, target, label: `${consecutiveWeeksCount}/${target} wks` }}
                  onToggle={() => setRewardMilestone({ consecutiveWeeksEnabled: !rewardMilestone.consecutiveWeeksEnabled })}
                  onEdit={() => setMilestoneModal({ mode: 'edit', type: 'weeks', count: '5', reward: rewardMilestone.consecutiveWeeksReward || '', habits: cwHabits, days: '', weeksTarget: String(target), streakId: null })}
                  onDelete={() => setRewardMilestone({ consecutiveWeeksEnabled: false })}
                  theme={theme}
                />
              );
            })()}

            {/* Streak milestone cards — always show if they exist (delete to remove) */}
            {(rewardMilestone?.streakMilestones || []).map(m => (
              <MilestoneCard
                key={m.id}
                icon="🔥"
                label={`${m.days} perfect days in a row`}
                reward={m.reward}
                enabled={true}
                progress={{ current: perfectStreak, target: m.days, label: `${perfectStreak}/${m.days} days` }}
                onToggle={null}
                onEdit={() => setMilestoneModal({ mode: 'edit', type: 'streak', count: '5', reward: m.reward || '', habits: [], days: String(m.days), streakId: m.id })}
                onDelete={() => deleteStreakMilestone(m.id)}
                theme={theme}
              />
            ))}

            {/* Empty state */}
            {activeMilestoneCount === 0 && (
              <p className={`text-xs text-center py-2 ${theme.muted}`}>No milestones yet — add one below</p>
            )}

            {/* Add button */}
            <button
              onClick={() => setMilestoneModal({ mode: 'add', type: 'daily', count: '5', reward: '', habits: [], days: '', streakId: null })}
              className={`w-full py-2 rounded-xl text-xs font-semibold ${theme.btnSecondary}`}
            >+ Add Milestone</button>
          </div>
        )}
      </div>

      {/* ── Add / Edit Milestone modal ── */}
      {milestoneModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className={`w-full max-w-xs rounded-2xl shadow-2xl overflow-hidden ${theme.card} ${theme.cardBorder} border`}>
            {/* Modal header */}
            <div className={`px-4 pt-4 pb-3 border-b ${theme.divider}`}>
              <h2 className={`text-sm font-bold ${theme.text}`}>
                {milestoneModal.mode === 'add' ? 'Add Milestone' : 'Edit Milestone'}
              </h2>
            </div>

            <div className="px-4 py-3 space-y-4">
              {/* Type selector (add mode only) */}
              {milestoneModal.mode === 'add' && (
                <div>
                  <p className={`text-[10px] font-bold uppercase tracking-widest mb-2 ${theme.muted}`}>Type</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { type: 'daily',  icon: '☀️',  label: 'Daily'       },
                      { type: 'weekly', icon: '📅',  label: 'Weekly'      },
                      { type: 'weeks',  icon: '🗓️', label: 'Wk Streak'   },
                      { type: 'streak', icon: '🔥',  label: 'Day Streak'  },
                    ].map(opt => (
                      <button
                        key={opt.type}
                        onClick={() => setMilestoneModal(m => ({ ...m, type: opt.type }))}
                        className={`py-2.5 rounded-xl text-xs font-semibold flex flex-col items-center gap-0.5 transition-all ${milestoneModal.type === opt.type ? theme.btnPrimary : theme.btnSecondary}`}
                      >
                        <span className="text-lg">{opt.icon}</span>
                        <span>{opt.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Config: Daily */}
              {milestoneModal.type === 'daily' && (
                <div>
                  <p className={`text-[10px] font-bold uppercase tracking-widest mb-2 ${theme.muted}`}>Target</p>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs whitespace-nowrap ${theme.muted}`}>Log</span>
                    <input
                      type="number" min="1" max="50"
                      value={milestoneModal.count}
                      onChange={e => setMilestoneModal(m => ({ ...m, count: e.target.value }))}
                      className={`w-14 text-sm text-center px-2 py-1.5 rounded-lg border outline-none ${theme.input}`}
                    />
                    <span className={`text-xs whitespace-nowrap ${theme.muted}`}>habits today</span>
                  </div>
                </div>
              )}

              {/* Config: Weekly */}
              {milestoneModal.type === 'weekly' && (
                <div>
                  <p className={`text-[10px] font-bold uppercase tracking-widest mb-2 ${theme.muted}`}>Habits to watch</p>
                  <div className="space-y-1 max-h-44 overflow-y-auto">
                    {activeActivities.filter(a => a.hasTarget).map(a => {
                      const sel = (milestoneModal.habits || []).includes(a.id);
                      return (
                        <button
                          key={a.id}
                          onClick={() => setMilestoneModal(m => ({
                            ...m,
                            habits: sel ? m.habits.filter(id => id !== a.id) : [...(m.habits || []), a.id],
                          }))}
                          className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left border transition-all ${sel ? 'border-blue-400 bg-blue-500/10' : theme.cardBorder + ' ' + theme.progressBg}`}
                        >
                          <span className="text-sm">{a.emoji}</span>
                          <span className={`flex-1 text-xs font-medium ${theme.text}`}>{a.name}</span>
                          {sel && <span className="text-blue-500 text-xs font-bold">✓</span>}
                        </button>
                      );
                    })}
                    {activeActivities.filter(a => a.hasTarget).length === 0 && (
                      <p className={`text-xs text-center py-2 ${theme.muted}`}>No habits with weekly targets yet</p>
                    )}
                  </div>
                </div>
              )}

              {/* Config: Consecutive Weeks */}
              {milestoneModal.type === 'weeks' && (
                <div className="space-y-3">
                  <div>
                    <p className={`text-[10px] font-bold uppercase tracking-widest mb-2 ${theme.muted}`}>Habits to watch</p>
                    <div className="space-y-1 max-h-36 overflow-y-auto">
                      {activeActivities.filter(a => a.hasTarget).map(a => {
                        const sel = (milestoneModal.habits || []).includes(a.id);
                        return (
                          <button
                            key={a.id}
                            onClick={() => setMilestoneModal(m => ({
                              ...m,
                              habits: sel ? m.habits.filter(id => id !== a.id) : [...(m.habits || []), a.id],
                            }))}
                            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left border transition-all ${sel ? 'border-blue-400 bg-blue-500/10' : theme.cardBorder + ' ' + theme.progressBg}`}
                          >
                            <span className="text-sm">{a.emoji}</span>
                            <span className={`flex-1 text-xs font-medium ${theme.text}`}>{a.name}</span>
                            {sel && <span className="text-blue-500 text-xs font-bold">✓</span>}
                          </button>
                        );
                      })}
                      {activeActivities.filter(a => a.hasTarget).length === 0 && (
                        <p className={`text-xs text-center py-2 ${theme.muted}`}>No habits with weekly targets yet</p>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className={`text-[10px] font-bold uppercase tracking-widest mb-2 ${theme.muted}`}>Consecutive weeks target</p>
                    <div className="flex items-center gap-2">
                      <input
                        type="number" min="2" max="52"
                        value={milestoneModal.weeksTarget ?? 4}
                        onChange={e => setMilestoneModal(m => ({ ...m, weeksTarget: e.target.value }))}
                        className={`w-14 text-sm text-center px-2 py-1.5 rounded-lg border outline-none ${theme.input}`}
                      />
                      <span className={`text-xs ${theme.muted}`}>weeks in a row hitting all targets</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Config: Streak */}
              {milestoneModal.type === 'streak' && (
                <div>
                  <p className={`text-[10px] font-bold uppercase tracking-widest mb-2 ${theme.muted}`}>Target</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="number" min="1"
                      value={milestoneModal.days}
                      onChange={e => setMilestoneModal(m => ({ ...m, days: e.target.value }))}
                      placeholder="e.g. 7"
                      autoFocus={milestoneModal.mode === 'add'}
                      className={`w-20 text-sm text-center px-2 py-1.5 rounded-lg border outline-none ${theme.input}`}
                    />
                    <span className={`text-xs whitespace-nowrap ${theme.muted}`}>consecutive perfect days</span>
                  </div>
                </div>
              )}

              {/* Reward */}
              <div>
                <p className={`text-[10px] font-bold uppercase tracking-widest mb-2 ${theme.muted}`}>Your reward</p>
                <input
                  type="text"
                  value={milestoneModal.reward}
                  onChange={e => setMilestoneModal(m => ({ ...m, reward: e.target.value }))}
                  placeholder={
                    milestoneModal.type === 'daily'  ? 'e.g. Netflix episode…' :
                    milestoneModal.type === 'weekly' ? 'e.g. Saturday brunch out…' :
                    milestoneModal.type === 'weeks'  ? 'e.g. New gear, massage…' :
                                                       'e.g. Weekend away…'
                  }
                  className={`w-full text-sm px-3 py-2 rounded-lg border outline-none ${theme.input}`}
                />
              </div>

              {/* Save / Cancel */}
              <div className="flex gap-2 pb-1">
                <button
                  onClick={saveMilestoneModal}
                  disabled={
                    (milestoneModal.type === 'daily'  && !milestoneModal.count) ||
                    (milestoneModal.type === 'weekly' && !(milestoneModal.habits || []).length) ||
                    (milestoneModal.type === 'weeks'  && !(milestoneModal.habits || []).length) ||
                    (milestoneModal.type === 'streak' && !milestoneModal.days)
                  }
                  className={`flex-1 py-2.5 rounded-xl text-xs font-bold disabled:opacity-40 ${theme.btnPrimary}`}
                >Save</button>
                <button onClick={() => setMilestoneModal(null)} className={`flex-1 py-2.5 rounded-xl text-xs font-bold ${theme.btnSecondary}`}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {addingNew && (
        <AddHabitForm allTags={tags} theme={theme} onSave={form => { addActivity(form); setAddingNew(false); }} onCancel={() => setAddingNew(false)} />
      )}

      {activeFilters > 0 && !editMode && (
        <p className={`text-xs mb-2 pl-1 ${theme.muted}`}>
          Showing {filtered.length} of {activities.length} · <button onClick={clearFilters} className="text-blue-500 underline">Clear</button>
        </p>
      )}

      {editMode && activities.length > 1 && (
        <p className={`text-xs mb-2 pl-1 ${theme.muted}`}>Hold ⠿ to drag · tap ⋯ for notes, tags & settings</p>
      )}

      {/* Habit list */}
      {editMode ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <SortableContext items={activeActivities.map(a => a.id)} strategy={verticalListSortingStrategy}>
            {activeActivities.map(a => {
              const actHasLogs = Object.values(logs[a.id] || {}).some(v => v > 0);
              return (
                <SortableHabitCard
                  key={a.id}
                  activity={a}
                  allTags={tags}
                  theme={theme}
                  editMode={true}
                  viewDate={viewDate}
                  hasLogs={actHasLogs}
                  onDelete={id => deleteActivity(id)}
                  onArchive={id => archiveActivity(id)}
                />
              );
            })}
          </SortableContext>
          <DragOverlay dropAnimation={null}>
            {activeActivity && (
              <HabitCard
                activity={activeActivity}
                allTags={tags}
                theme={theme}
                editMode={true}
                isDragOverlay={true}
                viewDate={viewDate}
                hasLogs={false}
                onDelete={() => {}}
                onArchive={() => {}}
                dragHandleProps={{}}
              />
            )}
          </DragOverlay>
        </DndContext>
      ) : (
        filtered.map(a => (
          <HabitCard
            key={a.id}
            activity={a}
            allTags={tags}
            theme={theme}
            editMode={false}
            viewDate={viewDate}
            hasLogs={false}
            onDelete={() => {}}
            onArchive={() => {}}
            dragHandleProps={{}}
          />
        ))
      )}

      {!editMode && activities.some(a => !a.hasTarget) && (
        <p className={`text-xs px-3 py-2 rounded-lg mt-1 mb-2 ${theme.progressBg} ${theme.muted}`}>
          ⚠️ {gamify ? 'Quests' : 'Habits'} without a weekly goal don't count toward a perfect day {gamify ? '🚀' : '⭐'}.
        </p>
      )}

      {filtered.length === 0 && !addingNew && !editMode && activeFilters > 0 && (
        <div className={`text-center py-8 ${theme.muted}`}>
          <p className="text-2xl mb-2">🔍</p>
          <p className="text-sm font-medium">No habits match these filters</p>
          <button onClick={clearFilters} className="text-xs text-blue-500 mt-1">Clear filters</button>
        </div>
      )}

      {activities.length === 0 && !addingNew && (
        <div className={`text-center py-10 ${theme.muted}`}>
          <p className="text-3xl mb-2">{gamify ? '⚔️' : '📋'}</p>
          <p className="text-sm font-medium">No habits yet</p>
          <p className="text-xs mt-1">Tap Edit → + Add to get started</p>
        </div>
      )}
    </div>
  );
}
