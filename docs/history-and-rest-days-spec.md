# Spec — Historical accuracy + rest-day-aware scoring

Status: **design, not yet built.** Captures the decisions so scoring can be made
correct and history kept frozen when this is implemented.

## The two problems

1. **Retroactive re-scoring.** The calendar %, "perfect day", and streaks are
   recomputed from the *current* habit config. So editing a habit's target,
   or archiving/deleting one, silently rewrites past months. The user does NOT
   want this — targets and habit sets legitimately change over time and history
   must stay frozen.
2. **"Every habit vs every day".** `getIntensity` counts a day as
   `logged ÷ all-eligible-habits`, ignoring weekly targets and scheduled days.
   So a 1×/week or Mon/Wed/Fri habit counts *against* every day it wasn't done,
   making the top shade unreachable even on a genuinely complete day.

## Principle: logs are immutable truth

The raw logs (per-habit, per-day counts) are **facts** and must never be
rewritten by a config edit. Editing name/emoji/target/schedule, or **adding** a
habit, must not touch them. Only a **hard Delete** removes logs — so Delete is
"erase this, including its history"; **Archive** is "retire it, keep history".
Warn before deleting a habit that has logs.

Everything below changes only how *derived views* are computed — never the logs.

## Data model additions

1. `createdAt` (exists) — a habit is only counted on days `>= createdAt`.
   Handles **additions** correctly (new habits never affect the past).
2. `archivedAt` (**new**, nullable date) — a habit is only counted on days
   `<= archivedAt`. Archiving retires a habit **without** erasing its past days.
   (Today, `archived` is a boolean that removes the habit from *all* days — that
   is the retroactive bug. Replace the effect with a date bound.)
3. **Config history** (**new**) — append-only per-habit records of the fields
   that affect scoring, written only when they change:
   `{ effectiveFrom: 'YYYY-MM-DD', weeklyTarget, hasTarget, scheduledDays }`.
   For any date D, use the record whose `effectiveFrom` is the latest `<= D`.
   Storage is cheap (only edits, not per-day). Backfill: every existing habit
   gets one record `effectiveFrom = createdAt` with its current values.

With (1)+(2)+(3), every past day is scored against **the habits that existed and
the settings that were in effect on that day** — history is frozen and honest.

## Scoring (rest-day aware), reading the effective config for each date

- **Due(habit, D):** habit exists on D (`createdAt <= D <= archivedAt ?? ∞`)
  AND, per the effective config on D:
  - if it has `scheduledDays`: D's weekday is in `scheduledDays`;
  - else if `hasTarget` with a weekly target: it's judged **weekly** (see below),
    not per-day;
  - else (no target): always eligible when it exists.
- **Calendar day %** = `logged-that-day ÷ habits-DUE-that-day`. Rest/off days are
  excluded from the denominator, so a day you did everything scheduled = green.
- **Perfect day** = every due habit on D was logged.
- **Streak** = consecutive *scheduled occurrences* done, **skipping** non-scheduled
  days (a rest day does not break the streak). Optional "comeback" grace after a
  gap (see HabitKit / CheckMate references).

### Weekly-target habits
For habits tracked as X×/week rather than fixed days, "due" is a **weekly**
notion. Options: (a) contribute to a weekly score and, on the daily calendar,
mark the week's days neutral once the target is met; or (b) exclude them from the
daily % and show them only in the weekly view. Decide during build; (a) is more
intuitive. Note the app already has "consecutive weeks hitting target" logic in
Reward Milestones to build on.

## Historical import caveat (why old daily colours can't be perfect)

The 2022 → 2026-Q1 logs were imported from weekly spreadsheets as **weekly totals
placed on each week's Saturday** — the day-by-day breakdown was never recorded.
Therefore:
- The **daily calendar cannot be accurate** for those years (it shows Saturday
  lumps). This is a data-granularity limit, not a bug, and is not recoverable.
- The **weekly and monthly stats ARE accurate** for those years.
- Recommendation: make the daily calendar authoritative only from the app's
  first real daily-logging date; present pre-app years via weekly/monthly stats,
  and optionally badge/greyscale the daily calendar before that date so it isn't
  read as "you missed all those days".

## Touch points when implementing

- `data/index.js`: `calcStreak`, `calcPerfectDayStreak` — read Due() + skip rest days.
- `CalendarStatsScreen.jsx`: `eligibleActivities`, `getIntensity`, `isPerfectDay`
  — denominator becomes "due that day" via the effective config; respect `archivedAt`.
- `store` + `sync` + schema: add `archivedAt`; add config-history (own table keyed
  `(user_id, activity_id)` or JSONB array on the activity); write a record on each
  target/schedule edit; backfill one record per existing habit.
- Habit editor: on Delete of a habit with logs, warn/confirm; prefer Archive.
