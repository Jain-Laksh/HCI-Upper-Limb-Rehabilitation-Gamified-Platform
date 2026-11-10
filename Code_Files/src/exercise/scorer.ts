// Per-stroke scoring state machine.
//   waitStart --(brush on start dot for 0.6 s)--> painting --(>=95% along tape)--> holding --> complete
//   error (off the tape > 1 s, trunk lean > 15°, large shoulder hike) --> reset to waitStart (no penalty)
//
// Error bounds (tuned for older adults and webcam noise):
//  * Corridor with hysteresis: you are "on the tape" when closer than `tol`, and stay on it until
//    further than 1.25 x tol. Landmark jitter at the edge therefore does not flicker on/off.
//  * Off-tape grace period of 1 s, and the timer is frozen while the wrist is barely visible
//    (a tracking problem is never counted as the user's mistake).
//  * Posture is compared with the posture at the START of the stroke (not with calibration), so
//    shifting in the chair between strokes is never an error. Only change DURING a stroke counts.
//  * Shoulder hike: small rise = spoken hint only; only a large, sustained hike resets.
import { V2, pointSegment } from '../vision/geometry';
import { PoseFrame } from '../vision/poseEngine';
import { Calibration, JointFrame, Posture, fromFrame, jointFrame, jointPointIU, horizontalAngle, jointVisible, posture, reconstructArm, toFrame } from '../vision/bodyFrame';
import { accuracyScore } from './dtw';
import { Exercise, RepResult } from './types';

export type ErrorReason = 'offPath' | 'lean' | 'hike';
export type StrokeState = 'waitStart' | 'painting' | 'holding';
export type HintKey = 'slowDown' | 'toStart' | 'lowConfidence' | 'shoulderUp';

export type ScorerEvent =
  | { type: 'started' }
  | { type: 'error'; reason: ErrorReason }
  | { type: 'complete'; result: RepResult }
  | { type: 'hint'; key: HintKey };

export interface ScorerSnapshot {
  state: StrokeState;
  progress: number;        // 0..1 along the tape
  brush: V2 | null;        // body units
  inCorridor: boolean;
  offPathFrac: number;     // 0..1, how close we are to an off-path reset (for amber warning)
  holdFrac: number;        // 0..1 progress of the end hold
  startFrac: number;       // 0..1 progress of the start-dot dwell
  depth: number;           // reconstructed wrist depth (BU, + toward camera)
  metric3D: number;
  metric2D: number;
  confidence: number;
  dist: number;            // distance from the tape centre line (BU)
  lean: number;            // degrees of trunk-lean change during this stroke
  hike: number;            // shoulder rise during this stroke (BU)
  frame: JointFrame | null; // where the tape is anchored on the body (image units) - for drawing
}

export const BOUNDS = {
  OFF_PATH_MS: 1000,
  HYSTERESIS: 1.25,
  START_RADIUS: 1.5,      // x tol
  START_HOLD_MS: 600,
  LEAN_DEG: 15,           // trunk tilt change (hips visible)
  ROLL_DEG: 20,           // shoulder-line roll change (fallback when hips are hidden)
  HIKE_HINT: 0.12,        // BU
  HIKE_RESET: 0.22,       // BU
  POSTURE_MS: 700,
};

export class StrokeScorer {
  state: StrokeState = 'waitStart';
  private idx = 0;
  private offSince = 0;
  private lastT = 0;
  private startSince = 0;
  private holdSince = 0;
  private postureSince = 0;
  private paintStart = 0;
  private samples: V2[] = [];
  private peak3 = 0;
  private peak2 = 0;
  private attempts = 1;
  private resets: Record<string, number> = {};
  private warnedSpeed = false;
  private warnedHike = false;
  private onTape = false;
  private trackingGap = false;   // wrist was barely visible: allow re-acquiring further along the tape
  private ref: Posture | null = null;
  private curFrame: JointFrame | null = null;
  /** Shoulder-girdle exercises: the user's own relaxed shoulder position (learnt while waiting to start). */
  private rest: { x: number; y: number } | null = null;
  snap: ScorerSnapshot = { state: 'waitStart', progress: 0, brush: null, inCorridor: false, offPathFrac: 0, holdFrac: 0, startFrac: 0, depth: 0, metric3D: 0, metric2D: 0, confidence: 1, dist: 0, lean: 0, hike: 0, frame: null };

  get joint() { return this.ex.joint ?? 'wrist'; }

