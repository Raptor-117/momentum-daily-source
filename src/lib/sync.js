import { supabase } from './supabase';
import { captureError } from './errors';
import { live, TABLES, keyOf, conflictOf, diffLocal, mergeRows } from './syncCore';

// ─────────────────────────────────────────────────────────────────────────────
// SYNC v2 — only what changed (docs/sync-v2-migration.sql)
// ─────────────────────────────────────────────────────────────────────────────
// Every synced item is one cloud row. The device keeps a fingerprint of each row
// as it was last synced (the "snapshot"), plus a cursor: the server time of the
// newest row it has seen.
//
//   Push  = rows whose fingerprint differs from the snapshot (new/edited), and a
//           delete marker (deleted_at) for rows that are in the snapshot but gone
//           locally. Nothing else is uploaded.
//   Pull  = rows with updated_at after the cursor (server-set by a trigger, so phone
//           clocks don't matter). A row whose local copy has unpushed edits is
//           skipped — the local edit is pushed next and becomes the latest save.
//
// Every write ends in .throwOnError(): the Supabase client otherwise reports a
// failed request (incl. a dropped connection) as a quiet { error }, and a failed
// push used to look successful.

const SYNC_KEY = 'momentum-sync-v2';
const OVERLAP_MS = 60_000; // re-read the last minute: a row can commit with a slightly older updated_at
const PAGE = 1000;         // Supabase caps a query at 1000 rows

// ── Snapshot + cursor (localStorage) ─────────────────────────────────────────
// ponytail: kept in localStorage next to the app state (~30 bytes per log row); move
// to IndexedDB if storage quota ever becomes a problem.
let sync = null;
function loadSync(userId) {
  if (!sync || sync.userId !== userId) {
    try { sync = JSON.parse(localStorage.getItem(SYNC_KEY) || 'null'); } catch { sync = null; }
    if (!sync || sync.userId !== userId) sync = { userId, cursor: null, rows: {} };
  }
  return sync;
}
function saveSync() {
  try { localStorage.setItem(SYNC_KEY, JSON.stringify(sync)); }
  catch (err) { captureError(err, { context: 'saveSyncState' }); }
}

// True once this device has done its first v2 pull for this user.
export function hasSyncState(userId) { return !!loadSync(userId).cursor; }
// Forget sync state (sign-in as someone else, or "pull everything again").
export function resetSyncState() { sync = null; try { localStorage.removeItem(SYNC_KEY); } catch { /* ignore */ } }

// ── Push ─────────────────────────────────────────────────────────────────────
async function requireSession(userId) {
  // Try a refresh first — an expired token shouldn't silently drop a push.
  let { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    try { ({ data: { session } } = await supabase.auth.refreshSession()); } catch { /* ignore */ }
  }
  if (!session || session.user.id !== userId) {
    captureError(new Error('pushAllData bailed: no valid session for this user'), {
      context: 'pushAllData.bail', hasSession: !!session, sessionUser: session?.user?.id ?? null, wantUser: userId,
    });
    // Throw, don't return: callers treat a normal return as success.
    throw new Error('Push skipped: not signed in as this user');
  }
}

async function markDeleted(def, userId, keys) {
  const at = new Date().toISOString();
  if (!def.keyCols.length) return;
  // Group by the first key column; .in() on the last (logs: per habit, the dates).
  const groups = new Map();
  for (const key of keys) {
    const parts = key.split('|');
    const head = parts.slice(0, -1).join('|');
    if (!groups.has(head)) groups.set(head, { parts, last: [] });
    groups.get(head).last.push(parts[parts.length - 1]);
  }
  const lastCol = def.keyCols[def.keyCols.length - 1];
  for (const { parts, last } of groups.values()) {
    for (let i = 0; i < last.length; i += 200) {
      let q = supabase.from(def.table).update({ deleted_at: at }).eq('user_id', userId);
      def.keyCols.slice(0, -1).forEach((c, j) => { q = q.eq(c, parts[j]); });
      await q.in(lastCol, last.slice(i, i + 200)).throwOnError();
    }
  }
}

// Pushes only what changed since the last sync. Name kept from v1 (callers in App).
export async function pushAllData(userId, state) {
  await requireSession(userId);
  const snap = loadSync(userId);
  const changes = diffLocal(state, snap);
  // Habits first: a new habit's logs need its row to exist (foreign key).
  changes.sort((a, b) => (b.def.table === 'activities') - (a.def.table === 'activities'));
  for (const { def, upserts, deletes } of changes) {
    for (let i = 0; i < upserts.length; i += 500) {
      const payload = upserts.slice(i, i + 500).map(u => ({ user_id: userId, ...u.row, ...live }));
      await supabase.from(def.table).upsert(payload, { onConflict: conflictOf(def) }).throwOnError();
    }
    if (deletes.length) await markDeleted(def, userId, deletes);
    // Record what reached the cloud. Edits made during the push keep a different
    // fingerprint, so they stay pending for the next push.
    const t = (snap.rows[def.table] ||= {});
    for (const u of upserts) t[u.key] = u.fp;
    for (const k of deletes) delete t[k];
    saveSync();
  }
}

