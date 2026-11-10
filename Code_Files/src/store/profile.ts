import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { RepResult } from '../exercise/types';

export interface ShiftRecord {
  id: string;
  date: number;
  jobName: string;
  wallsPlanned: number;
  wallsDone: number;
  reps: RepResult[];
  earnings: number;
  activeMs: number;
  restMs: number;
  completed: boolean;
  events: Record<string, number>;   // interaction log for evaluation (dwell selects, voice cmds, tracking losses...)
}

interface ProfileStore {
  name: string;
  trained: boolean;
  createdAt: number;
  history: ShiftRecord[];
  setName: (n: string) => void;
  setTrained: (v: boolean) => void;
  addRecord: (r: ShiftRecord) => void;
  clearHistory: () => void;
}

export const useProfile = create<ProfileStore>()(
  persist(
    (set) => ({
      name: '',
      trained: false,
      createdAt: Date.now(),
      history: [],
      setName: (name) => set({ name }),
      setTrained: (trained) => set({ trained }),
      addRecord: (r) => set((s) => ({ history: [...s.history.filter((h) => h.id !== r.id), r] })),
      clearHistory: () => set({ history: [] }),
    }),
    { name: 'dsp.profile', version: 1 },
  ),
);
