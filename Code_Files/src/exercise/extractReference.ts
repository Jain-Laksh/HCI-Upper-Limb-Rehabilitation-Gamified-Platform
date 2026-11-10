// Expert validation pipeline: physiotherapist video -> pose per frame -> body-relative wrist path
// + joint-angle profile -> rep segmentation -> averaged reference stroke (ground truth).
import { createLandmarker, torsoCentroid, PoseFrame } from '../vision/poseEngine';
import { Arm, LM, V2, armIdx, dist, resample } from '../vision/geometry';
import { Calibration, axesFor, horizontalAngle, reconstructArm, toIU } from '../vision/bodyFrame';
import { BodyArea, Exercise, Metric } from './types';

export interface RefFrame {
  t: number;              // seconds
  ok: boolean;
  wristDN: V2;            // display-normalised (mirrored) image position, for overlay
  wrist: V2;              // body units
  depth: number;          // body units, + toward camera
  elevation: number;      // degrees (3D)
  elbowFlex: number;      // degrees (3D)
  horizontal: number;     // degrees: arm swung from the side (0) toward the front (90), at shoulder height
}

export interface RefRep { start: number; end: number; path: V2[]; peak: number; durationMs: number; include: boolean }

export interface Extraction {
  arm: Arm;
  aspect: number;
  duration: number;
  frames: RefFrame[];
  metric: Metric;
  /** Wrist depth (90th percentile) during the reps, body units: > 0.5 = the hand comes toward the camera. */
  peakDepth: number;
  reps: RefRep[];
  thumbnail: string;
}

const pct = (arr: number[], p: number) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0; };
const smooth = (a: number[], w = 3) => a.map((_, i) => { let s = 0, n = 0; for (let k = -w; k <= w; k++) { const v = a[i + k]; if (v !== undefined) { s += v; n++; } } return s / n; });

function seek(v: HTMLVideoElement, t: number) {
  return new Promise<void>((res) => { const on = () => { v.removeEventListener('seeked', on); res(); }; v.addEventListener('seeked', on); v.currentTime = t; });
}

