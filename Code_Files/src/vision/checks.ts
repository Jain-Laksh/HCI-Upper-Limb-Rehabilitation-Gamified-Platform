// Setup / live checks: is the user visible, at a good distance, centred, well lit, alone?
import { Arm, LM, armIdx, dist } from './geometry';
import { PoseFrame } from './poseEngine';
import { isLandmarkVisible, toIU } from './bodyFrame';

export type DistanceState = 'ok' | 'tooFar' | 'tooClose';

export interface CheckResult {
  personFound: boolean;
  visible: boolean;           // head, shoulders, elbows, wrists visible (hips optional for seated users)
  missing: string[];          // human-readable body parts not visible (i18n keys)
  distance: DistanceState;
  distanceScore: number;      // -1 (too far) .. 0 (ideal) .. +1 (too close) for the meter
  reachFits: boolean;         // can the active arm's full reach be seen?
  centered: boolean;
  light: 'ok' | 'dark';
  onePerson: boolean;
  allOk: boolean;
}

const REQUIRED: [number, string][] = [
  [LM.NOSE, 'part.head'],
  [LM.L_SHOULDER, 'part.shoulders'], [LM.R_SHOULDER, 'part.shoulders'],
  [LM.L_ELBOW, 'part.elbows'], [LM.R_ELBOW, 'part.elbows'],
  [LM.L_WRIST, 'part.hands'], [LM.R_WRIST, 'part.hands'],
];

export function runChecks(f: PoseFrame | null, arm: Arm): CheckResult {
  if (!f) {
    return { personFound: false, visible: false, missing: ['part.everyone'], distance: 'tooFar', distanceScore: -1, reachFits: false, centered: false, light: 'ok', onePerson: true, allOk: false };
  }
  const missing = Array.from(new Set(REQUIRED.filter(([i]) => !isLandmarkVisible(f.lm[i], 0.5)).map(([, k]) => k)));
  const visible = missing.length === 0;

  // Shoulder width as a fraction of frame width: ~0.14-0.30 is a comfortable range for a laptop webcam.
  const sw = Math.abs(f.lm[LM.L_SHOULDER].x - f.lm[LM.R_SHOULDER].x);
  const ix = armIdx(arm);
  const s = f.lm[ix.shoulder];
  // Estimated arm length in display-normalised x and y units (use measured bones if longer).
  const swIU = dist(toIU(f.lm[LM.L_SHOULDER], f.aspect), toIU(f.lm[LM.R_SHOULDER], f.aspect));
  const boneIU = dist(toIU(f.lm[ix.shoulder], f.aspect), toIU(f.lm[ix.elbow], f.aspect)) + dist(toIU(f.lm[ix.elbow], f.aspect), toIU(f.lm[ix.wrist], f.aspect));
  const LIU = Math.max(swIU * 1.45, boneIU);
  const Lx = LIU / f.aspect, Ly = LIU;
  const outward = arm === 'right' ? 1 : -1; // mirrored display: right arm extends to screen right
  const reachFits = s.y - 0.8 * Ly > -0.01 && s.x + outward * 0.95 * Lx > -0.01 && s.x + outward * 0.95 * Lx < 1.01;

  let distance: DistanceState = 'ok';
  if (sw < 0.11) distance = 'tooFar';
  else if (sw > 0.32 || !reachFits) distance = 'tooClose';
  const distanceScore = Math.max(-1, Math.min(1, (sw - 0.2) / 0.12));

  const cx = (f.lm[LM.L_SHOULDER].x + f.lm[LM.R_SHOULDER].x) / 2;
  const centered = cx > 0.2 && cx < 0.8;
  const light = f.luminance < 45 ? 'dark' : 'ok';
  const onePerson = f.people <= 1;
  return {
    personFound: true, visible, missing, distance, distanceScore, reachFits, centered, light, onePerson,
    allOk: visible && distance === 'ok' && centered && light === 'ok',
  };
}
