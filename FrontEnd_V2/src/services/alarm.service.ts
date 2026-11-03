// A loud four-beep alarm made in code, so no sound file is needed. Browsers only let audio start after a tap, so the page
// unlocks the alarm when the person starts a rest. The alarm rings for ALARM_SECONDS, unless stopAlarm() is called sooner.

const BEEP_HZ = [1200, 1600, 1200, 1600];
const BEEP_SECONDS = 0.18;
const BEEP_GAP_SECONDS = 0.22;
const PEAK_GAIN = 0.5;
const SILENT_GAIN = 0.0001;
const RING_EVERY_MS = 1200;
export const ALARM_SECONDS = 30;
const BUZZ_PATTERN = [300, 100, 300];

let context: AudioContext | null = null;
let repeat: number | null = null;
let timeout: number | null = null;

/** Call from a tap. Lets a later alarm sound even though it is not started by a tap itself. */
export function unlockAlarm(): void {
  try {
    if (!context) context = new AudioContext();
    void context.resume();
  } catch {
    // No audio on this device: the vibration still goes off.
  }
}

/** Rings now and again every RING_EVERY_MS. Stops by itself after ALARM_SECONDS, or sooner when stopAlarm() is called. */
export function startAlarm(): void {
  stopAlarm();
  ring();
  repeat = window.setInterval(ring, RING_EVERY_MS);
  timeout = window.setTimeout(stopAlarm, ALARM_SECONDS * 1000);
}

export function stopAlarm(): void {
  if (repeat !== null) window.clearInterval(repeat);
  if (timeout !== null) window.clearTimeout(timeout);
  repeat = null;
  timeout = null;
}

function ring(): void {
  if ("vibrate" in navigator) navigator.vibrate?.(BUZZ_PATTERN);
  const audio = context;
  if (!audio) return;
  const start = audio.currentTime;
  BEEP_HZ.forEach((hz, i) => {
    const offset = i * BEEP_GAP_SECONDS;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = "square";
    oscillator.frequency.value = hz;
    gain.gain.setValueAtTime(SILENT_GAIN, start + offset);
    gain.gain.exponentialRampToValueAtTime(PEAK_GAIN, start + offset + 0.01);
    gain.gain.exponentialRampToValueAtTime(SILENT_GAIN, start + offset + BEEP_SECONDS);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(start + offset);
    oscillator.stop(start + offset + BEEP_SECONDS);
  });
}
