import React, { useState } from 'react';
import arduinoCode from '../../arduino/piezo_energy_harvesting.ino?raw';
import { Cpu, Code2, Copy, Check, FileText, CircuitBoard, Layers } from 'lucide-react';

export default function ArduinoGuide() {
  const [copied, setCopied] = useState(false);


  const copyToClipboard = () => {
    navigator.clipboard.writeText(arduinoCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur-md space-y-6">
      {/* Title */}
      <div className="flex items-center space-x-2.5">
        <div className="p-2 bg-emerald-500/10 rounded-xl text-emerald-400">
          <CircuitBoard className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-100">Arduino Hardware & Wiring Guide</h2>
          <p className="text-xs text-slate-400">Complete Pinout Schematics & C++ Code</p>
        </div>
      </div>

      {/* Grid: Component List & Circuit Diagram */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Component List */}
        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center space-x-1.5">
            <Layers className="w-4 h-4 text-emerald-400" />
            <span>Required Components</span>
          </h3>

          <ul className="text-xs text-slate-300 space-y-2">
            <li className="flex justify-between border-b border-slate-800/60 pb-1">
              <span className="font-semibold text-slate-400">Piezoelectric Discs (×4-8):</span>
              <span className="text-amber-300 font-mono">Parallel Tile Array</span>
            </li>
            <li className="flex justify-between border-b border-slate-800/60 pb-1">
              <span className="font-semibold text-slate-400">Bridge Rectifier (1N4007 ×4):</span>
              <span className="text-amber-300 font-mono">AC to DC Rectification</span>
            </li>
            <li className="flex justify-between border-b border-slate-800/60 pb-1">
              <span className="font-semibold text-slate-400">Storage Capacitor:</span>
              <span className="text-cyan-300 font-mono">4700µF 16V / 5.5V SuperCap</span>
            </li>
            <li className="flex justify-between border-b border-slate-800/60 pb-1">
              <span className="font-semibold text-slate-400">PIR Motion Sensor:</span>
              <span className="text-cyan-300 font-mono">Pin D2</span>
            </li>
            <li className="flex justify-between border-b border-slate-800/60 pb-1">
              <span className="font-semibold text-slate-400">LDR Light Sensor:</span>
              <span className="text-purple-300 font-mono">Pin A0 (with 10k resistor)</span>
            </li>
            <li className="flex justify-between pb-1">
              <span className="font-semibold text-slate-400">LED Driver MOSFET:</span>
              <span className="text-emerald-300 font-mono">IRF540N / LED (Pin D3)</span>
            </li>
          </ul>
        </div>

        {/* Pinout Schematic */}
        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center space-x-1.5">
            <Cpu className="w-4 h-4 text-cyan-400" />
            <span>Arduino Pin Mapping</span>
          </h3>

          <div className="space-y-2 text-xs">
            <div className="p-2 bg-slate-900 rounded border border-slate-800 flex justify-between items-center">
              <span className="font-mono text-amber-400 font-bold">Analog A0</span>
              <span className="text-slate-300">LDR Ambient Light Sensor</span>
            </div>
            <div className="p-2 bg-slate-900 rounded border border-slate-800 flex justify-between items-center">
              <span className="font-mono text-cyan-400 font-bold">Analog A1</span>
              <span className="text-slate-300">Piezo Impulse Sensor (Step Edge)</span>
            </div>
            <div className="p-2 bg-slate-900 rounded border border-slate-800 flex justify-between items-center">
              <span className="font-mono text-purple-400 font-bold">Digital D2</span>
              <span className="text-slate-300">PIR Motion Sensor</span>
            </div>
            <div className="p-2 bg-slate-900 rounded border border-slate-800 flex justify-between items-center">
              <span className="font-mono text-emerald-400 font-bold">Digital D3</span>
              <span className="text-slate-300">Streetlight LED (web ON / OFF)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Code Box */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-300 flex items-center space-x-1.5">
            <Code2 className="w-4 h-4 text-amber-400" />
            <span>Arduino C++ Firmware (`piezo_energy_harvesting.ino`)</span>
          </span>

          <button
            onClick={copyToClipboard}
            className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg text-xs font-bold transition-all flex items-center space-x-1 shadow-md"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Sketch Code</span>
              </>
            )}
          </button>
        </div>

        <pre className="p-4 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-amber-200/90 overflow-x-auto max-h-72 leading-relaxed">
          {arduinoCode}
        </pre>
      </div>
    </div>
  );
}
