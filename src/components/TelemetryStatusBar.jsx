import React from 'react';
import { Globe, Radio, Clock, Zap } from 'lucide-react';

const SOURCE_META = {
  cloud: {
    label: 'Live Cloud Telemetry',
    pill: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
    note: 'Live measurements from the authenticated NodeMCU gateway',
  },
  'cloud-stale': {
    label: 'Cloud Telemetry — STALE',
    pill: 'bg-rose-500/15 text-rose-300 border-rose-500/40',
    note: 'No current backend telemetry',
  },
  simulator: {
    label: 'Simulator Demo Data',
    pill: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
    note: 'Generated locally for demonstration — not hardware readings',
  },
  waiting: {
    label: 'Waiting for Arduino',
    pill: 'bg-slate-700/60 text-slate-300 border-slate-600',
    note: 'Waiting for live measurements from the NodeMCU gateway',
  },
};

function formatClock(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/**
 * Shows which data source the dashboard currently displays, the Socket.IO
 * connection status, and the freshness of the last backend payload.
 * A connected socket alone never proves hardware origin — cloud values are
 * always labeled "hardware origin unverified" until a hardware gateway is
 * identified by the system.
 */
export default function TelemetryStatusBar({
  source,
  cloudConnected,
  gatewayOnline = false,
  lastUpdate,
  lastPayloadAgeMs,
  staleNote,
}) {
  const meta = SOURCE_META[source] || SOURCE_META.waiting;
  const updateClock = lastUpdate ? formatClock(lastUpdate) : null;

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
      <div className="flex items-center gap-2 min-w-0">
        <span className={`px-2.5 py-1 rounded-lg font-bold border whitespace-nowrap ${meta.pill}`}>
          {meta.label}
        </span>
        <span className="text-slate-400 truncate">
          {source === 'cloud-stale' && staleNote ? staleNote : meta.note}
        </span>
      </div>
      <div className="flex items-center gap-4 text-slate-400 whitespace-nowrap">
        <span
          className="flex items-center gap-1.5"
          title={cloudConnected ? 'Socket.IO connected to the cloud backend' : 'Not connected to the cloud backend'}
        >
          <Globe className={`w-3.5 h-3.5 ${cloudConnected ? 'text-cyan-400' : 'text-slate-500'}`} />
          {cloudConnected ? 'Cloud connected' : 'Cloud offline'}
        </span>
        <span
          className="flex items-center gap-1.5"
          title={
            gatewayOnline
              ? 'Designated gateway (NodeMCU) is connected — LED commands can be delivered'
              : 'Designated gateway not connected — LED commands cannot be delivered'
          }
        >
          <Zap className={`w-3.5 h-3.5 ${gatewayOnline ? 'text-emerald-400' : 'text-slate-500'}`} />
          {gatewayOnline ? 'Gateway online' : 'Gateway offline'}
        </span>
        {(source === 'cloud' || source === 'cloud-stale') && lastPayloadAgeMs != null && (
          <span
            className="flex items-center gap-1.5"
            title="Time since the last telemetry:update payload arrived from the backend"
          >
            <Radio className={`w-3.5 h-3.5 ${lastPayloadAgeMs <= 5000 ? 'text-emerald-400 animate-pulse' : 'text-slate-500'}`} />
            {lastPayloadAgeMs < 1000 ? 'receiving updates' : `last payload ${(lastPayloadAgeMs / 1000).toFixed(0)}s ago`}
          </span>
        )}
        {updateClock && (
          <span className="flex items-center gap-1.5" title={`Backend updatedAt: ${lastUpdate}`}>
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            Backend updated {updateClock}
          </span>
        )}
      </div>
    </div>
  );
}
