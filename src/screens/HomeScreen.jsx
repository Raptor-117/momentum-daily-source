import { useState } from 'react';
import { useStore } from '../store';
import { LOGIN_BONUS_CONFIG, CLASSES, DEFAULT_TAGS } from '../data';
import {
  XpBar, StatBar, Checkbox, SquareCheckbox, PriorityDot, Badge,
} from '../components/UI';
import FilterBar from '../components/FilterBar';

// Iron Will banner component
function IronWillBanner({ t, mode, ironWill, toggleIronWill }) {
  if (!ironWill) {
    return (
      <button
        onClick={toggleIronWill}
        className={`w-full rounded-xl p-3 mb-4 transition-all ${t.card} ${t.cardHover} flex items-center justify-between`}
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">🛡</span>
          <span className={`text-sm ${t.text}`}>Casual Mode</span>
        </div>
        <span className={`text-xs ${t.muted}`}>Tap to enable Iron Will →</span>
      </button>
    );
  }

  return (
    <div className={`rounded-xl p-3 mb-4 ${t.ironWillBg}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">⚔</span>
          <span className={`text-sm font-bold ${t.ironWillText}`} style={{ fontFamily: t.font }}>
            Iron Will Mode Active
          </span>
          <span className="text-lg">⚔</span>
        </div>
        <button
          onClick={toggleIronWill}
          className="px-2 py-1 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white transition-all"
        >
          Disable
        </button>
      </div>
      <div className={`text-xs ${t.ironWillText} flex flex-wrap gap-x-3 gap-y-1 opacity-90`}>
        <span>✦ True streaks reset at midnight</span>
        <span>✦ Full HP damage on missed dailies</span>
        <span>✦ 1.5× XP on all actions</span>
      </div>
    </div>
  );
}

// Inline section toggle (allows sibling buttons like "+ Add")
function SectionHeader({ label, count, open, onToggle, t, children }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <button
        onClick={onToggle}
        className="flex-1 flex items-center justify-between px-3 py-2 rounded-xl transition-all"
      >
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold uppercase tracking-wider ${t.text}`}>{label}</span>
          <Badge t={t}>{count}</Badge>
        </div>
        <span
          className={`text-xs ${t.muted} transition-transform duration-200 inline-block`}
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        >▼</span>
      </button>
      {children}
    </div>
  );
}