  /**
   * The frame the tape lives in this frame. For the shoulder girdle it is shifted so the start of the
   * tape sits exactly at the user's relaxed shoulder (people's resting shoulder height differs a lot).
   */
  frame(f: PoseFrame, calNow: Calibration): JointFrame {
    const fr = jointFrame(f, calNow, this.joint);
    if (this.joint !== 'shoulder') return fr;
    const raw = toFrame(jointPointIU(f, calNow, 'shoulder'), fr);
    if (this.state === 'waitStart') {
      if (!this.rest) this.rest = raw;
      else this.rest = { x: this.rest.x + (raw.x - this.rest.x) * 0.08, y: this.rest.y + (raw.y - this.rest.y) * 0.08 };
    }
    const p0 = this.ex.path[0];
    const r = this.rest ?? raw;
    return { ...fr, origin: fromFrame({ x: r.x - p0.x, y: r.y - p0.y }, fr) };
  }

  /** Range-of-motion metric (degrees) for the exercise. Returns [3D, 2D]. */
  private metric(arm: ReturnType<typeof reconstructArm>, brush: V2, fr: JointFrame, calNow: Calibration): [number, number] {
    switch (this.ex.metric) {
      case 'elbowFlex': return [arm.elbowFlex3D, arm.elbowFlex2D];
      case 'horizontal': {
        // Arm swung from the side toward the front at shoulder height. This needs the reconstructed
        // depth: a flat (2D) view cannot see the swing, so the 2D value is reported as 0.
        return [horizontalAngle(arm.wrist, arm.elevation3D), 0];
      }
      case 'wristDev': {
        // Angle the hand has turned from the start of the tape, around the wrist.
        const p0 = this.ex.path[0];
        const a = Math.abs(Math.atan2(brush.y, brush.x) - Math.atan2(p0.y, p0.x)) * 180 / Math.PI;
        const d = Math.min(a, 360 - a);
        return [d, d];
      }
      case 'shrug': {
        // Shoulder (clavicle) elevation angle: rise of the shoulder over half the shoulder width.
        const rise = Math.max(0, brush.y - this.ex.path[0].y) * fr.unit;
        const d = Math.atan2(rise, calNow.shoulderWidth / 2) * 180 / Math.PI;
        return [d, d];
      }
      default: return [arm.elevation3D, arm.elevation2D];
    }
  }

  constructor(public ex: Exercise, public cal: Calibration, public postureChecks = true) {}

  get progress() { return this.idx / (this.ex.path.length - 1); }

  /** Restart the current stroke from its start point (used after an error or on user request). */
  resetStroke(reason?: ErrorReason) {
    if (reason) { this.attempts++; this.resets[reason] = (this.resets[reason] ?? 0) + 1; }
    this.state = 'waitStart'; this.idx = 0; this.offSince = 0; this.startSince = 0; this.holdSince = 0;
    this.postureSince = 0; this.samples = []; this.peak3 = 0; this.peak2 = 0; this.warnedSpeed = false;
    this.warnedHike = false; this.onTape = false; this.ref = null; this.trackingGap = false;
  }

  private nearest(p: V2, wide = false) {
    const path = this.ex.path;
    let best = { d: Infinity, i: this.idx };
    const lo = Math.max(0, this.idx - 3), hi = wide ? path.length - 2 : Math.min(path.length - 2, this.idx + 12);
    for (let i = lo; i <= hi; i++) {
      const r = pointSegment(p, path[i], path[i + 1]);
      if (r.d < best.d) best = { d: r.d, i: i + (r.t > 0.5 ? 1 : 0) };
    }
    return best;
  }

