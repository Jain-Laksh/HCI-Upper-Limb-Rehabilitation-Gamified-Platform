// Headless checks of the core algorithms with a synthetic person (no webcam needed).
// Run: npm test
(globalThis as any).document = { createElement: () => ({ getContext: () => null }) };
(globalThis as any).window = { innerWidth: 1600, innerHeight: 900, devicePixelRatio: 1 };
import { StrokeScorer } from '../src/exercise/scorer';
import { PRESETS } from '../src/exercise/presets';
import { BoneLengthTracker, bodyScale, calibrate, reconstructArm, scaledCal } from '../src/vision/bodyFrame';
import { matchCommand } from '../src/input/voice';
import { segmentReps, RefFrame } from '../src/exercise/extractReference';
import type { PoseFrame } from '../src/vision/poseEngine';

const ASPECT = 16 / 9;
let failures = 0;
const check = (name: string, ok: boolean, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${info}`); if (!ok) failures++; };

interface Opts {
  elev: number; plane?: 'frontal' | 'sagittal'; elbowFlex?: number; scale?: number; lean?: number; shiftX?: number; wristVis?: number; jitter?: number;
  fwd?: number;    // side raise with the arm turned this many degrees toward the camera
  shrug?: number;  // right shoulder lifted by this much (image units)
  hand?: number;   // hand direction around the wrist, degrees (90 = fingers up, 0 = outward)
}

// Synthetic person facing the camera, display-normalised (mirrored) coords; right arm extends to screen right.
// The arm is modelled in 3D (z toward the camera) and projected orthographically, like a webcam at ~2 m.
function makeFrame(t: number, o: Opts): PoseFrame {
  const sc = o.scale ?? 1;
  const Lu = 0.2 * sc, Lf = 0.17 * sc, sw = 0.22 * sc;           // image units
  const S0 = { x: (0.58 + (o.shiftX ?? 0)) * ASPECT, y: 0.45 };     // right shoulder, relaxed
  const S = { x: S0.x, y: S0.y - (o.shrug ?? 0) };                    // right shoulder (after shrug)
  const O = { x: S0.x - sw, y: S0.y };                              // left shoulder
  const e = (o.elev * Math.PI) / 180;                               // 0 = arm hanging down
  let ux: number, uy: number, uz: number;
  if (o.plane === 'sagittal') { ux = 0; uy = Math.cos(e); uz = Math.sin(e); } // forward raise
  else { const fw = ((o.fwd ?? 0) * Math.PI) / 180; ux = Math.sin(e) * Math.cos(fw); uy = Math.cos(e); uz = Math.sin(e) * Math.sin(fw); } // side raise
  const E = { x: S.x + ux * Lu, y: S.y + uy * Lu, z: uz * Lu };
  let fx = ux, fy = uy, fz = uz;
  if (o.elbowFlex) { const f = (o.elbowFlex * Math.PI) / 180; fx = 0; fy = Math.cos(f); fz = Math.sin(f); } // forearm comes forward
  const W = { x: E.x + fx * Lf, y: E.y + fy * Lf, z: E.z + fz * Lf };
  const lean = o.lean ?? 0;
  const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.99 }));
  // `lean` tilts the upper body sideways (hips stay put); `shiftX` moves the whole person.
  const j = o.jitter ?? 0;
  const set = (i: number, p: { x: number; y: number }, upper = true) => { lm[i] = { x: p.x / ASPECT + (upper ? lean : 0) + j, y: p.y, z: 0, visibility: 0.99 }; };
  set(12, S); set(11, O); set(14, E); set(16, W);
  // Hand (index + little-finger knuckles), 0.06 IU from the wrist: along the forearm, or at angle `hand`.
  const Lh = 0.06 * sc;
  const fl = Math.hypot(fx, fy) || 1;
  const hd = o.hand !== undefined ? { x: Math.cos((o.hand * Math.PI) / 180), y: -Math.sin((o.hand * Math.PI) / 180) } : { x: fx / fl, y: fy / fl };
  const Hm = { x: W.x + hd.x * Lh, y: W.y + hd.y * Lh };
  set(20, { x: Hm.x - hd.y * 0.012, y: Hm.y + hd.x * 0.012 }); set(18, { x: Hm.x + hd.y * 0.012, y: Hm.y - hd.x * 0.012 });
  set(8, { x: S0.x - 0.06, y: S0.y - 0.2 }); set(7, { x: O.x + 0.06, y: O.y - 0.2 }); // ears
  set(13, { x: O.x - 0.02, y: O.y + Lu }); set(15, { x: O.x - 0.02, y: O.y + Lu + Lf });
  set(0, { x: (S0.x + O.x) / 2, y: S0.y - 0.18 }); set(24, { x: S0.x - 0.03, y: S0.y + 0.45 }, false); set(23, { x: O.x + 0.03, y: O.y + 0.45 }, false);
  if (o.wristVis !== undefined) lm[16].visibility = o.wristVis;
  const world = lm.map((p) => ({ ...p, z: 0 }));
  world[14] = { ...world[14], z: -E.z * 2.5 }; world[16] = { ...world[16], z: -W.z * 2.5 }; // smaller z = closer
  return { t, aspect: ASPECT, lm, world, people: 1, luminance: 120 };
}

// ---- Calibration (arm straight out to the side) ----
const cal = calibrate(Array.from({ length: 30 }, (_, i) => makeFrame(i * 33, { elev: 90 })), 'right')!;
check('calibration arm length', Math.abs(cal.L - 0.37) < 0.01, `L=${cal.L.toFixed(3)} (expected 0.370)`);

// ---- Depth reconstruction ----
{
  const a = reconstructArm(makeFrame(0, { elev: 60, plane: 'sagittal' }), cal);
  check('3D elevation recovers a forward raise', Math.abs(a.elevation3D - 60) < 3, `3D=${a.elevation3D.toFixed(1)}° vs 2D=${a.elevation2D.toFixed(1)}° (true 60°)`);
  check('2D alone under-reports it (foreshortening)', a.elevation2D < 5);
  const c = reconstructArm(makeFrame(0, { elev: 0, elbowFlex: 70 }), cal);
  check('3D elbow flexion recovers a curl', Math.abs(c.elbowFlex3D - 70) < 4, `3D=${c.elbowFlex3D.toFixed(1)}° vs 2D=${c.elbowFlex2D.toFixed(1)}° (true 70°)`);
  check('wrist depth positive toward camera', c.wrist.z > 0.2, `z=${c.wrist.z.toFixed(2)} BU`);
}

// ---- Scorer ----
const side = PRESETS.find((p) => p.id === 'side-raise')!;
function runStroke(perturb: (i: number) => Partial<Opts> = () => ({}), scale = 1, calib = cal, base: Partial<Opts> = {}, refine = false, waitFrames = 30) {
  const sc = new StrokeScorer(side, calib, true);
  let s = 1; // adaptive scale, updated between strokes like PaintStage
  const bones = new BoneLengthTracker(calib);
  let cur = calib, n = 0;
  const events: string[] = [];
  let t = 0, res: any = null;
  const push = (o: Opts) => {
    t += 33; const f = makeFrame(t, { scale, ...base, ...o });
    if (sc.state === 'waitStart') s += (bodyScale(f, cur) - s) * 0.06;
    if (refine) { bones.push(f, s); if (++n % 5 === 0) { const r = bones.refine(cur); if (r) cur = r; } }
    for (const e of sc.update(f, scaledCal(cur, s))) { events.push(e.type === 'error' ? `error:${e.reason}` : e.type); if (e.type === 'complete') res = e.result; } };
  for (let i = 0; i < waitFrames; i++) push({ elev: 12 });                                     // hold on the start dot
  for (let i = 0; i <= 90; i++) push({ elev: 12 + i, ...perturb(i) });                // 3 s stroke 12°→102°
  for (let i = 0; i < 30; i++) push({ elev: 102 });                                    // hold at the end
  return { events, res, cal: cur };
}
{
  const { events, res } = runStroke();
  check('good stroke completes', events.includes('started') && events.includes('complete'), events.join(','));
  check('good stroke scores high neatness', res && res.accuracy >= 70, `accuracy=${res?.accuracy}`);
  check('peak range of motion measured', res && Math.abs(res.peakMetric3D - 102) < 8, `peak=${res?.peakMetric3D}°`);
}
{
  const cal2 = calibrate(Array.from({ length: 30 }, (_, i) => makeFrame(i * 33, { elev: 90, scale: 0.7 })), 'right')!;
  const { events } = runStroke(() => ({}), 0.7, cal2);
  check('same stroke works for a smaller / further person', events.includes('complete'), events.join(','));
}
{
  const { events } = runStroke((i) => (i > 30 && i < 70 ? { elbowFlex: 80 } : {}));
  check('leaving the tape resets the stroke', events.includes('error:offPath'), events.join(','));
}
{
  const { events } = runStroke((i) => (i > 20 ? { lean: 0.09 } : {}));
  check('trunk side-lean during a stroke resets it', events.includes('error:lean'), events.join(','));
}
{
  const { events } = runStroke(() => ({}), 1, cal, { shiftX: 0.08 });
  check('sitting in a different spot (whole-body shift) is NOT an error', events.includes('complete') && !events.some((e) => e.startsWith('error')), events.join(','));
}
{
  const { events } = runStroke(() => ({}), 1.12, cal);
  check('moving ~12% closer is absorbed by the adaptive scale', events.includes('complete') && !events.some((e) => e.startsWith('error')), events.join(','));
}
{
  const { events } = runStroke((i) => (i > 30 && i < 70 ? { elbowFlex: 80, wristVis: 0.2 } : {}));
  check('barely-visible wrist does not count as off the tape', !events.includes('error:offPath'), events.join(','));
}
{
  const { events } = runStroke((i) => ({ jitter: (i % 2 ? 1 : -1) * 0.012 }));
  check('landmark jitter at the tape edge does not reset (hysteresis)', events.includes('complete') && !events.includes('error:offPath'), events.join(','));
}

// ---- Arm length under-estimated at calibration (arm held 30° toward the camera) ----
{
  const calFwd = calibrate(Array.from({ length: 30 }, (_, i) => makeFrame(i * 33, { elev: 90, fwd: 30 })), 'right')!;
  check('calibration with the arm held forward under-estimates the arm', calFwd.L < 0.34, `L=${calFwd.L.toFixed(3)} (true 0.370)`);
  const before = runStroke(() => ({}), 1, calFwd);
  check('...then a fully extended arm goes past the tape (the pilot bug)', !before.events.includes('complete'), before.events.join(','));
  const after = runStroke(() => ({}), 1, calFwd, {}, true);
  check('live bone-length refinement fixes it: stroke completes', after.events.includes('complete') && !after.events.some((e) => e.startsWith('error')), `${after.events.join(',')} L→${after.cal.L.toFixed(3)}`);
  check('refined arm length is close to the true length', Math.abs(after.cal.L - 0.37) < 0.015, `L=${after.cal.L.toFixed(3)}`);
  const okCal = runStroke((i) => ({ jitter: (i % 2 ? 1 : -1) * 0.004 }), 1, cal, {}, true);
  check('refinement leaves a correct calibration alone', Math.abs(okCal.cal.L - cal.L) < 0.005 && okCal.events.includes('complete'), `L=${okCal.cal.L.toFixed(3)}`);
}

// ---- Other upper-limb joints ----
function runJoint(id: string, frames: Partial<Opts>[]) {
  const ex = PRESETS.find((p) => p.id === id)!;
  const sc = new StrokeScorer(ex, cal, true);
  const events: string[] = []; let res: any = null; let t = 0;
  for (const o of frames) {
    t += 33;
    for (const e of sc.update(makeFrame(t, { elev: 0, ...o }), cal)) { events.push(e.type === 'error' ? `error:${e.reason}` : e.type); if (e.type === 'complete') res = e.result; }
  }
  return { events, res, snap: sc.snap };
}
const seq = (n: number, f: (i: number) => Partial<Opts>) => Array.from({ length: n }, (_, i) => f(i));
{
  const rise = 0.03; // ~4.5 cm on a 0.37 IU (~60 cm) arm
  const { events, res } = runJoint('shrug', [...seq(40, () => ({})), ...seq(30, (i) => ({ shrug: (rise * i) / 29 })), ...seq(45, () => ({ shrug: rise }))]);
  check('shoulder shrug (shoulder girdle) is tracked and completes', events.includes('complete'), `${events.join(',')} peak=${res?.peakMetric3D}°`);
  const none = runJoint('shrug', seq(150, () => ({})));
  check('sitting still does not count as a shrug', !none.events.includes('complete'), none.events.join(','));
}
{
  const { events, res } = runJoint('wrist-wiper', [...seq(30, () => ({ hand: 120 })), ...seq(40, (i) => ({ hand: 120 - (50 * i) / 39 })), ...seq(20, () => ({ hand: 70 }))]);
  check('wrist side-to-side (wrist joint) is tracked and completes', events.includes('complete'), `${events.join(',')} range=${res?.peakMetric3D}°`);
  check('wrist range of motion measured', !!res && Math.abs(res.peakMetric3D - 50) < 6, `range=${res?.peakMetric3D}° (true 50°)`);
  const half = runJoint('wrist-wiper', [...seq(30, () => ({ hand: 120 })), ...seq(25, (i) => ({ hand: 120 - (20 * i) / 24 })), ...seq(40, () => ({ hand: 100 }))]);
  check('a partial wrist movement does not complete', !half.events.includes('complete'), half.events.join(','));
}


// ---- Exercises extracted from the team's demonstration videos (Expert Mode pipeline) ----
{
  const ease = (i: number, n: number) => 0.5 - 0.5 * Math.cos((Math.PI * i) / (n - 1));
  // Side lift: the demonstrator's tape ends a little above shoulder height (about 100 deg in the image).
  const side = runJoint('video-side-lift', [...seq(30, () => ({ elev: 12 })), ...seq(70, (i) => ({ elev: 12 + 88 * ease(i, 70) })), ...seq(30, () => ({ elev: 100 }))]);
  check('video side lift: a side raise completes', side.events.includes('complete') && !side.events.some((e) => e.startsWith('error')), `${side.events.join(',')} peak=${side.res?.peakMetric3D}°`);
  // Front lift: the demonstrator lifted about 20 deg out from straight ahead (arm 70 deg toward the camera).
  const front = runJoint('video-front-lift', [...seq(30, () => ({ elev: 8, fwd: 70 })), ...seq(70, (i) => ({ elev: 8 + 84 * ease(i, 70), fwd: 70 })), ...seq(30, () => ({ elev: 92, fwd: 70 }))]);
  check('video front lift: a forward raise completes, 3D peak near 90 deg', front.events.includes('complete') && Math.abs((front.res?.peakMetric3D ?? 0) - 88) < 12, `${front.events.join(',')} peak3D=${front.res?.peakMetric3D}° 2D=${front.res?.peakMetric2D}°`);
  // Side-to-front swing at shoulder height: fwd 0 -> 88 deg.
  const swing = runJoint('video-swing', [...seq(30, () => ({ elev: 90, fwd: 0 })), ...seq(80, (i) => ({ elev: 90, fwd: 88 * ease(i, 80) })), ...seq(30, () => ({ elev: 90, fwd: 88 }))]);
  check('video swing: a horizontal swing completes and is measured', swing.events.includes('complete') && Math.abs((swing.res?.peakMetric3D ?? 0) - 88) < 12, `${swing.events.join(',')} peak=${swing.res?.peakMetric3D}°`);
  const half = runJoint('video-swing', [...seq(30, () => ({ elev: 90, fwd: 0 })), ...seq(40, (i) => ({ elev: 90, fwd: 35 * ease(i, 40) })), ...seq(40, () => ({ elev: 90, fwd: 35 }))]);
  check('video swing: a half swing does not complete', !half.events.includes('complete'), half.events.join(','));
}

// ---- Voice command matching ----
{
  const cases: [string, string | null][] = [['Pause.', 'pause'], ['Next!', 'next'], ['please continue', 'resume'], ['रुको।', 'pause'], ['Go back.', 'back'], ['I like painting', null]];
  const bad = cases.filter(([txt, want]) => matchCommand(txt) !== want);
  check('voice commands match with punctuation / capitals / Hindi', !bad.length, bad.map(([t]) => `"${t}"→${matchCommand(t)}`).join('; '));
}

// ---- Rep segmentation on a synthetic physio recording (4 reps, 10°→100°→10°, 4 s each) ----
{
  const frames: RefFrame[] = [];
  for (let i = 0; i < 15 * 16; i++) {
    const t = i / 15, ph = (t % 4) / 4;
    const ang = ph < 0.5 ? 10 + 180 * ph : 10 + 180 * (1 - ph);
    const r = (ang * Math.PI) / 180;
    frames.push({ t, ok: true, wristDN: { x: 0, y: 0 }, wrist: { x: Math.sin(r), y: -Math.cos(r) }, depth: 0, elevation: ang, elbowFlex: 5 });
  }
  const reps = segmentReps(frames, 'elevation');
  check('rep segmentation finds 4 reps', reps.length === 4, reps.map((r) => `${r.start.toFixed(1)}–${r.end.toFixed(1)}s peak ${r.peak}°`).join('; '));
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
