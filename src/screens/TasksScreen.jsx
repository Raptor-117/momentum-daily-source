import { useState } from 'react';
import { useStore } from '../store';
import { todayStr, formatDisplayDate } from '../data';

// ─── Export helpers ───────────────────────────────────────────────────────────
function buildClaudeText(tasks, tags, today) {
  const getTagLabels = (ids) => ids.map(id => tags.find(t => t.id === id)?.label).filter(Boolean).join(', ');
  const displayDate  = new Date(today + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });

  const overdue    = tasks.filter(t => !t.completed && t.dueDate && t.dueDate < today).sort(sortByDueThenComplexity);
  const dueToday   = tasks.filter(t => !t.completed && t.dueDate === today).sort(sortByDueThenComplexity);
  const upcoming   = tasks.filter(t => !t.completed && t.dueDate && t.dueDate > today).sort(sortByDueThenComplexity);
  const noDeadline = tasks.filter(t => !t.completed && !t.dueDate).sort((a, b) => COMPLEXITY_RANK[a.complexity] - COMPLEXITY_RANK[b.complexity]);
  const done       = tasks.filter(t => t.completed);

  function formatTask(t) {
    let s = `• ${t.title}\n`;
    s += `  Complexity: ${t.complexity.charAt(0).toUpperCase() + t.complexity.slice(1)}`;
    if (t.dueDate) s += ` | Due: ${formatDisplayDate(t.dueDate)}`;
    const tagStr = getTagLabels(t.tags);
    if (tagStr) s += ` | Tags: ${tagStr}`;
    s += '\n';
    if (t.notes) s += `  Notes: ${t.notes}\n`;
    return s;
  }

  function section(icon, title, items) {
    if (!items.length) return '';
    return `${icon} ${title.toUpperCase()} (${items.length})\n${'─'.repeat(30)}\n${items.map(formatTask).join('\n')}\n`;
  }

  return [
    `📋 FLOW TASKS — ${displayDate}\n`,
    section('⚠', 'Overdue', overdue),
    section('📅', 'Due Today', dueToday),
    section('🗓', 'Upcoming', upcoming),
    section('📋', 'No Deadline', noDeadline),
    done.length ? `✓ COMPLETED (${done.length}) — not shown\n` : '',
  ].filter(Boolean).join('\n');
}

