import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Lang } from '../exercise/types';
import { Arm } from '../vision/geometry';

export type Theme = 'contrast' | 'warm' | 'dark';
export type SessionLength = 'short' | 'standard' | 'long';
export type TapeWidth = 'gentle' | 'standard' | 'precise';
export const TAPE_MULT: Record<TapeWidth, number> = { gentle: 1.35, standard: 1, precise: 0.8 };

export interface Settings {
  textScale: number;       // 1, 1.2, 1.4, 1.7
  buttonScale: number;     // 1, 1.25, 1.5
  theme: Theme;
  lang: Lang;
  voiceOn: boolean;
  voiceRate: number;       // 0.6 - 1.3
  voiceVolume: number;     // 0 - 1
  sfxOn: boolean;
  sfxVolume: number;       // 0 - 1
  captions: boolean;
  handControl: boolean;
  dwellMs: number;         // 1000 - 3000
  voiceCommands: boolean;
  arm: Arm;
  pointerHand: 'other' | 'same';   // which hand drives the menu pointer (default: the hand NOT exercising)
  tapeWidth: TapeWidth;            // corridor tolerance multiplier
  autoAdjust: boolean;             // widen the tape after repeated misses, narrow after neat strokes
  posture: 'seated' | 'standing';
  sessionLength: SessionLength;
  postureChecks: boolean;
  reducedMotion: boolean;
  cameraOpacity: number;   // 0 - 1, how visible the user's own video is behind the wall
  model: 'full' | 'lite';
  showDebug: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  textScale: 1.2, buttonScale: 1.25, theme: 'contrast', lang: 'en',
  voiceOn: true, voiceRate: 0.9, voiceVolume: 1, sfxOn: true, sfxVolume: 0.6, captions: true,
  handControl: true, dwellMs: 1500, voiceCommands: false,
  arm: 'right', pointerHand: 'other', tapeWidth: 'standard', autoAdjust: true, posture: 'seated', sessionLength: 'short', postureChecks: true,
  reducedMotion: false, cameraOpacity: 0.5, model: 'full', showDebug: false,
};

interface SettingsStore extends Settings {
  update: (p: Partial<Settings>) => void;
  reset: () => void;
}

export const useSettings = create<SettingsStore>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      update: (p) => set(p),
      reset: () => set(DEFAULT_SETTINGS),
    }),
    { name: 'dsp.settings', version: 1 },
  ),
);
