// ─────────────────────────────────────────────
// WHAT'S NEW (Settings › What's new)
// ─────────────────────────────────────────────
// One entry per prod release, newest first. Plain words about what a user
// would notice — no technical detail. Add an entry with every merge to prod.
export const CHANGELOG = [
  {
    date: '2026-11-12',
    title: "What's new",
    items: [
      "Settings › What's new shows what changed in each update.",
    ],
  },
  {
    date: '2026-10-28',
    title: 'New Tracker',
    items: [
      'Calendar and Stats are now one Tracker page. Days are coloured by how well you did: Excellent, Good, Average or Needs Improvement.',
      'Week, month and year score cards, with ▲/▼ against last week and last month, plus a breakdown by tag.',
      'Habits can be daily, weekly, monthly or log-only, shown as a tag on each card. Habits in your daily message get a purple edge.',
      'Settings › Tracker: set your goal % and read how scoring works.',
      'Fixed: book notes could revert to an older version, and reordering habits could delete archived ones.',
      'Fixed: the Default screen setting now sticks.',
    ],
  },
  {
    date: '2026-10-25',
    title: 'Saving and dark mode',
    items: [
      'Fixed: the Push button could quietly skip saving to the cloud.',
      "Android's bottom button bar now matches dark or light mode.",
    ],
  },
  {
    date: '2026-10-02',
    title: 'Lighter syncing',
    items: [
      'The app now syncs when you open it instead of every minute, using far less data.',
    ],
  },
  {
    date: '2026-10-01',
    title: 'Recurring tasks',
    items: [
      'Ticking off a recurring task moves it straight to its next date, with no more jumping back and forth.',
      'Monthly tasks on the 29th–31st land on the last day of shorter months.',
    ],
  },
];
