// Body-relative coordinate frame, calibration, adaptive scale and depth reconstruction.
//
// Body units (BU): origin = active shoulder, x = outward along the shoulder line, y = up,
// z = toward the camera (forward). 1 BU = calibrated arm length (shoulder->elbow + elbow->wrist).
// A path stored in BU can be replayed for any person / arm: P = O_user + L_user * (x*ex + y*ey).
//
// Robustness to the user shifting in the chair:
//  * the origin follows the shoulder every frame (sideways / up-down shifts are harmless);
//  * the scale ADAPTS: arm lengths are multiplied by (current body size / calibrated body size),
//    measured from shoulder width and torso length, so leaning in or sitting back a little does
//    not break the measurements. Only large distance changes pause the game.
//  * posture (lean / shoulder hike) is measured as an ANGLE / relative offset, compared with the
//    posture at the START of each stroke - so a new resting posture never counts as an error.
//
// Depth (z) uses a scaled-orthographic model: a bone that looks shorter than its (scaled) calibrated
// length has rotated out of the image plane by dz = sqrt(L0^2 - l^2). Sign from MediaPipe world z.
import { Arm, Landmark, LM, V2, V3, add, angle3, armIdx, dist, dot, len, median, mid, mul, norm, quantile, sub } from './geometry';
import { PoseFrame } from './poseEngine';

export interface Calibration {
  arm: Arm;
  aspect: number;
  L: number;              // total arm length (image units)
  Lu: number;             // upper-arm length (IU)
  Lf: number;             // forearm length (IU)
  Lh?: number;            // wrist -> middle of the hand (IU), for wrist/hand exercises
  shoulderWidth: number;  // IU
  torsoLen: number;       // shoulder-mid to hip-mid (IU), 0 if hips were not visible
  shoulderMid: V2;        // IU at calibration
  ex: V2;                 // outward axis (IU, unit)
  ey: V2;                 // up axis (IU, unit)
  hikeRef: number;        // (other.y - active.y)/L at calibration
  at: number;
}

export const toIU = (p: V2, aspect: number): V2 => ({ x: p.x * aspect, y: p.y });
export const fromIU = (p: V2, aspect: number): V2 => ({ x: p.x / aspect, y: p.y });

/** Compute outward/up axes from the shoulder line. */
export function axesFor(active: V2, other: V2) {
  const ex = norm(sub(active, other));
  let ey: V2 = { x: ex.y, y: -ex.x };
  if (ey.y > 0) ey = { x: -ey.x, y: -ey.y };
  return { ex, ey };
}

const hipsVisible = (f: PoseFrame) => (f.lm[LM.L_HIP].visibility ?? 0) > 0.5 && (f.lm[LM.R_HIP].visibility ?? 0) > 0.5 && f.lm[LM.L_HIP].y < 1 && f.lm[LM.R_HIP].y < 1;

function torsoLenIU(f: PoseFrame) {
  if (!hipsVisible(f)) return 0;
  const a = f.aspect;
  const s = mid(toIU(f.lm[LM.L_SHOULDER], a), toIU(f.lm[LM.R_SHOULDER], a));
  const h = mid(toIU(f.lm[LM.L_HIP], a), toIU(f.lm[LM.R_HIP], a));
  return dist(s, h);
}

/** Build a calibration from a window of frames where the user holds the active arm straight out to the side. */
export function calibrate(frames: PoseFrame[], arm: Arm): Calibration | null {
  if (frames.length < 5) return null;
  const a = frames[0].aspect;
  const ix = armIdx(arm);
  const Lu: number[] = [], Lf: number[] = [], Lh: number[] = [], sw: number[] = [], tl: number[] = [];
  const sm: V2[] = [], act: V2[] = [], oth: V2[] = [];
  for (const f of frames) {
    const s = toIU(f.lm[ix.shoulder], a), e = toIU(f.lm[ix.elbow], a), w = toIU(f.lm[ix.wrist], a), o = toIU(f.lm[ix.other], a);
    Lu.push(dist(s, e)); Lf.push(dist(e, w)); sw.push(dist(s, o));
    Lh.push(dist(w, handIU(f, arm)));
    const t = torsoLenIU(f); if (t) tl.push(t);
    act.push(s); oth.push(o); sm.push({ x: (s.x + o.x) / 2, y: (s.y + o.y) / 2 });
  }
  // A bone can only LOOK shorter than it is (when it turns toward/away from the camera), never
  // longer. So a high percentile, not the median, is the best estimate of its true length.
  // (Using the median under-estimated the arm when it was held slightly forward or bent, and then
  // a fully extended arm went past the tape.) Percentile 0.85 still rejects single-frame outliers.
  const mU = quantile(Lu, 0.85), mF = quantile(Lf, 0.85);
  const active = { x: median(act.map((p) => p.x)), y: median(act.map((p) => p.y)) };
  const other = { x: median(oth.map((p) => p.x)), y: median(oth.map((p) => p.y)) };
  const { ex, ey } = axesFor(active, other);
  const L = mU + mF;
  return {
    arm, aspect: a, L, Lu: mU, Lf: mF, Lh: quantile(Lh, 0.85),
    shoulderWidth: median(sw),
    torsoLen: tl.length > frames.length / 2 ? median(tl) : 0,
    shoulderMid: { x: median(sm.map((p) => p.x)), y: median(sm.map((p) => p.y)) },
    ex, ey,
    hikeRef: (other.y - active.y) / L,
    at: Date.now(),
  };
}

