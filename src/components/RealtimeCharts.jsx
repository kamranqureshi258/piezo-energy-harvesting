import React, { useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import { Activity, LineChart as ChartIcon, Zap, Eye } from 'lucide-react';

export default function RealtimeCharts({ history = [] }) {
  const [activeTab, setActiveTab] = useState('voltage'); // 'voltage' | 'brightness' | 'energy'

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur-md flex flex-col justify-between">
      {/* Header & Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 bg-purple-500/10 rounded-xl text-purple-400">
            <Activity className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100">Live Telemetry Analytics</h2>
            <p className="text-xs text-slate-400">Real-Time Sensor Telemetry Stream (200ms)</p>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="flex items-center space-x-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveTab('voltage')}
            className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'voltage'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Voltage Stream
          </button>
          <button
            onClick={() => setActiveTab('brightness')}
            className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'brightness'
                ? 'bg-emerald-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Light Control (%)
          </button>
          <button
            onClick={() => setActiveTab('energy')}
            className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'energy'
                ? 'bg-cyan-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Energy Harvested (J)
          </button>
        </div>
      </div>

      {/* Chart Area */}
      <div className="my-6 h-64 w-full">
        {history.length < 2 ? (
          <div className="h-full w-full flex items-center justify-center text-slate-500 text-xs font-semibold">
            Waiting for telemetry data stream...
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {activeTab === 'voltage' ? (
              <AreaChart data={history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="vCapGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="pulseGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="time" stroke="#64748b" tick={{ fontSize: 10 }} />
                <YAxis domain={[0, 6]} stroke="#64748b" tick={{ fontSize: 10 }} unit="V" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem', fontSize: '12px' }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Area type="monotone" dataKey="vCap" name="Capacitor Voltage (V)" stroke="#f59e0b" fillOpacity={1} fill="url(#vCapGrad)" strokeWidth={2} />
                <Area type="monotone" dataKey="pulse" name="Pulse Voltage (V)" stroke="#06b6d4" fillOpacity={1} fill="url(#pulseGrad)" strokeWidth={1.5} />
              </AreaChart>
            ) : activeTab === 'brightness' ? (
              <LineChart data={history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="time" stroke="#64748b" tick={{ fontSize: 10 }} />
                <YAxis domain={[0, 100]} stroke="#64748b" tick={{ fontSize: 10 }} unit="%" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem', fontSize: '12px' }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Line type="stepAfter" dataKey="brightness" name="Light Output (%)" stroke="#10b981" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="lux" name="Ambient Lux (%)" stroke="#a855f7" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
              </LineChart>
            ) : (
              <AreaChart data={history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="jouleGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="time" stroke="#64748b" tick={{ fontSize: 10 }} />
                <YAxis stroke="#64748b" tick={{ fontSize: 10 }} unit="J" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem', fontSize: '12px' }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Area type="monotone" dataKey="joules" name="Energy Harvested (Joules)" stroke="#3b82f6" fillOpacity={1} fill="url(#jouleGrad)" strokeWidth={2} />
              </AreaChart>
            )}
          </ResponsiveContainer>
        )}
      </div>

      <div className="pt-3 border-t border-slate-800 text-xs text-slate-400 flex items-center justify-between">
        <span>Streaming buffer: {history.length} / 50 data points</span>
        <span className="text-purple-400 font-semibold">Live Real-time Graph</span>
      </div>
    </div>
  );
}
