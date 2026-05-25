import { useState } from 'react';
import { useStore } from '../store';
import {
  todayStr, getWeekStart, getWeekDays, getMonthWeeks,
  MONTH_NAMES, MONTH_NAMES_FULL, DAY_LABELS, toDateStr,
} from '../data';

function exportCSV(filename, rows) {
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function StatsScreen() {
  const [period, setPeriod] = useState('week');
  const { activities, logs } = useStore();

  const today     = todayStr();
  const todayDate = new Date(today + 'T00:00:00');
  const weekStart = getWeekStart(today);
  const weekDays  = getWeekDays(weekStart);

  function getCount(actId, dateStr) {
    return (logs[actId] || {})[dateStr] || 0;
  }
  function getTotal(actId, dates) {
    return dates.reduce((s, d) => s + getCount(actId, d), 0);
  }

  // ── WEEK VIEW ──────────────────────────────────────────────────────
  function WeekView() {
    return (
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-xs min-w-[300px]">
          <thead>
            <tr>
              <th className="text-left text-gray-500 font-semibold py-2 pr-2 sticky left-0 bg-white min-w-[95px]">Activity</th>
              {DAY_LABELS.map((d, i) => {
                const isToday = weekDays[i] === today;
                return (
                  <th key={d} className={`text-center font-semibold py-2 px-1 min-w-[30px] ${isToday ? 'text-blue-600' : 'text-gray-400'}`}>
                    <div>{d}</div>
                    <div className="font-normal text-gray-300">
                      {new Date(weekDays[i] + 'T00:00:00').getDate()}
                    </div>
                  </th>
                );
              })}
              <th className="text-center text-blue-600 font-bold py-2 px-1 min-w-[36px]">Total</th>
            </tr>
          </thead>
          <tbody>
            {activities.map(a => {
              const dayCounts = weekDays.map(d => getCount(a.id, d));
              const total     = dayCounts.reduce((s, v) => s + v, 0);
              const hit       = total >= a.weeklyTarget;
              return (
                <tr key={a.id} className="border-t border-gray-50">
                  <td className="py-2 pr-2 text-gray-700 font-medium sticky left-0 bg-white leading-tight">{a.name}</td>
                  {dayCounts.map((c, i) => (
                    <td key={i} className="text-center py-2 px-1">
                      <span className={c > 0 ? 'text-blue-600 font-bold' : 'text-gray-200'}>{c || '–'}</span>
                    </td>
                  ))}
                  <td className={`text-center py-2 px-1 font-bold ${hit ? 'text-green-600' : total > 0 ? 'text-gray-700' : 'text-gray-200'}`}>
                    {total || '–'}{hit ? ' ✓' : ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  // ── MONTH VIEW ──────────────────────────────────────────────────────
  const [mDate, setMDate] = useState({ year: todayDate.getFullYear(), month: todayDate.getMonth() });

  function MonthView() {
    const weeks = getMonthWeeks(mDate.year, mDate.month);
    return (
      <div>
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setMDate(v => { const d = new Date(v.year, v.month - 1, 1); return { year: d.getFullYear(), month: d.getMonth() }; })}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500"
          >‹</button>
          <span className="text-sm font-bold text-gray-800">{MONTH_NAMES_FULL[mDate.month]} {mDate.year}</span>
          <button
            onClick={() => setMDate(v => { const d = new Date(v.year, v.month + 1, 1); return { year: d.getFullYear(), month: d.getMonth() }; })}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500"
          >›</button>
        </div>
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-xs min-w-[300px]">
            <thead>
              <tr>
                <th className="text-left text-gray-500 font-semibold py-2 pr-2 sticky left-0 bg-white min-w-[95px]">Activity</th>
                {weeks.map(w => {
                  const s = new Date(w.start + 'T00:00:00');
                  const e = new Date(w.end   + 'T00:00:00');
                  return (
                    <th key={w.start} className="text-center text-gray-400 font-semibold py-2 px-1 min-w-[44px]">
                      {s.getDate()}–{e.getDate()}
                    </th>
                  );
                })}
                <th className="text-center text-blue-600 font-bold py-2 px-1 min-w-[36px]">Total</th>
              </tr>
            </thead>
            <tbody>
              {activities.map(a => {
                const wTotals    = weeks.map(w => getTotal(a.id, w.days));
                const monthTotal = wTotals.reduce((s, v) => s + v, 0);
                return (
                  <tr key={a.id} className="border-t border-gray-50">
                    <td className="py-2 pr-2 text-gray-700 font-medium sticky left-0 bg-white leading-tight">{a.name}</td>
                    {wTotals.map((wt, i) => (
                      <td key={i} className="text-center py-2 px-1">
                        <span className={wt > 0 ? 'text-blue-600 font-bold' : 'text-gray-200'}>{wt || '–'}</span>
                      </td>
                    ))}
                    <td className={`text-center py-2 px-1 font-bold ${monthTotal > 0 ? 'text-gray-800' : 'text-gray-200'}`}>
                      {monthTotal || '–'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ── YEAR VIEW ──────────────────────────────────────────────────────
  const [viewYear, setViewYear] = useState(todayDate.getFullYear());

  function YearView() {
    function monthTotal(actId, m) {
      const days = new Date(viewYear, m + 1, 0).getDate();
      let total = 0;
      for (let d = 1; d <= days; d++) {
        total += getCount(actId, `${viewYear}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`);
      }
      return total;
    }
    return (
      <div>
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => setViewYear(v => v - 1)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500">‹</button>
          <span className="text-sm font-bold text-gray-800">{viewYear}</span>
          <button onClick={() => setViewYear(v => v + 1)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500">›</button>
        </div>
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-xs min-w-[340px]">
            <thead>
              <tr>
                <th className="text-left text-gray-500 font-semibold py-2 pr-1 sticky left-0 bg-white min-w-[80px]">Activity</th>
                {MONTH_NAMES.map(m => (
                  <th key={m} className="text-center text-gray-400 font-semibold py-2 px-0.5 min-w-[22px]">{m[0]}</th>
                ))}
                <th className="text-center text-blue-600 font-bold py-2 px-1 min-w-[32px]">YTD</th>
              </tr>
            </thead>
            <tbody>
              {activities.map(a => {
                const months = Array.from({ length: 12 }, (_, m) => monthTotal(a.id, m));
                const ytd    = months.reduce((s, v) => s + v, 0);
                return (
                  <tr key={a.id} className="border-t border-gray-50">
                    <td className="py-1.5 pr-1 text-gray-700 font-medium sticky left-0 bg-white leading-tight">{a.name}</td>
                    {months.map((mt, i) => (
                      <td key={i} className="text-center py-1.5 px-0.5">
                        <span className={mt > 0 ? 'text-blue-600 font-bold' : 'text-gray-200'}>{mt || '–'}</span>
                      </td>
                    ))}
                    <td className={`text-center py-1.5 px-1 font-bold ${ytd > 0 ? 'text-gray-800' : 'text-gray-200'}`}>
                      {ytd || '–'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ── EXPORT ──────────────────────────────────────────────────────────
  function handleExport() {
    if (period === 'week') {
      const dateRow  = ['Date',     ...weekDays.map(d => new Date(d+'T00:00:00').toLocaleDateString('en-AU')), ''];
      const labelRow = ['Activity', ...DAY_LABELS, 'TOTAL'];
      const rows     = [labelRow, dateRow];
      activities.forEach(a => {
        const counts = weekDays.map(d => getCount(a.id, d));
        rows.push([a.name, ...counts, counts.reduce((s,v)=>s+v,0)]);
      });
      exportCSV(`flow-week-${weekStart}.csv`, rows);
    } else {
      const weeks    = getMonthWeeks(mDate.year, mDate.month);
      const wLabels  = weeks.map(w => {
        const s = new Date(w.start+'T00:00:00'), e = new Date(w.end+'T00:00:00');
        return `${s.getDate()}-${e.getDate()} ${MONTH_NAMES[s.getMonth()]}`;
      });
      const rows = [['Activity', ...wLabels, 'MONTHLY TOTALS']];
      activities.forEach(a => {
        const wTotals = weeks.map(w => getTotal(a.id, w.days));
        rows.push([a.name, ...wTotals, wTotals.reduce((s,v)=>s+v,0)]);
      });
      exportCSV(`flow-${mDate.year}-${String(mDate.month+1).padStart(2,'0')}.csv`, rows);
    }
  }

  return (
    <div className="pb-4">
      {/* Period tabs */}
      <div className="flex gap-1 bg-gray-200 p-1 rounded-xl mb-4">
        {[['week','This Week'],['month','This Month'],['year','This Year']].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setPeriod(id)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              period === id ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 mb-3">
        {period === 'week'  && <WeekView  />}
        {period === 'month' && <MonthView />}
        {period === 'year'  && <YearView  />}
      </div>

      {/* Export */}
      {period !== 'year' && (
        <button
          onClick={handleExport}
          className="w-full py-3 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 active:scale-[0.98] transition-all shadow-sm"
        >
          ↓ Export {period === 'week' ? 'Week' : 'Month'} CSV
        </button>
      )}
    </div>
  );
}