export async function processVideo(file: File, armChoice: Arm | 'auto', onProgress: (p: number, msg: string) => void): Promise<Extraction> {
  const url = URL.createObjectURL(file);
  const v = document.createElement('video');
  v.src = url; v.muted = true; v.playsInline = true; v.preload = 'auto';
  await new Promise<void>((res, rej) => { v.onloadeddata = () => res(); v.onerror = () => rej(new Error('Could not read this video file.')); });
  const duration = v.duration;
  const aspect = v.videoWidth / v.videoHeight;
  onProgress(0, 'loading');
  const lmk = await createLandmarker('VIDEO', 'full', 2);

  // 1. Pose per frame (15 fps), with simple target lock on the most prominent person.
  const FPS = 15;
  const raw: { t: number; lm: PoseFrame['lm'] | null; world: PoseFrame['world'] | null }[] = [];
  let lockC: V2 | null = null;
  let thumbnail = '';
  for (let t = 0, i = 0; t < duration; t += 1 / FPS, i++) {
    await seek(v, t);
    const res = lmk.detectForVideo(v, Math.round(t * 1000) + 1);
    const poses = (res.landmarks ?? []).map((p) => p.map((q) => ({ x: 1 - q.x, y: q.y, z: q.z, visibility: q.visibility ?? 1 })));
    const worlds = (res.worldLandmarks ?? []).map((p) => p.map((q) => ({ x: -q.x, y: q.y, z: q.z, visibility: q.visibility ?? 1 })));
    let pick = -1;
    if (poses.length) {
      const cents = poses.map(torsoCentroid);
      if (lockC) { let bd = Infinity; cents.forEach((c, k) => { const d = dist(c, lockC!); if (d < bd) { bd = d; pick = k; } }); if (bd > 0.3) pick = -1; }
      else { let bs = -Infinity; poses.forEach((p, k) => { const s = dist(p[LM.L_SHOULDER], p[LM.R_SHOULDER]); if (s > bs) { bs = s; pick = k; } }); }
      if (pick >= 0) lockC = cents[pick];
    }
    raw.push({ t, lm: pick >= 0 ? poses[pick] : null, world: pick >= 0 ? worlds[pick] : null });
    if (i === Math.floor(duration * FPS * 0.3)) {
      const c = document.createElement('canvas'); c.width = 240; c.height = Math.round(240 / aspect);
      const ctx = c.getContext('2d')!; ctx.translate(c.width, 0); ctx.scale(-1, 1); ctx.drawImage(v, 0, 0, c.width, c.height);
      thumbnail = c.toDataURL('image/jpeg', 0.7);
    }
    onProgress(t / duration, 'analysing');
  }
  lmk.close();
  URL.revokeObjectURL(url);
  const valid = raw.filter((r) => r.lm) as { t: number; lm: PoseFrame['lm']; world: PoseFrame['world'] }[];
  if (valid.length < 10) throw new Error('No person could be tracked in this video. Film from the front with the upper body visible.');

  // 2. Which arm is exercising? (the one whose wrist moves more)
  const motion = (a: Arm) => { const w = valid.map((r) => r.lm[armIdx(a).wrist]); const mx = w.reduce((s, p) => s + p.x, 0) / w.length, my = w.reduce((s, p) => s + p.y, 0) / w.length; return w.reduce((s, p) => s + (p.x - mx) ** 2 + (p.y - my) ** 2, 0); };
  const arm: Arm = armChoice === 'auto' ? (motion('right') >= motion('left') ? 'right' : 'left') : armChoice;
  const ix = armIdx(arm);

  // 3. Calibration from the video itself: true bone length = 95th percentile of observed 2D length
  //    (at some point the moving arm passes through the image plane).
  const Lu = pct(valid.map((r) => dist(toIU(r.lm[ix.shoulder], aspect), toIU(r.lm[ix.elbow], aspect))), 0.95);
  const Lf = pct(valid.map((r) => dist(toIU(r.lm[ix.elbow], aspect), toIU(r.lm[ix.wrist], aspect))), 0.95);
  const s0 = toIU(valid[0].lm[ix.shoulder], aspect), o0 = toIU(valid[0].lm[ix.other], aspect);
  const { ex, ey } = axesFor(s0, o0);
  const L = Lu + Lf;
  const cal: Calibration = { arm, aspect, L, Lu, Lf, shoulderWidth: dist(s0, o0), torsoLen: 0, shoulderMid: { x: (s0.x + o0.x) / 2, y: (s0.y + o0.y) / 2 }, ex, ey, hikeRef: (o0.y - s0.y) / L, at: Date.now() };

  // 4. Per-frame body-relative wrist + 3D angles.
  let frames: RefFrame[] = raw.map((r) => {
    if (!r.lm || !r.world) return { t: r.t, ok: false, wristDN: { x: 0, y: 0 }, wrist: { x: 0, y: 0 }, depth: 0, elevation: 0, elbowFlex: 0, horizontal: 0 };
    const f: PoseFrame = { t: r.t * 1000, aspect, lm: r.lm, world: r.world, people: 1, luminance: 128 };
    const a = reconstructArm(f, cal);
    return { t: r.t, ok: true, wristDN: { x: r.lm[ix.wrist].x, y: r.lm[ix.wrist].y }, wrist: { x: a.wrist.x, y: a.wrist.y }, depth: a.wrist.z, elevation: a.elevation3D, elbowFlex: a.elbowFlex3D, horizontal: horizontalAngle(a.wrist, a.elevation3D) };
  });
  // Fill gaps & smooth.
  frames = frames.map((f, i) => (f.ok ? f : { ...(frames.slice(0, i).reverse().find((g) => g.ok) ?? frames.find((g) => g.ok)!), t: f.t, ok: false }));
  const sx = smooth(frames.map((f) => f.wrist.x)), sy = smooth(frames.map((f) => f.wrist.y)), sz = smooth(frames.map((f) => f.depth));
  const se = smooth(frames.map((f) => f.elevation)), sf = smooth(frames.map((f) => f.elbowFlex)), sh = smooth(frames.map((f) => f.horizontal));
  frames = frames.map((f, i) => ({ ...f, wrist: { x: sx[i], y: sy[i] }, depth: sz[i], elevation: se[i], elbowFlex: sf[i], horizontal: sh[i] }));

  // 5. Primary metric. A lift (side or front raise) changes shoulder elevation a lot. If elevation
  //    stays roughly constant, the movement is an elbow bend or a horizontal swing at shoulder
  //    height; take the one with the larger range. (Foreshortening during a forward swing makes the
  //    elbow *look* bent, so the old "largest range of elevation vs elbow" rule called it an elbow bend.)
  const metric = chooseMetric(se, sf, sh);
  const reps = segmentReps(frames, metric);
  const inRep = frames.filter((f) => reps.some((r) => f.t >= r.start && f.t <= r.end));
  const peakDepth = inRep.length ? pct(inRep.map((f) => f.depth), 0.9) : 0;
  return { arm, aspect, duration, frames, metric, peakDepth, reps, thumbnail };
}

