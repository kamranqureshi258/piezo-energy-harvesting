import React, { useEffect, useRef } from 'react';
import { Activity, Radio, Sliders } from 'lucide-react';

export default function Oscilloscope({ vCap = 0, pulse = 0, steps = 0 }) {
  const canvasRef = useRef(null);
  const waveformRef = useRef([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let animationFrameId;
    const width = (canvas.width = canvas.offsetWidth);
    const height = (canvas.height = canvas.offsetHeight);

    // Maintain 120 points buffer
    const bufferSize = 120;
    if (waveformRef.current.length < bufferSize) {
      waveformRef.current = Array(bufferSize).fill(0.1);
    }

    // Push new instant voltage sample (vCap base + pulse spike)
    const currentSample = vCap * 0.15 + pulse * 0.5 + (Math.random() - 0.5) * 0.05;
    waveformRef.current.push(currentSample);
    if (waveformRef.current.length > bufferSize) {
      waveformRef.current.shift();
    }

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // Dark Oscilloscope Grid Background
      ctx.fillStyle = '#020617';
      ctx.fillRect(0, 0, width, height);

      // Grid lines
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1;

      // Vertical grid lines
      for (let x = 0; x < width; x += 30) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      // Horizontal grid lines
      for (let y = 0; y < height; y += 20) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Center baseline
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();

      // Trigger Threshold Line (Cyan dashed)
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.4)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(0, height * 0.3);
      ctx.lineTo(width, height * 0.3);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw Phosphor Glowing Waveform Line
      ctx.shadowBlur = 12;
      ctx.shadowColor = pulse > 0.2 ? '#06b6d4' : '#10b981';
      ctx.strokeStyle = pulse > 0.2 ? '#22d3ee' : '#34d399';
      ctx.lineWidth = 2.5;

      ctx.beginPath();
      const stepX = width / (bufferSize - 1);

      waveformRef.current.forEach((val, i) => {
        const x = i * stepX;
        // Y mapping: baseline at height - 20, scaling val
        const y = height - 20 - val * 25;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });

      ctx.stroke();
      ctx.shadowBlur = 0; // Reset shadow

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [vCap, pulse]);

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur-md space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 bg-emerald-500/10 rounded-xl text-emerald-400">
            <Activity className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100">Digital Storage Oscilloscope</h2>
            <p className="text-xs text-slate-400">Piezo Voltage Waveform & Transient Impulse</p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <span className="px-2.5 py-1 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono font-bold text-emerald-400">
            CH1: 1.0V/Div
          </span>
          <span className="px-2.5 py-1 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono font-bold text-cyan-400">
            TRIG: {pulse > 0.2 ? 'PULSE DETECTED' : 'READY'}
          </span>
        </div>
      </div>

      {/* Canvas Viewport */}
      <div className="relative w-full h-44 rounded-xl overflow-hidden border border-slate-800 shadow-inner">
        <canvas ref={canvasRef} className="w-full h-full block" />

        {/* Oscilloscope Corner Overlay Labels */}
        <div className="absolute top-2 left-3 text-[10px] font-mono text-emerald-400 font-bold bg-slate-950/80 px-2 py-0.5 rounded border border-emerald-900">
          V_peak: {(vCap + pulse).toFixed(2)} V
        </div>
        <div className="absolute top-2 right-3 text-[10px] font-mono text-cyan-400 font-bold bg-slate-950/80 px-2 py-0.5 rounded border border-cyan-900">
          Freq: 10 Hz | 200ms
        </div>
      </div>
    </div>
  );
}
