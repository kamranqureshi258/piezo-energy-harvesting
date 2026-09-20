/**
 * Smart Light Control Algorithm
 * Adjusts LED light brightness based on:
 * - Capacitor Voltage / Energy state-of-charge
 * - Time of day (Hourly lighting demand curve)
 * - Ambient Brightness (LDR Sensor)
 * - Weather conditions (Sunny, Cloudy, Rainy, Stormy, Night)
 */

export function calculateLightAdjustment({
  vCap = 0,
  maxCapVoltage = 5.0,
  ambientLux = 50, // 0 (dark) to 100 (bright)
  hour = new Date().getHours(),
  weather = 'sunny',
  manualOverride = false,
  manualBrightness = 50,
}) {
  if (manualOverride) {
    return {
      brightness: manualBrightness,
      pwmValue: Math.round((manualBrightness / 100) * 255),
      energySaveMode: false,
      reason: `Manual override active (${manualBrightness}%)`,
      capState: Math.round((vCap / maxCapVoltage) * 100),
      demandFactor: manualBrightness,
      capFactorPct: 100,
      weatherFactor: 1.0,
    };
  }

  // 1. Capacitor Energy State of Charge (SOC)
  const capSocPct = Math.min(100, Math.max(0, (vCap / maxCapVoltage) * 100));

  let capFactor = 1.0;
  let energySaveMode = false;
  let capReason = "";

  if (capSocPct < 15) {
    capFactor = 0.0;
    energySaveMode = true;
    capReason = `Capacitor critically low (${capSocPct.toFixed(0)}%). Light shut off for energy safety.`;
  } else if (capSocPct < 35) {
    // Low energy preservation: cap factor scaled 0.2 to 0.5
    capFactor = 0.2 + ((capSocPct - 15) / 20) * 0.3;
    energySaveMode = true;
    capReason = `Low capacitor energy (${capSocPct.toFixed(0)}%). Saver mode limiting light output.`;
  } else if (capSocPct < 70) {
    // Balanced energy: cap factor scaled 0.5 to 0.95
    capFactor = 0.5 + ((capSocPct - 35) / 35) * 0.45;
    capReason = `Capacitor moderately charged (${capSocPct.toFixed(0)}%). Balanced lighting output.`;
  } else {
    capFactor = 1.0;
    capReason = `Capacitor fully charged (${capSocPct.toFixed(0)}%). Maximum power available.`;
  }

  // 2. Time-of-Day Lighting Demand (0 to 1 scale)
  // Peak demand in evening (18:00 - 22:00), moderate at night, low during day
  let timeFactor = 0.2;
  if (hour >= 6 && hour < 17) {
    timeFactor = 0.15 + Math.sin(((hour - 6) / 11) * Math.PI) * 0.15; // Day curve ~0.15 - 0.30
  } else if (hour >= 17 && hour < 22) {
    timeFactor = 0.7 + Math.sin(((hour - 17) / 5) * Math.PI) * 0.3; // Dusk/Evening ~0.70 - 1.00
  } else {
    timeFactor = 0.45; // Night/Midnight ~0.45
  }

  // 3. Ambient Light Demand (Inverse of lux)
  const ambientDemand = Math.max(0, (100 - ambientLux) / 100);

  // 4. Weather Multipliers
  const weatherMultipliers = {
    sunny: 0.75,
    cloudy: 1.1,
    rainy: 1.3,
    stormy: 1.45,
    night: 1.5,
  };
  const weatherFactor = weatherMultipliers[weather] || 1.0;

  // Combined Lighting Demand (0 - 100%)
  const combinedDemand = ((timeFactor * 0.45 + ambientDemand * 0.55) * weatherFactor) * 100;

  // Final Target Brightness adjusted by Capacitor Factor
  const rawTarget = combinedDemand * capFactor;
  const finalBrightness = Math.min(100, Math.max(0, Math.round(rawTarget)));

  // Convert to 8-bit PWM (0 - 255) for Arduino
  const pwmValue = Math.round((finalBrightness / 100) * 255);

  let reason = "";
  if (energySaveMode) {
    reason = capReason;
  } else {
    reason = `Auto-set to ${finalBrightness}% (${weather.toUpperCase()} weather, ${ambientLux}% ambient lux, ${capSocPct.toFixed(0)}% capacitor power).`;
  }

  return {
    brightness: finalBrightness,
    pwmValue,
    energySaveMode,
    reason,
    capState: Math.round(capSocPct),
    demandFactor: Math.round(combinedDemand),
    capFactorPct: Math.round(capFactor * 100),
    weatherFactor,
    timeFactorPct: Math.round(timeFactor * 100),
    ambientDemandPct: Math.round(ambientDemand * 100),
  };
}

/**
 * Calculates physics energy metrics from Capacitor parameters
 * E = 1/2 * C * V^2 (Joules)
 * 1 Joule = 0.000277778 mWh
 */
export function calculateEnergyMetrics({
  vCap = 0,
  capacitanceFarads = 0.0047, // 4700 uF standard capacitor
  footsteps = 0,
  avgVoltagePerStep = 2.5,
}) {
  // Energy currently stored in capacitor
  const energyStoredJoules = 0.5 * capacitanceFarads * Math.pow(vCap, 2);
  const energyStoredMWh = energyStoredJoules * 0.277778;

  // Estimate total harvested energy based on footsteps (approx 0.15 Joules generated per step)
  const energyPerStepJoules = 0.15;
  const totalHarvestedJoules = footsteps * energyPerStepJoules;
  const totalHarvestedMWh = totalHarvestedJoules * 0.277778;

  // Estimated LED power at 100% (e.g., 0.5 Watts = 500mW LED)
  const maxLedPowerWatts = 0.5;

  return {
    energyStoredJoules: Number(energyStoredJoules.toFixed(3)),
    energyStoredMWh: Number(energyStoredMWh.toFixed(3)),
    totalHarvestedJoules: Number(totalHarvestedJoules.toFixed(2)),
    totalHarvestedMWh: Number(totalHarvestedMWh.toFixed(3)),
    co2SavedGrams: Number((totalHarvestedJoules * 0.00015).toFixed(2)), // Approx conversion
  };
}
