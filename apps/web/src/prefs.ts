export function readPreference(key: string) {
  try { return localStorage.getItem('tablemate.' + key); } catch { return null; }
}

export function writePreference(key: string, value: string) {
  try { localStorage.setItem('tablemate.' + key, value); } catch { /* current tab still applies the preference */ }
}

let audioContext: AudioContext | null = null;

export function unlockAudio() {
  try {
    audioContext ??= new AudioContext();
    void audioContext.resume().catch(() => undefined);
  } catch { /* keep visual feedback if the browser denies audio */ }
}

export function playMoveTone(disc = false) {
  if (!audioContext || audioContext.state !== 'running' || document.hidden) return;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const now = audioContext.currentTime;
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(disc ? 350 : 510, now);
  oscillator.frequency.exponentialRampToValueAtTime(disc ? 185 : 340, now + .09);
  gain.gain.setValueAtTime(.05, now);
  gain.gain.exponentialRampToValueAtTime(.001, now + .1);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + .1);
}
