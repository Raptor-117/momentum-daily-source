import { supabase } from './supabase';
import { captureError } from './errors';

// ── Push: write local Zustand state to Supabase ───────────────────────────────

export async function pushAllData(userId, rawState) {
  // Bail if session is expired or belongs to a different user
  const { data: { session } } = await supabase.auth.getSession();
  if (!session || session.user.id !== userId) return;

  const state = rawState;
  await Promise.all([
    pushPreferences(userId, state),
    pushActivities(userId, state.activities),
    pushLogs(userId, state.logs),
    pushTags(userId, state.tags),
    pushTasks(userId, state.tasks),
    pushCheckIns(userId, state.checkIns),
    pushJournalPrompts(userId, state.journalPrompts),
    pushJournalEntries(userId, state.journalEntries),
    pushWellbeingNotes(userId, state.wellbeingNotes),
    pushLibrary(userId, state.library),
    pushNotifications(userId, state.notifications),
    pushDailyDrafts(userId, state.dailyDrafts),
    pushDailyMessageDefaults(userId, state.dailyMessageDefaults),
    pushCustomEmotions(userId, state.customEmotions),
    pushRewardMilestones(userId, state.rewardMilestone),
    pushMilestoneSeen(userId, state.milestoneSeen),
  ]);
}

// ── Pull: load all Supabase data into a state object ─────────────────────────

export async function pullAllData(userId) {
  const [
    preferences, activities, logs, tags, tasks,
    checkIns, journalPrompts, journalEntries, wellbeingNotes,
    library, notifications, dailyDrafts, dailyMessageDefaults,
    customEmotions, rewardMilestones, milestoneSeen,
  ] = await Promise.all([
    pullPreferences(userId),
    pullActivities(userId),
    pullLogs(userId),
    pullTags(userId),
    pullTasks(userId),
    pullCheckIns(userId),
    pullJournalPrompts(userId),
    pullJournalEntries(userId),
    pullWellbeingNotes(userId),
    pullLibrary(userId),
    pullNotifications(userId),
    pullDailyDrafts(userId),
    pullDailyMessageDefaults(userId),
    pullCustomEmotions(userId),
    pullRewardMilestones(userId),
    pullMilestoneSeen(userId),
  ]);

  return {
    ...preferences,
    activities,
    logs,
    tags,
    tasks,
    checkIns,
    journalPrompts,
    journalEntries,
    wellbeingNotes,
    library,
    notifications,
    dailyDrafts,
    dailyMessageDefaults,
    customEmotions,
    rewardMilestone: rewardMilestones,
    milestoneSeen,
  };
}

// ── Merge: pull remote data and intelligently combine with local ──────────────
// Called on app focus so both devices stay in sync without wiping each other.
//
// Rules:
//   Logs        → Math.max(local, remote) per activity/date  (never lose a logged habit)
//   Activities, Tasks, Tags, Library, Notifications, Custom emotions
//               → union by ID; remote wins on conflict  (pick up additions from other device)
//   CheckIns, WellbeingNotes, DailyDrafts
//               → union by date key; remote wins on conflict
//   JournalEntries
//               → union by date + prompt; remote wins on conflict
//   Preferences → remote wins (last device to push wins)

