import React, { useState, useEffect, useRef } from 'react';
import Navbar from './components/Navbar';
import MetricCard from './components/MetricCard';
import CapacitorGauge from './components/CapacitorGauge';
import LightController from './components/LightController';
import FootstepSimulator from './components/FootstepSimulator';
import RealtimeCharts from './components/RealtimeCharts';
import ArduinoGuide from './components/ArduinoGuide';
import SerialConnectionModal from './components/SerialConnectionModal';
import InteractiveRoomScene from './components/InteractiveRoomScene';
import EnergyFlowDiagram from './components/EnergyFlowDiagram';
import PresetModes from './components/PresetModes';
import Oscilloscope from './components/Oscilloscope';
import InteractiveCircuitSchematic from './components/InteractiveCircuitSchematic';
import TelemetryStatusBar from './components/TelemetryStatusBar';

import { ArduinoSerialHandler } from './utils/serialHandler';
import { PhysicsSimulator } from './utils/physicsSimulator';
import { calculateLightAdjustment, calculateEnergyMetrics } from './utils/lightAlgorithm';
import { soundSynth } from './utils/audioSynth';
import { aiVoice } from './utils/voiceSynth';
import { cloudSync } from './utils/cloudSync';

import { Footprints, Zap, Activity, Lightbulb, Sparkles, BookOpen, LayoutDashboard } from 'lucide-react';

// Freshness window for cloud telemetry: the gateway publishes ~1 update per
// second, so more than 10s without a new backend payload means the stream is
// no longer live.
const CLOUD_STALE_MS = 10000;

// Validate a backend telemetry payload. Malformed or non-numeric payloads are
// dropped instead of being displayed as cloud data.
function isValidCloudTelemetry(t) {
  return (
    Boolean(t) &&
    typeof t === 'object' &&
    Number.isFinite(Number(t.steps)) &&
    Number.isFinite(Number(t.vCap)) &&
    Number.isFinite(Number(t.pulse)) &&
    Number.isFinite(Number(t.lux))
  );
}

