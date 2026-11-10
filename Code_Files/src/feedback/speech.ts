// Spoken feedback via the browser's built-in Web Speech API (speechSynthesis).
// No model download and no API key: it uses voices installed with the OS/browser.
// Every spoken line is also shown as an on-screen caption (redundant coding for hearing loss).
import { create } from 'zustand';
import { useSettings } from '../store/settings';

interface CaptionStore { text: string; at: number; speaking: boolean; set: (p: Partial<CaptionStore>) => void }
export const useCaption = create<CaptionStore>((set) => ({ text: '', at: 0, speaking: false, set: (p) => set(p) }));

let voices: SpeechSynthesisVoice[] = [];
const synth: SpeechSynthesis | undefined = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
function loadVoices() { if (synth) voices = synth.getVoices(); }
if (synth) { loadVoices(); synth.onvoiceschanged = loadVoices; }

function pickVoice(lang: 'en' | 'hi') {
  const want = lang === 'hi' ? ['hi-IN', 'hi'] : ['en-IN', 'en-GB', 'en-US', 'en'];
  for (const w of want) {
    const v = voices.find((x) => x.lang?.toLowerCase().startsWith(w.toLowerCase()) && /natural|google|online/i.test(x.name))
      ?? voices.find((x) => x.lang?.toLowerCase().startsWith(w.toLowerCase()));
    if (v) return v;
  }
  return undefined;
}

export function hasVoiceFor(lang: 'en' | 'hi') { loadVoices(); return !!pickVoice(lang); }

const recent = new Map<string, number>();

/**
 * Speak a line. `key` de-duplicates repeated prompts (e.g. "move closer") within `cooldownMs`.
 */
export function speak(text: string, opts: { interrupt?: boolean; key?: string; cooldownMs?: number } = {}) {
  const s = useSettings.getState();
  const now = Date.now();
  if (opts.key) {
    const last = recent.get(opts.key) ?? 0;
    if (now - last < (opts.cooldownMs ?? 5000)) return;
    recent.set(opts.key, now);
  }
  if (s.captions) useCaption.getState().set({ text, at: now });
  if (!s.voiceOn || !synth) return;
  if (opts.interrupt !== false) synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = s.lang === 'hi' ? 'hi-IN' : 'en-IN';
  const v = pickVoice(s.lang);
  if (v) u.voice = v;
  u.rate = s.voiceRate;
  u.volume = s.voiceVolume;
  u.pitch = 1;
  u.onstart = () => useCaption.getState().set({ speaking: true });
  u.onend = () => useCaption.getState().set({ speaking: false });
  synth.speak(u);
}

export function stopSpeaking() { synth?.cancel(); useCaption.getState().set({ speaking: false }); }

/** Repeat the last caption (voice command "repeat"). */
export function repeatLast() {
  const t = useCaption.getState().text;
  if (t) speak(t);
}