function exportCSV(tasks, tags) {
  const getTagLabels = (ids) => ids.map(id => tags.find(t => t.id === id)?.label).filter(Boolean).join('; ');
  const header = ['Title', 'Complexity', 'Due Date', 'Tags', 'Notes', 'Status'];
  const rows   = tasks.map(t => [
    t.title,
    t.complexity,
    t.dueDate || '',
    getTagLabels(t.tags),
    t.notes || '',
    t.completed ? 'Completed' : t.dueDate && t.dueDate < todayStr() ? 'Overdue' : 'Active',
  ]);
  const csv  = [header, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `flow-tasks-${todayStr()}.csv`; a.click();
  URL.revokeObjectURL(url);
}

const COMPLEXITY_RANK = { critical: 0, hard: 1, medium: 2, easy: 3 };

const COMPLEXITY_LABELS = {
  standard: { critical: 'Urgent', hard: 'Major', medium: 'Standard', easy: 'Minor' },
  quest:    { critical: 'Urgent', hard: 'Major', medium: 'Standard', easy: 'Minor' },
};
function complexityLabel(key, gamify) {
  return (gamify ? COMPLEXITY_LABELS.quest : COMPLEXITY_LABELS.standard)[key] || key;
}

// ─── Recurrence helpers ───────────────────────────────────────────────────────
const RECURRENCE_OPTS = [
  { value: 'none',    label: 'One-time' },
  { value: 'daily',   label: 'Daily'    },
  { value: 'weekly',  label: 'Weekly'   },
  { value: 'monthly', label: 'Monthly'  },
];
const RECURRENCE_ICON = { daily: '🔁', weekly: '🔄', monthly: '📅' };

function isEffectivelyComplete(task) {
  if (!task.recurrence || task.recurrence === 'none') return task.completed;
  if (!task.completed || !task.lastCompleted) return false;
  const today = todayStr();
  if (task.recurrence === 'daily')   return task.lastCompleted === today;
  if (task.recurrence === 'weekly')  return Math.floor((new Date(today+'T00:00:00')-new Date(task.lastCompleted+'T00:00:00'))/86400000) < 7;
  if (task.recurrence === 'monthly') return task.lastCompleted.slice(0,7) === today.slice(0,7);
  return task.completed;
}

function sortByDueThenComplexity(a, b) {
  if (a.dueDate && !b.dueDate) return -1;
  if (!a.dueDate && b.dueDate) return 1;
  if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
  return COMPLEXITY_RANK[a.complexity] - COMPLEXITY_RANK[b.complexity];
}

// ─── Tag pill ─────────────────────────────────────────────────────────────────
function TagPill({ tagId, tags }) {
  const tag = tags.find(t => t.id === tagId);
  if (!tag) return null;
  return (
    <span className="text-xs px-2 py-0.5 rounded-full font-medium text-white" style={{ backgroundColor: tag.color }}>
      {tag.label}
    </span>
  );
}

// ─── Complexity badge ─────────────────────────────────────────────────────────
function ComplexityBadge({ complexity, theme, gamify }) {
  const map = { critical: theme.complexityCritical, hard: theme.complexityHard, medium: theme.complexityMedium, easy: theme.complexityEasy };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${map[complexity] || map.easy}`}>
      {complexityLabel(complexity, gamify)}
    </span>
  );
}

// ─── Task edit form ───────────────────────────────────────────────────────────
function TaskEditForm({ task, theme, onSave, onCancel }) {
  const { tags, updateTask } = useStore();
  const gamify = useStore(s => s.gamify);
  const [form, setForm] = useState({
    title:      task.title,
    notes:      task.notes || '',
    dueDate:    task.dueDate || '',
    complexity: task.complexity,
    recurrence: task.recurrence || 'none',
    tags:       task.tags || [],
  });

  function toggleTag(id) {
    setForm(f => ({ ...f, tags: f.tags.includes(id) ? f.tags.filter(t => t !== id) : [...f.tags, id] }));
  }

  function handleSave() {
    if (!form.title.trim()) return;
    updateTask(task.id, {
      title:      form.title.trim(),
      notes:      form.notes.trim() || null,
      dueDate:    form.dueDate || null,
      complexity: form.complexity,
      recurrence: form.recurrence,
      tags:       form.tags,
    });
    onSave();
  }

  return (
    <div className={`rounded-xl mb-2 border shadow-sm overflow-hidden ${theme.card} ${theme.cardBorder}`}>
      <p className={`text-xs font-bold px-3 pt-3 pb-2 border-b ${theme.textSub} ${theme.divider}`}>Edit Task</p>
      <div className="p-3 space-y-2">
        <input
          type="text"
          placeholder="Task title"
          value={form.title}
          onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          onKeyDown={e => e.key === 'Enter' && handleSave()}
          className={`w-full text-sm px-3 py-2 rounded-lg border outline-none ${theme.input}`}
          autoFocus
        />
        <textarea
          placeholder="Notes (optional)"
          value={form.notes}
          onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          rows={2}
          className={`w-full text-sm px-3 py-2 rounded-lg border outline-none resize-none ${theme.input}`}
        />
        <div className="flex gap-2">
          <div className="flex-1">
            <label className={`text-xs mb-1 block ${theme.muted}`}>Due date</label>
            <input
              type="date"
              value={form.dueDate}
              onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
              className={`w-full text-xs px-2 py-1.5 rounded-lg border outline-none ${theme.input}`}
            />
          </div>
          <div className="flex-1">
            <label className={`text-xs mb-1 block ${theme.muted}`}>Complexity</label>
            <select
              value={form.complexity}
              onChange={e => setForm(f => ({ ...f, complexity: e.target.value }))}
              className={`w-full text-xs px-2 py-1.5 rounded-lg border outline-none ${theme.select}`}
            >
              <option value="critical">{complexityLabel('critical', gamify)}</option>
              <option value="hard">{complexityLabel('hard', gamify)}</option>
              <option value="medium">{complexityLabel('medium', gamify)}</option>
              <option value="easy">{complexityLabel('easy', gamify)}</option>
            </select>
          </div>
        </div>
        <div>
          <label className={`text-xs mb-1 block ${theme.muted}`}>Recurrence</label>
          <div className="flex gap-1.5">
            {RECURRENCE_OPTS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setForm(f => ({ ...f, recurrence: opt.value }))}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${form.recurrence === opt.value ? theme.btnPrimary : theme.btnSecondary}`}
              >{opt.label}</button>
            ))}
          </div>
        </div>
        {tags.length > 0 && (
          <div>
            <label className={`text-xs mb-1.5 block ${theme.muted}`}>Tags</label>
            <div className="flex flex-wrap gap-1.5">
              {tags.map(tag => (
                <button
                  key={tag.id}
                  onClick={() => toggleTag(tag.id)}
                  className={`text-xs px-2.5 py-1 rounded-full font-medium border-2 transition-all ${
                    form.tags.includes(tag.id) ? 'text-white border-transparent' : 'bg-transparent border-gray-200'
                  }`}
                  style={form.tags.includes(tag.id) ? { backgroundColor: tag.color, borderColor: tag.color } : { color: tag.color }}
                >
                  {tag.label}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <button onClick={handleSave}  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold ${theme.btnPrimary}`}>Save</button>
          <button onClick={onCancel}    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold ${theme.btnSecondary}`}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── Task card ────────────────────────────────────────────────────────────────
function TaskCard({ task, theme, accentColor, gamify }) {
  const { tags, toggleTask, deleteTask } = useStore();
  const [expanded, setExpanded] = useState(true);
  const [editing,  setEditing]  = useState(false);
  const today      = todayStr();
  const isDone     = isEffectivelyComplete(task);
  const isRecurring = task.recurrence && task.recurrence !== 'none';
  const isOverdue   = task.dueDate && task.dueDate < today && !isDone;

  if (editing) {
    return <TaskEditForm task={task} theme={theme} onSave={() => setEditing(false)} onCancel={() => setEditing(false)} />;
  }

  return (
    <div
      className={`rounded-xl mb-2 shadow-sm border overflow-hidden ${theme.card} ${theme.cardBorder}`}
      style={accentColor ? { borderLeftColor: accentColor, borderLeftWidth: '3px' } : {}}
    >
      <div className="flex items-start gap-2 p-3">
        {/* Checkbox */}
        <button
          onClick={() => toggleTask(task.id)}
          className={`mt-0.5 w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${
            isDone     ? 'bg-green-500 border-green-500 text-white'
            : isOverdue ? 'border-red-400'
            : 'border-gray-300'
          }`}
        >
          {isDone && <span className="text-xs leading-none">✓</span>}
        </button>

        {/* Body */}
        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setExpanded(e => !e)}>
          <p className={`text-sm font-medium leading-snug ${isDone ? 'line-through ' + theme.muted : theme.text}`}>
            {task.title}
            {isRecurring && <span className="ml-1.5 text-xs not-italic">{RECURRENCE_ICON[task.recurrence]}</span>}
          </p>
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            <ComplexityBadge complexity={task.complexity} theme={theme} gamify={gamify} />
            {task.tags.map(tid => <TagPill key={tid} tagId={tid} tags={tags} />)}
            {isDone && task.completedDate && (
              <span className={`text-xs ${theme.muted}`}>✓ {formatDisplayDate(task.completedDate)}</span>
            )}
            {!isDone && task.dueDate && (
              <span className={`text-xs ${isOverdue ? theme.overdueText + ' font-semibold' : theme.muted}`}>
                {isOverdue ? '⚠ ' : ''}Due {formatDisplayDate(task.dueDate)}
              </span>
            )}
            {isRecurring && (
              <span className={`text-xs ${theme.muted}`}>{RECURRENCE_OPTS.find(o => o.value === task.recurrence)?.label}</span>
            )}
            {task.notes && (
              <span className={`text-xs ${theme.muted}`}>{expanded ? '▾ tap to hide' : '▸ tap to expand'}</span>
            )}
          </div>
          {expanded && task.notes && (
            <p className={`text-xs mt-2 leading-relaxed ${theme.textSub}`}>{task.notes}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-1 flex-shrink-0">
          <button
            onClick={() => setEditing(true)}
            className="text-xs px-2 py-1 rounded-lg font-semibold bg-blue-100 text-blue-600 hover:bg-blue-200 transition-colors"
          >Edit</button>
          <button
            onClick={() => deleteTask(task.id)}
            className="text-xs px-2 py-1 rounded-lg font-semibold bg-red-100 text-red-500 hover:bg-red-200 transition-colors"
          >Del</button>
        </div>
      </div>
    </div>
  );
}

// ─── Collapsible section ──────────────────────────────────────────────────────
function Section({ title, icon, count, accentColor, tasks, theme, defaultOpen = true, gamify }) {
  const [open, setOpen] = useState(defaultOpen);

  if (count === 0) return null;

  return (
    <div className="mb-3">
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-2 w-full px-3 py-2 rounded-xl mb-1 border ${theme.card} ${theme.cardBorder}`}
        style={accentColor ? { borderLeftColor: accentColor, borderLeftWidth: '3px' } : {}}
      >
        <span className="text-sm">{icon}</span>
        <span className={`text-xs font-bold uppercase tracking-widest flex-1 text-left ${theme.textSub}`}>{title}</span>
        <span
          className="text-xs px-2 py-0.5 rounded-full font-bold text-white"
          style={{ backgroundColor: accentColor || '#6b7280' }}
        >{count}</span>
        <span className={`text-xs ml-1 ${theme.muted}`}>{open ? '▾' : '▸'}</span>
      </button>

      {open && tasks.map(t => (
        <TaskCard key={t.id} task={t} theme={theme} accentColor={accentColor} gamify={gamify} />
      ))}
    </div>
  );
}

// ─── Add task form ────────────────────────────────────────────────────────────
function AddTaskForm({ theme, onClose }) {
  const { addTask, tags } = useStore();
  const gamify = useStore(s => s.gamify);
  const [form, setForm] = useState({ title: '', notes: '', dueDate: '', complexity: 'medium', recurrence: 'none', tags: [] });

  function toggleTag(id) {
    setForm(f => ({ ...f, tags: f.tags.includes(id) ? f.tags.filter(t => t !== id) : [...f.tags, id] }));
  }

  function handleAdd() {
    if (!form.title.trim()) return;
    addTask({ title: form.title.trim(), notes: form.notes.trim() || null, dueDate: form.dueDate || null, complexity: form.complexity, recurrence: form.recurrence, tags: form.tags });
    onClose();
  }

  return (
    <div className={`rounded-xl mb-3 border shadow-sm overflow-hidden ${theme.card} ${theme.cardBorder}`}>
      <p className={`text-xs font-bold px-3 pt-3 pb-2 border-b ${theme.textSub} ${theme.divider}`}>New Task</p>
      <div className="p-3 space-y-2">
        <input
          type="text"
          placeholder="Task title"
          value={form.title}
          onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          className={`w-full text-sm px-3 py-2 rounded-lg border outline-none ${theme.input}`}
          autoFocus
        />
        <textarea
          placeholder="Notes (optional)"
          value={form.notes}
          onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          rows={2}
          className={`w-full text-sm px-3 py-2 rounded-lg border outline-none resize-none ${theme.input}`}
        />
        <div className="flex gap-2">
          <div className="flex-1">
            <label className={`text-xs mb-1 block ${theme.muted}`}>Due date</label>
            <input
              type="date"
              value={form.dueDate}
              onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
              className={`w-full text-xs px-2 py-1.5 rounded-lg border outline-none ${theme.input}`}
            />
          </div>
          <div className="flex-1">
            <label className={`text-xs mb-1 block ${theme.muted}`}>Complexity</label>
            <select
              value={form.complexity}
              onChange={e => setForm(f => ({ ...f, complexity: e.target.value }))}
              className={`w-full text-xs px-2 py-1.5 rounded-lg border outline-none ${theme.select}`}
            >
              <option value="critical">{complexityLabel('critical', gamify)}</option>
              <option value="hard">{complexityLabel('hard', gamify)}</option>
              <option value="medium">{complexityLabel('medium', gamify)}</option>
              <option value="easy">{complexityLabel('easy', gamify)}</option>
            </select>
          </div>
        </div>

        <div>
          <label className={`text-xs mb-1 block ${theme.muted}`}>Recurrence</label>
          <div className="flex gap-1.5">
            {RECURRENCE_OPTS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setForm(f => ({ ...f, recurrence: opt.value }))}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${form.recurrence === opt.value ? theme.btnPrimary : theme.btnSecondary}`}
              >{opt.label}</button>
            ))}
          </div>
        </div>

        {tags.length > 0 && (
          <div>
            <label className={`text-xs mb-1.5 block ${theme.muted}`}>Tags</label>
            <div className="flex flex-wrap gap-1.5">
              {tags.map(tag => (
                <button
                  key={tag.id}
                  onClick={() => toggleTag(tag.id)}
                  className={`text-xs px-2.5 py-1 rounded-full font-medium border-2 transition-all ${
                    form.tags.includes(tag.id) ? 'text-white border-transparent' : 'bg-transparent border-gray-200'
                  }`}
                  style={form.tags.includes(tag.id) ? { backgroundColor: tag.color, borderColor: tag.color } : { color: tag.color }}
                >
                  {tag.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button onClick={handleAdd} className={`flex-1 py-1.5 rounded-lg text-xs font-semibold ${theme.btnPrimary}`}>Add Task</button>
          <button onClick={onClose}   className={`flex-1 py-1.5 rounded-lg text-xs font-semibold ${theme.btnSecondary}`}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function TasksScreen({ theme, gamify }) {
  const { tasks, tags } = useStore();
  const [showAdd,          setShowAdd]          = useState(false);
  const [showCompleted,    setShowCompleted]    = useState(false);
  const [copied,           setCopied]           = useState(false);
  const [filterOpen,          setFilterOpen]          = useState(false);
  const [filterComplexities,  setFilterComplexities]  = useState([]);
  const [filterTags,          setFilterTags]          = useState([]);

  const today  = todayStr();
  const title  = gamify ? '📜 Contracts' : 'Tasks';

  const complexityOptions = ['critical', 'hard', 'medium', 'easy'];
  const tagOptions        = tags.map(t => t.label);

  function toggleComplexity(key) {
    setFilterComplexities(prev => {
      const next = prev.includes(key) ? prev.filter(c => c !== key) : [...prev, key];
      return next.length === complexityOptions.length ? [] : next;
    });
  }
  function toggleTagFilter(label) {
    setFilterTags(prev => {
      const next = prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label];
      return next.length === tagOptions.length ? [] : next;
    });
  }

  function applyFilters(list) {
    return list.filter(t => {
      if (filterComplexities.length > 0 && !filterComplexities.includes(t.complexity)) return false;
      if (filterTags.length > 0) {
        const taskTagLabels = t.tags.map(tid => tags.find(tg => tg.id === tid)?.label).filter(Boolean);
        if (!filterTags.some(ft => taskTagLabels.includes(ft))) return false;
      }
      return true;
    });
  }

  const active      = applyFilters(tasks.filter(t => !isEffectivelyComplete(t)));
  const done        = tasks
    .filter(t => isEffectivelyComplete(t))
    .sort((a, b) => (b.completedDate || '').localeCompare(a.completedDate || ''));
  const activeFilters = (filterComplexities.length > 0 ? 1 : 0) + (filterTags.length > 0 ? 1 : 0);

  // Partition
  const overdue    = active.filter(t => t.dueDate && t.dueDate < today).sort(sortByDueThenComplexity);
  const dueToday   = active.filter(t => t.dueDate === today).sort(sortByDueThenComplexity);
  const upcoming   = active.filter(t => t.dueDate && t.dueDate > today).sort(sortByDueThenComplexity);
  const noDeadline = active.filter(t => !t.dueDate).sort((a, b) => COMPLEXITY_RANK[a.complexity] - COMPLEXITY_RANK[b.complexity]);

  function handleCopyText() {
    const text = buildClaudeText(tasks, tags, today);
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  return (
    <div className="pb-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className={`text-xl font-bold ${theme.text}`}>{title}</h1>
          <p className={`text-xs mt-0.5 ${theme.muted}`}>{tasks.filter(t=>!isEffectivelyComplete(t)).length} active · {done.length} done</p>
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={() => setFilterOpen(o => !o)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${filterOpen || activeFilters > 0 ? theme.btnPrimary : theme.btnSecondary}`}
          >
            Filter{activeFilters > 0 ? ` (${activeFilters})` : ''}
          </button>
          <button onClick={() => setShowAdd(true)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${theme.btnPrimary}`}>
            + Add
          </button>
        </div>
      </div>

      {/* Export row */}
      <div className="flex gap-2 mb-3">
        <button
          onClick={handleCopyText}
          className={`flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
            copied ? 'bg-green-500 text-white' : theme.btnSecondary
          }`}
        >{copied ? '✓ Copied!' : '📋 Copy Text'}</button>
        <button onClick={() => exportCSV(tasks, tags)} className={`flex-1 py-2 rounded-xl text-xs font-semibold ${theme.btnSecondary}`}>
          ↓ CSV
        </button>
      </div>

      {/* Filter panel — toggle */}
      {filterOpen && (
        <div className={`rounded-xl p-2.5 mb-3 border ${theme.card} ${theme.cardBorder}`}>
          <div className="mb-2">
            <p className={`text-[10px] font-bold uppercase tracking-widest mb-1.5 ${theme.muted}`}>Complexity</p>
            <div className="flex flex-wrap gap-1.5">
              {complexityOptions.map(key => (
                <button key={key} onClick={() => toggleComplexity(key)}
                  className={`text-xs px-2.5 py-1 rounded-full font-medium transition-all ${filterComplexities.includes(key) ? theme.btnPrimary : theme.btnSecondary}`}
                >{complexityLabel(key, gamify)}</button>
              ))}
            </div>
          </div>
          {tags.length > 0 && (
            <div className="mb-2">
              <p className={`text-[10px] font-bold uppercase tracking-widest mb-1.5 ${theme.muted}`}>Tag</p>
              <div className="flex flex-wrap gap-1.5">
                {tagOptions.map(opt => (
                  <button key={opt} onClick={() => toggleTagFilter(opt)}
                    className={`text-xs px-2.5 py-1 rounded-full font-medium transition-all ${filterTags.includes(opt) ? theme.btnPrimary : theme.btnSecondary}`}
                  >{opt}</button>
                ))}
              </div>
            </div>
          )}
          {activeFilters > 0 && (
            <button onClick={() => { setFilterComplexities([]); setFilterTags([]); }} className="text-xs text-blue-500 underline">Clear all</button>
          )}
        </div>
      )}

      {activeFilters > 0 && (
        <p className={`text-xs mb-2 pl-1 ${theme.muted}`}>
          Showing {active.length} filtered tasks
          <button onClick={() => { setFilterComplexities([]); setFilterTags([]); }} className="ml-2 text-blue-500 underline">Clear</button>
        </p>
      )}

      {showAdd && <AddTaskForm theme={theme} onClose={() => setShowAdd(false)} />}

      {/* Sections */}
      <Section
        title={gamify ? 'Breached' : 'Overdue'}
        icon="⚠"
        count={overdue.length}
        accentColor="#ef4444"
        tasks={overdue}
        theme={theme}
        defaultOpen={true}
        gamify={gamify}
      />
      <Section
        title="Due Today"
        icon="📅"
        count={dueToday.length}
        accentColor="#8b5cf6"
        tasks={dueToday}
        theme={theme}
        defaultOpen={true}
        gamify={gamify}
      />
      <Section
        title="Upcoming"
        icon="🗓"
        count={upcoming.length}
        accentColor="#3b82f6"
        tasks={upcoming}
        theme={theme}
        defaultOpen={true}
        gamify={gamify}
      />
      <Section
        title="No Deadline"
        icon="📋"
        count={noDeadline.length}
        accentColor="#6b7280"
        tasks={noDeadline}
        theme={theme}
        defaultOpen={true}
        gamify={gamify}
      />

      {/* Empty state */}
      {active.length === 0 && !showAdd && (
        <div className={`text-center py-10 ${theme.muted}`}>
          <p className="text-3xl mb-2">{gamify ? '🏆' : '✅'}</p>
          <p className="text-sm font-medium">{gamify ? 'All contracts fulfilled!' : 'All clear!'}</p>
          <p className="text-xs mt-1">Tap + Add to create a task</p>
        </div>
      )}

      {/* Completed — collapsed by default */}
      {done.length > 0 && (
        <div className="mt-2">
          <button
            onClick={() => setShowCompleted(s => !s)}
            className={`flex items-center gap-2 w-full px-3 py-2 rounded-xl mb-1 border ${theme.card} ${theme.cardBorder}`}
            style={{ borderLeftColor: '#22c55e', borderLeftWidth: '3px' }}
          >
            <span className="text-sm">✓</span>
            <span className={`text-xs font-bold uppercase tracking-widest flex-1 text-left ${theme.textSub}`}>
              {gamify ? 'Completed' : 'Completed'}
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full font-bold text-white bg-green-500">{done.length}</span>
            <span className={`text-xs ml-1 ${theme.muted}`}>{showCompleted ? '▾' : '▸'}</span>
          </button>
          {showCompleted && done.map(t => <TaskCard key={t.id} task={t} theme={theme} />)}
        </div>
      )}
    </div>
  );
}
