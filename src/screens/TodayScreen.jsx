import { useState } from 'react';
import { useStore } from '../store';
import { todayStr, getWeekStart, MONTH_NAMES_FULL, formatDisplayDate } from '../data';

// ─── Habit card ───────────────────────────────────────────────────────────────
function HabitCard({ activity, theme }) {
  const { getCount, getWeeklyTotal, getStreak, logActivity } = useStore();
  const today     = todayStr();
  const weekStart = getWeekStart(today);
  const count     = getCount(activity.id, today);
  const weekTotal = getWeeklyTotal(activity.id, weekStart);
  const streak    = getStreak(activity.id);
  const pct       = Math.min(100, Math.round((weekTotal / activity.weeklyTarget) * 100));
  const hit       = weekTotal >= activity.weeklyTarget;

  return (
    <div className={`rounded-xl p-3 mb-2 shadow-sm border ${theme.card} ${theme.cardBorder}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl flex-shrink-0">{activity.emoji}</span>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold truncate ${theme.text}`}>{activity.name}</p>
          <p className={`text-xs ${hit ? theme.hitTarget + ' font-medium' : theme.muted}`}>
            {hit ? `✓ ${weekTotal}/${activity.weeklyTarget} this week` : `${weekTotal}/${activity.weeklyTarget} this week`}
          </p>
        </div>

        {streak > 0 && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0 border ${theme.streakBadge}`}>
            🔥 {streak}d
          </span>
        )}

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={() => logActivity(activity.id, today, -1)}
            disabled={count === 0}
            className={`w-7 h-7 rounded-lg flex items-center justify-center text-base font-bold transition-colors disabled:opacity-30 ${theme.btnSecondary}`}
          >−</button>
          <span className={`text-xl font-bold w-7 text-center tabular-nums ${count > 0 ? theme.tabActiveText : theme.muted}`}>
            {count}
          </span>
          <button
            onClick={() => logActivity(activity.id, today, 1)}
            className={`w-7 h-7 rounded-lg flex items-center justify-center text-base font-bold active:scale-95 transition-all ${theme.btnPrimary}`}
          >+</button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className={`flex-1 h-1.5 rounded-full overflow-hidden ${theme.progressBg}`}>
          <div
            className={`h-1.5 rounded-full transition-all duration-500 ${hit ? 'bg-green-500' : 'bg-blue-400'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className={`text-xs font-medium w-8 text-right ${hit ? theme.hitTarget : theme.muted}`}>
          {pct}%
        </span>
      </div>
    </div>
  );
}

// ─── Complexity badge ─────────────────────────────────────────────────────────
function ComplexityBadge({ complexity, theme }) {
  const map = {
    easy:     theme.complexityEasy,
    medium:   theme.complexityMedium,
    hard:     theme.complexityHard,
    critical: theme.complexityCritical,
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${map[complexity] || map.easy}`}>
      {complexity}
    </span>
  );
}

// ─── Tag pill ─────────────────────────────────────────────────────────────────
function TagPill({ tagId, tags }) {
  const tag = tags.find(t => t.id === tagId);
  if (!tag) return null;
  return (
    <span
      className="text-xs px-2 py-0.5 rounded-full font-medium text-white"
      style={{ backgroundColor: tag.color }}
    >
      {tag.label}
    </span>
  );
}

// ─── Task card ────────────────────────────────────────────────────────────────
function TaskCard({ task, theme }) {
  const { tags, toggleTask, deleteTask } = useStore();
  const [expanded, setExpanded] = useState(false);
  const today = todayStr();
  const isOverdue = task.dueDate && task.dueDate < today && !task.completed;

  return (
    <div className={`rounded-xl mb-2 shadow-sm border overflow-hidden ${isOverdue ? theme.overdueBg : `${theme.card} ${theme.cardBorder}`}`}>
      <div className="flex items-start gap-2 p-3">
        {/* Checkbox */}
        <button
          onClick={() => toggleTask(task.id)}
          className={`mt-0.5 w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${
            task.completed
              ? 'bg-green-500 border-green-500 text-white'
              : isOverdue
                ? 'border-red-400'
                : 'border-gray-300'
          }`}
        >
          {task.completed && <span className="text-xs">✓</span>}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0" onClick={() => setExpanded(e => !e)}>
          <p className={`text-sm font-medium leading-snug ${task.completed ? 'line-through ' + theme.muted : theme.text}`}>
            {task.title}
          </p>

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            <ComplexityBadge complexity={task.complexity} theme={theme} />
            {task.tags.map(tid => <TagPill key={tid} tagId={tid} tags={tags} />)}
            {task.dueDate && (
              <span className={`text-xs ${isOverdue ? theme.overdueText + ' font-semibold' : theme.muted}`}>
                {isOverdue ? '⚠ ' : ''}Due {formatDisplayDate(task.dueDate)}
              </span>
            )}
          </div>

          {/* Expanded notes */}
          {expanded && task.notes && (
            <p className={`text-xs mt-2 leading-relaxed ${theme.textSub}`}>{task.notes}</p>
          )}
        </div>

        {/* Delete */}
        <button
          onClick={() => deleteTask(task.id)}
          className={`text-xs px-1.5 py-1 rounded-lg flex-shrink-0 ${theme.muted} hover:text-red-500 transition-colors`}
        >✕</button>
      </div>
    </div>
  );
}

// ─── Add task form ────────────────────────────────────────────────────────────
function AddTaskForm({ theme, onClose }) {
  const { addTask, tags } = useStore();
  const [form, setForm] = useState({
    title: '',
    notes: '',
    dueDate: '',
    complexity: 'easy',
    tags: [],
  });

  function toggleTag(id) {
    setForm(f => ({
      ...f,
      tags: f.tags.includes(id) ? f.tags.filter(t => t !== id) : [...f.tags, id],
    }));
  }

  function handleAdd() {
    if (!form.title.trim()) return;
    addTask({
      title: form.title.trim(),
      notes: form.notes.trim() || null,
      dueDate: form.dueDate || null,
      complexity: form.complexity,
      tags: form.tags,
    });
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
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
              <option value="critical">Critical</option>
            </select>
          </div>
        </div>

        {/* Tags */}
        {tags.length > 0 && (
          <div>
            <label className={`text-xs mb-1.5 block ${theme.muted}`}>Tags</label>
            <div className="flex flex-wrap gap-1.5">
              {tags.map(tag => (
                <button
                  key={tag.id}
                  onClick={() => toggleTag(tag.id)}
                  className={`text-xs px-2.5 py-1 rounded-full font-medium border-2 transition-all ${
                    form.tags.includes(tag.id)
                      ? 'text-white border-transparent'
                      : 'bg-transparent border-gray-200'
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
          <button onClick={handleAdd} className={`flex-1 py-1.5 rounded-lg text-xs font-semibold ${theme.btnPrimary}`}>
            Add Task
          </button>
          <button onClick={onClose} className={`flex-1 py-1.5 rounded-lg text-xs font-semibold ${theme.btnSecondary}`}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function TodayScreen({ theme }) {
  const { activities, tasks } = useStore();
  const [habitsOpen, setHabitsOpen] = useState(true);
  const [tasksOpen,  setTasksOpen]  = useState(true);
  const [showAdd,    setShowAdd]    = useState(false);

  const now      = new Date();
  const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const dateLabel = `${dayNames[now.getDay()]}, ${now.getDate()} ${MONTH_NAMES_FULL[now.getMonth()]}`;

  const today   = todayStr();
  const overdue = tasks.filter(t => !t.completed && t.dueDate && t.dueDate < today);
  const pending = tasks.filter(t => !t.completed && !(t.dueDate && t.dueDate < today));
  const done    = tasks.filter(t => t.completed);

  return (
    <div className="pb-4">
      {/* Date header */}
      <div className="mb-4">
        <h1 className={`text-xl font-bold ${theme.text}`}>{dateLabel}</h1>
        <p className={`text-xs mt-0.5 ${theme.muted}`}>Tap + each time you complete an activity</p>
      </div>

      {/* ── HABITS section ── */}
      <div className="mb-4">
        <button
          onClick={() => setHabitsOpen(o => !o)}
          className="flex items-center justify-between w-full mb-2"
        >
          <span className={`text-xs font-bold uppercase tracking-widest pl-1 ${theme.sectionLabel}`}>
            Habits
          </span>
          <span className={`text-xs ${theme.muted}`}>{habitsOpen ? '▾' : '▸'}</span>
        </button>

        {habitsOpen && activities.map(a => (
          <HabitCard key={a.id} activity={a} theme={theme} />
        ))}
      </div>

      {/* ── TASKS section ── */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => setTasksOpen(o => !o)}
            className="flex items-center gap-2"
          >
            <span className={`text-xs font-bold uppercase tracking-widest pl-1 ${theme.sectionLabel}`}>
              Tasks
            </span>
            {overdue.length > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${theme.overdueText} bg-red-100`}>
                {overdue.length} overdue
              </span>
            )}
            <span className={`text-xs ${theme.muted}`}>{tasksOpen ? '▾' : '▸'}</span>
          </button>
          <button
            onClick={() => { setShowAdd(true); setTasksOpen(true); }}
            className={`text-xs px-2.5 py-1 rounded-lg font-semibold ${theme.btnPrimary}`}
          >
            + Add
          </button>
        </div>

        {tasksOpen && (
          <>
            {showAdd && <AddTaskForm theme={theme} onClose={() => setShowAdd(false)} />}

            {/* Overdue */}
            {overdue.length > 0 && (
              <div className="mb-2">
                <p className={`text-xs font-semibold mb-1 pl-1 ${theme.overdueText}`}>⚠ Overdue</p>
                {overdue.map(t => <TaskCard key={t.id} task={t} theme={theme} />)}
              </div>
            )}

            {/* Pending */}
            {pending.length > 0 && (
              <div className="mb-2">
                {pending.map(t => <TaskCard key={t.id} task={t} theme={theme} />)}
              </div>
            )}

            {/* Completed */}
            {done.length > 0 && (
              <div className="mb-2">
                <p className={`text-xs font-semibold mb-1 pl-1 ${theme.muted}`}>Completed</p>
                {done.map(t => <TaskCard key={t.id} task={t} theme={theme} />)}
              </div>
            )}

            {tasks.length === 0 && !showAdd && (
              <p className={`text-sm text-center py-4 ${theme.muted}`}>No tasks yet — tap + Add to get started</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
