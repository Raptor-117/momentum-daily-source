# Momentum Daily

A personal habit tracking PWA built for daily accountability, journalling, and business building.

## Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Build & Deploy

```bash
npm run build   # outputs to dist/
```

Push to `main` — Cloudflare Pages auto-builds and deploys.

## Stack

- React 18 + Vite
- Tailwind CSS
- Zustand (persisted to localStorage)
- @dnd-kit (drag-and-drop)
- PWA with service worker

## Screens

| Tab | Description |
|-----|-------------|
| Habits | Log daily habits, weekly targets, streaks, reward milestones |
| Tasks | Task management with recurrence, tags, complexity |
| Tracker | Monthly heatmap, day breakdown, stats, CSV export |
| Sanctum | Inner-World (check-in + journal), Notes, Daily Message, Library |
| Settings | Dark mode, Quest mode, tags, reminders, data import/export |

## Quest Mode

Toggle in Settings to switch the app into a gamified theme — Habits become Quests, Tasks become Contracts, Sanctum becomes Tavern, and the header shows ⚔️ MOMENTUM QUEST ⚔️.

## Key Files

```
src/
  App.jsx                     # Root shell, tab nav, notification scheduler
  store/index.js              # All app state (read this first)
  data/index.js               # Constants, date helpers, streak calculators
  data/theme.js               # Light/dark theme tokens
  screens/
    HabitsScreen.jsx          # Habit logging, edit mode, reward milestones
    TasksScreen.jsx           # Task CRUD, recurrence, filtering
    CalendarStatsScreen.jsx   # Heatmap, stats, CSV export
    WellbeingScreen.jsx       # Inner-World, Notes, Daily Message, Library
    SettingsScreen.jsx        # All settings and data management
public/
  sw.js                       # Service worker — bump version on each deploy
  manifest.json               # PWA manifest
```
