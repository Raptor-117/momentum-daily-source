// ─────────────────────────────────────────────
// TRACKER SCORING (docs/tracker-spec.md §2, §4)
// ─────────────────────────────────────────────
// Pure functions, no store access. logs = { [activityId]: { 'YYYY-MM-DD': count } }.
// A habit's credit for a period = min(done ÷ expected, 1); a period score is the
// average credit of the habits scored in it. Self-check: node scripts/check-scoring.mjs
import { toDateStr } from './index.js';

// First day of in-app daily logging. Before it, logs are imported weekly totals on
// Saturdays, so daily habits score from totals and the day calendar can't be scored.
export const DAILY_LOGGING_FROM = '2026-05-06';

export const BANDS = [
  { min: 85, label: 'Excellent' },
  { min: 65, label: 'Good' },
  { min: 45, label: 'Average' },
  { min: 0,  label: 'Needs Improvement' },
];
export const bandFor = (pct) => pct == null ? null : BANDS.find(b => pct >= b.min).label;

export function monthDays(year, month) {
  const n = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: n }, (_, i) => toDateStr(new Date(year, month, i + 1)));
}

const dow = (date) => new Date(date + 'T00:00:00').getDay();
const count = (logs, id, date) => (logs[id] || {})[date] || 0;

// Settings in effect on a date: the latest config record on or before it. Logs older
// than the first record (imports, habits re-created in-app) use the first record.
export function configOn(a, date) {
  const hist = a.configHistory?.length ? a.configHistory
    : [{ effectiveFrom: '2020-01-01', cadence: a.cadence, target: a.target, scheduledDays: a.scheduledDays || [] }];
  return hist.reduce((cur, r) => (r.effectiveFrom <= date ? r : cur), hist[0]);
}

// A habit counts from its first config record or its first log, whichever is
// earlier (imported history predates many habits' createdAt), until archivedAt.
function startOf(a, logs) {
  const first = configOn(a, '0000-00-00').effectiveFrom;
  const firstLog = Object.keys(logs[a.id] || {}).filter(d => logs[a.id][d] > 0).sort()[0];
  return firstLog && firstLog < first ? firstLog : first;
}
function liveOn(a, date, start) {
  if (a.archived && !a.archivedAt) return false; // archived before archivedAt existed: date unknown
  return date >= start && (!a.archivedAt || date < a.archivedAt);
}
const scheduledOn = (cfg, date) => !cfg.scheduledDays?.length || cfg.scheduledDays.includes(dow(date));

// One habit over a run of days. kind: 'day' | 'week' | 'month' — weekly habits aren't
// scored on a day, monthly ones only on a month. Returns null when not scored.
export function habitCredit(a, days, logs, kind) {
  const start = startOf(a, logs);
  const live = days.filter(d => liveOn(a, d, start));
  if (!live.length) return null;
  // ponytail: one config per period (the one at its last live day); a mid-period
  // cadence change scores the whole period under the new settings.
  const cfg = configOn(a, live[live.length - 1]);
  const target = cfg.target || 1;
  if (cfg.cadence === 'log') return null;

  if (cfg.cadence === 'daily') {
    const post = live.filter(d => d >= DAILY_LOGGING_FROM && scheduledOn(cfg, d));
    // In the cutover week/month, only days from DAILY_LOGGING_FROM are due.
    const pre  = live.some(d => d >= DAILY_LOGGING_FROM) ? [] : live;
    if (kind === 'day' && !post.length) return null;
    // Imported weeks: the week's total counts as days done (spec §4).
    const preDue  = pre.filter(d => scheduledOn(cfg, d)).length;
    const preDone = Math.min(pre.reduce((s, d) => s + count(logs, a.id, d), 0) / target, preDue);
    const done = post.reduce((s, d) => s + Math.min(count(logs, a.id, d) / target, 1), 0) + preDone;
    const expected = post.length + preDue;
    return expected ? { done, expected, credit: Math.min(done / expected, 1), cadence: 'daily' } : null;
  }

  if (kind === 'day') return null;
  const done = live.reduce((s, d) => s + count(logs, a.id, d), 0);
  let expected;
  if (cfg.cadence === 'weekly') expected = target * live.length / 7; // pro-rated (30/wk in a 31-day month ≈ 133)
  else if (kind === 'month') expected = target * live.length / days.length; // monthly, pro-rated for a part month
  else return null;
  return { done, expected, credit: Math.min(done / expected, 1), cadence: cfg.cadence };
}

// Score a period. Each habit counts once in the total; in every tag it carries for
// the category breakdown. pct is null when nothing is scored (e.g. a day before
// DAILY_LOGGING_FROM — weeklyDataOnly tells the calendar to grey it).
export function scorePeriod(activities, logs, days, kind) {
  const habits = [];
  for (const a of activities) {
    const c = habitCredit(a, days, logs, kind);
    if (c) habits.push({ id: a.id, tags: a.tags || [], ...c });
  }
  const pctOf = (list) => list.length ? Math.round(list.reduce((s, h) => s + h.credit, 0) / list.length * 100) : null;
  const categories = {};
  for (const h of habits) for (const t of h.tags) (categories[t] ||= []).push(h);
  const pct = pctOf(habits);
  return {
    pct,
    band: bandFor(pct),
    points: habits.reduce((s, h) => s + h.credit, 0),
    habits,
    categories: Object.fromEntries(Object.entries(categories).map(([t, list]) => [t, {
      points: list.reduce((s, h) => s + h.credit, 0), count: list.length, pct: pctOf(list),
    }])),
    weeklyDataOnly: kind === 'day' && days[0] < DAILY_LOGGING_FROM,
  };
}

// Current streak. Daily habits: consecutive due days hit (rest days skipped, today
// doesn't break it until it's over). Weekly: consecutive weeks hit, same grace for
// the current week. Monthly/log: null.
// ponytail: walks back day by day, fine for a few years of history.
export function streak(a, logs, today, weekStartOf) {
  const start = startOf(a, logs);
  const cfg = configOn(a, today);
  const back = (d, n) => { const x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() - n); return toDateStr(x); };
  let n = 0;
  if (cfg.cadence === 'daily') {
    for (let d = today; d >= start && d >= DAILY_LOGGING_FROM; d = back(d, 1)) {
      const c = configOn(a, d);
      if (!liveOn(a, d, start) || !scheduledOn(c, d)) continue;
      if (count(logs, a.id, d) >= (c.target || 1)) n++;
      else if (d !== today) break;
    }
    return n;
  }
  if (cfg.cadence === 'weekly') {
    for (let ws = weekStartOf(today); back(ws, -6) >= start; ws = back(ws, 7)) {
      const week = Array.from({ length: 7 }, (_, i) => back(ws, -i));
      const c = habitCredit(a, week, logs, 'week');
      if (c?.credit >= 1) n++;
      else if (ws !== weekStartOf(today)) break;
    }
    return n;
  }
  return null;
}
