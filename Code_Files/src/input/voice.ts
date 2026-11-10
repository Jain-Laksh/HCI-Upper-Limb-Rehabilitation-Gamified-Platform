// Voice commands with the browser Web Speech API (SpeechRecognition; Chrome/Edge).
// Note (disclosed in ethics section): Chrome/Edge send audio to Google/Microsoft servers for
// recognition, so it needs internet. A small, fixed command vocabulary keeps it robust.
//
// v1.2 fixes (voice "did not work" in the pilot):
//  * Recognisers return punctuation and capitals ("Pause.", "Next!"); the matcher compared the raw
//    text, so single-word commands never matched. Text is now normalised before matching.
//  * Interim results are used, so a command fires as soon as the word is heard (not after the
//    recogniser decides the sentence ended, which took 1-3 s). Each result fires at most once.
//  * The game's own speech ("say pause to take a break") could be heard by the microphone and
//    trigger commands. Text that is part of what the game is currently saying is ignored.
//  * Errors are reported precisely (no internet / blocked service / no microphone), and restarts
//    back off instead of looping.
import { useEffect } from 'react';
import { create } from 'zustand';
import { useSettings } from '../store/settings';
import { useCaption } from '../feedback/speech';
import { Command, emitCommand } from './commands';

export type VoiceStatus = 'off' | 'listening' | 'unsupported' | 'denied' | 'error' | 'network' | 'nomic';
interface VoiceStore { status: VoiceStatus; heard: string; heardAt: number; set: (p: Partial<VoiceStore>) => void }
export const useVoice = create<VoiceStore>((set) => ({ status: 'off', heard: '', heardAt: 0, set: (p) => set(p) }));

const VOCAB: [Command, string[]][] = [
  ['back', ['go back', 'back', 'पीछे', 'वापस']],
  ['pause', ['pause', 'stop', 'wait', 'break', 'pose', 'paws', 'रुको', 'रुकिए', 'रोको', 'रुक', 'पॉज़', 'पॉज']],
  ['resume', ['resume', 'continue', 'go on', 'carry on', 'चलो', 'शुरू', 'जारी']],
  ['repeat', ['repeat', 'again', 'say again', 'दोबारा', 'फिर से', 'दुबारा']],
  ['help', ['help', 'मदद', 'सहायता']],
  ['menu', ['menu', 'home', 'मेनू', 'होम']],
  ['next', ['next', 'okay', 'ok', 'done', 'yes', 'start', 'आगे', 'अगला', 'ठीक', 'हाँ', 'हां']],
];

/** Lower-case, strip punctuation (incl. Hindi danda) and collapse spaces. */
export function normalise(text: string) {
  return text.toLowerCase().replace(/[.,!?;:"'“”‘’()\-–—।॥]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function matchCommand(text: string): Command | null {
  const t = ` ${normalise(text)} `;
  for (const [cmd, words] of VOCAB) {
    if (words.some((w) => t.includes(` ${w} `))) return cmd;
  }
  return null;
}

/** True if the recognised text is (part of) what the game itself is saying right now - an echo. */
function isEcho(text: string) {
  const c = useCaption.getState();
  const recent = c.speaking || Date.now() - lastSpeechEnd < 800;
  if (!recent) return false;
  const said = ` ${normalise(c.text)} `;
  const heard = normalise(text);
  return heard.length > 0 && said.includes(` ${heard} `);
}
let lastSpeechEnd = 0;
useCaption.subscribe((s, p) => { if (p.speaking && !s.speaking) lastSpeechEnd = Date.now(); });

export const speechRecognitionSupported = () =>
  typeof window !== 'undefined' && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

export function useVoiceCommands() {
  const enabled = useSettings((s) => s.voiceCommands);
  const lang = useSettings((s) => s.lang);
  useEffect(() => {
    const vs = useVoice.getState();
    if (!enabled) { vs.set({ status: 'off' }); return; }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { vs.set({ status: 'unsupported' }); return; }
    let stopped = false;
    let failures = 0;
    let timer = 0;
    let lastCmd: { c: Command; at: number } | null = null;
    const firedFor = new Set<number>();
    const r = new SR();
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 3;
    r.lang = lang === 'hi' ? 'hi-IN' : 'en-IN';

    r.onresult = (e: any) => {
      failures = 0;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const text: string = res[0].transcript;
        if (!text.trim()) continue;
        if (res.isFinal || text.trim().split(/\s+/).length <= 3) useVoice.getState().set({ heard: text.trim(), heardAt: Date.now() });
        if (firedFor.has(i) || isEcho(text)) continue;
        let cmd: Command | null = null;
        for (let k = 0; k < res.length && !cmd; k++) cmd = matchCommand(res[k].transcript);
        if (!cmd) continue;
        // The same command twice within 1.2 s is one utterance (interim + final), not two.
        if (lastCmd && lastCmd.c === cmd && Date.now() - lastCmd.at < 1200) { firedFor.add(i); continue; }
        firedFor.add(i);
        lastCmd = { c: cmd, at: Date.now() };
        emitCommand(cmd);
      }
    };
    r.onerror = (e: any) => {
      const st = useVoice.getState();
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { stopped = true; st.set({ status: 'denied' }); }
      else if (e.error === 'audio-capture') { failures++; st.set({ status: 'nomic' }); }
      else if (e.error === 'network') { failures++; st.set({ status: 'network' }); }
      else if (e.error === 'language-not-supported') { r.lang = 'en-US'; }
      else if (e.error !== 'no-speech' && e.error !== 'aborted') { failures++; st.set({ status: 'error' }); }
    };
    r.onstart = () => { if (!failures) useVoice.getState().set({ status: 'listening' }); };
    r.onaudiostart = () => useVoice.getState().set({ status: 'listening' });
    r.onend = () => {
      if (stopped) return;
      firedFor.clear();
      // Restart (Chrome ends sessions after silence / ~60 s). Back off after repeated failures.
      const delay = failures ? Math.min(10000, 500 * 2 ** failures) : 150;
      timer = window.setTimeout(() => { try { r.start(); } catch { /* already started */ } }, delay);
    };
    try { r.start(); } catch { /* ignore */ }
    return () => { stopped = true; clearTimeout(timer); try { r.abort(); } catch { /* ignore */ } };
  }, [enabled, lang]);
}
