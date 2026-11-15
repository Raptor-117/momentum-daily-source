import { todayStr, normalizeActivity, weeklyGoal } from '../data/index.js';

// Pure sync logic (no network, no storage) so it can be self-checked in Node:
// node scripts/check-sync.mjs. See lib/sync.js for how it's used.

export const arr = (v) => (Array.isArray(v) ? v : []);
export const live = { deleted_at: null }; // sent with every row so re-adding a deleted item revives it

// Each table: how local state becomes rows (rows), how a row becomes local state
// (apply), and its key columns. Keys are the key-column values joined with '|'.
// ponytail: '|' as key separator — fine while ids/dates never contain '|'.
export const TABLES = [
  {
    table: 'user_preferences', keyCols: [], single: true, fields: ['darkMode', 'gamify', 'weekStartDay', 'uiPrefs'],
    rows: (s) => [{ dark_mode: s.darkMode, gamify: s.gamify, week_start_day: s.weekStartDay, ui_prefs: s.uiPrefs ?? null }],
    apply: (p, r) => {
      Object.assign(p, { darkMode: r.dark_mode, gamify: r.gamify, weekStartDay: r.week_start_day });
      if (r.ui_prefs) p.uiPrefs = r.ui_prefs;
    },
  },
  {
    table: 'daily_message_defaults', keyCols: [], single: true, fields: ['dailyMessageDefaults'],
    rows: (s) => [{ book: s.dailyMessageDefaults?.book || '', notes: s.dailyMessageDefaults?.notes || '' }],
    apply: (p, r) => { p.dailyMessageDefaults = { book: r.book, notes: r.notes }; },
  },
  {
    table: 'reward_milestones', keyCols: [], single: true, fields: ['rewardMilestone'],
    rows: (s) => [{ config: s.rewardMilestone ?? {} }],
    apply: (p, r) => { p.rewardMilestone = r.config || {}; },
  },
  {
    table: 'milestone_seen', keyCols: [], single: true, fields: ['milestoneSeen'],
    rows: (s) => [{ data: s.milestoneSeen ?? null }],
    apply: (p, r) => { if (r.data) p.milestoneSeen = r.data; },
  },
  {
    table: 'activities', keyCols: ['id'], list: 'activities', ordered: true,
    // Store uses 'name', the column is 'label'.
    rows: (s) => arr(s.activities).filter(a => (a.name || a.label) && typeof a.id === 'string').map((a, i) => ({
      id: a.id, label: a.name || a.label, emoji: a.emoji, color: a.color || '#6366f1',
      cadence: a.cadence, target: a.target,
      // Legacy column, kept as the WEEKLY equivalent for app versions from before cadence.
      weekly_target: weeklyGoal(a) ?? a.target ?? 0,
      has_target: a.hasTarget ?? false, archived_at: a.archivedAt ?? null, config_history: a.configHistory ?? null,
      accountability: a.accountability ?? false, tags: arr(a.tags), pillars: arr(a.pillars),
      notes: typeof a.notes === 'string' ? a.notes : '', scheduled_days: arr(a.scheduledDays),
      complexity: a.complexity || 'medium', archived: a.archived || false, sort_order: i,
      created_at: a.createdAt || '2020-01-01',
    })),
    item: (r) => normalizeActivity({
      id: r.id, name: r.label, emoji: r.emoji, color: r.color,
      cadence: r.cadence, target: r.target, weeklyTarget: r.weekly_target, hasTarget: r.has_target,
      archivedAt: r.archived_at, configHistory: r.config_history, accountability: r.accountability ?? false,
      tags: r.tags || [], pillars: r.pillars || [], notes: r.notes || '', scheduledDays: r.scheduled_days || [],
      complexity: r.complexity, archived: r.archived, createdAt: r.created_at,
    }),
  },
  {
    table: 'logs', keyCols: ['activity_id', 'log_date'], slice: 'logs',
    // Logs of a habit that isn't here can't be saved (logs -> activities foreign key).
    // Zero counts are rows too: tapping − back to 0 must overwrite the old count.
    rows: (s) => {
      const known = new Set(arr(s.activities).map(a => a.id));
      const out = [];
      for (const [activity_id, days] of Object.entries(s.logs || {})) {
        if (!known.has(activity_id)) continue;
        for (const [log_date, count] of Object.entries(days || {})) out.push({ activity_id, log_date, count: count || 0 });
      }
      return out;
    },
    apply: (p, r, [activity_id, log_date]) => {
      const days = (p.logs[activity_id] = { ...(p.logs[activity_id] || {}) });
      if (r) days[log_date] = r.count || 0; else delete days[log_date];
    },
  },
  {
    table: 'tags', keyCols: ['id'], list: 'tags', ordered: true,
    rows: (s) => arr(s.tags).filter(t => typeof t.id === 'string' && t.label)
      .map((t, i) => ({ id: t.id, label: t.label, color: t.color, sort_order: i })),
    item: (r) => ({ id: r.id, label: r.label, color: r.color }),
  },
  {
    table: 'tasks', keyCols: ['id'], list: 'tasks',
    rows: (s) => arr(s.tasks).filter(t => t.title && typeof t.id === 'string').map(t => ({
      id: t.id, title: t.title, notes: t.notes ?? null, due_date: t.dueDate || null,
      complexity: t.complexity || 'medium', tags: t.tags || [], pillars: t.pillars || [],
      completed: t.completed || false, completed_date: t.completedDate || null,
      recurrence: t.recurrence || 'none', last_completed: t.lastCompleted || null,
      created_at: t.createdAt || todayStr(),
    })),
    item: (r) => ({
      id: r.id, title: r.title, notes: r.notes, dueDate: r.due_date, complexity: r.complexity,
      tags: r.tags || [], pillars: r.pillars || [], completed: r.completed, completedDate: r.completed_date,
      recurrence: r.recurrence, lastCompleted: r.last_completed, createdAt: r.created_at,
    }),
  },
  {
    table: 'check_ins', keyCols: ['check_in_date'], map: 'checkIns',
    rows: (s) => Object.entries(s.checkIns || {}).map(([check_in_date, d]) => ({ check_in_date, emotions: d?.emotions || [], notes: d?.notes || null })),
    value: (r) => ({ emotions: r.emotions || [], notes: r.notes || '' }),
  },
  {
    table: 'journal_prompts', keyCols: ['id'], list: 'journalPrompts', ordered: true,
    rows: (s) => arr(s.journalPrompts).filter(p => typeof p.id === 'string').map((p, i) => ({ id: p.id, text: p.text, sort_order: i })),
    item: (r) => ({ id: r.id, text: r.text }),
  },
  {
    table: 'journal_entries', keyCols: ['entry_date', 'prompt_id'], slice: 'journalEntries',
    rows: (s) => {
      const out = [];
      for (const [entry_date, prompts] of Object.entries(s.journalEntries || {}))
        for (const [prompt_id, text] of Object.entries(prompts || {})) if (text) out.push({ entry_date, prompt_id, text });
      return out;
    },
    apply: (p, r, [entry_date, prompt_id]) => {
      const day = (p.journalEntries[entry_date] = { ...(p.journalEntries[entry_date] || {}) });
      if (r) day[prompt_id] = r.text; else delete day[prompt_id];
    },
  },
  {
    table: 'wellbeing_notes', keyCols: ['note_date'], map: 'wellbeingNotes',
    rows: (s) => Object.entries(s.wellbeingNotes || {}).filter(([, text]) => text).map(([note_date, text]) => ({ note_date, text })),
    value: (r) => r.text,
  },
  {
    table: 'library', keyCols: ['id'], list: 'library',
    rows: (s) => arr(s.library).filter(e => typeof e.id === 'string').map(e => ({
      id: e.id, title: e.title, author: e.author, status: e.status, notes: e.notes,
      date_started: e.dateStarted || null, date_completed: e.dateCompleted || null,
    })),
    item: (r) => ({ id: r.id, title: r.title, author: r.author, status: r.status, notes: r.notes, dateStarted: r.date_started, dateCompleted: r.date_completed }),
  },
  {
    table: 'notifications', keyCols: ['id'], list: 'notifications',
    rows: (s) => arr(s.notifications).filter(n => typeof n.id === 'string').map(n => ({ id: n.id, time: n.time, message: n.message, enabled: n.enabled })),
    item: (r) => ({ id: r.id, time: r.time, message: r.message, enabled: r.enabled }),
  },
  {
    table: 'daily_drafts', keyCols: ['draft_date'], map: 'dailyDrafts',
    rows: (s) => Object.entries(s.dailyDrafts || {}).map(([draft_date, d]) => ({ draft_date, book: d?.book ?? null, audio: d?.audio ?? null, notes: d?.notes ?? null })),
    value: (r) => ({ book: r.book, audio: r.audio, notes: r.notes }),
  },
  {
    table: 'custom_emotions', keyCols: ['id'], list: 'customEmotions',
    rows: (s) => arr(s.customEmotions).filter(e => typeof e.id === 'string').map(e => ({ id: e.id, label: e.label, emoji: e.emoji })),
    item: (r) => ({ id: r.id, label: r.label, emoji: r.emoji }),
  },
];

