# Recurring task behaviour

Recurrence is **date arithmetic** driven entirely by a task's `dueDate` +
`recurrence` (`none | daily | weekly | monthly`). No separate weekday/ordinal
state is stored.

- **daily** — `dueDate` + 1 day.
- **weekly** — `dueDate` + 7 days. Preserves weekday for free (7 days = one
  week), so "weekly on Monday" just means picking a Monday due date.
- **monthly** — same date each month, clamped to the target month's last valid
  day. End-of-month sticks to end-of-month: Oct 31 → Nov 30 → Dec 31 → Jan 31 →
  Feb 28/29. Mid-month dates (the 15th) are unaffected.

Completion is **forward-only**: each tap completes the current occurrence and
rolls `dueDate` to the next one (`advanceDue`), which is then treated as a fresh
task. There is no tap-to-undo — fix a mistap by editing the task's due date.
Recurring tasks never archive to the Completed list; they roll forward.

## NOT built: ordinal-weekday monthly ("3rd Tuesday")

Designed, deferred (YAGNI — no task needs it yet). When it's wanted:

1. Add recurrence value `monthly-weekday` (rides the existing `recurrence`
   column — no new synced field).
2. Add `shiftMonthlyWeekday(from, direction)` (~15 lines, same shape as the
   monthly clamp in `store/index.js` `shiftDate`). Derive the pattern from the
   current `dueDate`: ordinal = `Math.ceil(day / 7)`, weekday = `getDay()`. Find
   the Nth occurrence of that weekday in the target month.
3. Two clamps, mirroring the monthly-date logic:
   - 5th-weekday doesn't exist that month → fall back to the last one.
   - If the date is the *last* weekday-of-its-kind in its month, keep it "last"
     going forward.
4. UI: when Monthly is picked, a two-way toggle "On the 31st" vs "On the 3rd
   Tuesday", the second computed live from the chosen due date. No extra picker.

Everything else (`advanceDue` loop, sync, list sections) is untouched because it
all keys off `dueDate`.
