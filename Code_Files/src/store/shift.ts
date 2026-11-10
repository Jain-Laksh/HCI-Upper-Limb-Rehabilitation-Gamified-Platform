// Shift (session) state. Persisted after every stroke so an interrupted shift can be resumed
// from the last completed stroke ("Continue yesterday's job?").
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Localised, RepResult } from '../exercise/types';
import { DAY_END, DAY_START, JOBS, LUNCH_AT, LUNCH_LEN, WALL_BONUS, WALL_NAMES, strokePay } from '../game/economy';
import { enabledExercises, getExercise } from './library';
import { SessionLength } from './settings';
import { ShiftRecord, useProfile } from './profile';

export interface WallPlan { exerciseId: string; reps: number; name: Localised }
export type ShiftPhase = 'briefing' | 'wallIntro' | 'working' | 'wallDone' | 'lunch' | 'done';

interface ShiftStore {
  active: boolean;
  id: string;
  job: Localised;
  walls: WallPlan[];
  wallIndex: number;
  repIndex: number;
  clockMin: number;
  lunchTaken: boolean;
  earnings: number;
  reps: RepResult[];
  phase: ShiftPhase;
  startedAt: number;
  activeMs: number;
  restMs: number;
  events: Record<string, number>;
  lastPay: { base: number; bonus: number; total: number } | null;

  /** Start a shift. `pick` = exercises chosen on the planning screen (one wall each, in order). */
  start: (len: SessionLength, pick?: { ids: string[]; reps: number | 'auto' }) => void;
  skipWall: () => void;
  setPhase: (p: ShiftPhase) => void;
  recordRep: (r: RepResult) => { wallFinished: boolean };
  nextWall: () => void;
  takeLunch: () => void;
  restartWall: () => void;
  addTime: (activeMs: number, restMs: number) => void;
  log: (event: string) => void;
  finish: (completed: boolean) => ShiftRecord;
}

const minutesPerRep = (walls: WallPlan[]) => (DAY_END - DAY_START - LUNCH_LEN) / Math.max(1, walls.reduce((s, w) => s + w.reps, 0));

export const useShift = create<ShiftStore>()(
  persist(
    (set, get) => ({
      active: false, id: '', job: JOBS[0], walls: [], wallIndex: 0, repIndex: 0,
      clockMin: DAY_START, lunchTaken: false, earnings: 0, reps: [], phase: 'briefing',
      startedAt: 0, activeMs: 0, restMs: 0, events: {}, lastPay: null,

      start: (len, pick) => {
        let walls: WallPlan[];
        const chosen = pick?.ids.map((id) => getExercise(id)).filter((e): e is NonNullable<typeof e> => !!e) ?? [];
        if (chosen.length) {
          walls = chosen.map((e, i) => ({ exerciseId: e.id, reps: pick!.reps === 'auto' ? e.reps : pick!.reps, name: WALL_NAMES[i % WALL_NAMES.length] }));
        } else {
          const ex = enabledExercises();
          const count = len === 'short' ? Math.min(3, ex.length) : len === 'standard' ? 4 : 6;
          walls = Array.from({ length: count }, (_, i) => {
            const e = ex[i % ex.length];
            const reps = len === 'short' ? 3 : len === 'standard' ? e.reps : e.reps + 2;
            return { exerciseId: e.id, reps, name: WALL_NAMES[i % WALL_NAMES.length] };
          });
        }
        const n = useProfile.getState().history.length;
        set({
          active: true, id: `shift-${Date.now()}`, job: JOBS[n % JOBS.length], walls,
          wallIndex: 0, repIndex: 0, clockMin: DAY_START, lunchTaken: false, earnings: 0, reps: [],
          phase: 'briefing', startedAt: Date.now(), activeMs: 0, restMs: 0, events: {}, lastPay: null,
        });
      },
      setPhase: (phase) => set({ phase }),
      recordRep: (r) => {
        const s = get();
        const pay = strokePay(r.accuracy);
        const repIndex = s.repIndex + 1;
        const wall = s.walls[s.wallIndex];
        const wallFinished = repIndex >= wall.reps;
        set({
          reps: [...s.reps, r],
          repIndex,
          earnings: s.earnings + pay.total + (wallFinished ? WALL_BONUS : 0),
          clockMin: Math.min(DAY_END, s.clockMin + minutesPerRep(s.walls)),
          lastPay: pay,
        });
        return { wallFinished };
      },
      nextWall: () => {
        const s = get();
        if (s.wallIndex + 1 >= s.walls.length) { set({ phase: 'done', clockMin: DAY_END }); return; }
        const needLunch = !s.lunchTaken && s.clockMin >= LUNCH_AT;
        set({ wallIndex: s.wallIndex + 1, repIndex: 0, phase: needLunch ? 'lunch' : 'wallIntro' });
      },
      skipWall: () => {
        // Skipping keeps pay already earned; the clock jumps over the skipped strokes.
        const s = get();
        const left = s.walls[s.wallIndex].reps - s.repIndex;
        set({ clockMin: Math.min(DAY_END, s.clockMin + left * minutesPerRep(s.walls)) });
        get().log('skipWall');
        get().nextWall();
      },
      takeLunch: () => set((s) => ({ lunchTaken: true, clockMin: s.clockMin + LUNCH_LEN, phase: 'wallIntro' })),
      restartWall: () => set((s) => {
        // Remove this wall's strokes (and their pay) so the wall is painted again from the start.
        const done = s.reps.slice(s.reps.length - s.repIndex);
        const refund = done.reduce((t, r) => t + strokePay(r.accuracy).total, 0);
        return { reps: s.reps.slice(0, s.reps.length - s.repIndex), earnings: s.earnings - refund,
          clockMin: s.clockMin - s.repIndex * minutesPerRep(s.walls), repIndex: 0, phase: 'wallIntro' };
      }),
      addTime: (a, r) => set((s) => ({ activeMs: s.activeMs + a, restMs: s.restMs + r })),
      log: (event) => set((s) => ({ events: { ...s.events, [event]: (s.events[event] ?? 0) + 1 } })),
      finish: (completed) => {
        const s = get();
        const rec: ShiftRecord = {
          id: s.id, date: s.startedAt, jobName: s.job.en,
          wallsPlanned: s.walls.length,
          wallsDone: completed ? s.walls.length : s.wallIndex,
          reps: s.reps, earnings: s.earnings, activeMs: s.activeMs, restMs: s.restMs,
          completed, events: s.events,
        };
        if (s.reps.length) useProfile.getState().addRecord(rec);
        set({ active: false, phase: 'done' });
        return rec;
      },
    }),
    { name: 'dsp.shift', version: 1 },
  ),
);

/** Session-only state (not persisted): calibration must be redone every session. */
import type { Calibration } from '../vision/bodyFrame';
interface SessionStore { calibration: Calibration | null; lastRecord: ShiftRecord | null; set: (p: Partial<SessionStore>) => void }
export const useSession = create<SessionStore>((set) => ({ calibration: null, lastRecord: null, set: (p) => set(p) }));
