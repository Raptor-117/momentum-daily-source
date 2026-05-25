# Realm — RPG Habit Tracker (Prototype)

A habit tracker + RPG app. Think Finch × Habitica × SuperBetter.

## Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:5173 — you should see the phone mockup.

## What's in here

```
src/
├── data/
│   ├── index.js       ← All static data, mock data, XP formulas
│   └── theme.js       ← All visual tokens for RPG / Focus modes
├── store/
│   └── index.js       ← Zustand store — all app state lives here
├── components/
│   └── UI.jsx         ← Shared primitives (bars, badges, checkboxes)
├── screens/
│   ├── HomeScreen.jsx  ← Daily habits + collapsible task groups
│   ├── ClassScreen.jsx ← Class picker + universal skill tree
│   ├── EventsScreen.jsx← Daily/weekly/class/seasonal events
│   └── MoodScreen.jsx  ← Emotion check-in, journal, party feed
└── App.jsx             ← Shell, nav, mode toggle, Iron Will panel
```

## Key design decisions to know

**Dual mode:** RPG Mode and Focus Mode are the same data, different skin.
Switching never loses state. All labels, colours, and XP indicators
swap — components read from `t.*` (theme tokens), never hardcode.

**Iron Will:** Boolean on the user object. When true:
- All XP × 1.5
- Streaks reset if no habit logged before midnight (needs a cron job in prod)
- HP damage on missed dailies (also cron)
- Badge shown on profile to party members

**Skill tree:** Two universal paths (Habit Focused / Quest Focused) for every class.
Tiers 1–3 are identical across all classes. Tier 4 is class-flavoured.
Unlocking costs gold. `unlockedSkills` in the store tracks what's been bought.

**Close Circle:** Hard capped at 5 friends. Enforced in `toggleCloseCircle()`.
Three sharing targets: `private` | `close_circle` | `party`.

**XP formula:** `xpForLevel(n) = 1000 × n^1.5` — gentle early curve, steeper later.
Iron Will multiplier is `× 1.5` applied in `addXp()`.

## What's mocked / placeholder

- All data comes from `src/data/index.js` (MOCK_* constants)
- No persistence — state resets on page refresh
- Pet screen not yet built (data model is in the handoff doc)
- Quest screen not yet built
- No auth

## Milestone roadmap

1. ✅ **Static prototype** — this is it, run it and click around
2. **Local persistence** — swap Zustand state for Zustand + localStorage
3. **Supabase** — auth, database, replace MOCK_* with real queries
4. **Party features** — Supabase Realtime for live party updates
5. **Game loop** — wire skill bonuses into XP calculations, Iron Will cron
6. **React Native port** — Expo, reuse all store/data logic

## Recommended stack (when ready to go beyond prototype)

| Layer | Pick |
|---|---|
| Mobile | React Native + Expo |
| State | Zustand (already here) |
| Backend | Supabase |
| Push notifications | Expo Notifications |
| Animations | Reanimated 2 |

See `REALM-dev-handoff.md` for the full data model.