/** A fallback calibration estimated from body proportions (used when the user skips calibration). */
export function estimateCalibration(f: PoseFrame, arm: Arm): Calibration {
  const a = f.aspect, ix = armIdx(arm);
  const s = toIU(f.lm[ix.shoulder], a), o = toIU(f.lm[ix.other], a);
  const sw = dist(s, o);
  const L = sw * 1.55;
  const { ex, ey } = axesFor(s, o);
  return { arm, aspect: a, L, Lu: L * 0.54, Lf: L * 0.46, shoulderWidth: sw, torsoLen: torsoLenIU(f), shoulderMid: { x: (s.x + o.x) / 2, y: (s.y + o.y) / 2 }, ex, ey, hikeRef: (o.y - s.y) / L, at: Date.now() };
}

/**
 * Current body size relative to calibration (1 = same distance from the camera).
 * Uses torso length when the hips are visible (robust to turning the shoulders) and shoulder width.
 */
export function bodyScale(f: PoseFrame, cal: Calibration) {
  const a = f.aspect;
  const sw = dist(toIU(f.lm[LM.L_SHOULDER], a), toIU(f.lm[LM.R_SHOULDER], a)) / cal.shoulderWidth;
  const t = cal.torsoLen ? torsoLenIU(f) : 0;
  return t ? (sw + t / cal.torsoLen) / 2 : sw;
}

/** Calibration with all lengths scaled to the user's current distance. */
export function scaledCal(cal: Calibration, s: number): Calibration {
  if (Math.abs(s - 1) < 1e-3) return cal;
  return { ...cal, L: cal.L * s, Lu: cal.Lu * s, Lf: cal.Lf * s, Lh: cal.Lh ? cal.Lh * s : cal.Lh, shoulderWidth: cal.shoulderWidth * s, torsoLen: cal.torsoLen * s };
}

export function activeShoulderIU(f: PoseFrame, cal: Calibration) {
  return toIU(f.lm[armIdx(cal.arm).shoulder], f.aspect);
}

/** Image units -> body units, relative to the user's current shoulder (axes locked at calibration). */
export function toBody(pIU: V2, originIU: V2, cal: Calibration): V2 {
  const d = sub(pIU, originIU);
  return { x: dot(d, cal.ex) / cal.L, y: dot(d, cal.ey) / cal.L };
}

/** Body units -> image units. */
export function fromBody(p: V2, originIU: V2, cal: Calibration): V2 {
  return add(originIU, add(mul(cal.ex, p.x * cal.L), mul(cal.ey, p.y * cal.L)));
}

export interface ArmPose3D {
  shoulder: V3; elbow: V3; wrist: V3; hand: V2;   // body units
  confidence: number;                               // 0..1, low when a bone points at the camera
  wristVisible: boolean;
  elevation3D: number; elevation2D: number;         // shoulder elevation (abduction/flexion) degrees
  elbowFlex3D: number; elbowFlex2D: number;         // elbow flexion degrees (0 = straight)
}

const DOWN: V3 = { x: 0, y: -1, z: 0 };

