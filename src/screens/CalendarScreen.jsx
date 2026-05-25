import { useState } from 'react';
import { useStore } from '../store';
import { toDateStr, todayStr, MONTH_NAMES_FULL } from '../data';

const INTENSITY_BG = [
  'bg-gray-100 text-gray-400',
  'bg-blue-100 text-blue-500',
  'bg-blue-300 text-blue-700',
  'bg-blue-500 text-white',
  'bg-blue-700 text-white',
];

export default function CalendarScreen() {
  const { activities, logs } = useStore();
  const now = new Date();
  const [viewYear,  setViewYear]  = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState(null);
  const todayDateStr = todayStr();

  function getDayIntensity(dateStr) {
    const active = activities.filter(a => (logs[a.id] || {})[dateStr] > 0).length;
    if (!active) return 0;
    const pct = active / activities.length;
    if (pct < 0.15) return 1;
    if (pct < 0.35) return 2;
    if (pct < 0.60) return 3;
    return 4;
  }

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }

  // Build grid: pad with nulls before day 1
  const firstDow = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const selectedDayActivities = selectedDay
    ? activities
        .map(a => ({ ...a, count: (logs[a.id] || {})[selectedDay] || 0 }))
        .filter(a => a.count > 0)
    : [];

  return (
    <div className="pb-4">
      {/* Month selector */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white text-gray-500 text-lg">‹</button>
        <h2 className="text-base font-bold text-gray-900">
          {MONTH_NAMES_FULL[viewMonth]} {viewYear}
        </h2>
        <button onClick={nextMonth} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white text-gray-500 text-lg">›</button>
      </div>

      {/* Day-of-week labels (Sun–Sat) */}
      <div className="grid grid-cols-7 mb-1">
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
          <div key={d} className="text-center text-xs text-gray-400 font-medium py-1">{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1 mb-4">
        {cells.map((day, i) => {
          if (!day) return <div key={`e-${i}`} />;
          const dateStr = toDateStr(new Date(viewYear, viewMonth, day));
          const intensity = getDayIntensity(dateStr);
          const isFuture   = dateStr > todayDateStr;
          const isToday    = dateStr === todayDateStr;
          const isSelected = dateStr === selectedDay;

          return (
            <button
              key={dateStr}
              onClick={() => !isFuture && setSelectedDay(isSelected ? null : dateStr)}
              disabled={isFuture}
              className={`aspect-square rounded-lg flex items-center justify-center text-xs font-semibold transition-all
                ${isFuture ? 'bg-gray-50 text-gray-300 cursor-default' : INTENSITY_BG[intensity]}
                ${isToday    ? 'ring-2 ring-blue-500 ring-offset-1' : ''}
                ${isSelected ? 'ring-2 ring-violet-500 ring-offset-1' : ''}
              `}
            >
              {day}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-1.5 mb-4">
        <span className="text-xs text-gray-400 mr-1">Less</span>
        {INTENSITY_BG.map((cls, i) => (
          <div key={i} className={`w-4 h-4 rounded ${cls.split(' ')[0]}`} />
        ))}
        <span className="text-xs text-gray-400 ml-1">More</span>
      </div>

      {/* Selected day breakdown */}
      {selectedDay && (
        <div className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm">
          <p className="text-sm font-bold text-gray-800 mb-2">
            {new Date(selectedDay + 'T00:00:00').toLocaleDateString('en-AU', {
              weekday: 'long', day: 'numeric', month: 'long',
            })}
          </p>
          {selectedDayActivities.length === 0 ? (
            <p className="text-xs text-gray-400 italic">Nothing logged this day</p>
          ) : (
            <div className="space-y-1.5">
              {selectedDayActivities.map(a => (
                <div key={a.id} className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">{a.emoji} {a.name}</span>
                  <span className="text-sm font-bold text-blue-600 tabular-nums">{a.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