export async function mergeFromCloud(userId, localState) {
  const remote = await pullAllData(userId);

  return {
    // Preferences — remote wins
    darkMode:             remote.darkMode             ?? localState.darkMode,
    gamify:               remote.gamify               ?? localState.gamify,
    weekStartDay:         remote.weekStartDay          ?? localState.weekStartDay,
    uiPrefs:              remote.uiPrefs              || localState.uiPrefs,
    dailyMessageDefaults: remote.dailyMessageDefaults || localState.dailyMessageDefaults,
    rewardMilestone:      remote.rewardMilestone      || localState.rewardMilestone,
    milestoneSeen:        remote.milestoneSeen        || localState.milestoneSeen,

    // Arrays keyed by .id — union, remote wins on conflict
    activities:    mergeById(localState.activities,    remote.activities),
    tags:          mergeById(localState.tags,          remote.tags),
    tasks:         mergeById(localState.tasks,         remote.tasks),
    library:       mergeById(localState.library,       remote.library),
    notifications: mergeById(localState.notifications, remote.notifications),
    customEmotions:mergeById(localState.customEmotions,remote.customEmotions),
    journalPrompts:mergeById(localState.journalPrompts,remote.journalPrompts),

    // Logs — take the higher count per activity/date (never lose a check)
    logs: mergeLogs(localState.logs, remote.logs),

    // Date-keyed objects — union, remote wins on conflict
    checkIns:       { ...localState.checkIns,       ...remote.checkIns },
    wellbeingNotes: { ...localState.wellbeingNotes, ...remote.wellbeingNotes },
    dailyDrafts:    { ...localState.dailyDrafts,    ...remote.dailyDrafts },

    // Journal entries keyed by date + promptId — union, remote wins per prompt
    journalEntries: mergeJournalEntries(localState.journalEntries, remote.journalEntries),
  };
}

// Helpers ─────────────────────────────────────────────────────────────────────

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

// ── Preferences ───────────────────────────────────────────────────────────────

