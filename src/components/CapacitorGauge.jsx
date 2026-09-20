import React from 'react';
import { Battery, BatteryCharging, Zap, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { calculateEnergyMetrics } from '../utils/lightAlgorithm';

export default function CapacitorGauge({
  vCap = 0,
  maxCapVoltage = 5.0,
  footsteps = 0,
  currentBrightness = 50,
}) {
  const socPct = Math.min(100, Math.max(0, Math.round((vCap / maxCapVoltage) * 100)));
  const energyMetrics = calculateEnergyMetrics({ vCap, maxCapVoltage, footsteps });

  // Calculate estimated LED operating time remaining in minutes
  // Assuming 0.35W max power at 100% brightness
  const ledPowerWatts = Math.max(0.01, (currentBrightness / 100) * 0.35);
  const remainingHours = (energyMetrics.energyStoredJoules / 3600) / ledPowerWatts;
  const remainingMinutes = Math.round(remainingHours * 60);

  // Status color logic
  let colorGradient = 'from-rose-600 via-amber-500 to-rose-500';
  let statusBadge = { text: 'CRITICAL LOW', bg: 'bg-rose-500/20 text-rose-300 border-rose-500/30' };

  if (socPct >= 80) {
    colorGradient = 'from-emerald-500 via-teal-400 to-cyan-400';
    statusBadge = { text: 'OPTIMAL CHARGE', bg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' };
  } else if (socPct >= 40) {
    colorGradient = 'from-amber-500 via-yellow-400 to-emerald-400';
    statusBadge = { text: 'STABLE ENERGY', bg: 'bg-amber-500/20 text-amber-300 border-amber-500/30' };
  } else if (socPct >= 20) {
    colorGradient = 'from-amber-600 via-orange-500 to-amber-500';
    statusBadge = { text: 'POWER SAVER', bg: 'bg-orange-500/20 text-orange-300 border-orange-500/30' };
  }

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur-md flex flex-col justify-between">
      {/* Card Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 bg-emerald-500/10 rounded-xl text-emerald-400">
            <BatteryCharging className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100">Capacitor Charge Gauge</h2>
            <p className="text-xs text-slate-400">Energy Storage Reservoir (4700µF)</p>
          </div>
        </div>
        <span className={`px-2.5 py-1 text-xs font-extrabold rounded-full border ${statusBadge.bg}`}>
          {statusBadge.text}
        </span>
      </div>

      {/* Main Capacitor Visualization */}
      <div className="my-6 grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
        {/* Animated Capacitor Cylinder */}
        <div className="relative flex flex-col items-center justify-center p-4">
          {/* Pins */}
          <div className="flex space-x-6 mb-1">
            <div className="w-3 h-4 bg-slate-400 rounded-t-sm shadow-inner flex items-center justify-center text-[9px] font-mono font-bold text-slate-950">+</div>
            <div className="w-3 h-4 bg-slate-500 rounded-t-sm shadow-inner flex items-center justify-center text-[9px] font-mono font-bold text-slate-950">-</div>
          </div>

          {/* Body */}
          <div className="relative w-28 h-44 bg-slate-950 border-2 border-slate-700 rounded-2xl overflow-hidden shadow-2xl flex flex-col justify-end p-1.5">
            {/* Liquid Fill Level */}
            <div
              className={`w-full rounded-xl transition-all duration-700 bg-gradient-to-t ${colorGradient} relative overflow-hidden shadow-lg`}
              style={{ height: `${Math.max(6, socPct)}%` }}
            >
              {/* Wave pulse animation */}
              <div className="absolute inset-0 bg-white/20 animate-pulse" />
            </div>

            {/* Percentage Display Overlay */}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center drop-shadow-md">
              <span className="text-3xl font-black text-white tracking-tight">
                {socPct}%
              </span>
              <span className="text-[11px] font-bold text-slate-200 uppercase tracking-widest mt-0.5">
                {vCap.toFixed(2)} V
              </span>
            </div>
          </div>

          {/* Rated Voltage indicator */}
          <p className="mt-3 text-xs font-medium text-slate-400">
            Max Rating: <span className="text-amber-400 font-semibold">{maxCapVoltage.toFixed(1)}V DC</span>
          </p>
        </div>

        {/* Energy breakdown metrics */}
        <div className="space-y-3.5 bg-slate-950/60 p-4 rounded-xl border border-slate-800">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 font-semibold">Stored Energy (Joules):</span>
            <span className="text-amber-400 font-mono font-bold">{energyMetrics.energyStoredJoules} J</span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 font-semibold">Stored Energy (mWh):</span>
            <span className="text-cyan-400 font-mono font-bold">{energyMetrics.energyStoredMWh} mWh</span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 font-semibold">Total Harvested:</span>
            <span className="text-emerald-400 font-mono font-bold">{energyMetrics.totalHarvestedJoules} J</span>
          </div>

          <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-800">
            <span className="text-slate-400 font-semibold">CO₂ Offset:</span>
            <span className="text-emerald-300 font-mono font-bold">{energyMetrics.co2SavedGrams} g</span>
          </div>

          <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800 flex items-center space-x-2 mt-2">
            <Zap className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <div className="text-xs">
              <span className="text-slate-400">Est. Light Time: </span>
              <span className="font-bold text-slate-200">
                {remainingMinutes > 120
                  ? `${(remainingMinutes / 60).toFixed(1)} hrs`
                  : `${remainingMinutes} mins`}
              </span>
              <span className="text-[10px] text-slate-400 block">@ current {currentBrightness}% output</span>
            </div>
          </div>
        </div>
      </div>

      {/* Progress Bar Footer */}
      <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
        <div
          className={`h-full transition-all duration-500 bg-gradient-to-r ${colorGradient}`}
          style={{ width: `${socPct}%` }}
        />
      </div>
    </div>
  );
}