export default function HomeScreen({ t, mode }) {
  const {
    user, habits, ironWill, loginBonusClaimed, claimLoginBonus,
    toggleHabit, toggleTask, toggleIronWill,
    getFilteredTasks, customTags, addTask, deleteTask,
  } = useStore();

  const [open, setOpen] = useState({
    habits: true,
    contracts: true,
    overdue: true,
    today: true,
    upcoming: false,
    nodead: false,
  });
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTask, setNewTask] = useState({ title: '', priority: 'med', difficulty: 'moderate', deadline: '' });
  const toggleSection = (k) => setOpen((p) => ({ ...p, [k]: !p[k] }));

  const cls = CLASSES.find((c) => c.id === user.classId);
  const loginDay = user.loginStreak;
  const bonus = LOGIN_BONUS_CONFIG[Math.min(loginDay - 1, 6)];

  const tasks = getFilteredTasks();
  const allTags = [...DEFAULT_TAGS, ...customTags];

  const groups = {
    overdue:  { label: mode === 'rpg' ? '⚠️ Overdue Contracts' : 'Overdue',     accent: t.overdue,   items: tasks.filter((x) => x.group === 'overdue') },
    today:    { label: mode === 'rpg' ? '⚔️ Due Today'          : 'Due Today',   accent: t.today,     items: tasks.filter((x) => x.group === 'today') },
    upcoming: { label: mode === 'rpg' ? '📜 Upcoming'           : 'Upcoming',    accent: t.upcoming,  items: tasks.filter((x) => x.group === 'upcoming') },
    nodead:   { label: mode === 'rpg' ? '🗂 No Deadline'         : 'No Deadline', accent: t.nodead,    items: tasks.filter((x) => x.group === 'nodead') },
  };

  const difficultyXP = { novice: 25, moderate: 50, hard: 100, difficult: 200 };
  const priXp = { high: 60, med: 40, low: 25 };

  function handleAddTask() {
    if (!newTask.title.trim()) return;
    addTask({
      ...newTask,
      xpReward: difficultyXP[newTask.difficulty] || 50,
    });
    setNewTask({ title: '', priority: 'med', difficulty: 'moderate', deadline: '' });
    setShowAddTask(false);
  }

  return (
    <div className="space-y-4 pb-4">

      {/* ── Iron Will Banner ── */}
      <IronWillBanner t={t} mode={mode} ironWill={ironWill} toggleIronWill={toggleIronWill} />

      {/* ── Login bonus ── */}
      {!loginBonusClaimed && bonus && (
        <button
          onClick={() => claimLoginBonus(bonus.xp, bonus.gold)}
          className={`w-full flex items-center gap-3 p-3 rounded-xl ${
            mode === 'rpg'
              ? 'bg-gradient-to-r from-amber-950/60 to-violet-950/60 border border-amber-700'
              : 'bg-amber-50 border border-amber-200'
          }`}
        >
          <span className="text-2xl">🎁</span>
          <div className="flex-1 text-left">
            <p className={`text-xs font-bold ${mode === 'rpg' ? 'text-amber-300' : 'text-amber-700'}`}>
              Day {loginDay} Login Bonus!
            </p>
            <p className={`text-xs ${t.muted}`}>
              +{bonus.xp} XP · {bonus.gold} Gold{bonus.itemLabel ? ` · ${bonus.itemLabel}` : ''} — tap to claim
            </p>
          </div>
          <span className={`text-xs px-2 py-1 rounded-full font-bold ${mode === 'rpg' ? 'bg-amber-500 text-black' : 'bg-amber-400 text-white'}`}>
            CLAIM
          </span>
        </button>
      )}

      {/* ── Player card ── */}
      <div className={`rounded-2xl p-4 ${t.card} ${t.glow}`}>
        <div className="flex items-center gap-3 mb-3">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${mode === 'rpg' ? 'bg-violet-950' : 'bg-[#f0ede6]'}`}>
            {cls?.icon || '🧙'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`font-bold ${t.text}`} style={{ fontFamily: t.font }}>{user.displayName}</span>
              <Badge t={t}>Lvl {user.level}</Badge>
              <Badge t={t}>{cls?.name}</Badge>
              {ironWill && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-rose-900 text-rose-300 border border-rose-700">
                  ⚔ Iron Will
                </span>
              )}
            </div>
            <p className={`text-xs ${t.muted}`}>🔥 {user.streakCurrent} day streak · longest: {user.streakLongest}</p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className={`text-xs ${t.muted}`}>Gold</p>
            <p className={`text-sm font-bold ${t.xp}`}>✦ {user.gold}</p>
          </div>
        </div>
        <div className="space-y-2">
          <XpBar xp={user.xp} xpNext={user.xpNext} t={t} />
          {mode === 'rpg' && (
            <div className="grid grid-cols-2 gap-2 pt-1">
              <StatBar val={user.hp}     max={user.hpMax}     colorClass="bg-rose-500"   label="HP"     t={t} />
              <StatBar val={user.energy} max={user.energyMax} colorClass="bg-amber-400"  label="Energy" t={t} />
            </div>
          )}
        </div>
      </div>

      {/* ── Daily habits ── */}
      <div>
        <SectionHeader
          label={mode === 'rpg' ? '⚔️ Daily Quests' : 'Daily Habits'}
          count={habits.length}
          open={open.habits}
          onToggle={() => toggleSection('habits')}
          t={t}
        />
        {open.habits && (
          <div className="space-y-2 mb-3">
            {habits.map((h) => (
              <button
                key={h.id}
                onClick={() => toggleHabit(h.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all ${t.card} ${
                  h.completedToday ? 'opacity-50' : t.cardHover
                }`}
              >
                <Checkbox checked={h.completedToday} onChange={() => {}} />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm truncate ${h.completedToday ? `line-through ${t.muted}` : t.text}`}>{h.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${t.pill}`}>{h.category}</span>
                    {h.streak > 0 && <span className={`text-xs ${t.muted}`}>🔥 {h.streak}</span>}
                    {h.lowEnergyVersion && !h.completedToday && (
                      <span className={`text-xs ${t.muted} italic truncate`}>⚡ {h.lowEnergyVersion}</span>
                    )}
                  </div>
                </div>
                {mode === 'rpg' && (
                  <span className={`text-xs font-bold flex-shrink-0 ${h.completedToday ? t.muted : t.xp}`}>
                    {h.completedToday ? '✓' : `+${h.xpReward} XP`}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Tasks ── */}
      <div>
        <SectionHeader
          label={mode === 'rpg' ? '📋 Contracts' : 'To-Do'}
          count={tasks.length}
          open={open.contracts}
          onToggle={() => toggleSection('contracts')}
          t={t}
        >
          <button
            onClick={() => setShowAddTask(!showAddTask)}
            className={`text-xs px-2 py-1.5 rounded-lg ${t.accentBtn} flex-shrink-0`}
          >
            + Add
          </button>
        </SectionHeader>

        {open.contracts && (
          <>
            {/* Add task form */}
            {showAddTask && (
              <div className={`rounded-xl p-3 mb-3 ${t.card}`}>
                <input
                  type="text"
                  placeholder="Task title..."
                  value={newTask.title}
                  onChange={e => setNewTask({ ...newTask, title: e.target.value })}
                  className={`w-full text-sm px-3 py-2 rounded-lg mb-2 outline-none ${t.inputBg}`}
                />
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <select
                    value={newTask.priority}
                    onChange={e => setNewTask({ ...newTask, priority: e.target.value })}
                    className={`text-xs px-2 py-1.5 rounded-lg outline-none ${t.inputBg}`}
                  >
                    <option value="high">🔴 High Priority</option>
                    <option value="med">🟡 Med Priority</option>
                    <option value="low">🟢 Low Priority</option>
                  </select>
                  <select
                    value={newTask.difficulty}
                    onChange={e => setNewTask({ ...newTask, difficulty: e.target.value })}
                    className={`text-xs px-2 py-1.5 rounded-lg outline-none ${t.inputBg}`}
                  >
                    <option value="novice">{mode === 'rpg' ? 'Novice' : 'Easy'} (25 XP)</option>
                    <option value="moderate">{mode === 'rpg' ? 'Moderate' : 'Medium'} (50 XP)</option>
                    <option value="hard">Hard (100 XP)</option>
                    <option value="difficult">{mode === 'rpg' ? 'Difficult' : 'Very Hard'} (200 XP)</option>
                  </select>
                </div>
                <input
                  type="date"
                  value={newTask.deadline}
                  onChange={e => setNewTask({ ...newTask, deadline: e.target.value })}
                  className={`w-full text-xs px-2 py-1.5 rounded-lg mb-2 outline-none ${t.inputBg}`}
                />
                <div className="flex gap-2">
                  <button onClick={handleAddTask} className={`flex-1 py-1.5 rounded-lg text-xs ${t.accentBtn}`}>Add Task</button>
                  <button onClick={() => setShowAddTask(false)} className={`flex-1 py-1.5 rounded-lg text-xs ${t.secondaryBtn}`}>Cancel</button>
                </div>
              </div>
            )}

            <FilterBar t={t} mode={mode} />

            {Object.entries(groups).map(([key, group]) => (
              <div key={key} className="mb-1">
                <button
                  onClick={() => toggleSection(key)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl mb-2 transition-all ${group.accent}`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold uppercase tracking-wider ${t.text}`}>{group.label}</span>
                    <Badge t={t}>{group.items.length}</Badge>
                  </div>
                  <span
                    className={`text-xs ${t.muted} transition-transform duration-200 inline-block`}
                    style={{ transform: open[key] ? 'rotate(180deg)' : 'rotate(0deg)' }}
                  >▼</span>
                </button>
                {open[key] && (
                  <div className="space-y-1.5 mb-3 pl-1">
                    {group.items.length === 0 ? (
                      <p className={`text-xs text-center py-3 ${t.muted} italic`}>Nothing here</p>
                    ) : (
                      group.items.map((item) => (
                        <div key={item.id} className="relative group">
                          <button
                            onClick={() => toggleTask(item.id)}
                            className={`w-full flex items-start gap-3 p-3 rounded-xl text-left transition-all ${t.card} ${
                              item.completed ? 'opacity-40' : t.cardHover
                            }`}
                          >
                            <div className="pt-0.5">
                              <SquareCheckbox checked={item.completed} onChange={() => {}} />
                            </div>
                            <div className="pt-0.5">
                              <PriorityDot priority={item.priority} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm ${item.completed ? `line-through ${t.muted}` : t.text}`}>
                                {item.title}
                              </p>
                              {item.deadline && (
                                <p className={`text-xs ${key === 'overdue' ? 'text-rose-400' : t.muted}`}>
                                  {key === 'overdue' ? '⚠ Overdue: ' : 'Due: '}{item.deadline}
                                </p>
                              )}
                              {item.tags && item.tags.length > 0 && (
                                <div className="flex gap-1 mt-1.5 flex-wrap">
                                  {item.tags.map(tagId => {
                                    const tag = allTags.find(t => t.id === tagId);
                                    if (!tag) return null;
                                    return (
                                      <span
                                        key={tagId}
                                        className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                                        style={{ background: `${tag.color}22`, color: tag.color }}
                                      >
                                        {tag.label}
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                            {mode === 'rpg' && (
                              <span className={`text-xs font-bold flex-shrink-0 pt-0.5 ${
                                item.completed ? t.muted : key === 'overdue' ? 'text-rose-400' : t.xp
                              }`}>
                                {item.completed ? '✓' : key === 'overdue' ? '−HP' : `+${item.xpReward || priXp[item.priority]} XP`}
                              </span>
                            )}
                          </button>
                          <button
                            onClick={() => deleteTask(item.id)}
                            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-xs px-2 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white"
                          >
                            ✕
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
