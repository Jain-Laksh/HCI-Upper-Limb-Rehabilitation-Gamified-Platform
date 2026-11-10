import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Exercise } from '../exercise/types';
import { PRESETS } from '../exercise/presets';

interface LibraryStore {
  custom: Exercise[];                 // exercises approved in Expert Mode
  enabled: Record<string, boolean>;   // which exercises appear as walls in a shift
  addCustom: (e: Exercise) => void;
  removeCustom: (id: string) => void;
  toggle: (id: string, v: boolean) => void;
}

export const useLibrary = create<LibraryStore>()(
  persist(
    (set) => ({
      custom: [],
      enabled: Object.fromEntries(PRESETS.map((p) => [p.id, true])),
      addCustom: (e) => set((s) => ({ custom: [...s.custom.filter((c) => c.id !== e.id), e], enabled: { ...s.enabled, [e.id]: true } })),
      removeCustom: (id) => set((s) => ({ custom: s.custom.filter((c) => c.id !== id) })),
      toggle: (id, v) => set((s) => ({ enabled: { ...s.enabled, [id]: v } })),
    }),
    { name: 'dsp.library', version: 1 },
  ),
);

export function allExercises(custom: Exercise[]) { return [...PRESETS, ...custom]; }

export function getExercise(id: string): Exercise | undefined {
  return allExercises(useLibrary.getState().custom).find((e) => e.id === id);
}

export function enabledExercises(): Exercise[] {
  const s = useLibrary.getState();
  const list = allExercises(s.custom).filter((e) => s.enabled[e.id] !== false);
  return list.length ? list : PRESETS.slice(0, 1);
}
