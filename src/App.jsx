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

import { ArduinoSerialHandler } from './utils/serialHandler';
import { PhysicsSimulator } from './utils/physicsSimulator';
import { calculateLightAdjustment, calculateEnergyMetrics } from './utils/lightAlgorithm';
import { soundSynth } from './utils/audioSynth';
import { aiVoice } from './utils/voiceSynth';
import { cloudSync } from './utils/cloudSync';

import { Footprints, Zap, BatteryCharging, Lightbulb, Sparkles, BookOpen, LayoutDashboard } from 'lucide-react';

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
        setIsSimulator(true);
        aiVoice.speak("Arduino disconnected. Switching to simulator mode.");
        if (simulatorRef.current) simulatorRef.current.start();
      },
      onError: (errMsg) => {
        setSerialError(errMsg);
      },
    });

    return () => {
      if (serialHandlerRef.current) serialHandlerRef.current.disconnect();
    };
  }, []);

  // Initialize Cloud Telemetry Sync
  useEffect(() => {
    cloudSync.connect();
    cloudSync.onStatusChange((status) => {
      setIsCloudConnected(status);
    });
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

  // Compute Energy Metrics
  const energyMetrics = calculateEnergyMetrics({ vCap, footsteps: steps });

  // Send PWM command to Arduino & Simulator + Broadcast Telemetry to Cloud
  useEffect(() => {
    if (isConnected && serialHandlerRef.current) {
      serialHandlerRef.current.sendCommand(`PWM:${lightState.pwmValue}`);
    }

    if (isSimulator && simulatorRef.current) {
      simulatorRef.current.tick(lightState.brightness);
    }

    // Broadcast telemetry to global cloud backend
    cloudSync.emitGatewayData({
      steps,
      vCap,
      pulse,
      lux: ambientLux,
      weather,
      brightness: lightState.brightness,
    });
  }, [lightState.pwmValue, lightState.brightness, isConnected, isSimulator, steps, vCap, pulse, ambientLux, weather]);

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
    } catch (e) {}
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

            {/* Top Stat Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              <MetricCard
                title="Footsteps Count"
                value={steps.toLocaleString()}
                unit="steps"
                subtitle="Total kinetic impacts"
                icon={Footprints}
                colorScheme="cyan"
                badgeText="+0.15 J/step"
              />
              <MetricCard
                title="Total Energy Harvested"
                value={energyMetrics.totalHarvestedJoules}
                unit="Joules"
                subtitle={`${energyMetrics.totalHarvestedMWh} mWh generated`}
                icon={Zap}
                colorScheme="amber"
                badgeText={`${energyMetrics.co2SavedGrams}g CO₂ Saved`}
                pulse={true}
              />
              <MetricCard
                title="Capacitor Voltage"
                value={vCap.toFixed(2)}
                unit="V DC"
                subtitle={`State of charge: ${lightState.capState}%`}
                icon={BatteryCharging}
                colorScheme={vCap > 3.0 ? 'emerald' : 'rose'}
                badgeText={vCap > 3.0 ? 'CHARGED' : 'LOW POWER'}
              />
              <MetricCard
                title="Adaptive LED Brightness"
                value={lightState.brightness}
                unit="%"
                subtitle={`PWM Output: ${lightState.pwmValue}/255`}
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
