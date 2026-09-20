/**
 * Web Speech Synthesis AI Voice Assistant
 * Announces system state changes and safety alerts.
 */

class VoiceAssistant {
  constructor() {
    this.enabled = true;
    this.lastSpokenText = "";
    this.lastSpokenTime = 0;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
  }

  speak(text) {
    if (!this.enabled || typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    // Avoid repeating identical alerts within 4 seconds
    const now = Date.now();
    if (text === this.lastSpokenText && now - this.lastSpokenTime < 4000) return;

    try {
      window.speechSynthesis.cancel(); // cancel pending speech
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      utterance.pitch = 1.0;
      utterance.volume = 0.8;

      // Select English voice
      const voices = window.speechSynthesis.getVoices();
      const preferredVoice = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('David') || v.name.includes('Zira')));
      if (preferredVoice) utterance.voice = preferredVoice;

      window.speechSynthesis.speak(utterance);
      this.lastSpokenText = text;
      this.lastSpokenTime = now;
    } catch (e) {
      console.warn("Speech synth error:", e);
    }
  }
}

export const aiVoice = new VoiceAssistant();
