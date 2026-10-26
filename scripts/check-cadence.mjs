// Self-check for habit cadence conversion: node scripts/check-cadence.mjs
import assert from 'node:assert';
import { normalizeActivity, weeklyGoal } from '../src/data/index.js';

// The user's pre-cadence habits (2026-09 export) and the classification they gave.
const rows = [
  ['audios', 7, true, 'daily'], ['reading', 5, true, 'daily'], ['act-1779574733561', 7, true, 'daily'],
  ['accountability', 7, true, 'daily'], ['exercise', 4, true, 'weekly'], ['meditation', 7, true, 'daily'],
  ['gratitude', 7, true, 'daily'], ['journal', 7, true, 'daily'], ['date-night', 1, true, 'weekly'],
  ['rel-checkin', 1, true, 'weekly'], ['act-1778244507581', 7, true, 'daily'], ['act-1785716032370', 30, true, 'weekly'],
  ['act-1778795200698', 10, true, 'weekly'], ['new-cu', 2, true, 'weekly'], ['exist-cu', 2, true, 'weekly'],
  ['events', 1, true, 'weekly'], ['online-mpa', 3, true, 'weekly'], ['ip-mpa', 7, true, 'weekly'],
  ['soft-dtm', 2, true, 'weekly'], ['dtm', 2, true, 'weekly'], ['prefilter', 2, true, 'weekly'],
  ['mg-personal', 1, true, 'weekly'], ['launch-p', 1, false, 'log'], ['launch-t', 1, false, 'log'],
];
for (const [id, weeklyTarget, hasTarget, want] of rows) {
  const a = normalizeActivity({ id, weeklyTarget, hasTarget, createdAt: '2026-01-01' });
  assert.equal(a.cadence, want, id);
  assert.equal(a.target, want === 'daily' ? 1 : weeklyTarget, id + ' target');
  assert.equal(a.hasTarget, want !== 'log', id + ' hasTarget');
  assert.equal('weeklyTarget' in a, false, id + ' legacy field dropped');
  assert.deepEqual(a.configHistory, [{ effectiveFrom: '2026-01-01', cadence: want, target: a.target, scheduledDays: [] }]);
}
const counts = rows.reduce((c, r) => ({ ...c, [r[3]]: (c[r[3]] || 0) + 1 }), {});
assert.deepEqual(counts, { daily: 8, weekly: 14, log: 2 });

// Idempotent: an already-converted habit (e.g. pulled from the cloud) is untouched.
const once = normalizeActivity({ id: 'exercise', weeklyTarget: 4, hasTarget: true });
assert.deepEqual(normalizeActivity(once), once);
// A cadence-aware row keeps its own target even if the legacy column disagrees
// (an old app version pushed weekly_target = 7 for a daily habit).
assert.equal(normalizeActivity({ id: 'audios', cadence: 'daily', target: 1, weeklyTarget: 7 }).target, 1);

// Weekly equivalent used by the existing week views.
assert.equal(weeklyGoal({ cadence: 'daily', target: 1, scheduledDays: [] }), 7);
assert.equal(weeklyGoal({ cadence: 'daily', target: 1, scheduledDays: [1, 3, 5] }), 3);
assert.equal(weeklyGoal({ cadence: 'weekly', target: 30 }), 30);
assert.equal(weeklyGoal({ cadence: 'monthly', target: 2 }), null);
assert.equal(weeklyGoal({ cadence: 'log', target: 1 }), null);
console.log('cadence checks passed (8 daily, 14 weekly, 2 log)');
