import React, { useState, useEffect, useRef } from 'react';
import Navbar from './components/Navbar';
import MetricCard from './components/MetricCard';
import CapacitorGauge from './components/CapacitorGauge';
import LightController from './components/LightController';
import RealtimeCharts from './components/RealtimeCharts';
import InteractiveRoomScene from './components/InteractiveRoomScene';
import EnergyFlowDiagram from './components/EnergyFlowDiagram';
import PresetModes from './components/PresetModes';
import Oscilloscope from './components/Oscilloscope';
import TelemetryStatusBar from './components/TelemetryStatusBar';
import StepHistory from './components/StepHistory';

import { calculateLightAdjustment, calculateEnergyMetrics } from './utils/lightAlgorithm';
import { soundSynth } from './utils/audioSynth';
import { aiVoice } from './utils/voiceSynth';
import { cloudSync } from './utils/cloudSync';

import { Footprints, Zap, Activity, Lightbulb, Sparkles, LayoutDashboard, CalendarDays } from 'lucide-react';

// Freshness window for cloud telemetry: the gateway publishes ~1 update per
// second, so more than 10s without a new backend payload means the stream is
// no longer live.
const CLOUD_STALE_MS = 10000;
const STEP_HISTORY_STORAGE_KEY = 'piezo-grid-step-history-v1';
const MAX_STEP_HISTORY_EVENTS = 2000;

function loadStepHistory() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STEP_HISTORY_STORAGE_KEY) || '[]');
    if (!Array.isArray(saved)) return [];
    return saved.filter((event) =>
      event && typeof event.id === 'string' &&
      typeof event.observedAt === 'string' && Number.isFinite(Date.parse(event.observedAt)) &&
      Number.isInteger(event.stepsAdded) && event.stepsAdded > 0 &&
      Number.isFinite(event.totalSteps) && event.totalSteps >= 0
    ).slice(0, MAX_STEP_HISTORY_EVENTS);
  } catch {
    return [];
  }
}