async function pushPreferences(userId, state) {
  await supabase.from('user_preferences').upsert({
    user_id: userId,
    dark_mode: state.darkMode,
    gamify: state.gamify,
    week_start_day: state.weekStartDay,
    ui_prefs: state.uiPrefs,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
}

async function pullPreferences(userId) {
  const { data, error } = await supabase
    .from('user_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return {};
  return {
    darkMode: data.dark_mode,
    gamify: data.gamify,
    weekStartDay: data.week_start_day,
    uiPrefs: data.ui_prefs,
  };
}

// ── Activities ────────────────────────────────────────────────────────────────

async function pushActivities(userId, activities) {
  // Store uses 'name', Supabase column is 'label'
  const valid = (activities || []).filter(a => (a.name || a.label) && a.id && typeof a.id === 'string');

  if (valid.length > 0) {
    const payload = valid.map((a, i) => ({
      id: a.id,
      user_id: userId,
      label: a.name || a.label,
      emoji: a.emoji,
      color: a.color || '#6366f1',
      weekly_target: a.weeklyTarget ?? 0,
      has_target: a.hasTarget ?? false,
      accountability: a.accountability ?? false,
      tags: Array.isArray(a.tags) ? a.tags : [],
      pillars: Array.isArray(a.pillars) ? a.pillars : [],
      notes: typeof a.notes === 'string' ? a.notes : '',
      scheduled_days: Array.isArray(a.scheduledDays) ? a.scheduledDays : [],
      complexity: a.complexity || 'medium',
      archived: a.archived || false,
      sort_order: i,
      created_at: a.createdAt || '2020-01-01',
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from('activities').upsert(payload, { onConflict: 'id' });
    if (error) captureError(new Error(error.message), { context: 'pushActivities' });

    // Delete cloud records that were removed locally
    const localIds = valid.map(a => a.id);
    const { error: delError } = await supabase
      .from('activities')
      .delete()
      .eq('user_id', userId)
      .not('id', 'in', `(${localIds.join(',')})`);
    if (delError) captureError(new Error(delError.message), { context: 'pushActivities.delete' });
  } else {
    // All activities deleted locally — clear cloud too
    await supabase.from('activities').delete().eq('user_id', userId);
  }
}

async function pullActivities(userId) {
  const { data, error } = await supabase
    .from('activities')
    .select('*')
    .eq('user_id', userId)
    .order('sort_order');
  if (error) throw error;
  // Store uses 'name', Supabase column is 'label' — map back correctly
  return (data || []).map(a => ({
    id: a.id,
    name: a.label,
    emoji: a.emoji,
    color: a.color,
    weeklyTarget: a.weekly_target,
    hasTarget: a.has_target,
    accountability: a.accountability ?? false,
    tags: a.tags || [],
    pillars: a.pillars || [],
    notes: a.notes || '',
    scheduledDays: a.scheduled_days || [],
    complexity: a.complexity,
    archived: a.archived,
    createdAt: a.created_at,
  }));
}

// ── Logs ──────────────────────────────────────────────────────────────────────
// logs shape: { activityId: { dateStr: count } }

async function pushLogs(userId, logs) {
  if (!logs) return;
  const rows = [];
  Object.entries(logs).forEach(([activityId, dateCounts]) => {
    Object.entries(dateCounts).forEach(([logDate, count]) => {
      if (count > 0) rows.push({ user_id: userId, activity_id: activityId, log_date: logDate, count });
    });
  });
  if (!rows.length) return;
  await supabase.from('logs').upsert(rows, { onConflict: 'user_id,activity_id,log_date' });
}

async function pullLogs(userId) {
  const { data, error } = await supabase
    .from('logs')
    .select('activity_id, log_date, count')
    .eq('user_id', userId);
  if (error) throw error;
  const logs = {};
  (data || []).forEach(({ activity_id, log_date, count }) => {
    if (!logs[activity_id]) logs[activity_id] = {};
    logs[activity_id][log_date] = count;
  });
  return logs;
}

// ── Tags ──────────────────────────────────────────────────────────────────────

async function pushTags(userId, tags) {
  const valid = (tags || []).filter(t => t.id && typeof t.id === 'string' && t.label);

  if (valid.length > 0) {
    await supabase.from('tags').upsert(
      valid.map((t, i) => ({
        id: t.id,
        user_id: userId,
        label: t.label,
        color: t.color,
        sort_order: i,
      })),
      { onConflict: 'id' }
    );

    // Delete cloud records that were removed locally
    const localIds = valid.map(t => t.id);
    const { error: delError } = await supabase
      .from('tags')
      .delete()
      .eq('user_id', userId)
      .not('id', 'in', `(${localIds.join(',')})`);
    if (delError) captureError(new Error(delError.message), { context: 'pushTags.delete' });
  } else {
    // All tags deleted locally — clear cloud too
    await supabase.from('tags').delete().eq('user_id', userId);
  }
}

async function pullTags(userId) {
  const { data, error } = await supabase
    .from('tags')
    .select('*')
    .eq('user_id', userId)
    .order('sort_order');
  if (error) throw error;
  return (data || []).map(t => ({ id: t.id, label: t.label, color: t.color }));
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

async function pushTasks(userId, tasks) {
  const today = new Date().toISOString().slice(0, 10);
  const valid = (tasks || []).filter(t => {
    if (!t.title || !t.id || typeof t.id !== 'string') return false;
    try { JSON.stringify(t); return true; }
    catch { return false; }
  });

  if (valid.length > 0) {
    const { error } = await supabase.from('tasks').upsert(
      valid.map(t => ({
        id: t.id,
        user_id: userId,
        title: t.title,
        notes: t.notes,
        due_date: t.dueDate || null,
        complexity: t.complexity || 'medium',
        tags: t.tags || [],
        pillars: t.pillars || [],
        completed: t.completed || false,
        completed_date: t.completedDate || null,
        recurrence: t.recurrence || 'none',
        last_completed: t.lastCompleted || null,
        created_at: t.createdAt || today,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: 'id' }
    );
    if (error) captureError(new Error(error.message), { context: 'pushTasks' });

    // Delete cloud records that were removed locally
    const localIds = valid.map(t => t.id);
    const { error: delError } = await supabase
      .from('tasks')
      .delete()
      .eq('user_id', userId)
      .not('id', 'in', `(${localIds.join(',')})`);
    if (delError) captureError(new Error(delError.message), { context: 'pushTasks.delete' });
  } else {
    // All tasks deleted locally — clear cloud too
    await supabase.from('tasks').delete().eq('user_id', userId);
  }
}

async function pullTasks(userId) {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId);
  if (error) throw error;
  return (data || []).map(t => ({
    id: t.id,
    title: t.title,
    notes: t.notes,
    dueDate: t.due_date,
    complexity: t.complexity,
    tags: t.tags || [],
    pillars: t.pillars || [],
    completed: t.completed,
    completedDate: t.completed_date,
    recurrence: t.recurrence,
    lastCompleted: t.last_completed,
    createdAt: t.created_at,
  }));
}

// ── Check-ins ─────────────────────────────────────────────────────────────────

async function pushCheckIns(userId, checkIns) {
  if (!checkIns) return;
  const rows = Object.entries(checkIns).map(([date, data]) => ({
    user_id: userId,
    check_in_date: date,
    emotions: data.emotions || [],
    notes: data.notes || null,
  }));
  if (!rows.length) return;
  await supabase.from('check_ins').upsert(rows, { onConflict: 'user_id,check_in_date' });
}

async function pullCheckIns(userId) {
  const { data, error } = await supabase
    .from('check_ins')
    .select('check_in_date, emotions, notes')
    .eq('user_id', userId);
  if (error) throw error;
  const checkIns = {};
  (data || []).forEach(({ check_in_date, emotions, notes }) => {
    checkIns[check_in_date] = { emotions: emotions || [], notes: notes || '' };
  });
  return checkIns;
}

// ── Journal prompts ───────────────────────────────────────────────────────────

async function pushJournalPrompts(userId, prompts) {
  if (!prompts?.length) return;
  await supabase.from('journal_prompts').upsert(
    prompts.map((p, i) => ({
      id: p.id,
      user_id: userId,
      text: p.text,
      sort_order: i,
    })),
    { onConflict: 'id' }
  );
}

async function pullJournalPrompts(userId) {
  const { data, error } = await supabase
    .from('journal_prompts')
    .select('*')
    .eq('user_id', userId)
    .order('sort_order');
  if (error) throw error;
  return (data || []).map(p => ({ id: p.id, text: p.text }));
}

// ── Journal entries ───────────────────────────────────────────────────────────

async function pushJournalEntries(userId, entries) {
  if (!entries) return;
  const rows = [];
  Object.entries(entries).forEach(([date, prompts]) => {
    Object.entries(prompts).forEach(([promptId, text]) => {
      if (text) rows.push({ user_id: userId, entry_date: date, prompt_id: promptId, text });
    });
  });
  if (!rows.length) return;
  await supabase.from('journal_entries').upsert(rows, { onConflict: 'user_id,entry_date,prompt_id' });
}

async function pullJournalEntries(userId) {
  const { data, error } = await supabase
    .from('journal_entries')
    .select('entry_date, prompt_id, text')
    .eq('user_id', userId);
  if (error) throw error;
  const entries = {};
  (data || []).forEach(({ entry_date, prompt_id, text }) => {
    if (!entries[entry_date]) entries[entry_date] = {};
    entries[entry_date][prompt_id] = text;
  });
  return entries;
}

// ── Wellbeing notes ───────────────────────────────────────────────────────────

async function pushWellbeingNotes(userId, notes) {
  if (!notes) return;
  const rows = Object.entries(notes)
    .filter(([, text]) => text)
    .map(([date, text]) => ({ user_id: userId, note_date: date, text }));
  if (!rows.length) return;
  await supabase.from('wellbeing_notes').upsert(rows, { onConflict: 'user_id,note_date' });
}

async function pullWellbeingNotes(userId) {
  const { data, error } = await supabase
    .from('wellbeing_notes')
    .select('note_date, text')
    .eq('user_id', userId);
  if (error) throw error;
  const notes = {};
  (data || []).forEach(({ note_date, text }) => { notes[note_date] = text; });
  return notes;
}

// ── Library ───────────────────────────────────────────────────────────────────

async function pushLibrary(userId, library) {
  if (!library?.length) return;
  await supabase.from('library').upsert(
    library.map(e => ({
      id: e.id,
      user_id: userId,
      title: e.title,
      author: e.author,
      status: e.status,
      notes: e.notes,
      date_started: e.dateStarted || null,
      date_completed: e.dateCompleted || null,
    })),
    { onConflict: 'id' }
  );
}

async function pullLibrary(userId) {
  const { data, error } = await supabase
    .from('library')
    .select('*')
    .eq('user_id', userId);
  if (error) throw error;
  return (data || []).map(e => ({
    id: e.id, title: e.title, author: e.author, status: e.status,
    notes: e.notes, dateStarted: e.date_started, dateCompleted: e.date_completed,
  }));
}

// ── Notifications ─────────────────────────────────────────────────────────────

async function pushNotifications(userId, notifications) {
  if (!notifications?.length) return;
  await supabase.from('notifications').upsert(
    notifications.map(n => ({
      id: n.id, user_id: userId, time: n.time, message: n.message, enabled: n.enabled,
    })),
    { onConflict: 'id' }
  );
}

async function pullNotifications(userId) {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId);
  if (error) throw error;
  return (data || []).map(n => ({ id: n.id, time: n.time, message: n.message, enabled: n.enabled }));
}

// ── Daily drafts ──────────────────────────────────────────────────────────────

async function pushDailyDrafts(userId, drafts) {
  if (!drafts) return;
  const rows = Object.entries(drafts).map(([date, d]) => ({
    user_id: userId, draft_date: date, book: d.book, audio: d.audio, notes: d.notes,
  }));
  if (!rows.length) return;
  await supabase.from('daily_drafts').upsert(rows, { onConflict: 'user_id,draft_date' });
}

async function pullDailyDrafts(userId) {
  const { data, error } = await supabase
    .from('daily_drafts')
    .select('draft_date, book, audio, notes')
    .eq('user_id', userId);
  if (error) throw error;
  const drafts = {};
  (data || []).forEach(({ draft_date, book, audio, notes }) => {
    drafts[draft_date] = { book, audio, notes };
  });
  return drafts;
}

// ── Daily message defaults ────────────────────────────────────────────────────

async function pushDailyMessageDefaults(userId, defaults) {
  await supabase.from('daily_message_defaults').upsert(
    { user_id: userId, book: defaults?.book || '', notes: defaults?.notes || '', updated_at: new Date().toISOString() },
    { onConflict: 'user_id' }
  );
}

async function pullDailyMessageDefaults(userId) {
  const { data, error } = await supabase
    .from('daily_message_defaults')
    .select('book, notes')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data ? { book: data.book, notes: data.notes } : { book: '', notes: '' };
}

// ── Custom emotions ───────────────────────────────────────────────────────────

async function pushCustomEmotions(userId, emotions) {
  if (!emotions?.length) return;
  await supabase.from('custom_emotions').upsert(
    emotions.map(e => ({ id: e.id, user_id: userId, label: e.label, emoji: e.emoji })),
    { onConflict: 'id' }
  );
}

async function pullCustomEmotions(userId) {
  const { data, error } = await supabase
    .from('custom_emotions')
    .select('*')
    .eq('user_id', userId);
  if (error) throw error;
  return (data || []).map(e => ({ id: e.id, label: e.label, emoji: e.emoji }));
}

// ── Reward milestones ─────────────────────────────────────────────────────────

async function pushRewardMilestones(userId, milestone) {
  await supabase.from('reward_milestones').upsert(
    { user_id: userId, config: milestone, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' }
  );
}

async function pullRewardMilestones(userId) {
  const { data, error } = await supabase
    .from('reward_milestones')
    .select('config')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data?.config || {};
}

// ── Milestone seen ────────────────────────────────────────────────────────────

async function pushMilestoneSeen(userId, seen) {
  await supabase.from('milestone_seen').upsert(
    { user_id: userId, data: seen, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' }
  );
}

async function pullMilestoneSeen(userId) {
  const { data, error } = await supabase
    .from('milestone_seen')
    .select('data')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data?.data || { daily: null, weekly: null, streaks: {}, consecutiveWeeks: null };
}

// ── Delete: wipe all user data from every table ───────────────────────────────
export async function deleteAllUserData(userId) {
  const tables = [
    'activities', 'logs', 'tags', 'tasks', 'check_ins',
    'journal_prompts', 'journal_entries', 'wellbeing_notes', 'library',
    'notifications', 'daily_drafts', 'daily_message_defaults',
    'custom_emotions', 'reward_milestones', 'milestone_seen', 'user_preferences',
  ];
  try {
    await Promise.all(
      tables.map(t => supabase.from(t).delete().eq('user_id', userId))
    );
  } catch (err) {
    captureError(err instanceof Error ? err : new Error(String(err)), { context: 'deleteAllUserData' });
    throw err;
  }
}
