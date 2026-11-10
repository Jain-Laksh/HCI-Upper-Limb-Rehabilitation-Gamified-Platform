// Singleton pose engine: webcam -> MediaPipe PoseLandmarker (BlazePose GHUM) -> target lock -> smoothing.
// Runs fully in the browser; video frames never leave the device.
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import { create } from 'zustand';
import { LandmarkSmoother } from './oneEuro';
import { Landmark, LM, V2, dist, mid } from './geometry';

export interface PoseFrame {
  t: number;
  aspect: number;      // video width / height
  lm: Landmark[];      // 33 landmarks of the locked person, display-normalised (mirrored), smoothed
  world: Landmark[];   // 33 world landmarks (metres, hip-centred, x mirrored)
  people: number;      // how many people were detected in the frame
  luminance: number;   // 0..255 mean brightness (sampled)
}

export type VisionStatus = 'idle' | 'loading' | 'ready' | 'denied' | 'error';

interface VisionState {
  status: VisionStatus;
  error?: string;
  fps: number;
  people: number;
  locked: boolean;
  set: (p: Partial<VisionState>) => void;
}
export const useVision = create<VisionState>((set) => ({
  status: 'idle', fps: 0, people: 0, locked: false,
  set: (p) => set(p),
}));

type Listener = (f: PoseFrame | null) => void;

const BASE = import.meta.env.BASE_URL;

/** Torso centroid (shoulders + hips) in display-normalised coords. */
export function torsoCentroid(lm: Landmark[]): V2 {
  const s = mid(lm[LM.L_SHOULDER], lm[LM.R_SHOULDER]);
  const h = mid(lm[LM.L_HIP], lm[LM.R_HIP]);
  return mid(s, h);
}

