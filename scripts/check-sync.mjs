// Self-check for sync v2 (src/lib/syncCore.js): node scripts/check-sync.mjs
// A fake cloud (server-set updated_at, deleted_at tombstones) and two devices run the
// same diff/merge code the app uses.
import assert from 'node:assert';
import { TABLES, keyOf, diffLocal, mergeRows } from '../src/lib/syncCore.js';
import { normalizeActivity } from '../src/data/index.js';

const U = 'user-1';
let clock = Date.parse('2026-11-15T00:00:00Z');
const tick = () => new Date((clock += 1000)).toISOString(); // 1s apart: inside the 60s pull overlap
const cloud = Object.fromEntries(TABLES.map(d => [d.table, new Map()]));

function push(dev) {
  for (const { def, upserts, deletes } of diffLocal(dev.state, dev.snap)) {
    const t = (dev.snap.rows[def.table] ||= {});
    for (const u of upserts) {
      const prev = cloud[def.table].get(u.key) || {};
      cloud[def.table].set(u.key, { ...prev, user_id: U, ...u.row, deleted_at: null, updated_at: tick() });
      t[u.key] = u.fp;
    }
    for (const k of deletes) {
      const prev = cloud[def.table].get(k);
      if (prev) cloud[def.table].set(k, { ...prev, deleted_at: tick(), updated_at: tick() });
      delete t[k];
    }
  }
}
function pull(dev, opts) {
  const since = dev.snap.cursor ? new Date(Date.parse(dev.snap.cursor) - 60_000).toISOString() : null;
  const rows = Object.fromEntries(TABLES.map(d => [d.table,
    [...cloud[d.table].values()].filter(r => (since ? r.updated_at > since : !r.deleted_at))
      .sort((a, b) => a.updated_at.localeCompare(b.updated_at))]));
  dev.state = { ...dev.state, ...mergeRows({ userId: U, full: !since, rows }, dev.state, dev.snap, opts) };
}
const pending = (dev) => diffLocal(dev.state, dev.snap).map(c => `${c.def.table}:${c.upserts.length}/${c.deletes.length}`);
const device = (state) => ({ state: structuredClone(state), snap: { userId: U, cursor: null, rows: {} } });
const set = (dev, fn) => { dev.state = fn(structuredClone(dev.state)); };

const base = {
  darkMode: true, gamify: false, weekStartDay: 6, uiPrefs: { tracker: { goalPct: 70 } },
  activities: [
    normalizeActivity({ id: 'audios', name: 'Audios', weeklyTarget: 7, hasTarget: true, tags: ['learning'] }),
    normalizeActivity({ id: 'exercise', name: 'Exercise', weeklyTarget: 4, hasTarget: true, tags: ['health'] }),
    normalizeActivity({ id: 'date-night', name: 'Date Night', weeklyTarget: 1, hasTarget: true }),
  ],
  logs: { audios: { '2026-11-14': 1 }, exercise: { '2026-11-13': 1 } },
  tags: [{ id: 'learning', label: 'Learning', color: '#f59e0b' }, { id: 'health', label: 'Health', color: '#10b981' }],
  tasks: [{ id: 't1', title: 'Pay rent', completed: false }, { id: 't2', title: 'Call mum', completed: false }],
  checkIns: {}, journalPrompts: [{ id: 'p1', text: 'Grateful for?' }], journalEntries: { '2026-11-14': { p1: 'Coffee' } },
  wellbeingNotes: {}, library: [{ id: 'b1', title: 'Atomic Habits', notes: 'ch1' }], notifications: [], dailyDrafts: {},
  dailyMessageDefaults: { book: '', notes: '' }, customEmotions: [], rewardMilestone: {}, milestoneSeen: null,
};

// First device: empty snapshot → everything is new → full upload.
const A = device(base);
push(A);
assert.deepEqual(pending(A), [], 'A fully pushed');
assert.equal(cloud.logs.size, 2);
pull(A); // first pull sets the cursor
assert.deepEqual(pending(A), [], 'pull does not echo A’s own rows back as edits');

// Second device, clean first sync: cloud copy wins over its stale local data.
const B = device({ ...base, tasks: [{ id: 't1', title: 'STALE', completed: false }] });
pull(B, { remoteWins: true });
assert.equal(B.state.tasks.find(t => t.id === 't1').title, 'Pay rent');
assert.deepEqual(B.state.logs, A.state.logs);
assert.deepEqual(pending(B), [], 'no echo after first pull on B');

