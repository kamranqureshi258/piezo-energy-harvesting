import React from 'react';
import { Footprints, ArrowRight, Zap, BatteryCharging, Cpu, Lightbulb, Sparkles } from 'lucide-react';

export default function EnergyFlowDiagram({
  steps = 0,
  vCap = 0,
  joules = 0,
  brightness = 0,
  pwmValue = 0,
}) {
  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur-md space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 bg-amber-500/10 rounded-xl text-amber-400">
            <Sparkles className="w-5 h-5 animate-spin-slow" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100">Kinetic-to-Electrical Energy Flow</h2>
            <p className="text-xs text-slate-400">Real-Time Conversion Pipeline & Power Distribution</p>
          </div>
        </div>

        <span className="px-3 py-1 bg-emerald-950/80 border border-emerald-600/60 text-emerald-400 rounded-full text-xs font-mono font-bold">
          Pipeline Active
        </span>
      </div>

      {/* Nodes Flow Diagram */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-center py-2">
        {/* Node 1: Mechanical Footstep Impact */}
        <div className="p-3.5 bg-slate-950 rounded-xl border border-cyan-500/40 flex flex-col items-center text-center space-y-1.5 hover:border-cyan-400 transition-all shadow-lg">
          <Footprints className="w-6 h-6 text-cyan-400" />
          <span className="text-[11px] font-bold text-slate-200 uppercase tracking-wider">
            1. Mechanical Force
          </span>
          <span className="text-xs font-mono font-extrabold text-cyan-300">
            {steps} Steps
          </span>
          <span className="text-[10px] text-slate-400">Kinetic Pressure</span>
        </div>

        {/* Connection Arrow 1 */}
        <div className="hidden md:flex flex-col items-center justify-center text-amber-400">
          <ArrowRight className="w-5 h-5 animate-pulse" />
          <span className="text-[9px] font-mono text-slate-500">AC Pulse</span>
        </div>

        {/* Node 2: Piezo Rectifier Bridge */}
        <div className="p-3.5 bg-slate-950 rounded-xl border border-amber-500/40 flex flex-col items-center text-center space-y-1.5 hover:border-amber-400 transition-all shadow-lg">
          <Zap className="w-6 h-6 text-amber-400" />
          <span className="text-[11px] font-bold text-slate-200 uppercase tracking-wider">
            2. Diode Rectifier
          </span>
          <span className="text-xs font-mono font-extrabold text-amber-300">
            {joules} Joules
          </span>
          <span className="text-[10px] text-slate-400">AC to DC Conversion</span>
        </div>

        {/* Connection Arrow 2 */}
        <div className="hidden md:flex flex-col items-center justify-center text-emerald-400">
          <ArrowRight className="w-5 h-5 animate-pulse" />
          <span className="text-[9px] font-mono text-slate-500">DC Charge</span>
        </div>

        {/* Node 3: Storage Capacitor Bank */}
        <div className="p-3.5 bg-slate-950 rounded-xl border border-emerald-500/40 flex flex-col items-center text-center space-y-1.5 hover:border-emerald-400 transition-all shadow-lg">
          <BatteryCharging className="w-6 h-6 text-emerald-400" />
          <span className="text-[11px] font-bold text-slate-200 uppercase tracking-wider">
            3. Capacitor Bank
          </span>
          <span className="text-xs font-mono font-extrabold text-emerald-300">
            {vCap.toFixed(2)} V DC
          </span>
          <span className="text-[10px] text-slate-400">4700µF Reservoir</span>
        </div>

        {/* Connection Arrow 3 */}
        <div className="hidden md:flex flex-col items-center justify-center text-purple-400">
          <ArrowRight className="w-5 h-5 animate-pulse" />
          <span className="text-[9px] font-mono text-slate-500">PWM Signal</span>
        </div>

        {/* Node 4: Adaptive Light LED Fixture */}
        <div className="p-3.5 bg-slate-950 rounded-xl border border-purple-500/40 flex flex-col items-center text-center space-y-1.5 hover:border-purple-400 transition-all shadow-lg md:col-span-1">
          <Lightbulb className="w-6 h-6 text-purple-400" />
          <span className="text-[11px] font-bold text-slate-200 uppercase tracking-wider">
            4. LED Illumination
          </span>
          <span className="text-xs font-mono font-extrabold text-purple-300">
            {brightness}% ({pwmValue} PWM)
          </span>
          <span className="text-[10px] text-slate-400">Adaptive Photons</span>
        </div>
      </div>
    </div>
  );
}