/** Reconstruct the active arm in 3D body units (scaled-orthographic depth recovery). */
export function reconstructArm(f: PoseFrame, cal: Calibration): ArmPose3D {
  const ix = armIdx(cal.arm);
  const O = toIU(f.lm[ix.shoulder], f.aspect);
  const e2 = toBody(toIU(f.lm[ix.elbow], f.aspect), O, cal);
  const w2 = toBody(toIU(f.lm[ix.wrist], f.aspect), O, cal);
  const h2 = toBody(toIU(f.lm[ix.index], f.aspect), O, cal);
  const Lu0 = cal.Lu / cal.L, Lf0 = cal.Lf / cal.L;
  const lu = len(e2), lf = dist(e2, w2);

  const sgn = (zNear: number, zFar: number) => {
    const d = zFar - zNear;             // >0 means the distal joint is further from the camera
    if (Math.abs(d) < 0.03) return 1;   // ambiguous: assume forward (most rehab movements are anterior)
    return d < 0 ? 1 : -1;
  };
  const W = f.world;
  const su = sgn(W[ix.shoulder].z, W[ix.elbow].z);
  const sf = sgn(W[ix.elbow].z, W[ix.wrist].z);
  const dzu = Math.sqrt(Math.max(0, Lu0 * Lu0 - lu * lu)) * su;
  const dzf = Math.sqrt(Math.max(0, Lf0 * Lf0 - lf * lf)) * sf;

  const shoulder: V3 = { x: 0, y: 0, z: 0 };
  const elbow: V3 = { x: e2.x, y: e2.y, z: dzu };
  const wrist: V3 = { x: w2.x, y: w2.y, z: dzu + dzf };
  const confidence = Math.min(1, Math.min(lu / Lu0, lf / Lf0) / 0.35);

  const up3 = { x: elbow.x, y: elbow.y, z: elbow.z };
  const fa3 = { x: wrist.x - elbow.x, y: wrist.y - elbow.y, z: wrist.z - elbow.z };
  const up2 = { x: elbow.x, y: elbow.y, z: 0 };
  const fa2 = { x: wrist.x - elbow.x, y: wrist.y - elbow.y, z: 0 };
  return {
    shoulder, elbow, wrist, hand: h2, confidence,
    wristVisible: (f.lm[ix.wrist].visibility ?? 1) > 0.5,
    elevation3D: angle3(up3, DOWN),
    elevation2D: angle3(up2, DOWN),
    elbowFlex3D: angle3(up3, fa3),
    elbowFlex2D: angle3(up2, fa2),
  };
}

export interface Posture {
  tilt: number | null;   // trunk side-lean: angle of hip-mid -> shoulder-mid from vertical (deg), null if hips hidden
  roll: number;          // shoulder line angle from horizontal (deg)
  hike: number;          // (other.y - active.y) / L, BU (positive = active shoulder higher)
}

/** Translation-invariant posture measures (independent of where the user sits). */
export function posture(f: PoseFrame, cal: Calibration): Posture {
  const a = f.aspect, ix = armIdx(cal.arm);
  const ls = toIU(f.lm[LM.L_SHOULDER], a), rs = toIU(f.lm[LM.R_SHOULDER], a);
  const sm = mid(ls, rs);
  let tilt: number | null = null;
  if (hipsVisible(f)) {
    const hm = mid(toIU(f.lm[LM.L_HIP], a), toIU(f.lm[LM.R_HIP], a));
    tilt = (Math.atan2(sm.x - hm.x, hm.y - sm.y) * 180) / Math.PI;
  }
  const roll = (Math.atan2(rs.y - ls.y, rs.x - ls.x) * 180) / Math.PI;
  const hike = (f.lm[ix.other].y - f.lm[ix.shoulder].y) / cal.L;
  return { tilt, roll, hike };
}

export function isLandmarkVisible(l: Landmark, thr = 0.5) {
  return (l.visibility ?? 1) >= thr && l.x > -0.02 && l.x < 1.02 && l.y > -0.02 && l.y < 1.02;
}

// ---------------------------------------------------------------------------------------------
// Upper-limb joints other than the arm as a whole.
//
// Every exercise traces ONE body point (the "effector") inside a frame anchored to the body part it
// moves relative to, measured in that user's own segment length:
//   wrist    - wrist relative to the shoulder, unit = arm length     (shoulder & elbow movements)
//   hand     - middle of the hand relative to the wrist, unit = hand length  (wrist movements)
//   shoulder - shoulder relative to the ear, unit = 1/4 arm length   (shoulder-girdle: shrug)
// So one reference path still fits every body size, and the same scorer/tape works for all.
// ---------------------------------------------------------------------------------------------
export type Joint = 'wrist' | 'hand' | 'shoulder';

export interface JointFrame { origin: V2; unit: number; ex: V2; ey: V2 }

/** Middle of the hand (between the index and little-finger knuckles), image units. */
export function handIU(f: PoseFrame, arm: Arm): V2 {
  const ix = armIdx(arm), a = f.aspect;
  return mid(toIU(f.lm[ix.index], a), toIU(f.lm[ix.pinky], a));
}

