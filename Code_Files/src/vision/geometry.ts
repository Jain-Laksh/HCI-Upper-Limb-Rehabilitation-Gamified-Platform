// Geometry helpers + MediaPipe Pose landmark indices.
// Coordinate conventions used across the app:
//  * "display normalised" (DN): MediaPipe normalised coords, MIRRORED in x (selfie view),
//    so x in [0,1] left->right on screen, y in [0,1] top->bottom.
//  * "image units" (IU): isotropic version of DN: u = x * aspect, v = y (aspect = W/H).
//    Distances in IU are comparable horizontally and vertically.
//  * "body units" (BU): body-relative frame anchored at the active shoulder, scaled by arm length.

export interface V2 { x: number; y: number }
export interface V3 { x: number; y: number; z: number }
export interface Landmark extends V3 { visibility?: number }

export const LM = {
  NOSE: 0,
  L_EAR: 7, R_EAR: 8,
  L_SHOULDER: 11, R_SHOULDER: 12,
  L_ELBOW: 13, R_ELBOW: 14,
  L_WRIST: 15, R_WRIST: 16,
  L_PINKY: 17, R_PINKY: 18,
  L_INDEX: 19, R_INDEX: 20,
  L_HIP: 23, R_HIP: 24,
} as const;

export type Arm = 'left' | 'right';

export function armIdx(arm: Arm) {
  return arm === 'right'
    ? { shoulder: LM.R_SHOULDER, elbow: LM.R_ELBOW, wrist: LM.R_WRIST, index: LM.R_INDEX, pinky: LM.R_PINKY, ear: LM.R_EAR, other: LM.L_SHOULDER }
    : { shoulder: LM.L_SHOULDER, elbow: LM.L_ELBOW, wrist: LM.L_WRIST, index: LM.L_INDEX, pinky: LM.L_PINKY, ear: LM.L_EAR, other: LM.R_SHOULDER };
}

export const add = (a: V2, b: V2): V2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: V2, b: V2): V2 => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (a: V2, s: number): V2 => ({ x: a.x * s, y: a.y * s });
export const dot = (a: V2, b: V2) => a.x * b.x + a.y * b.y;
export const len = (a: V2) => Math.hypot(a.x, a.y);
export const dist = (a: V2, b: V2) => Math.hypot(a.x - b.x, a.y - b.y);
export const norm = (a: V2): V2 => { const l = len(a) || 1; return { x: a.x / l, y: a.y / l }; };
export const mid = (a: V2, b: V2): V2 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
export const lerp2 = (a: V2, b: V2, t: number): V2 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

export const sub3 = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const dot3 = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;
export const len3 = (a: V3) => Math.hypot(a.x, a.y, a.z);

/** Angle in degrees between two 3D vectors. */
export function angle3(a: V3, b: V3) {
  const d = dot3(a, b) / ((len3(a) * len3(b)) || 1);
  return (Math.acos(Math.max(-1, Math.min(1, d))) * 180) / Math.PI;
}

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** q-quantile (0..1) of a list, linear interpolation. */
export function quantile(values: number[], q: number) {
  if (!values.length) return 0;
  const a = [...values].sort((x, y) => x - y);
  const i = (a.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return a[lo] + (a[hi] - a[lo]) * (i - lo);
}

export function median(values: number[]) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Distance from point p to segment ab, plus the parameter t in [0,1] of the closest point. */
export function pointSegment(p: V2, a: V2, b: V2) {
  const ab = sub(b, a);
  const l2 = dot(ab, ab) || 1e-9;
  const t = clamp(dot(sub(p, a), ab) / l2, 0, 1);
  const c = add(a, mul(ab, t));
  return { d: dist(p, c), t };
}

/** Resample a polyline to n points evenly spaced by arc length. */
export function resample<T extends V2>(pts: T[], n: number): V2[] {
  if (pts.length < 2) return pts.map((p) => ({ x: p.x, y: p.y }));
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]));
  const total = cum[cum.length - 1] || 1e-9;
  const out: V2[] = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const target = (total * k) / (n - 1);
    while (j < cum.length - 2 && cum[j + 1] < target) j++;
    const seg = cum[j + 1] - cum[j] || 1e-9;
    out.push(lerp2(pts[j], pts[j + 1], (target - cum[j]) / seg));
  }
  return out;
}

export function pathLength(pts: V2[]) {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += dist(pts[i - 1], pts[i]);
  return s;
}