const range = (a: number[]) => pct(a, 0.95) - pct(a, 0.05);
export function chooseMetric(elev: number[], flex: number[], horiz: number[]): Metric {
  if (range(elev) >= 45) return 'elevation';
  if (range(horiz) > range(flex)) return 'horizontal';
  return range(elev) >= range(flex) ? 'elevation' : 'elbowFlex';
}

const metricSignal = (f: RefFrame, m: Metric) => (m === 'elbowFlex' ? f.elbowFlex : m === 'horizontal' ? f.horizontal : f.elevation);

/** Body area for the plan cards, from the measured movement. No name or text is generated:
 *  the therapist names and describes the exercise. */
const areaFor = (m: Metric): BodyArea => (m === 'elbowFlex' ? 'elbow' : 'shoulder');

export const END_FRACTION = 0.92;
/** Cut a polyline at a fraction of its arc length, resampled back to the same number of points. */
export function trimPath(p: V2[], frac: number): V2[] {
  if (p.length < 2 || frac >= 1) return p;
  const cum = [0];
  for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + dist(p[i - 1], p[i]));
  const cut = cum[cum.length - 1] * frac;
  const out: V2[] = [p[0]];
  for (let i = 1; i < p.length; i++) {
    if (cum[i] < cut) { out.push(p[i]); continue; }
    const t = (cut - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1);
    out.push({ x: p[i - 1].x + (p[i].x - p[i - 1].x) * t, y: p[i - 1].y + (p[i].y - p[i - 1].y) * t });
    break;
  }
  return resample(out, p.length);
}

export interface DraftOptions {
  id?: string; nameEn?: string; nameHi?: string; instrEn?: string; instrHi?: string;
  tolerance: number; reps: number; holdMs: number; color: string; approvedBy?: string; postureChecks: boolean;
}
/** Turn an extraction (with the reps the expert kept) into a playable exercise. */
export function draftExercise(x: Extraction, o: DraftOptions): Exercise {
  // The tape ends a little short of the demonstrator's AVERAGE peak (92% of the stroke length).
  // Testing with the demonstrator's own video as the camera showed why: a stroke completes at 95%
  // of the tape, and an average peak is, by definition, above half of the reps, so even the same
  // person often could not finish. The real range reached is still measured and reported.
  const path = trimPath(averagePath(x.reps), END_FRACTION);
  const inc = x.reps.filter((r) => r.include);
  const median = (a: number[]) => { const s = [...a].sort((p, q) => p - q); return s[Math.floor(s.length / 2)] ?? 0; };
  return {
    id: o.id ?? `expert-${Date.now()}`,
    name: { en: o.nameEn || 'Custom exercise', hi: o.nameHi || o.nameEn || 'कस्टम व्यायाम' },
    instruction: { en: o.instrEn || 'Follow the tape at a slow, steady pace.', hi: o.instrHi || 'टेप के साथ धीरे-धीरे, एक समान गति से चलें।' },
    area: areaFor(x.metric),
    path: path.map((p) => ({ x: +p.x.toFixed(4), y: +p.y.toFixed(4) })),
    tolerance: o.tolerance, reps: o.reps, holdMs: o.holdMs,
    metric: x.metric, romTarget: median(inc.map((r) => r.peak)), refDurationMs: Math.max(1500, median(inc.map((r) => r.durationMs))),
    postureChecks: o.postureChecks, color: o.color, source: 'expert', createdAt: Date.now(), approvedBy: o.approvedBy || undefined,
    depthCue: x.metric === 'horizontal' || x.peakDepth > 0.5,
  };
}