  /** @param calNow calibration scaled to the user's current distance (adaptive scale). */
  update(f: PoseFrame, calNow: Calibration = this.cal): ScorerEvent[] {
    const ev: ScorerEvent[] = [];
    const t = f.t;
    const dt = this.lastT ? t - this.lastT : 0;
    this.lastT = t;
    const arm = reconstructArm(f, calNow);
    const pos = posture(f, calNow);
    const fr = this.frame(f, calNow);
    const brush = this.joint === 'wrist' ? { x: arm.wrist.x, y: arm.wrist.y } : toFrame(jointPointIU(f, calNow, this.joint), fr);
    const visible = jointVisible(f, calNow, this.joint);
    const [m3, m2] = this.metric(arm, brush, fr, calNow);
    this.curFrame = fr;
    const tol = this.ex.tolerance;
    const path = this.ex.path;
    const start = path[0], end = path[path.length - 1];
    let offPathFrac = 0, holdFrac = 0, startFrac = 0, d = 0, lean = 0, hike = 0;

    if (this.state === 'waitStart') {
      d = Math.hypot(brush.x - start.x, brush.y - start.y);
      this.onTape = d < tol * BOUNDS.START_RADIUS;
      if (this.onTape) {
        if (!this.startSince) this.startSince = t;
        startFrac = Math.min(1, (t - this.startSince) / BOUNDS.START_HOLD_MS);
        if (startFrac >= 1) {
          this.state = 'painting'; this.paintStart = t; this.idx = 0; this.samples = [brush];
          this.ref = pos; // posture baseline = how the user sits at the start of THIS stroke
          ev.push({ type: 'started' });
        }
      } else this.startSince = 0;
    } else {
      // ---- posture (compensation) checks, relative to the start of the stroke ----
      if (this.postureChecks && this.ex.postureChecks && this.ref) {
        lean = pos.tilt !== null && this.ref.tilt !== null ? Math.abs(pos.tilt - this.ref.tilt) : Math.abs(pos.roll - this.ref.roll) * (BOUNDS.LEAN_DEG / BOUNDS.ROLL_DEG);
        hike = pos.hike - this.ref.hike;
        if (hike > BOUNDS.HIKE_HINT && !this.warnedHike) { this.warnedHike = true; ev.push({ type: 'hint', key: 'shoulderUp' }); }
        const bad: ErrorReason | null = lean > BOUNDS.LEAN_DEG ? 'lean' : hike > BOUNDS.HIKE_RESET ? 'hike' : null;
        if (bad) {
          if (!this.postureSince) this.postureSince = t;
          if (t - this.postureSince > BOUNDS.POSTURE_MS) { this.resetStroke(bad); ev.push({ type: 'error', reason: bad }); return this.finish(ev, brush, arm, m3, m2, { dist: 0, lean, hike }); }
        } else this.postureSince = 0;
      }

      // ---- corridor with hysteresis ----
      let n = this.nearest(brush);
      if (this.trackingGap && visible && n.d >= tol) {
        const w = this.nearest(brush, true);
        if (w.d < tol) n = w;
      }
      if (visible && n.d < tol) this.trackingGap = false;
      if (!visible) this.trackingGap = true;
      d = n.d;
      this.onTape = this.onTape ? d < tol * BOUNDS.HYSTERESIS : d < tol;
      if (this.onTape) {
        this.offSince = 0;
        if (n.i > this.idx) this.idx = n.i;
        this.samples.push(brush);
        if (arm.confidence > 0.25 || this.joint !== 'wrist') this.peak3 = Math.max(this.peak3, m3);
        this.peak2 = Math.max(this.peak2, m2);
      } else {
        if (!this.offSince) this.offSince = t;
        // A barely-visible wrist is a tracking problem, not the user's mistake: freeze the timer.
        if (!visible) this.offSince = Math.min(t, this.offSince + dt);
        offPathFrac = Math.min(1, (t - this.offSince) / BOUNDS.OFF_PATH_MS);
        if (offPathFrac >= 1) { this.resetStroke('offPath'); ev.push({ type: 'error', reason: 'offPath' }); return this.finish(ev, brush, arm, m3, m2, { dist: d, lean, hike }); }
      }

      // Gentle pacing hint (never an error): much faster than the reference.
      if (!this.warnedSpeed && this.progress > 0.6 && t - this.paintStart < this.ex.refDurationMs * 0.4 * this.progress) {
        this.warnedSpeed = true; ev.push({ type: 'hint', key: 'slowDown' });
      }

      if (this.progress >= 0.95) {
        if (this.state !== 'holding') { this.state = 'holding'; this.holdSince = t; }
        const nearEnd = Math.hypot(brush.x - end.x, brush.y - end.y) < tol * 1.6;
        if (!nearEnd) { this.state = 'painting'; this.holdSince = 0; }
        holdFrac = this.ex.holdMs > 0 ? Math.min(1, (t - this.holdSince) / this.ex.holdMs) : 1;
        if (this.state === 'holding' && holdFrac >= 1) {
          const result: RepResult = {
            exerciseId: this.ex.id,
            accuracy: accuracyScore(this.samples, path, tol),
            durationMs: Math.round(t - this.paintStart),
            peakMetric3D: Math.round(this.peak3 || m3),
            peakMetric2D: Math.round(this.peak2 || m2),
            attempts: this.attempts,
            resets: { ...this.resets },
            at: Date.now(),
          };
          ev.push({ type: 'complete', result });
          this.attempts = 1; this.resets = {};
          this.resetStroke();
        }
      }
    }
    return this.finish(ev, brush, arm, m3, m2, { inCorridor: this.onTape, offPathFrac, holdFrac, startFrac, dist: d, lean, hike });
  }

  private finish(ev: ScorerEvent[], brush: V2, arm: ReturnType<typeof reconstructArm>, m3: number, m2: number,
    extra: Partial<ScorerSnapshot> = {}) {
    this.snap = {
      state: this.state, progress: this.progress, brush,
      inCorridor: false, offPathFrac: 0, holdFrac: 0, startFrac: 0,
      depth: this.joint === 'wrist' ? arm.wrist.z : 0, metric3D: m3, metric2D: m2,
      confidence: this.joint === 'wrist' ? arm.confidence : 1, dist: 0, lean: 0, hike: 0, frame: this.curFrame,
      ...extra,
    };
    return ev;
  }
}
