import { create } from 'zustand';
import { stopSpeaking, useCaption } from '../feedback/speech';

export type Screen =
  | 'welcome' | 'menu' | 'roles' | 'setup' | 'calibrate' | 'training' | 'shift' | 'payslip'
  | 'progress' | 'settings' | 'help' | 'expert' | 'goodbye' | 'plan';

interface NavStore {
  stack: Screen[];
  /** What to open after setup/calibration finishes. */
  after: 'training' | 'shift';
  go: (s: Screen) => void;
  replace: (s: Screen) => void;
  back: () => void;
  home: () => void;
  setAfter: (a: 'training' | 'shift') => void;
  reset: (stack: Screen[]) => void;
}

/** Leaving a screen silences its speech and caption, so guidance never refers to a screen that is gone. */
function leave() { stopSpeaking(); useCaption.getState().set({ text: '', at: 0 }); }

export const useNav = create<NavStore>((set) => ({
  stack: ['welcome'],
  after: 'shift',
  go: (s) => { leave(); set((st) => ({ stack: [...st.stack, s] })); },
  replace: (s) => set((st) => ({ stack: [...st.stack.slice(0, -1), s] })),
  back: () => { leave(); set((st) => ({ stack: st.stack.length > 1 ? st.stack.slice(0, -1) : st.stack })); },
  home: () => { leave(); set({ stack: ['menu'] }); },
  setAfter: (after) => set({ after }),
  reset: (stack) => { leave(); set({ stack }); },
}));

export const currentScreen = () => { const s = useNav.getState().stack; return s[s.length - 1]; };
