// Earcons generated with the Web Audio API.
// Design rules (older adults): fundamentals 260-1100 Hz (presbycusis mainly affects high
// frequencies), soft attack (no startle), short (<350 ms), one consistent sound per meaning.
import { useSettings } from '../store/settings';

let ctx: AudioContext | null = null;
function ac() {
  if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
/** Call from any user gesture to unlock audio. */
export function unlockAudio() { try { ac(); } catch { /* ignore */ } }

function tone(freq: number, start: number, dur: number, gain = 0.25, type: OscillatorType = 'sine') {
  const s = useSettings.getState();
  if (!s.sfxOn) return;
  const c = ac();
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.value = freq;
  const t0 = c.currentTime + start;
  const peak = gain * s.sfxVolume;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + 0.02);     // soft attack
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0); o.stop(t0 + dur + 0.05);
}

export const sfx = {
  /** Hover entered a button (dwell started). */
  hover: () => tone(520, 0, 0.08, 0.12),
  /** A button was activated. */
  select: () => { tone(520, 0, 0.12, 0.2); tone(780, 0.08, 0.16, 0.2); },
  /** Brush placed on the start dot - stroke begins. */
  start: () => tone(440, 0, 0.18, 0.18, 'triangle'),
  /** Stroke completed (calm major arpeggio). */
  success: () => { tone(392, 0, 0.25, 0.2); tone(494, 0.1, 0.25, 0.2); tone(587, 0.2, 0.32, 0.2); },
  /** Wage added. */
  coin: () => { tone(660, 0, 0.1, 0.15, 'triangle'); tone(990, 0.07, 0.18, 0.12, 'triangle'); },
  /** Stroke reset: gentle descending pair, not a harsh buzzer. */
  reset: () => { tone(494, 0, 0.18, 0.16); tone(370, 0.14, 0.26, 0.16); },
  /** Attention needed (tracking lost / move closer). */
  attention: () => { tone(330, 0, 0.14, 0.2, 'triangle'); tone(330, 0.2, 0.14, 0.2, 'triangle'); },
  pause: () => { tone(587, 0, 0.14, 0.16); tone(440, 0.1, 0.2, 0.16); },
  resume: () => { tone(440, 0, 0.14, 0.16); tone(587, 0.1, 0.2, 0.16); },
  /** Wall finished / end of shift. */
  fanfare: () => { [392, 494, 587, 784].forEach((f, i) => tone(f, i * 0.12, 0.35, 0.16)); },
  /** Soft tick for countdowns. */
  tick: () => tone(700, 0, 0.06, 0.1),
};

/** Continuous, quiet "brush on wall" texture while painting (filtered noise). */
let brushNode: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
export function brushSound(on: boolean) {
  const s = useSettings.getState();
  if (!s.sfxOn) on = false;
  try {
    if (on && !brushNode) {
      const c = ac();
      const buf = c.createBuffer(1, c.sampleRate * 1, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
      const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.8;
      const g = c.createGain(); g.gain.value = 0;
      g.gain.linearRampToValueAtTime(0.05 * s.sfxVolume, c.currentTime + 0.1);
      src.connect(f).connect(g).connect(c.destination); src.start();
      brushNode = { src, gain: g };
    } else if (!on && brushNode) {
      const c = ac(); const n = brushNode; brushNode = null;
      n.gain.gain.linearRampToValueAtTime(0, c.currentTime + 0.1);
      n.src.stop(c.currentTime + 0.15);
    }
  } catch { /* audio unavailable */ }
}