export const keyOf = (def, row) => (def.single ? 'self' : def.keyCols.map(c => row[c]).join('|'));
export const conflictOf = (def) => ['user_id', ...def.keyCols].join(',');

// Fingerprint of a row (FNV-1a over its JSON) — the snapshot stores these, not rows.
export function fingerprint(row) {
  const s = JSON.stringify(row);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

// Local state → { table: Map(key → { row, fp }) }
export function localRows(state) {
  const out = {};
  for (const def of TABLES) {
    const m = new Map();
    for (const row of def.rows(state)) m.set(keyOf(def, row), { row, fp: fingerprint(row) });
    out[def.table] = m;
  }
  return out;
}

// What would be pushed right now: changed rows + keys deleted locally, per table.
export function diffLocal(state, snap) {
  const rows = localRows(state);
  const changes = [];
  for (const def of TABLES) {
    const was = snap.rows[def.table] || {};
    const now = rows[def.table];
    const upserts = [];
    for (const [key, { row, fp }] of now) if (was[key] !== fp) upserts.push({ key, row, fp });
    const deletes = Object.keys(was).filter(key => !now.has(key));
    if (upserts.length || deletes.length) changes.push({ def, upserts, deletes });
  }
  return changes;
}

// Merge pulled rows into local state. Returns the state slices to set, and updates
// `snap` (fingerprints + cursor) in place.
// remoteWins: first sync of a device with no pending edits — the cloud copy wins
// even where the (empty) snapshot makes every local row look "edited".
export function mergeRows(remote, state, snap, { remoteWins = false } = {}) {
  const mine = localRows(state);
  const view = { ...state };
  const patch = {};
  let cursor = snap.cursor;
  for (const def of TABLES) {
    const t = (snap.rows[def.table] ||= {});
    const changed = [];
    for (const r of remote.rows[def.table] || []) {
      if (!cursor || r.updated_at > cursor) cursor = r.updated_at;
      const key = keyOf(def, r);
      const local = mine[def.table].get(key);
      const pending = local ? t[key] !== local.fp : key in t; // unpushed local edit/delete
      if (pending && !remoteWins) continue; // the local edit is pushed next and wins
      changed.push({ key, r: r.deleted_at ? null : r });
    }
    if (!changed.length) continue;
    for (const field of applyRows(def, view, changed)) patch[field] = view[field];
    // Snapshot = fingerprints of these rows exactly as a push would build them.
    const fresh = new Map(def.rows(view).map(row => [keyOf(def, row), fingerprint(row)]));
    for (const { key } of changed) { if (fresh.has(key)) t[key] = fresh.get(key); else delete t[key]; }
  }
  if (cursor) snap.cursor = cursor;
  else if (remote.full) snap.cursor = new Date(0).toISOString(); // empty cloud: still counts as synced
  return patch;
}

// Writes rows into `view` (copy-on-write per slice). Returns the fields it changed.
function applyRows(def, view, changed) {
  if (def.single) {
    for (const { r } of changed) if (r) def.apply(view, r);
    return def.fields;
  }
  if (def.list) {
    let items = arr(view[def.list]).slice();
    const order = new Map(items.map((it, i) => [it.id, i]));
    for (const { key, r } of changed) {
      const i = items.findIndex(it => it.id === key);
      if (!r) { if (i >= 0) items.splice(i, 1); continue; }
      if (i >= 0) items[i] = def.item(r); else items.push(def.item(r));
      order.set(key, r.sort_order ?? items.length);
    }
    // Ordered lists follow the other device's sort_order; untouched items keep their place.
    if (def.ordered) items = items.map((it, i) => [it, order.get(it.id) ?? i]).sort((a, b) => a[1] - b[1]).map(([it]) => it);
    view[def.list] = items;
    return [def.list];
  }
  if (def.map) {
    const m = { ...(view[def.map] || {}) };
    for (const { key, r } of changed) { if (r) m[key] = def.value(r); else delete m[key]; }
    view[def.map] = m;
    return [def.map];
  }
  view[def.slice] = { ...(view[def.slice] || {}) };
  for (const { key, r } of changed) def.apply(view, r, key.split('|'));
  return [def.slice];
}

