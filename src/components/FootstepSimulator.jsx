import React, { useState } from 'react';
import { Footprints, Radio, Sparkles, Volume2, VolumeX, Flame } from 'lucide-react';
import { soundSynth } from '../utils/audioSynth';

export default function FootstepSimulator({
  onStomp,
  pulseVoltage = 0,
  steps = 0,
  ambientLux = 50,
  onAmbientLuxChange,
  isMuted,
  onToggleMute,
}) {
  const [force, setForce] = useState(1.0);
  const [activeTileIndex, setActiveTileIndex] = useState(null);

  // 3x3 Tile Matrix Grid
  const tiles = Array.from({ length: 9 }, (_, i) => i + 1);

  const handleTileClick = (tileIndex) => {
    setActiveTileIndex(tileIndex);
    soundSynth.playStompSound(force);
    onStomp(force);
    setTimeout(() => setActiveTileIndex(null), 250);
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur-md flex flex-col justify-between space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 bg-cyan-500/10 rounded-xl text-cyan-400">
            <Footprints className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100">3×3 Piezo Tile Matrix</h2>
            <p className="text-xs text-slate-400">Tactile Kinetic Floor Pad Array</p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* Mute/Sound toggle */}
          <button
            onClick={onToggleMute}
            className={`p-2 rounded-xl border text-xs font-bold transition-all ${
              isMuted
                ? 'bg-slate-950 text-slate-500 border-slate-800'
                : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/20'
            }`}
            title={isMuted ? 'Unmute Audio Feedback' : 'Mute Audio Feedback'}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 animate-pulse" />}
          </button>

          <div className="flex items-center space-x-1.5 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 text-xs font-mono text-cyan-300">
            <Radio className="w-3.5 h-3.5 animate-pulse text-cyan-400" />
            <span>Pulse: {pulseVoltage.toFixed(2)} V</span>
          </div>
        </div>
      </div>

      {/* 3x3 Tile Grid Visualizer */}
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          {tiles.map((id) => (
            <button
              key={id}
              onClick={() => handleTileClick(id)}
              className={`h-20 rounded-xl border-2 transition-all duration-150 flex flex-col items-center justify-center font-bold text-xs shadow-lg select-none cursor-pointer active:scale-95 relative overflow-hidden ${
                activeTileIndex === id
                  ? 'bg-cyan-400 border-white text-slate-950 shadow-cyan-400/50 scale-95'
                  : 'bg-slate-950 border-slate-800 text-cyan-300 hover:border-cyan-500/60 hover:bg-slate-900'
              }`}
            >
              {activeTileIndex === id && (
                <span className="absolute inset-0 bg-white/40 animate-ping rounded-xl" />
              )}
              <Footprints className={`w-5 h-5 mb-1 ${activeTileIndex === id ? 'scale-125' : ''}`} />
              <span>Tile #{id}</span>
            </button>
          ))}
        </div>

        {/* Quick Stomp Batches */}
        <div className="flex items-center justify-between gap-2 pt-2">
          <button
            onClick={() => {
              soundSynth.playStompSound(1.0);
              for (let i = 0; i < 5; i++) onStomp(1.0);
            }}
            className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold transition-all text-center"
          >
            +5 Steps Tap
          </button>
          <button
            onClick={() => {
              soundSynth.playStompSound(1.4);
              for (let i = 0; i < 25; i++) onStomp(1.2);
            }}
            className="flex-1 py-2 bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-800 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-1"
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>+25 Stomp Burst</span>
          </button>
          <button
            onClick={() => {
              soundSynth.playStompSound(2.0);
              for (let i = 0; i < 100; i++) onStomp(1.5);
            }}
            className="flex-1 py-2 bg-amber-950 hover:bg-amber-900 text-amber-300 border border-amber-800 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-1"
          >
            <Flame className="w-3.5 h-3.5 text-amber-400" />
            <span>+100 Power Surge</span>
          </button>
        </div>
      </div>

      {/* Sliders: Force & Ambient Lux */}
      <div className="space-y-4 pt-4 border-t border-slate-800/80">
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs font-semibold">
            <span className="text-slate-400">Impact Force Multiplier:</span>
            <span className="text-cyan-400 font-bold">{force.toFixed(1)}x</span>
          </div>
          <input
            type="range"
            min="0.5"
            max="2.5"
            step="0.1"
            value={force}
            onChange={(e) => setForce(Number(e.target.value))}
            className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-xs font-semibold">
            <span className="text-slate-400">Ambient Brightness Sensor (LDR Lux):</span>
            <span className="text-amber-400 font-bold">{ambientLux}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={ambientLux}
            onChange={(e) => onAmbientLuxChange(Number(e.target.value))}
            className="w-full accent-amber-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
          />
        </div>
      </div>
    </div>
  );
}