export async function createLandmarker(mode: 'VIDEO' | 'IMAGE', model: 'full' | 'lite', numPoses: number) {
  const fileset = await FilesetResolver.forVisionTasks(`${BASE}wasm`);
  const opts = (delegate: 'GPU' | 'CPU') => ({
    baseOptions: { modelAssetPath: `${BASE}models/pose_landmarker_${model}.task`, delegate },
    runningMode: mode,
    numPoses,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  try {
    return await PoseLandmarker.createFromOptions(fileset, opts('GPU'));
  } catch (e) {
    console.warn('[pose] GPU delegate failed, falling back to CPU', e);
    return await PoseLandmarker.createFromOptions(fileset, opts('CPU'));
  }
}

class PoseEngine {
  video: HTMLVideoElement | null = null;
  stream: MediaStream | null = null;
  latest: PoseFrame | null = null;
  private landmarker: PoseLandmarker | null = null;
  private listeners = new Set<Listener>();
  private raf = 0;
  private lastTs = -1;
  private lockC: V2 | null = null;
  private lostSince = 0;
  private smoother = new LandmarkSmoother(1.0, 0.04);
  private worldSmoother = new LandmarkSmoother(1.0, 0.04);
  private frameCount = 0;
  private fpsT = performance.now();
  private lumCanvas: HTMLCanvasElement | null = null;
  private luminance = 128;
  private starting: Promise<void> | null = null;

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  /** Start camera + model (idempotent). */
  start(model: 'full' | 'lite' = 'full') {
    if (this.starting) return this.starting;
    this.starting = this._start(model).catch((e) => { this.starting = null; throw e; });
    return this.starting;
  }

  private async _start(model: 'full' | 'lite') {
    const vs = useVision.getState();
    vs.set({ status: 'loading', error: undefined });
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false,
      });
    } catch (e: any) {
      vs.set({ status: 'denied', error: String(e?.message ?? e) });
      throw e;
    }
    const v = document.createElement('video');
    v.playsInline = true; v.muted = true; v.autoplay = true;
    v.srcObject = this.stream;
    await v.play();
    this.video = v;
    try {
      this.landmarker = await createLandmarker('VIDEO', model, 3);
    } catch (e: any) {
      vs.set({ status: 'error', error: String(e?.message ?? e) });
      throw e;
    }
    vs.set({ status: 'ready' });
    this.loop();
  }

  /** Forget the locked person so the next most-central / largest person is selected. */
  resetLock() { this.lockC = null; this.smoother.reset(); this.worldSmoother.reset(); }

  private sampleLuminance(v: HTMLVideoElement) {
    const c = (this.lumCanvas ??= document.createElement('canvas')); c.width = 32; c.height = 18;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, 32, 18);
    const d = ctx.getImageData(0, 0, 32, 18).data;
    let s = 0;
    for (let i = 0; i < d.length; i += 4) s += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    this.luminance = s / (d.length / 4);
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const v = this.video, lmk = this.landmarker;
    if (!v || !lmk || v.readyState < 2) return;
    let ts = performance.now();
    if (ts <= this.lastTs) ts = this.lastTs + 1;
    this.lastTs = ts;

    let res;
    try { res = lmk.detectForVideo(v, ts); } catch (e) { console.warn(e); return; }

    this.frameCount++;
    if (this.frameCount % 15 === 0) this.sampleLuminance(v);
    if (ts - this.fpsT > 1000) {
      useVision.getState().set({ fps: Math.round((this.frameCount * 1000) / (ts - this.fpsT)) });
      this.frameCount = 0; this.fpsT = ts;
    }

    const poses = (res.landmarks ?? []).map((p) => p.map((q) => ({ x: 1 - q.x, y: q.y, z: q.z, visibility: q.visibility ?? 1 })));
    const worlds = (res.worldLandmarks ?? []).map((p) => p.map((q) => ({ x: -q.x, y: q.y, z: q.z, visibility: q.visibility ?? 1 })));
    const people = poses.length;
    const pick = this.pickTarget(poses, ts);
    const vsState = useVision.getState();
    if (vsState.people !== people || vsState.locked !== (pick >= 0)) vsState.set({ people, locked: pick >= 0 });

    if (pick < 0) {
      this.latest = null;
      this.listeners.forEach((fn) => fn(null));
      return;
    }
    const frame: PoseFrame = {
      t: ts,
      aspect: v.videoWidth / v.videoHeight,
      lm: this.smoother.apply(poses[pick], ts),
      world: this.worldSmoother.apply(worlds[pick] ?? poses[pick], ts),
      people,
      luminance: this.luminance,
    };
    this.latest = frame;
    this.listeners.forEach((fn) => fn(frame));
  };

  /** Target lock: keep following the same person (nearest torso centroid); pick largest+central initially. */
  private pickTarget(poses: Landmark[][], ts: number) {
    if (!poses.length) { if (!this.lostSince) this.lostSince = ts; return -1; }
    const cents = poses.map(torsoCentroid);
    if (this.lockC) {
      let best = -1, bd = Infinity;
      cents.forEach((c, i) => { const d = dist(c, this.lockC!); if (d < bd) { bd = d; best = i; } });
      if (bd < 0.25) { this.lockC = cents[best]; this.lostSince = 0; return best; }
      // Lock lost. If it stays lost for 1.5 s and only one person is visible, re-lock on them.
      if (!this.lostSince) this.lostSince = ts;
      if (ts - this.lostSince > 1500 && poses.length === 1) { this.resetLock(); }
      else return -1;
    }
    let best = 0, bs = -Infinity;
    poses.forEach((p, i) => {
      const sw = dist(p[LM.L_SHOULDER], p[LM.R_SHOULDER]);
      const score = sw * 2 - Math.abs(cents[i].x - 0.5);
      if (score > bs) { bs = score; best = i; }
    });
    this.lockC = cents[best];
    this.lostSince = 0;
    this.smoother.reset(); this.worldSmoother.reset();
    return best;
  }
}

export const poseEngine = new PoseEngine();
