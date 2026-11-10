import { useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useNav, Screen } from './store/nav';
import { useSettings } from './store/settings';
import { Page, CaptionBar } from './ui/components';
import { DwellCursor } from './input/DwellCursor';
import { useVoiceCommands } from './input/voice';
import { ScrollAssist } from './input/ScrollAssist';
import { useCommands } from './input/commands';
import { repeatLast } from './feedback/speech';
import { Welcome, MainMenu, RoleSelect, Help, Goodbye } from './screens/basic';
import { SetupCheck, Calibrate } from './screens/Setup';
import { Shift, Training } from './screens/Shift';
import { PaySlip, Progress } from './screens/Results';
import { Settings } from './screens/Settings';
import { Expert } from './screens/Expert';
import { Plan } from './screens/Plan';
import { poseEngine } from './vision/poseEngine';

const SCREENS: Record<Screen, () => JSX.Element | null> = {
  welcome: Welcome, menu: MainMenu, roles: RoleSelect, setup: SetupCheck, calibrate: Calibrate,
  training: Training, shift: Shift, payslip: PaySlip, progress: Progress, settings: Settings,
  help: Help, expert: Expert, goodbye: Goodbye, plan: Plan,
};

const clickFirst = (sel: string) => {
  const el = document.querySelector<HTMLButtonElement>(`.page:last-of-type ${sel}:not([disabled]), .overlay ${sel}:not([disabled])`);
  const overlayEl = document.querySelector<HTMLButtonElement>(`.overlay ${sel}:not([disabled])`);
  (overlayEl ?? el)?.click();
};

export default function App() {
  const stack = useNav((s) => s.stack);
  const screen = stack[stack.length - 1];
  const s = useSettings();

  // Apply display settings globally (theme, text scale, button scale, reduced motion).
  useEffect(() => {
    const r = document.documentElement;
    r.dataset.theme = s.theme;
    r.style.setProperty('--text-scale', String(s.textScale));
    r.style.setProperty('--btn-scale', String(s.buttonScale));
    r.dataset.reducedMotion = String(s.reducedMotion);
    r.lang = s.lang === 'hi' ? 'hi' : 'en';
  }, [s.theme, s.textScale, s.buttonScale, s.reducedMotion, s.lang]);

  // Hand-side layout: controls are placed on the side of the hand that works the pointer
  // (see the "hand-side layout" block in styles.css). 'none' when the hand pointer is off.
  useEffect(() => {
    const hand = !s.handControl ? 'none' : s.pointerHand === 'other' ? (s.arm === 'right' ? 'left' : 'right') : s.arm;
    document.documentElement.dataset.hand = hand;
  }, [s.handControl, s.pointerHand, s.arm]);

  // v1.4: the hand pointer works from the main menu on, not only after the first shift starts.
  // The camera starts on the first screen after Welcome (Welcome says so beforehand), whenever hand
  // control is on. start() is idempotent; a refused permission is not re-asked until settings change.
  const handControl = s.handControl;
  const model = s.model;
  const afterWelcome = screen !== 'welcome' && screen !== 'goodbye';
  useEffect(() => {
    if (handControl && afterWelcome) poseEngine.start(model).catch(() => {});
  }, [handControl, afterWelcome, model]);

  useVoiceCommands();
  const inShift = screen === 'shift' || screen === 'training';
  useCommands({
    next: () => clickFirst('[data-primary]'),
    back: () => !inShift && clickFirst('[data-back]'),
    help: () => !inShift && useNav.getState().go('help'),
    menu: () => !inShift && useNav.getState().home(),
    repeat: () => repeatLast(),
  });

  // Global keyboard shortcuts (in addition to normal Tab/Enter navigation).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'Escape' && !inShift) clickFirst('[data-back]');
      if (e.key.toLowerCase() === 'r' && !e.ctrlKey && !e.metaKey) repeatLast();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [inShift]);

  const Comp = SCREENS[screen] ?? MainMenu;
  return (
    <>
      <AnimatePresence mode="wait">
        <Page k={`${screen}-${stack.length}`}><Comp /></Page>
      </AnimatePresence>
      <CaptionBar />
      <ScrollAssist />
      <DwellCursor />
    </>
  );
}