export const SHOULDER_UNIT = 0.25; // shoulder-girdle movements are small: 1 unit = 1/4 arm length

export function jointPointIU(f: PoseFrame, cal: Calibration, joint: Joint): V2 {
  const ix = armIdx(cal.arm), a = f.aspect;
  if (joint === 'hand') return handIU(f, cal.arm);
  if (joint === 'shoulder') return toIU(f.lm[ix.shoulder], a);
  return toIU(f.lm[ix.wrist], a);
}

/** The frame the effector is measured in (before any per-stroke rest offset). */
export function jointFrame(f: PoseFrame, cal: Calibration, joint: Joint): JointFrame {
  const ix = armIdx(cal.arm), a = f.aspect;
  if (joint === 'hand') return { origin: toIU(f.lm[ix.wrist], a), unit: cal.Lh || cal.Lf * 0.33, ex: cal.ex, ey: cal.ey };
  if (joint === 'shoulder') return { origin: toIU(f.lm[ix.ear], a), unit: cal.L * SHOULDER_UNIT, ex: cal.ex, ey: cal.ey };
  return { origin: toIU(f.lm[ix.shoulder], a), unit: cal.L, ex: cal.ex, ey: cal.ey };
}

export const toFrame = (p: V2, fr: JointFrame): V2 => { const d = sub(p, fr.origin); return { x: dot(d, fr.ex) / fr.unit, y: dot(d, fr.ey) / fr.unit }; };
export const fromFrame = (p: V2, fr: JointFrame): V2 => add(fr.origin, add(mul(fr.ex, p.x * fr.unit), mul(fr.ey, p.y * fr.unit)));

export function jointVisible(f: PoseFrame, cal: Calibration, joint: Joint) {
  const ix = armIdx(cal.arm);
  const v = (i: number) => (f.lm[i].visibility ?? 1) > 0.5;
  if (joint === 'hand') return v(ix.wrist) && (v(ix.index) || v(ix.pinky));
  if (joint === 'shoulder') return v(ix.shoulder) && v(ix.ear);
  return v(ix.wrist);
}

/**
 * Keeps refining the bone lengths while the user exercises. Foreshortening only ever makes a
 * bone look SHORTER, so if we keep seeing it longer than calibrated, calibration under-estimated
 * it (arm held a little forward or bent). Lengths are normalised by the current body scale. The
 * estimate uses the 75th percentile of the last ~1.5 s, so it needs the bone to look longer for
 * about 10 frames (single-frame landmark glitches are ignored), never shrinks, and may grow by at
 * most 25%. Because it reacts within a fraction of a second, the user's first stroke already fits.
 */
export class BoneLengthTracker {
  private u: number[] = [];
  private fa: number[] = [];
  constructor(private base: Calibration, private max = 45) {}
  push(f: PoseFrame, scale: number) {
    const ix = armIdx(this.base.arm), a = f.aspect;
    const ok = [ix.shoulder, ix.elbow, ix.wrist].every((i) => (f.lm[i].visibility ?? 1) > 0.7);
    if (!ok || scale <= 0) return;
    const s = toIU(f.lm[ix.shoulder], a), e = toIU(f.lm[ix.elbow], a), w = toIU(f.lm[ix.wrist], a);
    this.u.push(dist(s, e) / scale); this.fa.push(dist(e, w) / scale);
    if (this.u.length > this.max) { this.u.shift(); this.fa.shift(); }
  }
  /** Refined calibration, or null if nothing changed meaningfully. */
  refine(cal: Calibration): Calibration | null {
    if (this.u.length < 12) return null;
    const qu = quantile(this.u, 0.75), qf = quantile(this.fa, 0.75);
    const Lu = Math.min(this.base.Lu * 1.25, Math.max(cal.Lu, qu));
    const Lf = Math.min(this.base.Lf * 1.25, Math.max(cal.Lf, qf));
    if (Lu + Lf < (cal.Lu + cal.Lf) * 1.03) return null; // ignore changes under 3%
    const L = Lu + Lf;
    return { ...cal, Lu, Lf, L, hikeRef: cal.hikeRef * (cal.L / L) };
  }
}

/** Horizontal (transverse-plane) arm angle: 0 = out to the side, 90 = straight ahead toward the
 *  camera. Only defined while the arm is raised near shoulder height (elevation >= 50 deg), else 0. */
export function horizontalAngle(w: { x: number; z: number }, elevation: number) {
  if (elevation < 50) return 0;
  return Math.max(0, (Math.atan2(Math.max(0, w.z), w.x) * 180) / Math.PI);
}