function localDayKey(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Validate a backend telemetry payload. Malformed or non-numeric payloads are
// dropped instead of being displayed as cloud data.
function isValidCloudTelemetry(t) {
  return (
    Boolean(t) &&
    typeof t === 'object' &&
    ['steps', 'vCap', 'pulse', 'lux'].every(
      (key) => typeof t[key] === 'number' && Number.isFinite(t[key])
    )
  );
}

export default function App() {
  // Telemetry State
  const [steps, setSteps] = useState(0);
  const [vCap, setVCap] = useState(0);
  const [pulse, setPulse] = useState(0);
  const [ambientLux, setAmbientLux] = useState(0);
  const [weather, setWeather] = useState('sunny');
  const [hour, setHour] = useState(new Date().getHours());
  const [isMuted, setIsMuted] = useState(false);
  const [activePreset, setActivePreset] = useState('balanced');
  const [isCloudConnected, setIsCloudConnected] = useState(false);

  // Telemetry received only from the authenticated NodeMCU gateway backend.
  const [cloudTelemetry, setCloudTelemetry] = useState(null);
  const [cloudLastPayloadAt, setCloudLastPayloadAt] = useState(0);
  const [cloudUpdateCount, setCloudUpdateCount] = useState(0);
  const [nowTick, setNowTick] = useState(0);

  // Secure gateway LED-control state
  const [isGatewayOnline, setIsGatewayOnline] = useState(false);
  const [ledCommand, setLedCommand] = useState(null); // {commandId, command, state, detail?}
  const [confirmedLedOn, setConfirmedLedOn] = useState(null);
  const ledCommandsByIdRef = useRef(new Map());

  // Control State
  const [manualOverride, setManualOverride] = useState(false);
  const [manualBrightness, setManualBrightness] = useState(70);

  // Historical Stream for Charts
  const [history, setHistory] = useState([]);
  const [stepEvents, setStepEvents] = useState(loadStepHistory);
  const [activePage, setActivePage] = useState('dashboard');
  const lastRecordedStepsRef = useRef(null);

  // Handlers Refs
  const handleToggleMute = () => {
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    soundSynth.setMuted(nextMute);
    aiVoice.setEnabled(!nextMute);
  };

  // Initialize Cloud Telemetry Sync
  useEffect(() => {
    cloudSync.connect();
    const unsubscribeStatus = cloudSync.onStatusChange((status) => {
      setIsCloudConnected(status);
    });

    // Designated-gateway online status (drives LED button availability).
    const unsubscribeGateway = cloudSync.onGatewayStatus((status) => {
      setIsGatewayOnline(Boolean(status && status.online));
    });

    // Command outcomes from the secure gateway path: applied / rejected / timeout.
    const unsubscribeAck = cloudSync.onCommandAck((ack) => {
      const command = ack.command || ledCommandsByIdRef.current.get(ack.commandId);
      if (ack.status === 'applied' && (command === 'LIGHT:ON' || command === 'LIGHT:OFF')) {
        setConfirmedLedOn(command === 'LIGHT:ON');
      }
      ledCommandsByIdRef.current.delete(ack.commandId);
      setLedCommand((prev) => {
        if (!prev || prev.commandId !== ack.commandId) return prev;
        const state =
          ack.status === 'applied' ? 'applied' : ack.status === 'timeout' ? 'timeout' : 'rejected';
        return { ...prev, state, detail: ack.detail ?? null };
      });
    });

    // Subscribe to backend telemetry. The authenticated NodeMCU gateway posts
    // current readings to /api/gateway/sync.
    const unsubscribeTelemetry = cloudSync.subscribeTelemetry((payload) => {
      if (!isValidCloudTelemetry(payload)) return;
      setCloudTelemetry(payload);
      setCloudLastPayloadAt(Date.now());
      setCloudUpdateCount((c) => c + 1);

      // The authenticated NodeMCU gateway is the sole telemetry source.
      const incomingSteps = Number(payload.steps);
      const previousSteps = lastRecordedStepsRef.current;
      if (previousSteps !== null && incomingSteps > previousSteps) {
        const observedAt = new Date().toISOString();
        setStepEvents((previous) => [
          {
            id: `${observedAt}-${previousSteps}-${incomingSteps}`,
            observedAt,
            stepsAdded: incomingSteps - previousSteps,
            totalSteps: incomingSteps,
          },
          ...previous,
        ].slice(0, MAX_STEP_HISTORY_EVENTS));
      }
      // A lower value means the device counter was reset; use it as a new baseline.
      lastRecordedStepsRef.current = incomingSteps;
      setSteps(incomingSteps);
      setVCap(Number(payload.vCap));
      setPulse(Number(payload.pulse));
      setAmbientLux(Number(payload.lux));
      // Weather and brightness are UI/model values, not hardware readings.
    });

    return () => {
      if (unsubscribeGateway) unsubscribeGateway();
      if (unsubscribeAck) unsubscribeAck();
      if (unsubscribeStatus) unsubscribeStatus();
      if (unsubscribeTelemetry) unsubscribeTelemetry();
    };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STEP_HISTORY_STORAGE_KEY, JSON.stringify(stepEvents));
    } catch {
      // Keep the live history usable if browser storage is unavailable or full.
    }
  }, [stepEvents]);

  // 1 Hz ticker so the age/staleness of the last cloud payload is live.
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Compute Smart Light Output
  let rawLightState = calculateLightAdjustment({
    vCap,
    maxCapVoltage: 5.0,
    ambientLux,
    hour,
    weather,
    manualOverride,
    manualBrightness,
  });

  if (!manualOverride) {
    if (activePreset === 'eco') {
      rawLightState.brightness = Math.min(40, rawLightState.brightness);
      rawLightState.pwmValue = Math.round((rawLightState.brightness / 100) * 255);
    } else if (activePreset === 'security') {
      rawLightState.brightness = Math.max(25, rawLightState.brightness);
      rawLightState.pwmValue = Math.round((rawLightState.brightness / 100) * 255);
    }
  }

  const lightState = rawLightState;

  // Cloud freshness: a payload only counts as "live" once the backend has
  // pushed at least one update AFTER the initial connect snapshot (that
  // snapshot can be seed/startup data). More than CLOUD_STALE_MS without a
  // new payload also marks the stream stale.
  const hasCloudPayload = Boolean(cloudTelemetry);
  const isLiveCloud = hasCloudPayload && cloudUpdateCount >= 2;
  const cloudArrivalStale = hasCloudPayload && nowTick - cloudLastPayloadAt > CLOUD_STALE_MS;
  const displaySource = !hasCloudPayload
    ? 'waiting'
    : (isLiveCloud && !cloudArrivalStale ? 'cloud' : 'cloud-stale');
  const cloudStaleNote = !isLiveCloud
    ? 'Connected — waiting for live backend updates (snapshot may be stored/seed data)'
    : 'No backend update received recently';

  // Compute Energy Metrics
  const energyMetrics = calculateEnergyMetrics({ vCap, footsteps: steps });

  // Update History Stream for Charts
  useEffect(() => {
    if (displaySource !== 'cloud') return undefined;
    const interval = setInterval(() => {
      const now = new Date();
      const timeLabel = `${String(hour).padStart(2, '0')}:${now.toLocaleTimeString([], { minute: '2-digit', second: '2-digit' })}`;

      setHistory((prev) => {
        const next = [
          ...prev,
          {
            time: timeLabel,
            vCap,
            pulse,
            brightness: lightState.brightness,
            lux: ambientLux,
            joules: energyMetrics.totalHarvestedJoules,
          },
        ];
        return next.slice(-40);
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [displaySource, vCap, pulse, lightState.brightness, ambientLux, energyMetrics.totalHarvestedJoules, hour]);

  // Send a command through the secure designated-gateway path and track its
  // pending/ack/timeout state for the UI. Resolves with the commandId (or null).
  const sendLedCommand = async (command) => {
    const result = await cloudSync.sendRemoteControl(command);
    if (!result.ok) {
      setLedCommand({
        commandId: null,
        command,
        state: result.reason === 'gateway-offline' ? 'offline' : 'failed',
        detail: result.reason,
      });
      return null;
    }
    ledCommandsByIdRef.current.set(result.commandId, command);
    setLedCommand({ commandId: result.commandId, command, state: 'pending' });
    return result.commandId;
  };

  const handleSetPhysicalLight = (turnOn) => {
    // Send an explicit hardware state. Model brightness is not a reliable
    // source for deciding whether the physical LED is currently on.
    sendLedCommand(turnOn ? 'LIGHT:ON' : 'LIGHT:OFF');
  };

  const localTodayKey = localDayKey(new Date());
  const todayStepCount = stepEvents
    .filter((event) => localDayKey(event.observedAt) === localTodayKey)
    .reduce((sum, event) => sum + event.stepsAdded, 0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans antialiased selection:bg-amber-500 selection:text-slate-950">
      {/* Top Navbar */}
      <Navbar
        weather={weather}
        onWeatherChange={setWeather}
        hour={hour}
        onHourChange={setHour}
        isMuted={isMuted}
        onToggleMute={handleToggleMute}
        isCloudConnected={isCloudConnected}
        gatewayOnline={isGatewayOnline}
        ledCommand={ledCommand}
        onSetPhysicalLight={handleSetPhysicalLight}
        confirmedLedOn={confirmedLedOn}
      />



      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div className="flex items-center justify-end border-b border-slate-800/80 pb-4">
          <div className="hidden sm:flex items-center space-x-2 text-xs text-slate-400 font-semibold">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>PiezoGrid Outdoor Streetlight System</span>
          </div>
        </div>

        <div className="flex gap-2 border-b border-slate-800/80 pb-4" role="tablist" aria-label="Dashboard views">
          <button
            type="button"
            role="tab"
            aria-selected={activePage === 'dashboard'}
            onClick={() => setActivePage('dashboard')}
            className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold transition-colors ${activePage === 'dashboard' ? 'border-cyan-500/50 bg-cyan-950/60 text-cyan-200' : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-slate-200'}`}
          >
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activePage === 'steps'}
            onClick={() => setActivePage('steps')}
            className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold transition-colors ${activePage === 'steps' ? 'border-cyan-500/50 bg-cyan-950/60 text-cyan-200' : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-slate-200'}`}
          >
            <CalendarDays className="h-4 w-4" />
            Daily Steps
          </button>
        </div>

        {activePage === 'steps' ? (
          <StepHistory events={stepEvents} currentSteps={steps} />
        ) : (
          <>

            <div className="flex flex-col gap-4 rounded-2xl border border-cyan-500/20 bg-gradient-to-r from-cyan-950/40 to-slate-900/80 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <div className="rounded-xl bg-cyan-500/10 p-3 text-cyan-300">
                  <CalendarDays className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="font-bold text-white">Today’s step activity</h2>
                  <p className="mt-1 text-sm text-slate-400">
                    {todayStepCount.toLocaleString()} steps logged today · open the timeline for times and the LED energy estimate.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActivePage('steps')}
                className="shrink-0 rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-2.5 text-sm font-bold text-cyan-200 transition-colors hover:bg-cyan-500/20"
              >
                Open daily history
              </button>
            </div>

            {/* Primary 3D Footpath & Streetlamp Viewport with Direct Light Adjustment Controls */}
            <InteractiveRoomScene
              brightness={lightState.brightness}
              onBrightnessChange={setManualBrightness}
              vCap={vCap}
              weather={weather}
              hour={hour}
              pulse={pulse}
              onHourChange={setHour}
              manualOverride={manualOverride}
              onToggleManualOverride={setManualOverride}
            />

            {/* Smart Presets Selector */}
            <PresetModes
              activePreset={activePreset}
              onSelectPreset={setActivePreset}
            />

            {/* Telemetry Source & Cloud Connection Status */}
            <TelemetryStatusBar
              source={displaySource}
              cloudConnected={isCloudConnected}
              gatewayOnline={isGatewayOnline}
              lastUpdate={cloudTelemetry?.updatedAt}
              lastPayloadAgeMs={cloudTelemetry ? nowTick - cloudLastPayloadAt : null}
              staleNote={displaySource === 'cloud-stale' ? cloudStaleNote : null}
            />

            {/* Top Stat Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              <MetricCard
                title="Footsteps Count"
                value={steps.toLocaleString()}
                unit="steps"
                subtitle="Detected piezo impact events (firmware counter)"
                icon={Footprints}
                colorScheme="cyan"
                badgeText="model: +0.15 J/event"
              />
              <MetricCard
                title="Piezo Input Voltage (A1)"
                value={pulse.toFixed(2)}
                unit="V"
                subtitle="Live piezo pulse sampled after the bridge rectifier"
                icon={Activity}
                colorScheme="amber"
                badgeText="A1 reading"
                pulse={true}
              />
              <MetricCard
                title="Storage Capacitor Voltage (A2)"
                value={vCap.toFixed(2)}
                unit="V"
                subtitle={`Post-bridge DC voltage · level ${lightState.capState}% of 5 V scale`}
                icon={Zap}
                colorScheme="cyan"
                badgeText="1000 µF"
              />
              <MetricCard
                title="Adaptive LED Brightness"
                value={lightState.brightness}
                unit="%"
                subtitle={`PWM target ${lightState.pwmValue}/255 (device applies on/off)`}
                icon={Lightbulb}
                colorScheme="purple"
                badgeText={manualOverride ? 'MANUAL' : 'AUTO ALGORITHM'}
              />
            </div>

            {/* Energy Flow Conversion Pipeline */}
            <EnergyFlowDiagram
              steps={steps}
              pulse={pulse}
              vCap={vCap}
              brightness={lightState.brightness}
              pwmValue={lightState.pwmValue}
            />

            {/* Middle Grid: Capacitor Gauge & Light Controller */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <CapacitorGauge
                vCap={vCap}
                maxCapVoltage={5.0}
                footsteps={steps}
                currentBrightness={lightState.brightness}
              />
              <LightController
                lightState={lightState}
                manualOverride={manualOverride}
                onToggleManualOverride={setManualOverride}
                manualBrightness={manualBrightness}
                onManualBrightnessChange={setManualBrightness}
                ambientLux={ambientLux}
                weather={weather}
                vCap={vCap}
              />
            </div>

            {/* Digital Storage Oscilloscope & 3x3 Tile Matrix */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <Oscilloscope
                vCap={vCap}
                pulse={pulse}
                steps={steps}
              />
            </div>

            {/* Realtime Streaming Charts */}
            <RealtimeCharts history={history} />
          </>
        )}
      </main>

    </div>
  );
}
