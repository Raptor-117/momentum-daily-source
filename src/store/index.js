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

      // Recurring tasks: check effective completion state based on recurrence period
      toggleTask: (id) => set((s) => {
        const today = new Date().toISOString().slice(0, 10);
        return {
          tasks: s.tasks.map(t => {
            if (t.id !== id) return t;
            // Non-recurring: simple toggle
            if (!t.recurrence || t.recurrence === 'none') {
              const nc = !t.completed;
              return { ...t, completed: nc, completedDate: nc ? today : null };
            }
            // Recurring: determine if currently effective for this period
            const lc = t.lastCompleted;
            let effective = false;
            if (t.completed && lc) {
              if      (t.recurrence === 'daily')   effective = lc === today;
              else if (t.recurrence === 'weekly')  effective = Math.floor((new Date(today+'T00:00:00')-new Date(lc+'T00:00:00'))/86400000) < 7;
              else if (t.recurrence === 'monthly') effective = lc.slice(0,7) === today.slice(0,7);
            }
            // Toggle: complete for this period, or uncomplete
            const ne = !effective;
            return { ...t, completed: ne, completedDate: ne ? today : null, lastCompleted: ne ? today : null };
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
        enabled: false, count: 5, reward: '',
        // Weekly per-habit targets
        weeklyEnabled: false, weeklyHabits: [], weeklyReward: '',
        // Streak
        streakMilestones: [], streakMilestonesEnabled: false,
      },

      setRewardMilestone: (updates) => set((s) => ({
        rewardMilestone: { ...s.rewardMilestone, ...updates },
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
        checkIns:        s.checkIns,
        journalPrompts:  s.journalPrompts,
        journalEntries:  s.journalEntries,
        wellbeingNotes:  s.wellbeingNotes,
        notifications:        s.notifications,
        dailyDrafts:          s.dailyDrafts,
        dailyMessageDefaults: s.dailyMessageDefaults,
        library:              s.library,
      }),
    }
  )
);
