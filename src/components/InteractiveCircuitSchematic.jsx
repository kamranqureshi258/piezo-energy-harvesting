import React, { useState } from 'react';
import { CircuitBoard, Cpu, Layers, Zap, Info } from 'lucide-react';

export default function InteractiveCircuitSchematic() {
  const [hoveredNode, setHoveredNode] = useState(null);

  const nodes = [
    {
      id: 'piezo',
      title: 'Piezoelectric Tile Array',
      type: 'Energy Harvesting Sensor',
      pin: 'Impulse Input (Pin A1)',
      desc: 'Piezoelectric ceramic elements produce AC voltage spikes on mechanical deformation (footsteps).',
      color: 'border-cyan-500 bg-cyan-950/40 text-cyan-300',
      activeColor: 'ring-2 ring-cyan-400 bg-cyan-900/60',
    },
    {
      id: 'bridge',
      title: '1N4007 Bridge Rectifier',
      type: 'AC-to-DC Conversion',
      pin: 'Diode Rectification',
      desc: 'Full-wave diode bridge rectifies AC piezo impulses into unidirectional DC charge.',
      color: 'border-amber-500 bg-amber-950/40 text-amber-300',
      activeColor: 'ring-2 ring-amber-400 bg-amber-900/60',
    },
    {
      id: 'capacitor',
      title: '4700µF 16V Storage Capacitor',
      type: 'Electrical Energy Storage',
      pin: 'Voltage Divider (Pin A0)',
      desc: 'High-capacitance reservoir stores harvested electrical energy. Voltage read via R1=10k, R2=10k divider.',
      color: 'border-emerald-500 bg-emerald-950/40 text-emerald-300',
      activeColor: 'ring-2 ring-emerald-400 bg-emerald-900/60',
    },
    {
      id: 'ldr',
      title: 'LDR Ambient Light Sensor',
      type: 'Environmental Lux Detector',
      pin: 'Analog Input (Pin A2)',
      desc: 'Light-dependent resistor measures surrounding ambient light to trigger automatic compensation.',
      color: 'border-purple-500 bg-purple-950/40 text-purple-300',
      activeColor: 'ring-2 ring-purple-400 bg-purple-900/60',
    },
    {
      id: 'mosfet',
      title: 'IRF540N N-Channel MOSFET',
      type: 'High-Speed PWM Switch',
      pin: 'Gate Pin D9 (PWM)',
      desc: 'Drives output LED light fixture based on 0-255 PWM duty cycle commands from Arduino.',
      color: 'border-rose-500 bg-rose-950/40 text-rose-300',
      activeColor: 'ring-2 ring-rose-400 bg-rose-900/60',
    },
    {
      id: 'arduino',
      title: 'Arduino Microcontroller',
      type: 'Central Intelligence Unit',
      pin: 'USB COM Port (115200 baud)',
      desc: 'Runs the embedded sketch, reads sensor ADC channels, streams JSON telemetry, and executes PWM control.',
      color: 'border-teal-500 bg-teal-950/40 text-teal-300',
      activeColor: 'ring-2 ring-teal-400 bg-teal-900/60',
    },
  ];

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur-md space-y-6">
      {/* Header */}
      <div className="flex items-center space-x-2.5">
        <div className="p-2 bg-cyan-500/10 rounded-xl text-cyan-400">
          <CircuitBoard className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-100">Interactive Circuit Schematic & Pin Mapping</h2>
          <p className="text-xs text-slate-400">Hover over components to trace electrical wiring paths</p>
        </div>
      </div>

      {/* Schematic Node Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {nodes.map((node) => {
          const isHovered = hoveredNode === node.id;
          return (
            <div
              key={node.id}
              onMouseEnter={() => setHoveredNode(node.id)}
              onMouseLeave={() => setHoveredNode(null)}
              className={`p-4 rounded-xl border transition-all duration-200 cursor-pointer space-y-2 shadow-md ${node.color} ${
                isHovered ? node.activeColor : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider opacity-80">
                  {node.type}
                </span>
                <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded bg-slate-950 border border-slate-800">
                  {node.pin}
                </span>
              </div>

              <h3 className="text-sm font-bold text-slate-100">{node.title}</h3>
              <p className="text-xs text-slate-300 leading-relaxed">{node.desc}</p>
            </div>
          );
        })}
      </div>

      {/* Popover Active Trace Inspector */}
      <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs flex items-center space-x-2 text-slate-300">
        <Info className="w-4 h-4 text-cyan-400 flex-shrink-0" />
        <span>
          {hoveredNode
            ? `Active Wire Trace: Highlighting electrical node [${hoveredNode.toUpperCase()}] pin connections.`
            : 'Hover over any hardware block above to inspect signal flow paths.'}
        </span>
      </div>
    </div>
  );
}
