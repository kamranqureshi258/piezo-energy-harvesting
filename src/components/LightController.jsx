import React from 'react';
import { SunMedium, Lightbulb, Sliders, Cpu, Cloud, Moon, Zap, AlertTriangle } from 'lucide-react';

export default function LightController({
  lightState,
  manualOverride,
  onToggleManualOverride,
  manualBrightness,
  onManualBrightnessChange,
  ambientLux,
  weather,
  vCap,
}) {
  const {
    brightness,
    pwmValue,
    energySaveMode,
    reason,
    capState,
    demandFactor,
    weatherFactor,
    timeFactorPct,
    ambientDemandPct,
  } = lightState;

  // Visual light glow calculation
  const glowOpacity = Math.max(0.05, brightness / 100);
  const glowSpread = Math.round((brightness / 100) * 80);

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur-md flex flex-col justify-between">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 bg-amber-500/10 rounded-xl text-amber-400">
            <Lightbulb className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100">Smart LED Light Control</h2>
            <p className="text-xs text-slate-400">PWM Pin 9 Output ({pwmValue} / 255)</p>
          </div>
        </div>

        {/* Mode Toggle Switch */}
        <div className="flex items-center space-x-2 bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => onToggleManualOverride(false)}
            className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
              !manualOverride
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            AUTO ALGORITHM
          </button>
          <button
            onClick={() => onToggleManualOverride(true)}
            className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
              manualOverride
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            MANUAL OVERRIDE
          </button>
        </div>
      </div>

      {/* Main Lamp Preview & Controls */}
      <div className="my-6 grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
        {/* LED Bulb Visualizer */}
        <div className="relative flex flex-col items-center justify-center p-6 bg-slate-950/80 rounded-2xl border border-slate-800/80 overflow-hidden min-h-[200px]">
          {/* Glowing Aura Effect */}
          <div
            className="absolute rounded-full transition-all duration-500 pointer-events-none"
            style={{
              width: `${120 + glowSpread}px`,
              height: `${120 + glowSpread}px`,
              backgroundColor: `rgba(245, 158, 11, ${glowOpacity * 0.6})`,
              filter: `blur(${30 + glowSpread * 0.5}px)`,
            }}
          />

          {/* Lamp Fixture Icon */}
          <div className="relative z-10 flex flex-col items-center">
            <div
              className="p-5 rounded-full border-2 transition-all duration-300 shadow-2xl"
              style={{
                borderColor: brightness > 0 ? '#f59e0b' : '#475569',
                backgroundColor: brightness > 0 ? `rgba(245, 158, 11, ${Math.max(0.1, brightness / 100)})` : '#0f172a',
                boxShadow: brightness > 0 ? `0 0 ${glowSpread}px rgba(245, 158, 11, 0.8)` : 'none',
              }}
            >
              <Lightbulb
                className="w-12 h-12 transition-colors duration-300"
                style={{ color: brightness > 0 ? '#fff' : '#64748b' }}
              />
            </div>

            <div className="mt-4 text-center">
              <span className="text-3xl font-black text-amber-400 tracking-tight">
                {brightness}%
              </span>
              <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider mt-0.5">
                Target Brightness
              </span>
            </div>
          </div>
        </div>

        {/* Algorithm Control Factors */}
        <div className="space-y-3 bg-slate-950/60 p-4 rounded-xl border border-slate-800">
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 flex items-center justify-between">
            <span>Adaptive Factors</span>
            <Cpu className="w-3.5 h-3.5 text-amber-400" />
          </h3>

          {/* Time Factor */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Time Demand Factor:</span>
            <span className="font-mono font-bold text-slate-200">{timeFactorPct}%</span>
          </div>

          {/* Ambient Light Demand */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Ambient Darkness Demand:</span>
            <span className="font-mono font-bold text-cyan-300">{ambientDemandPct}%</span>
          </div>

          {/* Weather Multiplier */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Weather Multiplier ({weather}):</span>
            <span className="font-mono font-bold text-amber-300">×{weatherFactor}</span>
          </div>

          {/* Capacitor Power Cap */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Capacitor Power Cap:</span>
            <span className={`font-mono font-bold ${energySaveMode ? 'text-rose-400' : 'text-emerald-400'}`}>
              {capState}%
            </span>
          </div>

          {/* Manual Slider if active */}
          {manualOverride && (
            <div className="mt-3 pt-3 border-t border-slate-800 space-y-2">
              <div className="flex justify-between text-xs font-semibold text-slate-300">
                <span>Manual Brightness Slider:</span>
                <span className="text-amber-400 font-bold">{manualBrightness}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={manualBrightness}
                onChange={(e) => onManualBrightnessChange(Number(e.target.value))}
                className="w-full accent-amber-400 cursor-pointer h-2 bg-slate-800 rounded-lg"
              />
            </div>
          )}
        </div>
      </div>

      {/* Algorithm Decision Explanation */}
      <div className={`p-3 rounded-xl border text-xs flex items-center space-x-2.5 ${
        energySaveMode
          ? 'bg-rose-950/60 border-rose-800/80 text-rose-200'
          : 'bg-slate-950 border-slate-800 text-slate-300'
      }`}>
        {energySaveMode ? (
          <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
        ) : (
          <Zap className="w-4 h-4 text-amber-400 flex-shrink-0" />
        )}
        <p className="leading-snug">{reason}</p>
      </div>
    </div>
  );
}
