// ─────────────────────────────────────────────
// Shared UI primitives
// ─────────────────────────────────────────────

export function StatBar({ val, max, colorClass, label, t }) {
  const pct = Math.min(100, Math.round((val / max) * 100));
  return (
    <div className="flex items-center gap-2">
      <span className={`text-xs w-12 ${t.muted}`}>{label}</span>
      <div className={`flex-1 h-2 rounded-full ${t.progressBg}`}>
        <div className={`h-2 rounded-full transition-all duration-500 ${colorClass}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs ${t.muted} w-12 text-right`}>{val}/{max}</span>
    </div>
  );
}

export function XpBar({ xp, xpNext, t }) {
  const pct = Math.min(100, Math.round((xp / xpNext) * 100));
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className={`text-xs ${t.muted}`}>XP</span>
        <span className={`text-xs font-bold ${t.xp}`}>{xp.toLocaleString()} / {xpNext.toLocaleString()}</span>
      </div>
      <div className={`h-2.5 rounded-full ${t.progressBg} overflow-hidden`}>
        <div className={`h-2.5 rounded-full ${t.progress} transition-all duration-700`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function ProgressBar({ val, max, t, className = '' }) {
  const pct = Math.min(100, Math.round((val / max) * 100));
  return (
    <div className={`h-2 rounded-full ${t.progressBg} ${className}`}>
      <div className={`h-2 rounded-full ${t.progress} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Badge({ children, t }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${t.badge}`}>{children}</span>
  );
}

export function SectionToggle({ label, count, open, onToggle, accentClass, t }) {
  return (
    <button
      onClick={onToggle}
      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl mb-2 transition-all ${accentClass}`}
    >
      <div className="flex items-center gap-2">
        <span className={`text-xs font-bold uppercase tracking-wider ${t.text}`}>{label}</span>
        <Badge t={t}>{count}</Badge>
      </div>
      <span
        className={`text-xs ${t.muted} transition-transform duration-200 inline-block`}
        style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
      >▼</span>
    </button>
  );
}

export function Checkbox({ checked, onChange, size = 'md' }) {
  const s = size === 'sm' ? 'w-5 h-5' : 'w-6 h-6';
  return (
    <button
      onClick={onChange}
      className={`${s} rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all duration-200 ${
        checked ? 'border-violet-400 bg-violet-500' : 'border-slate-600'
      }`}
    >
      {checked && <span className="text-white text-xs">✓</span>}
    </button>
  );
}

export function SquareCheckbox({ checked, onChange }) {
  return (
    <button
      onClick={onChange}
      className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${
        checked ? 'border-violet-400 bg-violet-500' : 'border-slate-600'
      }`}
    >
      {checked && <span className="text-white" style={{ fontSize: '9px' }}>✓</span>}
    </button>
  );
}

export function PriorityDot({ priority }) {
  const colors = { high: 'bg-rose-500', med: 'bg-amber-400', low: 'bg-emerald-400' };
  return <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${colors[priority] || 'bg-slate-500'}`} />;
}

export function SubTabBar({ tabs, active, onSelect, t }) {
  return (
    <div className={`flex gap-1 p-1 rounded-xl ${t.progressBg} mb-4`}>
      {tabs.map(({ id, label }) => (
        <button
          key={id}
          onClick={() => onSelect(id)}
          className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${
            active === id ? t.accentBtn : t.muted
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