// ── Pull ─────────────────────────────────────────────────────────────────────
async function fetchRows(def, userId, since) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(def.table).select('*').eq('user_id', userId);
    if (since) q = q.gt('updated_at', since);
    else q = q.is('deleted_at', null);
    q = q.order('updated_at');
    if (!def.single) q = q.order('id'); // tiebreak — many rows share one updated_at
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

// Rows changed since this device's cursor (everything on the first pull).
// Name kept from v1. Returns { rows: { table: row[] }, full }.
export async function pullAllData(userId) {
  const { cursor } = loadSync(userId);
  const since = cursor ? new Date(new Date(cursor).getTime() - OVERLAP_MS).toISOString() : null;
  const lists = await Promise.all(TABLES.map(def => fetchRows(def, userId, since)));
  return { userId, full: !since, rows: Object.fromEntries(TABLES.map((def, i) => [def.table, lists[i]])) };
}

// Merge pulled rows into the CURRENT local state (call synchronously right before
// applying). Returns the state slices to set; saves the snapshot and cursor.
// remoteWins: first sync of a device with no pending edits — the cloud copy wins
// even where the (empty) snapshot makes every local row look "edited".
export function mergePull(remote, state, opts) {
  const patch = mergeRows(remote, state, loadSync(remote.userId), opts);
  saveSync();
  return patch;
}

// Full cloud copy shaped like the store — for the explicit sign-in flow (conflict
// check / first backup), which compares whole datasets.
export async function pullFullState(userId) {
  const lists = await Promise.all(TABLES.map(def => fetchRows(def, userId, null)));
  const empty = { activities: [], tags: [], tasks: [], journalPrompts: [], library: [], notifications: [], customEmotions: [],
    logs: {}, journalEntries: {}, checkIns: {}, wellbeingNotes: {}, dailyDrafts: {} };
  const remote = { userId, full: true, rows: Object.fromEntries(TABLES.map((d, i) => [d.table, lists[i]])) };
  // Merged against a throwaway snapshot — this device's real one is untouched.
  return { ...empty, ...mergeRows(remote, empty, { userId, cursor: null, rows: {} }, { remoteWins: true }) };
}

// ── Merge helpers for the explicit sign-in flow ──────────────────────────────
export async function mergeFromCloud(userId, localState) {
  const remote = await pullFullState(userId);
  return {
    darkMode:             remote.darkMode             ?? localState.darkMode,
    gamify:               remote.gamify               ?? localState.gamify,
    weekStartDay:         remote.weekStartDay         ?? localState.weekStartDay,
    uiPrefs:              remote.uiPrefs              || localState.uiPrefs,
    dailyMessageDefaults: remote.dailyMessageDefaults || localState.dailyMessageDefaults,
    rewardMilestone:      remote.rewardMilestone      || localState.rewardMilestone,
    milestoneSeen:        remote.milestoneSeen        || localState.milestoneSeen,
    activities:    mergeById(localState.activities,    remote.activities),
    tags:          mergeById(localState.tags,          remote.tags),
    tasks:         mergeById(localState.tasks,         remote.tasks),
    library:       mergeById(localState.library,       remote.library),
    notifications: mergeById(localState.notifications, remote.notifications),
    customEmotions:mergeById(localState.customEmotions,remote.customEmotions),
    journalPrompts:mergeById(localState.journalPrompts,remote.journalPrompts),
    logs: mergeLogs(localState.logs, remote.logs),
    checkIns:       { ...localState.checkIns,       ...remote.checkIns },
    wellbeingNotes: { ...localState.wellbeingNotes, ...remote.wellbeingNotes },
    dailyDrafts:    { ...localState.dailyDrafts,    ...remote.dailyDrafts },
    journalEntries: mergeJournalEntries(localState.journalEntries, remote.journalEntries),
  };
}

function mergeById(local = [], remote = []) {
  const map = new Map((local).map(item => [item.id, item]));
  remote.forEach(item => map.set(item.id, item)); // remote wins on same ID
  return Array.from(map.values());
}

export function mergeLogs(local = {}, remote = {}) {
  const merged = {};
  const activityIds = new Set([...Object.keys(local), ...Object.keys(remote)]);
  activityIds.forEach(actId => {
    const l = local[actId]  || {};
    const r = remote[actId] || {};
    const dates = new Set([...Object.keys(l), ...Object.keys(r)]);
    merged[actId] = {};
    dates.forEach(date => {
      merged[actId][date] = Math.max(l[date] || 0, r[date] || 0);
    });
  });
  return merged;
}

function mergeJournalEntries(local = {}, remote = {}) {
  const merged = { ...local };
  Object.entries(remote).forEach(([date, prompts]) => {
    merged[date] = { ...(merged[date] || {}), ...prompts };
  });
  return merged;
}

// ── Delete: wipe all user data from every table ───────────────────────────────
export async function deleteAllUserData(userId) {
  try {
    await Promise.all(TABLES.map(d => supabase.from(d.table).delete().eq('user_id', userId)));
    resetSyncState();
  } catch (err) {
    captureError(err instanceof Error ? err : new Error(String(err)), { context: 'deleteAllUserData' });
    throw err;
  }
}
