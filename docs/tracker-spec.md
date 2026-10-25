# Spec — Tracker redesign (cadence + planner scoring)

Status: **design, awaiting sign-off. Nothing built.**
Builds on [`history-and-rest-days-spec.md`](history-and-rest-days-spec.md), which
still owns: immutable logs, `archivedAt`, config history (frozen scoring), and the
imported-history caveat. Where the two differ, this doc wins.

Scoring model is adapted from the user's paper planner ("Track & Reflect",
"Scoring Matrix", "Monthly Reflection" pages).

## 1. Cadence per habit

Every habit gets a `cadence`. The target number is read **in that cadence's unit**.

| Cadence | Target means | Colours the daily calendar? | Scored in | Streak unit |
|---|---|---|---|---|
| `daily` | reps **per day** (default 1) | **Yes** — the only thing that does | day, week, month | days |
| `weekly` | reps **per week**, any days | No — activity dot only | week, month | weeks |
| `monthly` | reps **per month** | No — activity dot only | month only | months |
| `log` | none | No — activity dot only | never | none |

- **Daily + scheduled weekdays** (optional, dormant): a daily habit with
  `scheduledDays` set is only due on those days; other days are rest days (excluded
  from scoring, don't break streaks). No current habit uses this.
- Weekly/monthly habits ignore `scheduledDays`.
- Every log still records **which day** it happened, for every cadence.
- **Monthly** is kept in the model although no habit uses it today: the planner
  scoring needs month totals anyway, so the extra cost is the cadence option and a
  row in the month view.
- **One-off month goals ("finish book") are out of scope** — those are Tasks.

### Current classification (backfill)

From the user's annotated list (2026-09). Daily targets become **1 per day**.

- **Daily (8):** Audios, Read (was 5/week → now every day), Affirmations, Send Daily
  Accountability Message, Meditation, Gratitude, Journal, Respond to Messages
- **Weekly (14):** Exercise 4, Date Night 1, Relationship Check-In 1, Conversations
  30, Contact 10, New Catch Up 2, Existing Catch Up 2, Events 1, Online MPA 3,
  In-Person MPA 7, Soft DTM 2, DTM 2, Prefilter 2, Meet & Greet 1
- **Monthly (0)**
- **Log (2):** Launches (Personal), Launches (Team)

Other users' habits are defaulted: `has_target = false` → `log`; target 7 → `daily`
at 1/day; anything else → `weekly`. They fix any mistakes in the editor.

## 2. Scoring (planner model)

**Principle: 1 habit = 1 point per scoring period, partial credit, capped at 1.**
(The planner's "1 tick = 1 point"; partial credit so a 29-of-30-day month isn't 0.)

A habit's credit for a period = `min(done ÷ expected, 1)`:

| Period | daily habit | weekly habit | monthly habit |
|---|---|---|---|
| **Day** | `min(count ÷ perDay, 1)` | — | — |
| **Week** | days hit ÷ days due that week | `min(weekTotal ÷ target, 1)` | — |
| **Month** | days hit ÷ days due that month | `min(monthTotal ÷ (target × daysInMonth ÷ 7), 1)` | `min(monthTotal ÷ target, 1)` |

- Weekly habits in a month are **pro-rated** (30/week in a 31-day month expects
  ~133), so weeks split across months need no special rule.
- "Days due" respects `createdAt`/`archivedAt` and `scheduledDays`.
- `log` habits are never scored.

**Period score** = sum of credits ÷ number of scored habits → a %.

**Example week:** Audios 6/7 days → 0.86 · Exercise 3/4 → 0.75 · Conversations 34/30
→ 1.0 · Date Night 0/1 → 0 → **2.61 / 4 = 65% (Good)**.

### Bands (planner Scoring Matrix)

| % | Band |
|---|---|
| 85–100 | Excellent |
| 65–84 | Good |
| 45–64 | Average |
| < 45 | Needs Improvement |

Used for the calendar day colour **and** the week/month scores. A **goal %**
setting (default **70%**, per the planner example) shows hit/missed against it.

### Categories = tags

Category score = credits of habits with that tag ÷ count of them, e.g.
**"Learning 2.6 / 3 (87%)"**. A habit with two tags counts in **both** categories;
the overall total counts each habit **once**.

## 3. Tracker page (Calendar + Stats merged)

1. **Daily calendar** — each day coloured by the **band** of its day score (daily
   habits only). Activity dots show when *any* habit was logged, so weekly/monthly
   work is visible by day. Rest days / days with nothing due are neutral.
2. **Week score** — selected week: total %, band, vs goal; per-habit progress
   (`3/4`, `24/30`, `6/7 days`); category breakdown.
3. **Month score** — same for the month, laid out like the planner's Monthly
   Reflection (category lines → total → %).

Habits screen labels follow cadence: daily shows today (`✓` / `0/1`) and
`6/7 days this week`; weekly keeps `3/4 this week`; monthly `1/2 this month`.

## 4. History

- Config history (see history spec) records `{ effectiveFrom, cadence, target,
  scheduledDays }`; backfill one record per habit at `createdAt` with the **new**
  classification, so all history is scored under one consistent model.
- **Imported years (2022 → 2026-Q1)** are weekly totals on Saturdays. Before the
  in-app daily-logging start date, a daily habit's week/month credit uses the
  total as days (`min(weekTotal ÷ 7, 1)`), and the daily calendar is shown greyed as
  "weekly data only". Week/month scores stay accurate for those years.

## 5. Data / sync changes

- `activities.cadence text not null default 'weekly'` (`daily|weekly|monthly|log`).
- Keep `weekly_target` as the target column, **reinterpreted per cadence**.
  ponytail: misleading column name; rename to `target` only if it confuses someone.
- `activities.archived_at date null`; `activities.config_history jsonb` (on the row,
  so it rides the existing activity sync — no new table/sync path).
- `goal_percent int default 70` on `user_preferences`.
- Older cached app versions don't send `cadence`; PostgREST upsert only updates
  columns present, so they can't wipe it.

## 6. Build phases

1. **Data + editor** — schema, sync, backfill; cadence picker; target labelled per
   cadence; weekdays only for daily; Archive sets `archivedAt`; warn on Delete.
2. **Scoring engine** — pure functions (`data/scoring.js`) with a runnable
   self-check: day/week/month credit, categories, bands, streaks, import cutover.
3. **Tracker page** — calendar bands + dots, week and month score sections,
   goal %, Habits-screen labels.

Each phase ships to dev for testing before prod.

## Decisions

1. **Partial credit** (decided 2026-10-25). Strict ticks (1 only at 100%) rejected.
2. **Tasks are separate** (decided 2026-10-25) — they don't count toward the
   calendar or any score.
3. **In-app daily-logging start date** — "around April 2026" per user; confirming
   from the logs (first month with non-Saturday logs) before Phase 2.

## Sequencing

Tracker first, then per-item ("only what changed") sync — see the queued sync
work; the new activity fields get built into the new sync from the start.
