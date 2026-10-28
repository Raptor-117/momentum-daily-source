// Self-check for tracker scoring: node scripts/check-scoring.mjs
import assert from 'node:assert';
import { getWeekStart, getWeekDays } from '../src/data/index.js';
import { scorePeriod, habitCredit, bandFor, monthDays, streak } from '../src/data/scoring.js';

const H = (id, cadence, target, extra = {}) => ({
  id, cadence, target, tags: [],
  configHistory: [{ effectiveFrom: '2026-01-01', cadence, target, scheduledDays: extra.scheduledDays || [] }],
  ...extra,
});
const L = (...dates) => Object.fromEntries(dates.map(d => Array.isArray(d) ? d : [d, 1]));
const week = getWeekDays('2026-10-17'); // Sat 17 → Fri 23 Oct
const credit = (a, logs, days, kind) => habitCredit(a, days, logs, kind)?.credit;
const near = (x, y) => assert.ok(Math.abs(x - y) < 1e-9, `${x} ≠ ${y}`);

// Spec §2 example week: 6/7 + 3/4 + 34/30 + 0/1 = 2.61 / 4 = 65% Good. Log habits don't count.
const habits = [H('audios', 'daily', 1), H('exercise', 'weekly', 4), H('convos', 'weekly', 30), H('date', 'weekly', 1), H('launch', 'log', 1)];
const logs = {
  audios: L(...week.slice(0, 6)),
  exercise: L('2026-10-17', '2026-10-19', '2026-10-21'),
  convos: L(['2026-10-18', 34]),
  launch: L('2026-10-18'),
};
const w = scorePeriod(habits, logs, week, 'week');
assert.equal(w.pct, 65); assert.equal(w.band, 'Good'); assert.equal(w.habits.length, 4);
near(w.points, 6 / 7 + 0.75 + 1);

// Day: daily habits only; partial credit inside a day (target 2/day, did 1).
const day = scorePeriod([H('water', 'daily', 2), H('exercise', 'weekly', 4)], { water: L('2026-10-20') }, ['2026-10-20'], 'day');
assert.equal(day.pct, 50); assert.equal(day.habits.length, 1); assert.equal(day.weeklyDataOnly, false);

// Month: weekly habits pro-rated (30/wk in a 31-day month expects ~132.9); monthly scored only in months.
const oct = monthDays(2026, 9);
near(credit(H('c', 'weekly', 30), { c: L(['2026-10-05', 120]) }, oct, 'month'), 120 / (30 * 31 / 7));
assert.equal(credit(H('m', 'monthly', 2), { m: L('2026-10-05') }, oct, 'month'), 0.5);
assert.equal(habitCredit(H('m', 'monthly', 2), week, { m: L('2026-10-19') }, 'week'), null);

// Before daily logging (imported Saturday totals): week total counts as days done.
const march = getWeekDays('2026-03-07');
near(credit(H('audios', 'daily', 1), { audios: L(['2026-03-07', 5]) }, march, 'week'), 5 / 7);
const preDay = scorePeriod([H('audios', 'daily', 1)], { audios: L(['2026-03-07', 5]) }, ['2026-03-07'], 'day');
assert.equal(preDay.pct, null); assert.equal(preDay.weeklyDataOnly, true);
// Cutover week (Sat 2 May): only 6–8 May are due, the 2 May import is ignored.
const cut = habitCredit(H('audios', 'daily', 1), getWeekDays('2026-05-02'), { audios: L(['2026-05-02', 4], '2026-05-06', '2026-05-07', '2026-05-08') }, 'week');
assert.equal(cut.expected, 3); assert.equal(cut.credit, 1);

// Rest days: Mon/Wed/Fri habit, hit Mon + Wed, a Tuesday log is ignored → 2/3.
near(credit(H('gym', 'daily', 1, { scheduledDays: [1, 3, 5] }), { gym: L('2026-10-19', '2026-10-20', '2026-10-21') }, week, 'week'), 2 / 3);

// Lifetime: starts at the first config record (mid-week → pro-rated), or earlier if logs predate it.
const late = H('new', 'weekly', 7); late.configHistory[0].effectiveFrom = '2026-10-20';
assert.deepEqual([habitCredit(late, week, { new: L('2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23') }, 'week').expected], [4]);
assert.equal(credit(late, { new: L(['2026-03-07', 7]) }, march, 'week'), 1);
assert.equal(habitCredit(late, getWeekDays('2026-10-10'), {}, 'week'), null); // not yet created
// Archived on the 20th → only Sat–Mon count; archived with no date isn't scored at all.
assert.equal(habitCredit(H('old', 'daily', 1, { archivedAt: '2026-10-20' }), week, {}, 'week').expected, 3);
assert.equal(habitCredit(H('old', 'daily', 1, { archived: true, archivedAt: null }), week, {}, 'week'), null);

// Config history: daily until 1 Oct, then 3/week — September scores as daily, October as weekly.
const changed = H('read', 'weekly', 3);
changed.configHistory = [{ effectiveFrom: '2026-01-01', cadence: 'daily', target: 1, scheduledDays: [] }, { effectiveFrom: '2026-10-01', cadence: 'weekly', target: 3, scheduledDays: [] }];
assert.equal(habitCredit(changed, monthDays(2026, 8), {}, 'month').cadence, 'daily');
assert.equal(habitCredit(changed, oct, {}, 'month').cadence, 'weekly');

// Categories: a two-tag habit counts in both, but once in the total.
const cats = scorePeriod([{ ...H('a', 'weekly', 1), tags: ['learning', 'health'] }, { ...H('b', 'weekly', 1), tags: ['health'] }], { a: L('2026-10-19') }, week, 'week');
assert.equal(cats.pct, 50); assert.equal(cats.habits.length, 2);
assert.deepEqual(cats.categories.learning, { points: 1, count: 1, pct: 100 });
assert.deepEqual(cats.categories.health, { points: 1, count: 2, pct: 50 });

// Empty period with habits = 0%; nothing scored = null.
assert.equal(scorePeriod(habits, {}, week, 'week').pct, 0);
assert.equal(scorePeriod([], {}, week, 'week').pct, null);

// Bands.
assert.deepEqual([100, 85, 84, 65, 64, 45, 44, 0].map(bandFor),
  ['Excellent', 'Excellent', 'Good', 'Good', 'Average', 'Average', 'Needs Improvement', 'Needs Improvement']);

// Streaks: rest days skipped, today doesn't break it.
const ws = d => getWeekStart(d, 6);
const gym = H('gym', 'daily', 1, { scheduledDays: [1, 3, 5] });
const gymLogs = { gym: L('2026-10-16', '2026-10-19', '2026-10-21') }; // Fri, Mon, Wed — missed Wed 14th
assert.equal(streak(gym, gymLogs, '2026-10-23', ws), 3);
assert.equal(streak(gym, { gym: { ...gymLogs.gym, '2026-10-23': 1 } }, '2026-10-23', ws), 4);
const wk = H('date', 'weekly', 1);
assert.equal(streak(wk, { date: L('2026-10-03', '2026-10-12') }, '2026-10-23', ws), 2); // this week pending
assert.equal(streak(H('m', 'monthly', 1), {}, '2026-10-23', ws), null);

console.log('scoring checks passed');