export default function App() {
  // Navigation tab ('dashboard' | 'arduino')
  const [activeTab, setActiveTab] = useState('dashboard');

  // Telemetry State
  const [steps, setSteps] = useState(112);
  const [vCap, setVCap] = useState(4.15);
  const [pulse, setPulse] = useState(0.0);
  const [ambientLux, setAmbientLux] = useState(38);
  const [weather, setWeather] = useState('sunny');
  const [hour, setHour] = useState(new Date().getHours());
  const [isMuted, setIsMuted] = useState(false);
  const [activePreset, setActivePreset] = useState('balanced');
  const [isCloudConnected, setIsCloudConnected] = useState(false);

  // Cloud Telemetry State (backend-provided values; hardware origin unverified)
  const [cloudTelemetry, setCloudTelemetry] = useState(null);
  const [cloudLastPayloadAt, setCloudLastPayloadAt] = useState(0);
  const [cloudUpdateCount, setCloudUpdateCount] = useState(0);
  const [nowTick, setNowTick] = useState(0);
  const dataSourceRef = useRef('simulator'); // 'cloud' | 'simulator'

  // Secure gateway LED-control state
  const [isGatewayOnline, setIsGatewayOnline] = useState(false);
  const [ledCommand, setLedCommand] = useState(null); // {commandId, command, state, detail?}

  // Control State
  const [manualOverride, setManualOverride] = useState(false);
  const [manualBrightness, setManualBrightness] = useState(70);

  // Serial & Connection State
  const [isConnected, setIsConnected] = useState(false);
  const [isSimulator, setIsSimulator] = useState(true);
  const [autoFootsteps, setAutoFootsteps] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [serialError, setSerialError] = useState(null);

  // Historical Stream for Charts
  const [history, setHistory] = useState([]);

  // Handlers Refs
  const serialHandlerRef = useRef(null);
  const simulatorRef = useRef(null);
  const lastSerialCommandRef = useRef('');
  const lastArduinoNightRef = useRef(null);

  const handleToggleMute = () => {
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    soundSynth.setMuted(nextMute);
    aiVoice.setEnabled(!nextMute);
  };

  // Initialize Simulator
  useEffect(() => {
    simulatorRef.current = new PhysicsSimulator({
      onStateUpdate: (data) => {
        setSteps(data.steps);
        setVCap(data.vCap);
        setPulse(data.pulse);
        setAmbientLux(data.lux);
      },
    });
    simulatorRef.current.start();

    return () => {
      if (simulatorRef.current) simulatorRef.current.stop();
    };
  }, []);

  // Initialize Serial Handler
  useEffect(() => {
    serialHandlerRef.current = new ArduinoSerialHandler({
      onData: (data) => {
        setIsSimulator(false);
        setIsConnected(true);
        setSteps(data.steps);
        setVCap(data.vCap);
        setPulse(data.pulse);
        setAmbientLux(data.lux);

        if (data.night !== undefined && data.night !== null) {
          const isNight = Number(data.night) === 1;
          if (lastArduinoNightRef.current !== isNight) {
            lastArduinoNightRef.current = isNight;
            if (isNight) {
              setHour(21);
              setWeather('night');
            } else {
              setHour(12);
              setWeather('sunny');
            }
          }
        }
      },
      onConnect: () => {
        setIsConnected(true);
        setIsSimulator(false);
        setIsModalOpen(false);
        aiVoice.speak("Arduino connected successfully.");
        if (simulatorRef.current) simulatorRef.current.stop();
      },
      onDisconnect: () => {
        setIsConnected(false);
        lastSerialCommandRef.current = '';
        lastArduinoNightRef.current = null;
        // Return to the simulator only when there is no cloud telemetry to
        // display; a cloud-fed dashboard keeps showing backend values.
        if (dataSourceRef.current !== 'cloud') {
          setIsSimulator(true);
          aiVoice.speak("Arduino disconnected. Switching to simulator mode.");
          if (simulatorRef.current) simulatorRef.current.start();
        } else {
          aiVoice.speak("Arduino disconnected.");
        }
      },
      onError: (errMsg) => {
        setSerialError(errMsg);
        setIsModalOpen(true);
      },
    });

    return () => {
      if (serialHandlerRef.current) serialHandlerRef.current.disconnect();
    };
  }, []);

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
      setLedCommand((prev) => {
        if (!prev || prev.commandId !== ack.commandId) return prev;
        const state =
          ack.status === 'applied' ? 'applied' : ack.status === 'timeout' ? 'timeout' : 'rejected';
        return { ...prev, state, detail: ack.detail ?? null };
      });
    });

    // Subscribe to backend telemetry. The backend sends its current state once
    // when a client connects (server.js) and then on every backend state
    // change (POST /api/telemetry or gateway:telemetry events).
    const unsubscribeTelemetry = cloudSync.subscribeTelemetry((payload) => {
      if (!isValidCloudTelemetry(payload)) return;
      setCloudTelemetry(payload);
      setCloudLastPayloadAt(Date.now());
      setCloudUpdateCount((c) => c + 1);

      // A directly attached Arduino (USB serial) is the most trustworthy
      // source: never let cloud values overwrite live serial data.
      if (serialHandlerRef.current?.connected) return;

      if (dataSourceRef.current !== 'cloud') {
        dataSourceRef.current = 'cloud';
        setIsSimulator(false);
        // Cloud values take over the dashboard; stop the demo simulator.
        if (simulatorRef.current) simulatorRef.current.stop();
      }

      // Feed the existing dashboard state (same pattern as the USB serial path).
      setSteps(Number(payload.steps));
      setVCap(Number(payload.vCap));
      setPulse(Number(payload.pulse));
      setAmbientLux(Number(payload.lux));
      // NOTE: payload.weather / payload.brightness are intentionally NOT
      // mapped: the backend may hold seed/echo values that the hardware does
      // not measure. Never display fabricated weather or brightness.
    });

    return () => {
      if (unsubscribeGateway) unsubscribeGateway();
      if (unsubscribeAck) unsubscribeAck();
      if (unsubscribeStatus) unsubscribeStatus();
      if (unsubscribeTelemetry) unsubscribeTelemetry();
    };
  }, []);

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
    ? 'simulator'
    : (isLiveCloud && !cloudArrivalStale ? 'cloud' : 'cloud-stale');
  const cloudStaleNote = !isLiveCloud
    ? 'Connected — waiting for live backend updates (snapshot may be stored/seed data)'
    : 'No backend update received recently';

  // Compute Energy Metrics
  const energyMetrics = calculateEnergyMetrics({ vCap, footsteps: steps });

  // Send latched light commands to the LOCALLY attached Arduino only (USB
  // serial). Cloud LED commands go exclusively through the explicit gateway
  // path (handleForceLightToggle → sendLedCommand) — never browser-to-browser.
  useEffect(() => {
    const command = manualOverride
      ? (lightState.pwmValue > 0 ? 'LIGHT:ON' : 'LIGHT:OFF')
      : 'LIGHT:AUTO';

    if (isConnected && serialHandlerRef.current && lastSerialCommandRef.current !== command) {
      lastSerialCommandRef.current = command;
      serialHandlerRef.current.sendCommand(command);
    }

    if (isSimulator && simulatorRef.current) {
      simulatorRef.current.tick(lightState.brightness);
    }
  }, [manualOverride, lightState.pwmValue, lightState.brightness, isConnected, isSimulator]);

  // Relay only real local hardware readings to the cloud (browser-as-gateway
  // path for a USB-attached Arduino). Simulator and cloud-echoed values must
  // never be published as if they came from hardware.
  useEffect(() => {
    if (!isConnected) return;
    cloudSync.emitGatewayData({
      steps,
      vCap,
      pulse,
      lux: ambientLux,
      weather,
      brightness: lightState.brightness,
    });
  }, [isConnected, steps, vCap, pulse, ambientLux, weather, lightState.brightness]);

  // Update History Stream for Charts
  useEffect(() => {
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
  }, [vCap, pulse, lightState.brightness, ambientLux, energyMetrics.totalHarvestedJoules, hour]);

  // Connection Actions
  const handleConnectPort = async (baudRate) => {
    setSerialError(null);
    try {
      await serialHandlerRef.current.connect(baudRate);
    } catch (e) {
      setSerialError(e?.message || 'Failed to connect to the Arduino serial port.');
    }
  };

  const handleDisconnectPort = async () => {
    if (serialHandlerRef.current) {
      await serialHandlerRef.current.disconnect();
    }
  };

  const handleStomp = (force) => {
    if (isSimulator && simulatorRef.current) {
      simulatorRef.current.stomp(force);
    } else {
      setSteps((s) => s + 1);
    }
  };

  const handleToggleAutoFootsteps = () => {
    const nextState = !autoFootsteps;
    setAutoFootsteps(nextState);
    if (simulatorRef.current) {
      simulatorRef.current.setAutoFootsteps(nextState);
    }
  };

  const handleAmbientLuxChange = (newLux) => {
    setAmbientLux(newLux);
    if (simulatorRef.current) {
      simulatorRef.current.setAmbientLux(newLux);
    }
  };

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
    setLedCommand({ commandId: result.commandId, command, state: 'pending' });
    return result.commandId;
  };

  const handleForceLightToggle = () => {
    const isCurrentlyOn = lightState.brightness > 0;
    const command = isCurrentlyOn ? 'LIGHT:OFF' : 'LIGHT:ON';

    setManualOverride(true);
    setManualBrightness(isCurrentlyOn ? 0 : 100);

    // With a USB-attached Arduino the local device is controlled directly and
    // the remote gateway is left alone (no double-commanding). Without USB,
    // the command goes through the secure designated-gateway path.
    if (isConnected && serialHandlerRef.current) {
      lastSerialCommandRef.current = command;
      serialHandlerRef.current.sendCommand(command);
      return;
    }
    sendLedCommand(command);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans antialiased selection:bg-amber-500 selection:text-slate-950">
      {/* Top Navbar */}
      <Navbar
        isConnected={isConnected}
        isSimulator={isSimulator}
        onConnectClick={() => setIsModalOpen(true)}
        onDisconnectClick={handleDisconnectPort}
        autoFootsteps={autoFootsteps}
        onToggleAutoFootsteps={handleToggleAutoFootsteps}
        weather={weather}
        onWeatherChange={setWeather}
        hour={hour}
        onHourChange={setHour}
        isMuted={isMuted}
        onToggleMute={handleToggleMute}
        isCloudConnected={isCloudConnected}
        gatewayOnline={isGatewayOnline}
        ledCommand={ledCommand}
        onForceLightToggle={handleForceLightToggle}
        lightOn={lightState.brightness > 0}
      />



      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Navigation Bar / Tab Selector */}
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
          <div className="flex space-x-3">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 border ${
                activeTab === 'dashboard'
                  ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-lg shadow-amber-500/20'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-850 hover:text-slate-200'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>3D Outdoor Footpath & Control Dashboard</span>
            </button>
            <button
              onClick={() => setActiveTab('arduino')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 border ${
                activeTab === 'arduino'
                  ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-lg shadow-amber-500/20'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-850 hover:text-slate-200'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>Arduino Firmware & Schematic</span>
            </button>
          </div>

          <div className="hidden sm:flex items-center space-x-2 text-xs text-slate-400 font-semibold">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>PiezoGrid Outdoor Streetlight System</span>
          </div>
        </div>

        {activeTab === 'dashboard' ? (
          <>
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
                title="Harvested Energy (model est.)"
                value={energyMetrics.totalHarvestedJoules}
                unit="Joules"
                subtitle="Estimate · assumes +0.15 J per detected event"
                icon={Zap}
                colorScheme="amber"
                badgeText={`${energyMetrics.co2SavedGrams}g CO₂ est.`}
                pulse={true}
              />
              <MetricCard
                title="Piezo Activity (Σ ΔV)"
                value={vCap.toFixed(2)}
                unit="V cum."
                subtitle={`Cumulative A1 signal deltas · level ${lightState.capState}% of 5 V scale`}
                icon={Activity}
                colorScheme="cyan"
                badgeText="activity proxy"
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
              vCap={vCap}
              joules={energyMetrics.totalHarvestedJoules}
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
              <FootstepSimulator
                onStomp={handleStomp}
                pulseVoltage={pulse}
                steps={steps}
                ambientLux={ambientLux}
                onAmbientLuxChange={handleAmbientLuxChange}
                isMuted={isMuted}
                onToggleMute={handleToggleMute}
              />
              <Oscilloscope
                vCap={vCap}
                pulse={pulse}
                steps={steps}
              />
            </div>

            {/* Realtime Streaming Charts */}
            <RealtimeCharts history={history} />
          </>
        ) : (
          <div className="space-y-8">
            <InteractiveCircuitSchematic />
            <ArduinoGuide />
          </div>
        )}
      </main>

      {/* Serial Connection Modal */}
      <SerialConnectionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onConnect={handleConnectPort}
        error={serialError}
      />
    </div>
  );
}
