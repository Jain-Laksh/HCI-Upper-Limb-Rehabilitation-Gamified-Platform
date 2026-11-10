import { V2 } from '../vision/geometry';
import type { Joint } from '../vision/bodyFrame';

export type Lang = 'en' | 'hi';
export type Localised = Record<Lang, string>;
export type Metric = 'elevation' | 'elbowFlex' | 'wristDev' | 'shrug' | 'horizontal';
/** Which part of the upper limb the exercise trains (shown on the exercise cards). */
export type BodyArea = 'shoulder' | 'elbow' | 'wrist' | 'girdle';

/** An exercise = one reference stroke (path in body units) + scoring parameters. */
export interface Exercise {
  id: string;
  name: Localised;
  instruction: Localised;
  tip?: Localised;
  /**
   * Which body point traces the tape (default 'wrist'): 'wrist' (relative to the shoulder, in arm
   * lengths), 'hand' (relative to the wrist, in hand lengths) or 'shoulder' (relative to the ear).
   */
  joint?: Joint;
  area?: BodyArea;
  /** Reference path of that point in its frame (x outward, y up), resampled to ~60 points. */
  path: V2[];
  /** Optional reconstructed depth along the path (body units, + = toward camera). */
  depth?: number[];
  tolerance: number;       // corridor half-width in body units
  reps: number;            // strokes per wall
  holdMs: number;          // hold at the end of the stroke
  metric: Metric;          // range-of-motion metric reported for this exercise
  romTarget: number;       // degrees, the reference movement's peak
  refDurationMs: number;   // duration of one reference rep
  postureChecks: boolean;  // trunk-lean / shoulder-hike detection
  color: string;           // paint colour for this wall
  depthCue?: boolean;      // show the depth meter (movement toward the camera)
  source: 'preset' | 'expert';
  createdAt?: number;
  approvedBy?: string;
}

export interface RepResult {
  exerciseId: string;
  accuracy: number;       // 0-100, DTW-based
  durationMs: number;
  peakMetric3D: number;   // degrees
  peakMetric2D: number;   // degrees (for comparison, shows effect of depth reconstruction)
  attempts: number;       // 1 + number of resets before success
  resets: Record<string, number>;
  at: number;
}
