import React from 'react';
import { Leaf, Sun, Shield, Zap, Sparkles } from 'lucide-react';

export default function PresetModes({ activePreset, onSelectPreset }) {
  const presets = [
    {
      id: 'eco',
      name: 'Eco Saver Mode',
      desc: 'Max energy conservation, caps light at 40% output',
      icon: Leaf,
      color: 'emerald',
    },
    {
      id: 'max',
      name: 'Max Illumination',
      desc: 'Priority walkway lighting, allows up to 100%',
      icon: Sun,
      color: 'amber',
    },
    {
      id: 'security',
      name: 'Night Security',
      desc: '25% continuous night glow, boosts on footstep pulse',
      icon: Shield,
      color: 'purple',
    },
    {
      id: 'balanced',
      name: 'Dynamic Adaptive',
      desc: 'Automatic algorithm balancing energy & weather',
      icon: Zap,
      color: 'cyan',
    },
  ];

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur-md space-y-4">
      <div className="flex items-center space-x-2.5">
        <div className="p-2 bg-amber-500/10 rounded-xl text-amber-400">
          <Sparkles className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-100">Smart Energy Presets</h2>
          <p className="text-xs text-slate-400">Select Lighting Control Profile</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {presets.map((p) => {
          const Icon = p.icon;
          const isSelected = activePreset === p.id;
          return (
            <button
              key={p.id}
              onClick={() => onSelectPreset(p.id)}
              className={`p-4 rounded-xl border text-left transition-all duration-200 shadow-md flex flex-col justify-between space-y-2 cursor-pointer ${
                isSelected
                  ? 'bg-slate-950 border-amber-400 ring-2 ring-amber-400/50'
                  : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className={`p-2 rounded-lg ${isSelected ? 'bg-amber-400 text-slate-950 font-bold' : 'bg-slate-900 text-slate-400'}`}>
                  <Icon className="w-4 h-4" />
                </div>
                {isSelected && (
                  <span className="px-2 py-0.5 text-[10px] font-black rounded-full bg-amber-400 text-slate-950">
                    ACTIVE
                  </span>
                )}
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-200">{p.name}</h3>
                <p className="text-[10px] text-slate-400 leading-tight mt-0.5">{p.desc}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