// Only changes are sent: one tap = one log row.
set(A, s => { s.logs.audios['2026-11-15'] = 1; return s; });
assert.deepEqual(pending(A), ['logs:1/0']);
push(A); pull(B);
assert.equal(B.state.logs.audios['2026-11-15'], 1);

// Un-logging back to 0 reaches the other device (was the v1 zero bug).
set(A, s => { s.logs.audios['2026-11-15'] = 0; return s; });
push(A); pull(B);
assert.equal(B.state.logs.audios['2026-11-15'], 0);

// Different items edited on each device: both edits survive everywhere.
set(A, s => { s.tasks[0].title = 'Pay rent (A)'; return s; });
set(B, s => { s.tasks[1].title = 'Call mum (B)'; return s; });
push(A); push(B); pull(A); pull(B);
for (const d of [A, B]) assert.deepEqual(d.state.tasks.map(t => t.title), ['Pay rent (A)', 'Call mum (B)']);

// Same item edited on both: the latest save wins, and an unpushed local edit is
// never overwritten by a pull.
set(A, s => { s.library[0].notes = 'A notes'; return s; });
set(B, s => { s.library[0].notes = 'B notes'; return s; });
push(A);
pull(B);
assert.equal(B.state.library[0].notes, 'B notes', 'pull keeps B’s unpushed edit');
push(B); pull(A);
assert.equal(A.state.library[0].notes, 'B notes', 'B saved last → B wins');

// Deletes travel as tombstones.
set(A, s => { s.tasks = s.tasks.filter(t => t.id !== 't2'); return s; });
push(A);
assert.ok(cloud.tasks.get('t2').deleted_at);
pull(B);
assert.deepEqual(B.state.tasks.map(t => t.id), ['t1']);
assert.deepEqual(pending(B), []);
// Clearing a journal answer deletes it on the other device too.
set(B, s => { s.journalEntries['2026-11-14'].p1 = ''; return s; });
push(B); pull(A);
assert.equal(A.state.journalEntries['2026-11-14'].p1, undefined);

// Re-adding a deleted item revives it.
set(A, s => { s.tasks.push({ id: 't2', title: 'Call mum again', completed: false }); return s; });
push(A);
assert.equal(cloud.tasks.get('t2').deleted_at, null);
pull(B);
assert.ok(B.state.tasks.some(t => t.title === 'Call mum again'));

// Reordering habits on A reorders them on B.
set(A, s => { s.activities.reverse(); return s; });
push(A); pull(B);
assert.deepEqual(B.state.activities.map(a => a.id), ['date-night', 'exercise', 'audios']);
assert.deepEqual(pending(B), []);

// A new habit and its first log in one push: the habit row is created first.
set(A, s => {
  s.activities.push(normalizeActivity({ id: 'read', name: 'Read', weeklyTarget: 5, hasTarget: true }));
  s.logs.read = { '2026-11-15': 1 };
  return s;
});
const order = diffLocal(A.state, A.snap).map(c => c.def.table);
assert.ok(order.indexOf('activities') < order.indexOf('logs'), 'push lists activities before logs');
push(A); pull(B);
assert.equal(B.state.logs.read['2026-11-15'], 1);

// Deleting a habit tombstones its logs; the other device drops both.
set(A, s => { s.activities = s.activities.filter(a => a.id !== 'read'); return s; });
push(A);
assert.ok(cloud.logs.get('read|2026-11-15').deleted_at);
pull(B);
assert.ok(!B.state.activities.some(a => a.id === 'read'));
assert.equal(B.state.logs.read?.['2026-11-15'], undefined);

// Settings (single rows) sync too.
set(A, s => { s.uiPrefs = { tracker: { goalPct: 80 } }; return s; });
push(A); pull(B);
assert.equal(B.state.uiPrefs.tracker.goalPct, 80);

// Pulling twice (overlap window re-reads rows) changes nothing.
const before = JSON.stringify(B.state);
pull(B); pull(B);
assert.equal(JSON.stringify(B.state), before);
assert.deepEqual(pending(A), []); assert.deepEqual(pending(B), []);

// Keys are stable: every cloud row maps back to exactly one key.
for (const d of TABLES) for (const [k, r] of cloud[d.table]) assert.equal(keyOf(d, r), k);

console.log('sync checks passed');
