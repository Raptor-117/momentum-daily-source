// ─────────────────────────────────────────────
// ACTIVITIES
// ─────────────────────────────────────────────
// hasTarget: false = log occurrences only, no weekly goal
// tags: shared tag IDs from the tags store (same system as tasks)
export const DEFAULT_ACTIVITIES = [
  // ── Learning ──
  { id: 'audios',      name: 'Audios',                          weeklyTarget: 7, emoji: '🎧', hasTarget: true,  tags: ['learning'], accountability: true  },
  { id: 'reading',     name: 'Read',                            weeklyTarget: 5, emoji: '📖', hasTarget: true,  tags: ['learning'], accountability: true  },
  { id: 'accountability', name: 'Send Daily Accountability Message', weeklyTarget: 7, emoji: '💬', hasTarget: true, tags: ['learning'], accountability: false },
  // ── Health ──
  { id: 'exercise',    name: 'Exercise',                        weeklyTarget: 4, emoji: '💪', hasTarget: true,  tags: ['health'],   accountability: true  },
  { id: 'meditation',  name: 'Meditation',                      weeklyTarget: 7, emoji: '🧘', hasTarget: true,  tags: ['health'],   accountability: false },
  { id: 'gratitude',   name: 'Gratitude',                       weeklyTarget: 7, emoji: '🙏', hasTarget: true,  tags: ['health'],   accountability: false },
  { id: 'journal',     name: 'Journal',                         weeklyTarget: 7, emoji: '📓', hasTarget: true,  tags: ['health'],   accountability: false },
  // ── Relationship ──
  { id: 'date-night',  name: 'Date Night',                      weeklyTarget: 1, emoji: '❤️', hasTarget: true,  tags: ['relationship'], accountability: false },
  { id: 'rel-checkin', name: 'Relationship Check-In',           weeklyTarget: 1, emoji: '💑', hasTarget: true,  tags: ['relationship'], accountability: false },
  // ── Business Building ──
  { id: 'new-cu',      name: 'New Catch Up',                    weeklyTarget: 2, emoji: '🤝', hasTarget: true,  tags: ['business'], accountability: true  },
  { id: 'exist-cu',    name: 'Existing Catch Up',               weeklyTarget: 1, emoji: '📞', hasTarget: true,  tags: ['business'], accountability: false },
  { id: 'events',      name: 'Events',                          weeklyTarget: 1, emoji: '🎪', hasTarget: true,  tags: ['business'], accountability: false },
  { id: 'online-mpa',  name: 'Online MPA',                      weeklyTarget: 3, emoji: '💻', hasTarget: true,  tags: ['business'], accountability: true  },
  { id: 'ip-mpa',      name: 'In-Person MPA',                   weeklyTarget: 3, emoji: '🏢', hasTarget: true,  tags: ['business'], accountability: true  },
  { id: 'soft-dtm',    name: 'Soft DTM',                        weeklyTarget: 2, emoji: '📋', hasTarget: true,  tags: ['business'], accountability: true  },
  { id: 'dtm',         name: 'DTM',                             weeklyTarget: 2, emoji: '🎯', hasTarget: true,  tags: ['business'], accountability: true  },
  { id: 'prefilter',   name: 'Prefilter',                       weeklyTarget: 2, emoji: '🔍', hasTarget: true,  tags: ['business'], accountability: true  },
  { id: 'mg-personal', name: 'Meet & Greet',                    weeklyTarget: 1, emoji: '👋', hasTarget: true,  tags: ['business'], accountability: false },
  { id: 'launch-p',    name: 'Launches (Personal)',              weeklyTarget: 1, emoji: '🚀', hasTarget: false, tags: ['business'], accountability: false },
  { id: 'launch-t',    name: 'Launches (Team)',                  weeklyTarget: 1, emoji: '👥', hasTarget: false, tags: ['business'], accountability: false },
];

export const MONTH_NAMES      = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export const MONTH_NAMES_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];
export const DAY_LABELS       = ['Sat','Sun','Mon','Tue','Wed','Thu','Fri'];

// ─────────────────────────────────────────────
// DEFAULT TAGS
// ─────────────────────────────────────────────
export const DEFAULT_TAGS = [
  { id: 'learning',     label: 'Learning',          color: '#f59e0b' },
  { id: 'health',       label: 'Health',             color: '#10b981' },
  { id: 'relationship', label: 'Relationship',       color: '#ec4899' },
  { id: 'business',     label: 'Business Building',  color: '#3b82f6' },
  { id: 'lifeadmin',   label: 'Life Admin',          color: '#8b5cf6' },
];

// ─────────────────────────────────────────────
// MOCK TASKS  (cleared for live use)
// ─────────────────────────────────────────────
export const MOCK_TASKS = [];

// ─────────────────────────────────────────────
// DATE HELPERS
// ─────────────────────────────────────────────
export function toDateStr(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export function todayStr() {
  return toDateStr(new Date());
}

// firstDay: 0=Sun, 1=Mon, 6=Sat (default)
export function getWeekStart(dateStr, firstDay = 6) {
  const d    = new Date(dateStr + 'T00:00:00');
  const day  = d.getDay();
  const diff = (day - firstDay + 7) % 7;
  d.setDate(d.getDate() - diff);
  return toDateStr(d);
}

const ALL_DAY_LABELS_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
export function getDayLabels(firstDay = 6) {
  return Array.from({ length: 7 }, (_, i) => ALL_DAY_LABELS_SHORT[(firstDay + i) % 7]);
}

export function getWeekDays(weekStartStr) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStartStr + 'T00:00:00');
    d.setDate(d.getDate() + i);
    return toDateStr(d);
  });
}

// Calendar-month aligned chunks: 1–7, 8–14, 15–21, 22–28, 29–end
export function getCalendarMonthChunks(year, month) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const chunks = [];
  for (let start = 1; start <= daysInMonth; start += 7) {
    const end  = Math.min(start + 6, daysInMonth);
    const days = [];
    for (let d = start; d <= end; d++) {
      days.push(`${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`);
    }
    chunks.push({ start, end, days });
  }
  return chunks;
}

// Consecutive perfect-day streak (all hasTarget habits logged) up to today
export function calcPerfectDayStreak(activities, logs) {
  const goalActivities = activities.filter(a => !a.archived && a.hasTarget);
  if (!goalActivities.length) return 0;
  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const check = new Date(today);
  // Grace period: if today isn't perfect yet, count from yesterday
  const todayDs = toDateStr(today);
  const todayPerfect = goalActivities.every(a => (logs[a.id] || {})[todayDs] > 0);
  if (!todayPerfect) check.setDate(check.getDate() - 1);
  while (true) {
    const ds = toDateStr(check);
    if (goalActivities.every(a => (logs[a.id] || {})[ds] > 0)) {
      streak++;
      check.setDate(check.getDate() - 1);
    } else break;
  }
  return streak;
}

// Consecutive-day streak up to today where count > 0
export function calcStreak(actLogs) {
  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const check = new Date(today);
  // If today hasn't been logged yet, start from yesterday so the streak
  // stays visible all day and only breaks at midnight if yesterday was also missed
  if (!(actLogs[toDateStr(today)] > 0)) {
    check.setDate(check.getDate() - 1);
  }
  while (true) {
    const ds = toDateStr(check);
    if ((actLogs[ds] || 0) > 0) {
      streak++;
      check.setDate(check.getDate() - 1);
    } else break;
  }
  return streak;
}

export function formatDisplayDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

// ─────────────────────────────────────────────
// MOCK LOGS  (cleared for live use)
// ─────────────────────────────────────────────
export const MOCK_LOGS = {};
