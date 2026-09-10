import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  DEFAULT_ACTIVITIES, DEFAULT_TAGS, MOCK_TASKS, MOCK_LOGS,
  getWeekDays, calcStreak,
} from '../data';

const DEFAULT_JOURNAL_PROMPTS = [
  { id: 'jp-1', text: 'What is my intention for today?' },
  { id: 'jp-2', text: 'What would make today a win?' },
  { id: 'jp-3', text: 'What am I feeling?' },
  { id: 'jp-4', text: 'Did I honour my intention today?' },
  { id: 'jp-5', text: 'Did today feel like a win? Why or why not?' },
  { id: 'jp-6', text: 'What challenged me today, and what did it teach me?' },
  { id: 'jp-tomorrow', text: "What's on your agenda for tomorrow?" },
];

export const useStore = create(
  persist(
    (set, get) => ({

      // ── APPEARANCE ───────────────────────────────────────────────────────
      darkMode: false,
      toggleDarkMode: () => set(s => ({ darkMode: !s.darkMode })),

      gamify: false,
      toggleGameify: () => set(s => ({ gamify: !s.gamify })),

      // 0=Sun, 1=Mon, 6=Sat
      weekStartDay: 6,
      setWeekStartDay: (day) => set(() => ({ weekStartDay: day })),

      defaultTab: 'habits',
      setDefaultTab: (tab) => set(() => ({ defaultTab: tab })),

      // ── ACTIVITIES ──────────────────────────────────────────────────────
      activities: DEFAULT_ACTIVITIES.map(a => ({ ...a })),

      addActivity: (activity) => set((s) => ({
        activities: [...s.activities, {
          id: `act-${Date.now()}`,
          emoji: '📌',
          weeklyTarget: 1,
          hasTarget: true,
          tags: [],
          notes: '',
          createdAt: new Date().toISOString().slice(0, 10),
          ...activity,
        }],
      })),

      updateActivity: (id, updates) => set((s) => ({
        activities: s.activities.map(a => a.id === id ? { ...a, ...updates } : a),
      })),

      // Hard delete — only used when activity has no logs
      deleteActivity: (id) => set((s) => ({
        activities: s.activities.filter(a => a.id !== id),
        logs: Object.fromEntries(Object.entries(s.logs).filter(([k]) => k !== id)),
      })),

      // Soft archive — hides activity but preserves all logs
      archiveActivity: (id) => set((s) => ({
        activities: s.activities.map(a => a.id === id ? { ...a, archived: true } : a),
      })),

      unarchiveActivity: (id) => set((s) => ({
        activities: s.activities.map(a => a.id === id ? { ...a, archived: false } : a),
      })),

      setActivityOrder: (newActivities) => set(() => ({ activities: newActivities })),

      reorderActivity: (id, direction) => set((s) => {
        const idx    = s.activities.findIndex(a => a.id === id);
        if (idx === -1) return {};
        const newIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (newIdx < 0 || newIdx >= s.activities.length) return {};
        const arr = [...s.activities];
        [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
        return { activities: arr };
      }),

      // ── LOGS ────────────────────────────────────────────────────────────
      logs: { ...MOCK_LOGS },

      logActivity: (activityId, dateStr, delta) => set((s) => {
        const actLogs = s.logs[activityId] || {};
        const current = actLogs[dateStr] || 0;
        const newCount = Math.max(0, current + delta);
        return {
          logs: {
            ...s.logs,
            [activityId]: { ...actLogs, [dateStr]: newCount },
          },
        };
      }),

      setLogCount: (activityId, dateStr, count) => set((s) => ({
        logs: {
          ...s.logs,
          [activityId]: { ...(s.logs[activityId] || {}), [dateStr]: Math.max(0, count) },
        },
      })),

      // ── COMPUTED (LOGS) ─────────────────────────────────────────────────
      getCount: (activityId, dateStr) => {
        return (get().logs[activityId] || {})[dateStr] || 0;
      },

      getWeeklyTotal: (activityId, weekStartStr) => {
        const actLogs = get().logs[activityId] || {};
        return getWeekDays(weekStartStr).reduce((sum, d) => sum + (actLogs[d] || 0), 0);
      },

      getStreak: (activityId) => {
        return calcStreak(get().logs[activityId] || {});
      },

      getMonthlyTotal: (activityId, year, month) => {
        const actLogs = get().logs[activityId] || {};
        const days = new Date(year, month + 1, 0).getDate();
        let total = 0;
        for (let d = 1; d <= days; d++) {
          const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
          total += actLogs[ds] || 0;
        }
        return total;
      },

      // ── TAGS ────────────────────────────────────────────────────────────
      tags: DEFAULT_TAGS.map(t => ({ ...t })),

      addTag: (tag) => set((s) => ({
        tags: [...s.tags, { id: `tag-${Date.now()}`, ...tag }],
      })),

      updateTag: (id, updates) => set((s) => ({
        tags: s.tags.map(t => t.id === id ? { ...t, ...updates } : t),
      })),

      setTagOrder: (newTags) => set(() => ({ tags: newTags })),

      reorderTag: (id, direction) => set((s) => {
        const idx    = s.tags.findIndex(t => t.id === id);
        if (idx === -1) return {};
        const newIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (newIdx < 0 || newIdx >= s.tags.length) return {};
        const arr = [...s.tags];
        [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
        return { tags: arr };
      }),

      deleteTag: (id) => set((s) => ({
        tags: s.tags.filter(t => t.id !== id),
        tasks: s.tasks.map(task => ({
          ...task,
          tags: task.tags.filter(tid => tid !== id),
        })),
        activities: s.activities.map(act => ({
          ...act,
          tags: (act.tags || []).filter(tid => tid !== id),
        })),
      })),

      // ── TASKS ────────────────────────────────────────────────────────────
      tasks: MOCK_TASKS.map(t => ({ ...t })),

      addTask: (task) => set((s) => ({
        tasks: [...s.tasks, {
          id: `task-${Date.now()}`,
          title: '',
          notes: null,
          dueDate: null,
          complexity: 'medium',
          tags: [],
          completed: false,
          recurrence: 'none',
          lastCompleted: null,
          completedDate: null,
          createdAt: new Date().toISOString().slice(0, 10),
          ...task,
        }],
      })),

      updateTask: (id, updates) => set((s) => ({
        tasks: s.tasks.map(t => t.id === id ? { ...t, ...updates } : t),
      })),

      deleteTask: (id) => set((s) => ({
        tasks: s.tasks.filter(t => t.id !== id),
      })),

      // Recurring tasks: never disappear — tick advances the due date and stays visible
      toggleTask: (id) => set((s) => {
        const today = new Date().toISOString().slice(0, 10);

        function shiftDate(recurrence, from, direction) {
          if (!from) return null;
          const d = new Date(from + 'T00:00:00');
          if (recurrence === 'daily')   d.setDate(d.getDate() + direction);
          if (recurrence === 'weekly')  d.setDate(d.getDate() + direction * 7);
          if (recurrence === 'monthly') d.setMonth(d.getMonth() + direction);
          return d.toISOString().slice(0, 10);
        }

        function doneThisPeriod(t) {
          if (!t.lastCompleted) return false;
          if (t.recurrence === 'daily')   return t.lastCompleted === today;
          if (t.recurrence === 'weekly')  return Math.floor((new Date(today+'T00:00:00')-new Date(t.lastCompleted+'T00:00:00'))/86400000) < 7;
          if (t.recurrence === 'monthly') return t.lastCompleted.slice(0,7) === today.slice(0,7);
          return false;
        }

        return {
          tasks: s.tasks.map(t => {
            if (t.id !== id) return t;

            // Non-recurring: simple toggle
            if (!t.recurrence || t.recurrence === 'none') {
              const nc = !t.completed;
              return { ...t, completed: nc, completedDate: nc ? today : null };
            }

            // Recurring: tick = mark done this period + advance due date (stays visible in upcoming)
            //            un-tick = undo — revert due date and clear lastCompleted
            const alreadyDone = doneThisPeriod(t);
            if (!alreadyDone) {
              // Completing: advance due date to next period, record lastCompleted
              return {
                ...t,
                completed: false,           // stays in active list
                lastCompleted: today,
                dueDate: shiftDate(t.recurrence, t.dueDate, +1),
              };
            } else {
              // Un-completing: revert due date, clear lastCompleted
              return {
                ...t,
                completed: false,
                lastCompleted: null,
                dueDate: shiftDate(t.recurrence, t.dueDate, -1),
              };
            }
          }),
        };
      }),

      // ── CUSTOM EMOTIONS ──────────────────────────────────────────────────────
      // Shape: [{ id, label, emoji }]
      customEmotions: [],

      addCustomEmotion: (emotion) => set((s) => ({
        customEmotions: [...s.customEmotions, { id: `emo-${Date.now()}`, ...emotion }],
      })),

      deleteCustomEmotion: (id) => set((s) => ({
        customEmotions: s.customEmotions.filter(e => e.id !== id),
      })),

      // ── REWARD MILESTONE ─────────────────────────────────────────────────────
      // daily: fires when X habits logged today
      // weekly: fires when all selected habits hit their weekly targets
      // streakMilestones: [{id, days, reward}] — fires on perfect-day streak
      rewardMilestone: {
        // Daily count
        enabled: false, count: 5, reward: '', dailyCreated: false,
        // Weekly per-habit targets
        weeklyEnabled: false, weeklyHabits: [], weeklyReward: '',
        // Streak (perfect days)
        streakMilestones: [], streakMilestonesEnabled: false,
        // Consecutive weeks — hit selected habits' weekly targets N weeks in a row
        consecutiveWeeksEnabled: false, consecutiveWeeksHabits: [], consecutiveWeeksTarget: 4, consecutiveWeeksReward: '',
      },

      setRewardMilestone: (updates) => set((s) => ({
        rewardMilestone: { ...s.rewardMilestone, ...updates },
      })),

      // ── MILESTONE SEEN TRACKING ───────────────────────────────────────────────
      // Persisted so resets happen on date/week boundary, not just page reload
      // { daily: 'YYYY-MM-DD', weekly: 'YYYY-WW', streaks: { [id]: number } }
      milestoneSeen: { daily: null, weekly: null, streaks: {}, consecutiveWeeks: null },

      setMilestoneSeen: (updates) => set((s) => ({
        milestoneSeen: { ...s.milestoneSeen, ...updates },
      })),

      // ── WELLBEING — CHECK-IN ─────────────────────────────────────────────
      // Shape: { [dateStr]: { emotions: string[], notes: string } }
      checkIns: {},

      saveCheckIn: (dateStr, data) => set((s) => ({
        checkIns: { ...s.checkIns, [dateStr]: data },
      })),

      // ── WELLBEING — JOURNAL ──────────────────────────────────────────────
      journalPrompts: DEFAULT_JOURNAL_PROMPTS.map(p => ({ ...p })),

      addJournalPrompt: (text) => set((s) => ({
        journalPrompts: [...s.journalPrompts, { id: `jp-${Date.now()}`, text }],
      })),

      deleteJournalPrompt: (id) => set((s) => ({
        journalPrompts: s.journalPrompts.filter(p => p.id !== id),
      })),

      updateJournalPrompt: (id, text) => set((s) => ({
        journalPrompts: s.journalPrompts.map(p => p.id === id ? { ...p, text } : p),
      })),

      setJournalPromptOrder: (newPrompts) => set(() => ({ journalPrompts: newPrompts })),

      reorderJournalPrompt: (id, direction) => set((s) => {
        const idx    = s.journalPrompts.findIndex(p => p.id === id);
        if (idx === -1) return {};
        const newIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (newIdx < 0 || newIdx >= s.journalPrompts.length) return {};
        const arr = [...s.journalPrompts];
        [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
        return { journalPrompts: arr };
      }),

      // Shape: { [dateStr]: { [promptId]: string } }
      journalEntries: {},

      saveJournalEntry: (dateStr, promptId, text) => set((s) => ({
        journalEntries: {
          ...s.journalEntries,
          [dateStr]: {
            ...(s.journalEntries[dateStr] || {}),
            [promptId]: text,
          },
        },
      })),

      // ── WELLBEING — NOTES ────────────────────────────────────────────────────
      // Shape: { [dateStr]: string }
      wellbeingNotes: {},

      saveWellbeingNote: (dateStr, text) => set((s) => ({
        wellbeingNotes: { ...s.wellbeingNotes, [dateStr]: text },
      })),

      // ── LIBRARY ───────────────────────────────────────────────────────────────
      // Shape: [{ id, title, author, status: 'reading'|'completed', notes, dateStarted, dateCompleted }]
      library: [],

      addLibraryEntry: (entry) => set((s) => ({
        library: [...s.library, {
          id: `lib-${Date.now()}`,
          title: '',
          author: '',
          status: 'reading',
          notes: '',
          dateStarted: new Date().toISOString().slice(0, 10),
          dateCompleted: null,
          ...entry,
        }],
      })),

      updateLibraryEntry: (id, updates) => set((s) => ({
        library: s.library.map(e => e.id === id ? { ...e, ...updates } : e),
      })),

      deleteLibraryEntry: (id) => set((s) => ({
        library: s.library.filter(e => e.id !== id),
      })),

      // ── DAILY MESSAGE DRAFTS ─────────────────────────────────────────────────
      // Shape: { [dateStr]: { book: string, audio: string, notes: string } }
      dailyDrafts: {},

      saveDailyDraft: (dateStr, draft) => set((s) => ({
        dailyDrafts: { ...s.dailyDrafts, [dateStr]: { ...(s.dailyDrafts[dateStr] || {}), ...draft } },
      })),

      // ── DAILY MESSAGE DEFAULTS ────────────────────────────────────────────────
      // Pre-fills book title and extra notes for every new daily message
      dailyMessageDefaults: { book: '', notes: '' },

      saveDailyMessageDefaults: (defaults) => set((s) => ({
        dailyMessageDefaults: { ...s.dailyMessageDefaults, ...defaults },
      })),

      // ── REMINDERS ────────────────────────────────────────────────────────────
      // Shape: [{ id, time: 'HH:MM', message: string, enabled: bool }]
      notifications: [],

      addNotification: (notif) => set((s) => ({
        notifications: [...s.notifications, { id: `notif-${Date.now()}`, enabled: true, ...notif }],
      })),

      updateNotification: (id, updates) => set((s) => ({
        notifications: s.notifications.map(n => n.id === id ? { ...n, ...updates } : n),
      })),

      deleteNotification: (id) => set((s) => ({
        notifications: s.notifications.filter(n => n.id !== id),
      })),

      // ── UI PREFERENCES (persisted across tab navigation) ─────────────────────
      // Stores filter + section-collapse state so it survives tab switches
      uiPrefs: {
        tasks: {
          sections: { urgent: true, overdue: true, dueToday: true, next7Days: true, upcoming: true, noDeadline: true, completed: false },
          filterComplexities: [],
          filterTags: [],
          filterOpen: false,
        },
        habits: {
          filterStatuses: [],
          filterTags: [],
        },
      },

      setUiPref: (screen, key, value) => set((s) => ({
        uiPrefs: {
          ...s.uiPrefs,
          [screen]: { ...s.uiPrefs[screen], [key]: value },
        },
      })),

      setTaskSection: (sectionKey, isOpen) => set((s) => ({
        uiPrefs: {
          ...s.uiPrefs,
          tasks: {
            ...s.uiPrefs.tasks,
            sections: { ...s.uiPrefs.tasks.sections, [sectionKey]: isOpen },
          },
        },
      })),

      // ── CSV IMPORT HELPERS ────────────────────────────────────────────────────
      importLogs: (newLogs) => set((s) => {
        const merged = { ...s.logs };
        Object.entries(newLogs).forEach(([actId, dateCounts]) => {
          merged[actId] = { ...(merged[actId] || {}), ...dateCounts };
        });
        return { logs: merged };
      }),

      importCheckIns: (newCheckIns) => set((s) => ({
        checkIns: { ...s.checkIns, ...newCheckIns },
      })),

      importJournalEntries: (newEntries) => set((s) => {
        const merged = { ...s.journalEntries };
        Object.entries(newEntries).forEach(([date, prompts]) => {
          merged[date] = { ...(merged[date] || {}), ...prompts };
        });
        return { journalEntries: merged };
      }),

      importWellbeingNotes: (newNotes) => set((s) => ({
        wellbeingNotes: { ...s.wellbeingNotes, ...newNotes },
      })),

      importTasks: (newTasks) => set((s) => ({
        tasks: [...s.tasks, ...newTasks],
      })),

      // ── SUPABASE HYDRATION ────────────────────────────────────────────────────
      // Replaces all data fields with pulled cloud data (called on login)
      hydrateFromSupabase: (data) => set(() => ({ ...data })),
    }),
    {
      name: 'flow-realm-storage',
      // Only persist data — not computed functions
      partialize: (s) => ({
        darkMode:       s.darkMode,
        gamify:         s.gamify,
        weekStartDay:   s.weekStartDay,
        activities:     s.activities,
        logs:           s.logs,
        tags:           s.tags,
        tasks:          s.tasks,
        customEmotions:  s.customEmotions,
        rewardMilestone: s.rewardMilestone,
        milestoneSeen:   s.milestoneSeen,
        checkIns:        s.checkIns,
        journalPrompts:  s.journalPrompts,
        journalEntries:  s.journalEntries,
        wellbeingNotes:  s.wellbeingNotes,
        notifications:        s.notifications,
        dailyDrafts:          s.dailyDrafts,
        dailyMessageDefaults: s.dailyMessageDefaults,
        library:              s.library,
        uiPrefs:              s.uiPrefs,
      }),
    }
  )
);
