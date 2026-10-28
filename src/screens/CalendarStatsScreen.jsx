import { useState, Component } from 'react';
import { useStore } from '../store';
import {
  todayStr, toDateStr, getWeekStart, getWeekDays, getCalendarMonthChunks,
  getDayLabels, MONTH_NAMES, MONTH_NAMES_FULL, weeklyGoal,
} from '../data';
import { scorePeriod, monthDays, BANDS } from '../data/scoring';

// ─── Shared emotion map ───────────────────────────────────────────────────────
const PRESET_EMOTION_EMOJI = {
  energised:'⚡', calm:'😌', focused:'🎯', tired:'😴', anxious:'😰', happy:'😊',
  sad:'☁️', frustrated:'🔥', grateful:'🌱', hopeful:'🌟', lonely:'😔', proud:'⭐',
};

// Merge preset + user-defined custom emotions into a lookup map
function buildEmotionMap(customEmotions = []) {
  const custom = Object.fromEntries((customEmotions || []).map(e => [e.id, e.emoji]));
  return { ...PRESET_EMOTION_EMOJI, ...custom };
}

// ─── CSV export helper ────────────────────────────────────────────────────────
function exportCSV(filename, rows) {
  const csv  = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ─── Calendar heatmap ─────────────────────────────────────────────────────────
function CalendarView({ theme, gamify, onShowScoringHelp }) {
  const { activities, logs, checkIns, journalEntries, journalPrompts, wellbeingNotes, tasks, logActivity, setLogCount, customEmotions } = useStore();
  const EMOTION_EMOJI = buildEmotionMap(customEmotions);
  const now          = new Date();
  const todayDateStr = todayStr();
  const [viewYear,   setViewYear]   = useState(now.getFullYear());
  const [viewMonth,  setViewMonth]  = useState(now.getMonth());
  const [selDay,     setSelDay]     = useState(todayDateStr);
  const [editingDay, setEditingDay] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }

  // Day colour = band of the daily-habit score (tracker-spec §3). Today stays neutral
  // until something is logged; days before daily logging are greyed.
  function dayFill(dateStr, score) {
    if (score.weeklyDataOnly) return theme.calWeeklyOnly;
    if (score.pct == null || (dateStr === todayDateStr && score.pct === 0)) return theme.cal[0];
    return theme.band[score.band];
  }
  // Daily habits show in the colour; the dot marks weekly/monthly habit logs.
  const loggedNonDaily = (dateStr) =>
    activities.some(a => (a.cadence === 'weekly' || a.cadence === 'monthly') && (logs[a.id] || {})[dateStr] > 0);

  const firstDow    = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  // All activities with their counts for the selected day
  const allSelActivities = selDay
    ? activities.map(a => ({ ...a, count: (logs[a.id] || {})[selDay] || 0 }))
    : [];
  // Only logged ones for read view
  const selActivities = allSelActivities.filter(a => a.count > 0);

  return (
    <div>
      {/* Month nav */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={prevMonth} className={`w-8 h-8 flex items-center justify-center rounded-lg text-base ${theme.btnSecondary}`}>◀</button>
        <h2 className={`text-base font-bold ${theme.text}`}>{MONTH_NAMES_FULL[viewMonth]} {viewYear}</h2>
        <button onClick={nextMonth} className={`w-8 h-8 flex items-center justify-center rounded-lg text-base ${theme.btnSecondary}`}>▶</button>
      </div>

      {/* DOW headers */}
      <div className="grid grid-cols-7 mb-1">
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
          <div key={d} className={`text-center text-xs font-medium py-1 ${theme.muted}`}>{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1 mb-3">
        {cells.map((day, i) => {
          if (!day) return <div key={`e-${i}`} />;
          const dateStr    = toDateStr(new Date(viewYear, viewMonth, day));
          const isFuture   = dateStr > todayDateStr;
          const score      = isFuture ? null : scorePeriod(activities, logs, [dateStr], 'day');
          const isToday    = dateStr === todayDateStr;
          const isSel      = dateStr === selDay;
          const hasCheckIn  = !isFuture && !!checkIns[dateStr];
          const hasJournal  = !isFuture && !!(journalEntries[dateStr] && Object.values(journalEntries[dateStr]).some(v => v?.trim()));
          const hasNotes    = !isFuture && !!(wellbeingNotes[dateStr]?.trim());
          const perfect     = !isFuture && score.pct === 100;
          const dot         = !isFuture && loggedNonDaily(dateStr);
          const tasksDone   = !isFuture ? (tasks || []).filter(t => t.completedDate === dateStr).length : 0;

          return (
            <button
              key={dateStr}
              onClick={() => { if (!isFuture) { setSelDay(isSel ? null : dateStr); setEditingDay(false); setJournalOpen(false); } }}
              disabled={isFuture}
              className={`min-h-[40px] w-full rounded-lg flex flex-col items-center justify-center py-1 text-xs font-semibold transition-all relative
                ${isFuture ? (theme.bg + ' ' + theme.muted + ' cursor-default') : dayFill(dateStr, score)}
                ${isToday  ? 'ring-2 ring-blue-500 ring-offset-1' : ''}
                ${isSel    ? 'ring-2 ring-violet-500 ring-offset-1' : ''}
              `}
            >
              <span className="leading-none">{day}</span>
              {dot && <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-current opacity-70" />}
              {(perfect || hasCheckIn || hasJournal || hasNotes || tasksDone > 0) && (
                <div className="flex flex-wrap gap-0.5 mt-0.5 items-center justify-center w-full px-0.5">
                  {perfect    && <span className="text-[9px] leading-none">{gamify ? '🚀' : '⭐'}</span>}
                  {hasCheckIn && (() => {
                    const firstEmotion = (checkIns[dateStr]?.emotions || [])[0];
                    return <span className="text-[9px] leading-none">{EMOTION_EMOJI[firstEmotion] || '🌙'}</span>;
                  })()}
                  {hasJournal  && <span className="text-[9px] leading-none">📖</span>}
                  {hasNotes    && <span className="text-[9px] leading-none">📝</span>}
                  {tasksDone > 0 && <span className="text-[9px] leading-none font-bold text-green-600">✅{tasksDone}</span>}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Colour key — full explanation lives in Settings › Tracker */}
      <button onClick={onShowScoringHelp} className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3 px-1 text-left">
        {BANDS.map(b => (
          <span key={b.label} className={`flex items-center gap-1 text-[10px] ${theme.muted}`}>
            <span className={`w-2.5 h-2.5 rounded-sm ${theme.band[b.label].split(' ')[0]}`} />{b.label}
          </span>
        ))}
        <span className={`text-[10px] ${theme.muted}`}>• weekly/monthly logged · ⓘ</span>
      </button>

      {/* Selected day breakdown */}
      {selDay && (
        <div className={`rounded-xl p-3 border shadow-sm ${theme.card} ${theme.cardBorder}`}>
          {/* Header row */}
          <div className="flex items-center justify-between mb-2">
            <p className={`text-sm font-bold ${theme.text}`}>
              {new Date(selDay + 'T00:00:00').toLocaleDateString('en-AU', {
                weekday: 'long', day: 'numeric', month: 'long',
              })}
            </p>
            {editingDay ? (
              <button
                onClick={() => setEditingDay(false)}
                className={`text-xs px-3 py-1 rounded-lg font-semibold ${theme.btnPrimary}`}
              >Done</button>
            ) : (
              <button
                onClick={() => setEditingDay(true)}
                className={`text-xs px-3 py-1 rounded-lg font-semibold ${theme.btnSecondary}`}
              >✎ Edit</button>
            )}
          </div>

          {/* Habits — edit or read mode */}
          {editingDay ? (
            <div className="space-y-1.5 mb-3">
              {allSelActivities.length === 0 ? (
                <p className={`text-xs italic ${theme.muted}`}>No habits set up yet</p>
              ) : (
                allSelActivities.map(a => (
                  <div key={a.id} className="flex items-center justify-between gap-2">
                    <span className={`text-sm flex-1 leading-tight ${theme.textSub}`}>{a.emoji} {a.name}</span>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => logActivity(a.id, selDay, -1)}
                        className={`w-7 h-7 flex items-center justify-center rounded-lg text-base font-bold transition-all active:scale-90 ${theme.btnSecondary}`}
                      >−</button>
                      <span className={`text-sm font-bold tabular-nums w-6 text-center ${a.count > 0 ? theme.tabActiveText : theme.muted}`}>
                        {a.count}
                      </span>
                      <button
                        onClick={() => logActivity(a.id, selDay, 1)}
                        className={`w-7 h-7 flex items-center justify-center rounded-lg text-base font-bold transition-all active:scale-90 ${theme.btnSecondary}`}
                      >+</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <>
              {selActivities.length === 0 ? (
                <p className={`text-xs italic mb-2 ${theme.muted}`}>No habits logged</p>
              ) : (
                <div className="space-y-1.5 mb-3">
                  {selActivities.map(a => (
                    <div key={a.id} className="flex items-center justify-between">
                      <span className={`text-sm ${theme.textSub}`}>{a.emoji} {a.name}</span>
                      <span className={`text-sm font-bold tabular-nums ${theme.tabActiveText}`}>{a.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Check-in */}
          {checkIns[selDay] && (
            <div className={`pt-2 border-t ${theme.divider}`}>
              <p className={`text-xs font-semibold mb-1 ${theme.muted}`}>🌙 Check-in</p>
              <div className="flex flex-wrap gap-1">
                {checkIns[selDay].emotions.map(id => (
                  <span key={id} className={`text-xs px-2 py-0.5 rounded-full ${theme.progressBg} ${theme.textSub}`}>
                    {EMOTION_EMOJI[id]} {id.charAt(0).toUpperCase() + id.slice(1)}
                  </span>
                ))}
              </div>
              {checkIns[selDay].notes && (
                <p className={`text-xs mt-1.5 italic ${theme.muted}`}>"{checkIns[selDay].notes}"</p>
              )}
            </div>
          )}

          {/* Journal */}
          {journalEntries[selDay] && Object.values(journalEntries[selDay]).some(v => v?.trim()) && (() => {
            const answeredPrompts = journalPrompts.filter(p => (journalEntries[selDay][p.id] || '').trim());
            return (
              <div className={`pt-2 mt-2 border-t ${theme.divider}`}>
                <button
                  className="flex items-center justify-between w-full"
                  onClick={() => setJournalOpen(o => !o)}
                >
                  <p className={`text-xs font-semibold ${theme.muted}`}>📓 Journal</p>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs ${theme.muted}`}>{answeredPrompts.length} prompt{answeredPrompts.length !== 1 ? 's' : ''}</span>
                    <span className={`text-xs ${theme.muted}`}>{journalOpen ? '▾' : '▸'}</span>
                  </div>
                </button>
                {journalOpen && (
                  <div className="mt-2 space-y-3">
                    {answeredPrompts.map(p => (
                      <div key={p.id}>
                        <p className={`text-xs italic mb-0.5 ${theme.muted}`}>"{p.text}"</p>
                        <p className={`text-xs leading-relaxed ${theme.textSub}`}>{journalEntries[selDay][p.id]}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Notes */}
          {wellbeingNotes[selDay]?.trim() && (
            <div className={`pt-2 mt-2 border-t ${theme.divider}`}>
              <p className={`text-xs font-semibold mb-1 ${theme.muted}`}>📝 Notes</p>
              <p className={`text-xs leading-relaxed ${theme.textSub}`}>{wellbeingNotes[selDay]}</p>
            </div>
          )}

          {/* Tasks completed */}
          {(() => {
            const dayTasks = (tasks || []).filter(t => t.completedDate === selDay);
            if (dayTasks.length === 0) return null;
            return (
              <div className={`pt-2 mt-2 border-t ${theme.divider}`}>
                <p className={`text-xs font-semibold mb-1.5 ${theme.muted}`}>✅ Tasks Completed ({dayTasks.length})</p>
                <div className="space-y-0.5">
                  {dayTasks.map(t => (
                    <p key={t.id} className={`text-xs ${theme.textSub}`}>• {t.title}</p>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      <TrackerScores theme={theme} selDay={selDay || todayDateStr} year={viewYear} month={viewMonth} />
    </div>
  );
}

// ─── Journal log entry (expandable, defaults open) ────────────────────────────
function JournalLogEntry({ displayDate, prompts, dayEntries, theme }) {
  const [open, setOpen] = useState(true);
  return (
    <div className={`rounded-xl border overflow-hidden ${theme.card} ${theme.cardBorder}`}>
      <button className="flex items-center justify-between w-full px-3 py-2.5" onClick={() => setOpen(o => !o)}>
        <span className={`text-xs font-semibold ${theme.textSub}`}>{displayDate}</span>
        <div className="flex items-center gap-2">
          <span className={`text-xs ${theme.muted}`}>{prompts.length} prompt{prompts.length !== 1 ? 's' : ''}</span>
          <span className={`text-xs ${theme.muted}`}>{open ? '▾' : '▸'}</span>
        </div>
      </button>
      {open && (
        <div className={`px-3 pb-3 border-t space-y-3 ${theme.divider}`}>
          {prompts.map(p => (
            <div key={p.id} className="pt-2">
              <p className={`text-xs font-semibold italic mb-1 ${theme.muted}`}>"{p.text}"</p>
              <p className={`text-sm leading-relaxed ${theme.text}`}>{dayEntries[p.id]}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Error boundary ───────────────────────────────────────────────────────────
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
          <p className="font-bold mb-1">Something went wrong loading this tab:</p>
          <p className="font-mono break-all">{this.state.error.message}</p>
          <p className="mt-2 text-red-500">Screenshot this and share it to get it fixed.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Logs view ────────────────────────────────────────────────────────────────
function LogsView({ theme, gamify }) {
  const { checkIns, journalEntries, journalPrompts, customEmotions } = useStore();
  const EMOTION_EMOJI = buildEmotionMap(customEmotions);
  const [subTab, setSubTab] = useState('checkins');

  const ciDates = Object.keys(checkIns)
    .filter(d => checkIns[d] && Array.isArray(checkIns[d].emotions))
    .sort((a, b) => b.localeCompare(a));
  const jeDates = Object.keys(journalEntries)
    .filter(d => journalEntries[d] && typeof journalEntries[d] === 'object' && Object.values(journalEntries[d]).some(v => v?.trim()))
    .sort((a, b) => b.localeCompare(a));

  function formatDate(d) {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-AU', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    });
  }

  function exportCheckIns() {
    const rows = [['Date', 'Emotions', 'Notes']];
    ciDates.forEach(d => {
      const ci = checkIns[d];
      rows.push([
        d,
        (ci.emotions || []).map(e => e.charAt(0).toUpperCase() + e.slice(1)).join(', '),
        ci.notes || '',
      ]);
    });
    exportCSV(`flow-checkins-${todayStr()}.csv`, rows);
  }

  function exportJournal() {
    const rows = [['Date', 'Prompt', 'Answer']];
    jeDates.forEach(d => {
      journalPrompts.forEach(p => {
        const answer = (journalEntries[d][p.id] || '').trim();
        if (answer) rows.push([d, p.text, answer]);
      });
    });
    exportCSV(`flow-journal-${todayStr()}.csv`, rows);
  }

  return (
    <div>
      {/* Sub-tabs */}
      <div className={`flex gap-1 p-1 rounded-xl mb-4 ${theme.periodTabBar}`}>
        <button
          onClick={() => setSubTab('checkins')}
          className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${subTab === 'checkins' ? theme.periodActive : theme.periodInactive}`}
        >{gamify ? '🗺 Adventure Reports' : '🌙 Check-Ins'} {ciDates.length > 0 ? `(${ciDates.length})` : ''}</button>
        <button
          onClick={() => setSubTab('journal')}
          className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${subTab === 'journal' ? theme.periodActive : theme.periodInactive}`}
        >{gamify ? '📖 The Tome' : '📓 Journal'} {jeDates.length > 0 ? `(${jeDates.length})` : ''}</button>
      </div>

      {/* Check-Ins */}
      {subTab === 'checkins' && (
        <div>
          {ciDates.length === 0 ? (
            <div className={`text-center py-10 ${theme.muted}`}>
              <p className="text-3xl mb-2">{gamify ? '🗺' : '🌙'}</p>
              <p className="text-sm font-medium">{gamify ? 'No adventure reports yet' : 'No check-ins yet'}</p>
              <p className="text-xs mt-1">{gamify ? 'File one in the Wellbeing tab' : 'Log one in the Wellbeing tab'}</p>
            </div>
          ) : (
            <div className="space-y-2 mb-3">
              {ciDates.map(d => {
                const ci = checkIns[d];
                return (
                  <div key={d} className={`rounded-xl p-3 border ${theme.card} ${theme.cardBorder}`}>
                    <p className={`text-xs font-semibold mb-1.5 ${theme.textSub}`}>{formatDate(d)}</p>
                    <div className="flex flex-wrap gap-1 mb-1.5">
                      {(ci.emotions || []).map(id => (
                        <span key={id} className={`text-xs px-2 py-0.5 rounded-full ${theme.progressBg} ${theme.textSub}`}>
                          {EMOTION_EMOJI[id]} {id.charAt(0).toUpperCase() + id.slice(1)}
                        </span>
                      ))}
                    </div>
                    {ci.notes ? (
                      <p className={`text-xs italic ${theme.muted}`}>"{ci.notes}"</p>
                    ) : (
                      <p className={`text-xs ${theme.muted}`}>No notes</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {ciDates.length > 0 && (
            <button onClick={exportCheckIns} className={`w-full py-3 rounded-xl text-sm font-bold active:scale-[0.98] transition-all shadow-sm ${theme.btnPrimary}`}>
              {gamify ? '↓ Export Adventure Reports CSV' : '↓ Export Check-Ins CSV'}
            </button>
          )}
        </div>
      )}

      {/* Journal */}
      {subTab === 'journal' && (
        <div>
          {jeDates.length === 0 ? (
            <div className={`text-center py-10 ${theme.muted}`}>
              <p className="text-3xl mb-2">{gamify ? '📖' : '📓'}</p>
              <p className="text-sm font-medium">{gamify ? 'The Tome is empty' : 'No journal entries yet'}</p>
              <p className="text-xs mt-1">{gamify ? 'Write some in the Wellbeing tab' : 'Answer prompts in the Wellbeing tab'}</p>
            </div>
          ) : (
            <div className="space-y-2 mb-3">
              {jeDates.map(d => {
                const dayEntries = journalEntries[d] || {};
                const answered   = journalPrompts.filter(p => (dayEntries[p.id] || '').trim());
                return (
                  <JournalLogEntry
                    key={d}
                    displayDate={formatDate(d)}
                    prompts={answered}
                    dayEntries={dayEntries}
                    theme={theme}
                  />
                );
              })}
            </div>
          )}
          {jeDates.length > 0 && (
            <button onClick={exportJournal} className={`w-full py-3 rounded-xl text-sm font-bold active:scale-[0.98] transition-all shadow-sm ${theme.btnPrimary}`}>
              {gamify ? '↓ Export The Tome CSV' : '↓ Export Journal CSV'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Stats tables ─────────────────────────────────────────────────────────────
function offsetDateStr(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function getWeekOfYear(dateStr) {
  const d    = new Date(dateStr + 'T00:00:00');
  const jan1 = new Date(d.getFullYear(), 0, 1);
  return Math.floor(((d - jan1) / 86400000 + jan1.getDay()) / 7) + 1;
}

// ─── Score cards (tracker-spec §3) ─────────────────────────────────────────────
const BAR = { 'Excellent': 'bg-green-500', 'Good': 'bg-lime-500', 'Average': 'bg-amber-500', 'Needs Improvement': 'bg-rose-500' };
const fmtDay = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });

function ScoreCard({ theme, title, sub, result, prev, prevLabel, goal, chart, children }) {
  const { tags } = useStore();
  const [open, setOpen] = useState(false);
  const { pct, band } = result;
  const diff = pct != null && prev?.pct != null ? pct - prev.pct : null;
  return (
    <div className={`rounded-xl p-3 mb-3 border shadow-sm ${theme.card} ${theme.cardBorder}`}>
      <div className="flex items-center justify-between gap-2">
        <p className={`text-sm font-bold ${theme.text}`}>{title} {sub && <span className={`text-xs font-normal ${theme.muted}`}>{sub}</span>}</p>
        {pct != null && <span className={`text-xs px-2 py-0.5 rounded-full font-semibold whitespace-nowrap ${theme.bandPill[band]}`}>{pct}% · {band}</span>}
      </div>
      {pct == null ? (
        <p className={`text-xs mt-1 ${theme.muted}`}>No habits scored in this period</p>
      ) : (<>
        <div className={`relative h-1.5 rounded-full mt-2 mb-1 ${theme.progressBg}`}>
          <div className={`h-full rounded-full ${BAR[band]}`} style={{ width: `${pct}%` }} />
          <div className={`absolute -top-1 w-0.5 h-3.5 ${theme.goalTick}`} style={{ left: `${goal}%` }} />
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className={`text-[11px] ${theme.muted}`}>Goal {goal}% · {pct >= goal ? 'hit' : `${goal - pct}% to go`}</span>
          {diff != null && (
            <span className={`text-[11px] font-semibold ${diff > 0 ? 'text-green-500' : diff < 0 ? 'text-rose-500' : theme.muted}`}>
              {diff > 0 ? '▲' : diff < 0 ? '▼' : '='} {Math.abs(diff)}% vs {prevLabel} ({prev.pct}%)
            </span>
          )}
        </div>
        <div className="mt-2 space-y-1">
          {tags.filter(t => result.categories[t.id]).map(t => {
            const c = result.categories[t.id];
            return (
              <div key={t.id} className="flex items-center justify-between text-xs">
                <span className={theme.textSub}><span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: t.color }} />{t.label}</span>
                <span className={`tabular-nums ${theme.muted}`}>{+c.points.toFixed(1)} / {c.count} · {c.pct}%</span>
              </div>
            );
          })}
          <div className={`flex items-center justify-between text-xs pt-1 border-t ${theme.divider}`}>
            <span className={theme.textSub}>Total</span>
            <span className={`tabular-nums font-semibold ${theme.text}`}>{+result.points.toFixed(1)} / {result.habits.length} points</span>
          </div>
        </div>
      </>)}
      {chart}
      {children && (<>
        <button onClick={() => setOpen(o => !o)} className={`text-xs mt-2 font-semibold ${theme.tabActiveText}`}>{open ? 'Hide habits ▴' : 'Show habits ▾'}</button>
        {open && <div className="mt-2">{children}</div>}
      </>)}
    </div>
  );
}

// Week follows the tapped calendar day; month and year follow the calendar page.
// The current week/month/year is scored "so far" so it compares fairly with the last.
function TrackerScores({ theme, selDay, year, month }) {
  const { activities, logs, weekStartDay, uiPrefs } = useStore();
  const goal  = uiPrefs?.tracker?.goalPct ?? 70;
  const today = todayStr();
  const score = (days, kind) => scorePeriod(activities, logs, days.filter(d => d <= today), kind);
  const partial = (days) => days[days.length - 1] > today ? 'so far' : '';

  const ws       = getWeekStart(selDay, weekStartDay);
  const week     = getWeekDays(ws);
  const mDays    = monthDays(year, month);
  const prevM    = new Date(year, month - 1, 1);
  const months   = Array.from({ length: 12 }, (_, m) => monthDays(year, m)).filter(d => d[0] <= today);

  return (<>
    <div className="h-2" />
    <ScoreCard theme={theme} goal={goal}
      title={ws === getWeekStart(today, weekStartDay) ? 'This week' : `Week of ${fmtDay(ws)}`} sub={partial(week)}
      result={score(week, 'week')} prev={score(getWeekDays(offsetDateStr(ws, -7)), 'week')} prevLabel="last week">
      <PeriodDetail theme={theme} period="week" weekStart={ws} year={year} month={month} />
    </ScoreCard>
    <ScoreCard theme={theme} goal={goal}
      title={`${MONTH_NAMES_FULL[month]} ${year}`} sub={partial(mDays)}
      result={score(mDays, 'month')} prev={score(monthDays(prevM.getFullYear(), prevM.getMonth()), 'month')} prevLabel={MONTH_NAMES_FULL[prevM.getMonth()]}>
      <PeriodDetail theme={theme} period="month" weekStart={ws} year={year} month={month} />
    </ScoreCard>
    <ScoreCard theme={theme} goal={goal} title={`${year}`} sub={months.length && months.length < 12 ? 'so far' : ''} result={score(months.flat(), 'month')} chart={
      <div className="flex items-end gap-1 h-16 mt-3">
        {Array.from({ length: 12 }, (_, m) => {
          const r = m < months.length ? score(months[m], 'month') : null;
          return (
            <div key={m} className="flex-1 flex flex-col items-center gap-0.5 h-full justify-end">
              <div className={`w-full rounded-sm ${r?.pct != null ? BAR[r.band] : theme.progressBg}`} style={{ height: `${Math.max(r?.pct ?? 0, 4)}%` }} />
              <span className={`text-[9px] ${theme.muted}`}>{MONTH_NAMES[m][0]}</span>
            </div>
          );
        })}
      </div>}>
      <PeriodDetail theme={theme} period="year" weekStart={ws} year={year} month={month} />
    </ScoreCard>
  </>);
}

// ─── Per-habit tables + share/export (formerly the Stats tab) ──────────────────
function PeriodDetail({ theme, period, weekStart: viewWeekStart, year, month }) {
  const { activities, logs, weekStartDay } = useStore();
  const today     = todayStr();
  const todayDate = new Date(today + 'T00:00:00');
  const dayLabels = getDayLabels(weekStartDay);
  const isCurrentWeek = viewWeekStart === getWeekStart(today, weekStartDay);
  const viewWeekDays  = getWeekDays(viewWeekStart);
  const weekNum       = getWeekOfYear(viewWeekStart);
  const weekYear      = new Date(viewWeekStart + 'T00:00:00').getFullYear();
  const mDate    = { year, month };
  const viewYear = year;

  function getCount(actId, dateStr) { return (logs[actId] || {})[dateStr] || 0; }
  function getTotal(actId, dates)   { return dates.reduce((s, d) => s + getCount(actId, d), 0); }

  // ── Week ──
  function WeekTable() {
    return (
      <div>
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-xs min-w-[300px]">
            <thead>
              <tr>
                <th className={`text-left font-semibold py-2 pr-2 sticky left-0 min-w-[95px] ${theme.card} ${theme.textSub}`}>Activity</th>
                {dayLabels.map((d, i) => {
                  const isToday = viewWeekDays[i] === today;
                  return (
                    <th key={d} className={`text-center font-semibold py-2 px-1 min-w-[30px] ${isToday ? theme.tabActiveText : theme.muted}`}>
                      <div>{d}</div>
                      <div className={`font-normal ${theme.muted}`}>{new Date(viewWeekDays[i]+'T00:00:00').getDate()}</div>
                    </th>
                  );
                })}
                <th className={`text-center font-bold py-2 px-1 min-w-[36px] ${theme.tabActiveText}`}>Tot</th>
              </tr>
            </thead>
            <tbody>
              {activities.map(a => {
                const dayCounts = viewWeekDays.map(d => getCount(a.id, d));
                const total     = dayCounts.reduce((s, v) => s + v, 0);
                const hit       = weeklyGoal(a) != null && total >= weeklyGoal(a);
                return (
                  <tr key={a.id} className={`border-t ${theme.divider}`}>
                    <td className={`py-2 pr-2 font-medium sticky left-0 leading-tight ${theme.card} ${theme.textSub}`}>{a.name}</td>
                    {dayCounts.map((c, i) => (
                      <td key={i} className="text-center py-2 px-1">
                        <span className={c > 0 ? theme.tabActiveText + ' font-bold' : theme.muted}>{c || '–'}</span>
                      </td>
                    ))}
                    <td className={`text-center py-2 px-1 font-bold ${hit ? theme.hitTarget : total > 0 ? theme.text : theme.muted}`}>
                      {total || '–'}{hit ? '✓' : ''}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ── Month ──
  function MonthTable() {
    const chunks = getCalendarMonthChunks(mDate.year, mDate.month);
    return (
      <div>
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-xs min-w-[300px]">
            <thead>
              <tr>
                <th className={`text-left font-semibold py-2 pr-2 sticky left-0 min-w-[95px] ${theme.card} ${theme.textSub}`}>Activity</th>
                {chunks.map(c => (
                  <th key={c.start} className={`text-center font-semibold py-2 px-1 min-w-[44px] ${theme.muted}`}>
                    {c.start}–{c.end}
                  </th>
                ))}
                <th className={`text-center font-bold py-2 px-1 min-w-[36px] ${theme.tabActiveText}`}>Tot</th>
              </tr>
            </thead>
            <tbody>
              {activities.map(a => {
                const chunkTotals = chunks.map(c => getTotal(a.id, c.days));
                const monthTotal  = chunkTotals.reduce((s, v) => s + v, 0);
                return (
                  <tr key={a.id} className={`border-t ${theme.divider}`}>
                    <td className={`py-2 pr-2 font-medium sticky left-0 leading-tight ${theme.card} ${theme.textSub}`}>{a.name}</td>
                    {chunkTotals.map((ct, i) => (
                      <td key={i} className="text-center py-2 px-1">
                        <span className={ct > 0 ? theme.tabActiveText + ' font-bold' : theme.muted}>{ct || '–'}</span>
                      </td>
                    ))}
                    <td className={`text-center py-2 px-1 font-bold ${monthTotal > 0 ? theme.text : theme.muted}`}>
                      {monthTotal || '–'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ── Year ──
  function YearTable() {
    const currentYear   = todayDate.getFullYear();
    const monthsElapsed = viewYear < currentYear ? 12 : todayDate.getMonth() + 1;

    function monthTotal(actId, m) {
      const days = new Date(viewYear, m + 1, 0).getDate();
      let total = 0;
      for (let d = 1; d <= days; d++) {
        total += getCount(actId, `${viewYear}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`);
      }
      return total;
    }
    return (
      <div>
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-xs min-w-[340px]">
            <thead>
              <tr>
                <th className={`text-left font-semibold py-2 pr-1 sticky left-0 min-w-[80px] ${theme.card} ${theme.textSub}`}>Activity</th>
                {MONTH_NAMES.map(m => (
                  <th key={m} className={`text-center font-semibold py-2 px-0.5 min-w-[22px] ${theme.muted}`}>{m[0]}</th>
                ))}
                <th className={`text-center font-bold py-2 px-1 min-w-[32px] ${theme.tabActiveText}`}>YTD</th>
              </tr>
            </thead>
            <tbody>
              {activities.map(a => {
                const months = Array.from({ length: 12 }, (_, m) => monthTotal(a.id, m));
                const ytd    = months.reduce((s, v) => s + v, 0);
                return (
                  <tr key={a.id} className={`border-t ${theme.divider}`}>
                    <td className={`py-1.5 pr-1 font-medium sticky left-0 leading-tight ${theme.card} ${theme.textSub}`}>{a.name}</td>
                    {months.map((mt, i) => (
                      <td key={i} className="text-center py-1.5 px-0.5">
                        <span className={mt > 0 ? theme.tabActiveText + ' font-bold' : theme.muted}>{mt || '–'}</span>
                      </td>
                    ))}
                    <td className={`text-center py-1.5 px-1 font-bold ${ytd > 0 ? theme.text : theme.muted}`}>
                      {ytd || '–'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ── Share ──
  const [shareFeedback, setShareFeedback] = useState('');

  function buildShareText() {
    if (period === 'week') {
      const label    = isCurrentWeek ? 'This Week' : `Wk ${weekNum}, ${weekYear}`;
      const startFmt = new Date(viewWeekDays[0] + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
      const endFmt   = new Date(viewWeekDays[6] + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
      const lines    = [`📊 Momentum Daily — ${label}`, `${startFmt} – ${endFmt}`, ''];
      activities.forEach(a => {
        const counts = viewWeekDays.map(d => getCount(a.id, d));
        const total  = counts.reduce((s, v) => s + v, 0);
        const hit    = weeklyGoal(a) != null && total >= weeklyGoal(a);
        const avg    = total > 0 ? (total / 7).toFixed(1) : '0';
        lines.push(`${a.emoji || ''} ${a.name}: ${total}${hit ? ' ✓' : ''}  (avg ${avg}/day)`);
      });
      return lines.join('\n');
    }
    if (period === 'month') {
      const chunks = getCalendarMonthChunks(mDate.year, mDate.month);
      const lines  = [`📊 Momentum Daily — ${MONTH_NAMES_FULL[mDate.month]} ${mDate.year}`, ''];
      activities.forEach(a => {
        const total = chunks.reduce((s, c) => s + getTotal(a.id, c.days), 0);
        const avg   = total > 0 ? (total / chunks.length).toFixed(1) : '0';
        lines.push(`${a.emoji || ''} ${a.name}: ${total}  (avg ${avg}/week)`);
      });
      return lines.join('\n');
    }
    if (period === 'year') {
      const currentYear  = todayDate.getFullYear();
      const monthsElap   = viewYear < currentYear ? 12 : todayDate.getMonth() + 1;
      const lines        = [`📊 Momentum Daily — ${viewYear}`, ''];
      activities.forEach(a => {
        let total = 0;
        for (let m = 0; m < 12; m++) {
          const daysInM = new Date(viewYear, m + 1, 0).getDate();
          for (let d = 1; d <= daysInM; d++) {
            total += getCount(a.id, `${viewYear}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`);
          }
        }
        const avg = total > 0 ? (total / monthsElap).toFixed(1) : '0';
        lines.push(`${a.emoji || ''} ${a.name}: ${total}  (avg ${avg}/month)`);
      });
      return lines.join('\n');
    }
    return '';
  }

  async function handleShare() {
    const text = buildShareText();
    if (!text) return;
    if (navigator.share) {
      try { await navigator.share({ title: 'Momentum Daily Stats', text }); } catch (_) { /* cancelled */ }
    } else {
      try {
        await navigator.clipboard.writeText(text);
        setShareFeedback('Copied!');
        setTimeout(() => setShareFeedback(''), 2000);
      } catch (_) {
        setShareFeedback('Failed');
        setTimeout(() => setShareFeedback(''), 2000);
      }
    }
  }

  // ── Export ──
  function handleExport() {
    if (period === 'week') {
      const dateRow  = ['Date', ...viewWeekDays.map(d => new Date(d+'T00:00:00').toLocaleDateString('en-AU')), '', ''];
      const labelRow = ['Activity', ...dayLabels, 'TOTAL', 'AVG/DAY'];
      const rows     = [labelRow, dateRow];
      activities.forEach(a => {
        const counts = viewWeekDays.map(d => getCount(a.id, d));
        const total  = counts.reduce((s,v)=>s+v,0);
        rows.push([a.name, ...counts, total, total > 0 ? (total/7).toFixed(1) : 0]);
      });
      exportCSV(`flow-week-${viewWeekStart}.csv`, rows);
    } else if (period === 'month') {
      const chunks  = getCalendarMonthChunks(mDate.year, mDate.month);
      const wLabels = chunks.map(c => `${c.start}-${c.end} ${MONTH_NAMES[mDate.month]}`);
      const rows    = [['Activity', ...wLabels, 'MONTHLY TOTALS', 'AVG/WEEK']];
      activities.forEach(a => {
        const totals = chunks.map(c => getTotal(a.id, c.days));
        const total  = totals.reduce((s,v)=>s+v,0);
        rows.push([a.name, ...totals, total, total > 0 ? (total/chunks.length).toFixed(1) : 0]);
      });
      exportCSV(`flow-${mDate.year}-${String(mDate.month+1).padStart(2,'0')}.csv`, rows);
    }
  }

  return (
    <div>
      {period === 'week'  && <WeekTable  />}
      {period === 'month' && <MonthTable />}
      {period === 'year'  && <YearTable  />}

      {/* Export + Share */}
      <div className="flex gap-2 mt-2">
        {period !== 'year' && (
          <button
            onClick={handleExport}
            className={`flex-1 py-2 rounded-xl text-xs font-bold active:scale-[0.98] transition-all ${theme.btnSecondary}`}
          >
            ↓ Export CSV
          </button>
        )}
        <button
          onClick={handleShare}
          className={`flex-1 py-2 rounded-xl text-xs font-bold active:scale-[0.98] transition-all ${theme.btnSecondary}`}
        >
          {shareFeedback || '↗ Share'}
        </button>
      </div>
    </div>
  );
}

// ─── Combined screen ──────────────────────────────────────────────────────────
export default function CalendarStatsScreen({ theme, gamify, onShowScoringHelp }) {
  const [view, setView] = useState('calendar');

  return (
    <div className="pb-4">
      {/* View toggle */}
      <div className={`flex gap-1 p-1 rounded-xl mb-4 ${theme.periodTabBar}`}>
        {[['calendar','📅 Tracker'],['logs','📓 Logs']].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setView(id)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              view === id ? theme.periodActive : theme.periodInactive
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === 'calendar' && <CalendarView theme={theme} gamify={gamify} onShowScoringHelp={onShowScoringHelp} />}
      {view === 'logs'     && <ErrorBoundary><LogsView theme={theme} gamify={gamify} /></ErrorBoundary>}
    </div>
  );
}
