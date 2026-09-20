import React from 'react';

export default function MetricCard({
  title,
  value,
  unit,
  subtitle,
  icon: Icon,
  colorScheme = 'amber',
  badgeText,
  pulse = false,
}) {
  const themes = {
    amber: {
      border: 'border-amber-500/30',
      bg: 'bg-slate-900/90 hover:border-amber-500/50',
      iconBg: 'bg-amber-500/10 text-amber-400',
      valueColor: 'text-amber-400',
      badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    },
    emerald: {
      border: 'border-emerald-500/30',
      bg: 'bg-slate-900/90 hover:border-emerald-500/50',
      iconBg: 'bg-emerald-500/10 text-emerald-400',
      valueColor: 'text-emerald-400',
      badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    },
    cyan: {
      border: 'border-cyan-500/30',
      bg: 'bg-slate-900/90 hover:border-cyan-500/50',
      iconBg: 'bg-cyan-500/10 text-cyan-400',
      valueColor: 'text-cyan-400',
      badge: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
    },
    purple: {
      border: 'border-purple-500/30',
      bg: 'bg-slate-900/90 hover:border-purple-500/50',
      iconBg: 'bg-purple-500/10 text-purple-400',
      valueColor: 'text-purple-400',
      badge: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
    },
    rose: {
      border: 'border-rose-500/30',
      bg: 'bg-slate-900/90 hover:border-rose-500/50',
      iconBg: 'bg-rose-500/10 text-rose-400',
      valueColor: 'text-rose-400',
      badge: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    },
  };

  const currentTheme = themes[colorScheme] || themes.amber;

  return (
    <div
      className={`relative p-5 rounded-2xl border ${currentTheme.border} ${currentTheme.bg} transition-all duration-300 shadow-lg backdrop-blur-md group`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            {title}
          </p>
          <div className="mt-2 flex items-baseline space-x-1.5">
            <span className={`text-3xl font-extrabold tracking-tight ${currentTheme.valueColor}`}>
              {value}
            </span>
            {unit && <span className="text-sm font-bold text-slate-400">{unit}</span>}
          </div>
        </div>

        {Icon && (
          <div
            className={`p-3 rounded-xl ${currentTheme.iconBg} transition-transform duration-300 group-hover:scale-110 ${
              pulse ? 'animate-pulse' : ''
            }`}
          >
            <Icon className="w-6 h-6" />
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between pt-3 border-t border-slate-800/80">
        <span className="text-xs font-medium text-slate-400">{subtitle}</span>
        {badgeText && (
          <span
            className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${currentTheme.badge}`}
          >
            {badgeText}
          </span>
        )}
      </div>
    </div>
  );
}
