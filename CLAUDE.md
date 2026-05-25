# Momentum Daily — CLAUDE.md

## What this is
A personal habit tracking PWA built with React + Vite + Tailwind CSS + Zustand. Brandon uses it daily to track habits, journal, log emotions, manage tasks, and build accountability for his network marketing business.

## Stack
- **React 18** + **Vite** — no React Router (tab state via useState in App.jsx)
- **Tailwind CSS** — utility classes only, no custom CSS files
- **Zustand** with `persist` middleware — all state lives in `src/store/index.js`, persisted to localStorage under key `'flow-realm-storage'`
- **@dnd-kit** — drag-and-drop for habits and journal prompts
- **docx** (npm) — client-side Word doc export in the Library tab

## Key files
```
src/
  App.jsx               # Root: tab nav, notification scheduler
  store/index.js        # ALL app state — read this before touching data
  data/index.js         # Constants (DEFAULT_ACTIVITIES, DEFAULT_TAGS), date helpers, calcStreak, calcPerfectDayStreak
  data/theme.js         # Light/dark theme token maps (theme.text, theme.card, etc.)
  screens/
    HabitsScreen.jsx    # Habit logging, edit mode, drag reorder, reward milestones
    TasksScreen.jsx     # Task CRUD, recurrence, tag filtering
    CalendarStatsScreen.jsx  # Monthly heatmap, day detail, stats tabs, CSV export
    WellbeingScreen.jsx # Inner-World (check-in + journal), Notes, Daily Message, Library
    SettingsScreen.jsx  # Dark mode, quest mode, tags, reminders, data import/export
public/
  sw.js                 # Service worker — bump cache version on every deploy
  manifest.json         # PWA manifest
```

## Screens / nav tabs
| Tab ID | Label (normal / quest) | Screen |
|--------|------------------------|--------|
| habits | Habits / Quests | HabitsScreen |
| tasks | Tasks / Contracts | TasksScreen |
| tracker | Tracker | CalendarStatsScreen |
| wellbeing | Sanctum / Tavern | WellbeingScreen |
| settings | Settings | SettingsScreen |

## Quest mode
Toggle in Settings. Changes labels throughout the app:
- Habits → Quests, Tasks → Contracts, Sanctum → Tavern
- Check-In → Report, Journal → The Tome, Inner-World → Inner Realm
- App header: MOMENTUM DAILY → ⚔️ MOMENTUM QUEST ⚔️

## Store shape (src/store/index.js)
Key slices — read the file for full detail:
- `activities[]` — habits with emoji, weeklyTarget, tags, scheduledDays, accountability, createdAt, archived
- `logs{}` — `{ [activityId]: { [dateStr]: count } }`
- `tasks[]` — with recurrence, completedDate, tags, complexity
- `checkIns{}` — `{ [dateStr]: { emotions: string[], notes: string } }`
- `customEmotions[]` — user-added emotions `{ id, label, emoji }`
- `journalPrompts[]` + `journalEntries{}` — prompts and per-date answers
- `wellbeingNotes{}` — free-text notes per date
- `library[]` — book entries `{ id, title, author, status, notes, dateStarted, dateCompleted }`
- `rewardMilestone{}` — daily count, weekly per-habit targets, streak milestones
- `notifications[]` — scheduled browser notifications
- `tags[]` — shared between tasks and activities
- `darkMode`, `gamify`, `weekStartDay`

## Conventions
- **Date strings**: always `YYYY-MM-DD` via `toDateStr()` / `todayStr()` from `src/data/index.js`
- **Week start**: Saturday by default (`weekStartDay: 6`), configurable
- **Theme tokens**: always use `theme.text`, `theme.card`, `theme.muted` etc. — never hardcode colours
- **Edit/Delete buttons**: `bg-blue-100 text-blue-600` for Edit, `bg-red-100 text-red-500` for Del (pill style, `text-xs px-2 py-1 rounded-lg font-semibold`)
- **Auto-save**: Library notes debounce 700ms; Journal answers save on every keystroke; Notes tab saves on every keystroke
- **Service worker**: cache name is in `public/sw.js` — bump it (`momentum-vN`) on every deploy so browsers pick up the new build

## Build & deploy
```bash
npm install          # first time only
npm run dev          # local dev server at localhost:5173
npm run build        # outputs to dist/
```
Deploy by pushing to the `main` branch — Cloudflare Pages auto-builds and deploys.

## Activities (DEFAULT_ACTIVITIES in src/data/index.js)
14 default habits across 4 categories: Learning, Health, Relationship, Business Building.
Custom habits can be added via the UI. `hasTarget: false` habits log occurrences only (no weekly goal bar). `accountability: true` habits appear in the Daily Message tab.

## Tracker heatmap
Colour intensity (0–4) based on % of *eligible* habits completed. Eligible = not archived AND `createdAt <= dateStr` (so newly added habits don't retroactively degrade old days). Perfect day = all `hasTarget` eligible habits logged.

## Reward milestones
Three types in `rewardMilestone` store slice:
1. **Daily**: fires when X distinct habits logged today
2. **Weekly**: fires when all selected habits hit their weekly targets (user picks which habits)
3. **Streak**: array of `{ id, days, reward }` — fires when `calcPerfectDayStreak()` hits the day count