/** Rep segmentation: valleys (rest) -> peaks (end of movement) of the primary angle, with prominence. */
export function segmentReps(frames: RefFrame[], metric: Metric): RefRep[] {
  const sig = smooth(frames.map((f) => metricSignal(f, metric)), 4);
  const lo = pct(sig, 0.05), hi = pct(sig, 0.95);
  const prom = Math.max(15, (hi - lo) * 0.45);
  // Hysteresis state machine: find rising phases that cross from near-low to near-high.
  const reps: RefRep[] = [];
  let state: 'low' | 'rising' = 'low';
  let startIdx = 0, minIdx = 0;
  for (let i = 1; i < sig.length; i++) {
    if (state === 'low') {
      if (sig[i] <= sig[minIdx]) minIdx = i;
      if (sig[i] - sig[minIdx] > prom) { state = 'rising'; startIdx = minIdx; }
    } else {
      // peak = point after which the signal drops by prominence/2
      let peakIdx = i;
      while (i < sig.length - 1 && sig[i + 1] >= sig[peakIdx] - prom * 0.15) { i++; if (sig[i] > sig[peakIdx]) peakIdx = i; }
      const seg = frames.slice(startIdx, peakIdx + 1).map((f) => f.wrist);
      if (seg.length >= 4) {
        reps.push({ start: frames[startIdx].t, end: frames[peakIdx].t, path: resample(seg, 60), peak: Math.round(sig[peakIdx]), durationMs: Math.round((frames[peakIdx].t - frames[startIdx].t) * 1000), include: true });
      }
      state = 'low'; minIdx = peakIdx;
    }
  }
  // Outlier reps (e.g. the first one also contains lifting the arm out of the lap) start or end
  // far from the others; untick them so they do not bend the average. The expert can re-tick.
  if (reps.length >= 3) {
    const med = (v: number[]) => [...v].sort((p, q) => p - q)[Math.floor(v.length / 2)];
    const ms = { x: med(reps.map((r) => r.path[0].x)), y: med(reps.map((r) => r.path[0].y)) };
    const me = { x: med(reps.map((r) => r.path[r.path.length - 1].x)), y: med(reps.map((r) => r.path[r.path.length - 1].y)) };
    for (const r of reps) if (dist(r.path[0], ms) > 0.25 || dist(r.path[r.path.length - 1], me) > 0.25) r.include = false;
  }
  if (!reps.length) {
    // Fallback: global min -> global max.
    let a = 0, b = 0; sig.forEach((v, i) => { if (v < sig[a]) a = i; if (v > sig[b]) b = i; });
    const [s, e] = a < b ? [a, b] : [b, a];
    reps.push({ start: frames[s].t, end: frames[e].t, path: resample(frames.slice(s, e + 1).map((f) => f.wrist), 60), peak: Math.round(sig[b]), durationMs: Math.round((frames[e].t - frames[s].t) * 1000), include: true });
  }
  return reps;
}

/** Point-wise mean of the included reps (all already resampled to the same length). */
export function averagePath(reps: RefRep[]): V2[] {
  const use = reps.filter((r) => r.include);
  if (!use.length) return [];
  const n = use[0].path.length;
  return Array.from({ length: n }, (_, i) => ({
    x: use.reduce((s, r) => s + r.path[i].x, 0) / use.length,
    y: use.reduce((s, r) => s + r.path[i].y, 0) / use.length,
  }));
}
