import React from 'react';
import { Zap, Cpu, Usb, RefreshCw, Volume2, VolumeX, Clock, Globe } from 'lucide-react';

export default function Navbar({
  isConnected,
  isSimulator,
  onConnectClick,
  onDisconnectClick,
  autoFootsteps,
  onToggleAutoFootsteps,
  weather,
  onWeatherChange,
  hour,
  onHourChange,
  isMuted,
  onToggleMute,
  isCloudConnected = true,
}) {
  return (
    <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-50 text-slate-100 shadow-xl backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-4">
        {/* Brand Logo & Title */}
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-gradient-to-tr from-amber-500 via-yellow-400 to-emerald-400 rounded-xl shadow-md text-slate-950 font-bold">
            <Zap className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-amber-400 via-emerald-300 to-cyan-400 bg-clip-text text-transparent">
              PiezoGrid EcoControl Pro
            </h1>
            <p className="text-xs text-slate-400 font-medium hidden sm:block">
              Kinetic Energy Harvesting & Autonomous Light Controller
            </p>
          </div>
        </div>

        {/* Controls Bar */}
        <div className="flex items-center flex-wrap gap-3">
          {/* Global Cloud Sync Status Badge */}
          <div
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${
              isCloudConnected
                ? 'bg-cyan-950/70 border-cyan-600/50 text-cyan-300'
                : 'bg-slate-800/80 border-slate-700 text-slate-400'
            }`}
            title={isCloudConnected ? 'Global Cloud Telemetry WebSocket Connected' : 'Cloud Sync Offline'}
          >
            <Globe className={`w-3.5 h-3.5 ${isCloudConnected ? 'text-cyan-400 animate-pulse' : 'text-slate-500'}`} />
            <span className="hidden md:inline">{isCloudConnected ? 'Cloud Sync' : 'Offline'}</span>
          </div>

          {/* Weather Selector */}
          <div className="flex items-center bg-slate-800/80 border border-slate-700/80 rounded-lg px-2 py-1 text-xs text-slate-300 space-x-1.5">
            <span className="text-slate-400 font-semibold hidden lg:inline">Weather:</span>
            <select
              value={weather}
              onChange={(e) => onWeatherChange(e.target.value)}
              className="bg-slate-900 text-amber-300 border border-slate-700 rounded px-2 py-1 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-amber-400 cursor-pointer"
            >
              <option value="sunny">☀️ Sunny Daylight</option>
              <option value="cloudy">⛅ Overcast Sky</option>
              <option value="rainy">🌧️ Rainy Dark</option>
              <option value="stormy">⛈️ Heavy Storm</option>
              <option value="night">🌙 Night Mode</option>
            </select>
          </div>

          {/* Time Scrubber Slider */}
          <div className="flex items-center bg-slate-800/80 border border-slate-700/80 rounded-lg px-2.5 py-1 text-xs text-slate-300 space-x-2">
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            <span className="font-mono font-bold text-cyan-300">{hour}:00</span>
            <input
              type="range"
              min="0"
              max="23"
              value={hour}
              onChange={(e) => onHourChange(Number(e.target.value))}
              className="w-16 accent-cyan-400 cursor-pointer h-1.5 bg-slate-900 rounded"
              title="Time of Day Scrubber (00:00 - 23:00)"
            />
          </div>

          {/* Audio Mute Toggle */}
          <button
            onClick={onToggleMute}
            className={`p-2 rounded-lg border text-xs font-bold transition-all ${
              isMuted
                ? 'bg-slate-800 text-slate-500 border-slate-700'
                : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/40 hover:bg-cyan-500/20'
            }`}
            title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          {/* Source Status Badge */}
          {isConnected ? (
            <div className="flex items-center space-x-2 bg-emerald-950/80 border border-emerald-600/60 text-emerald-400 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <Usb className="w-4 h-4" />
              <span>Arduino USB</span>
            </div>
          ) : (
            <div className="flex items-center space-x-2 bg-amber-950/70 border border-amber-600/50 text-amber-300 px-3 py-1.5 rounded-lg text-xs font-semibold">
              <Cpu className="w-4 h-4 animate-spin-slow" />
              <span>Simulator</span>
            </div>
          )}

          {/* Connect / Disconnect Action Button */}
          {isConnected ? (
            <button
              onClick={onDisconnectClick}
              className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold transition-all shadow-md active:scale-95"
            >
              Disconnect
            </button>
          ) : (
            <button
              onClick={onConnectClick}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition-all shadow-md active:scale-95 flex items-center space-x-1.5"
            >
              <Usb className="w-3.5 h-3.5" />
              <span>Connect USB</span>
            </button>
          )}

          {/* Auto Footsteps Simulator Toggle */}
          {isSimulator && (
            <button
              onClick={onToggleAutoFootsteps}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center space-x-1.5 border ${
                autoFootsteps
                  ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${autoFootsteps ? 'animate-spin' : ''}`} />
              <span>{autoFootsteps ? 'Auto-Walk ON' : 'Auto-Walk OFF'}</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

