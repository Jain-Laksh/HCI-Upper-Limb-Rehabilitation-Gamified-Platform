import { Arm, Landmark, LM, armIdx } from '../vision/geometry';

const BONES: [number, number][] = [
  [LM.L_SHOULDER, LM.R_SHOULDER], [LM.L_SHOULDER, LM.L_ELBOW], [LM.L_ELBOW, LM.L_WRIST],
  [LM.R_SHOULDER, LM.R_ELBOW], [LM.R_ELBOW, LM.R_WRIST], [LM.L_SHOULDER, LM.L_HIP],
  [LM.R_SHOULDER, LM.R_HIP], [LM.L_HIP, LM.R_HIP],
];

/** Draw an upper-body skeleton. Visible joints green, hidden joints red; active arm thicker. */
export function drawSkeleton(ctx: CanvasRenderingContext2D, lm: Landmark[], W: number, H: number, arm: Arm) {
  const ix = armIdx(arm);
  const activeSet = new Set<number>([ix.shoulder, ix.elbow, ix.wrist]);
  ctx.lineCap = 'round';
  for (const [a, b] of BONES) {
    const p = lm[a], q = lm[b];
    const active = activeSet.has(a) && activeSet.has(b);
    ctx.beginPath(); ctx.moveTo(p.x * W, p.y * H); ctx.lineTo(q.x * W, q.y * H);
    ctx.lineWidth = active ? 9 : 5;
    ctx.strokeStyle = active ? 'rgba(255, 214, 0, 0.95)' : 'rgba(255,255,255,0.8)';
    ctx.stroke();
  }
  const joints = [LM.NOSE, LM.L_SHOULDER, LM.R_SHOULDER, LM.L_ELBOW, LM.R_ELBOW, LM.L_WRIST, LM.R_WRIST, LM.L_HIP, LM.R_HIP];
  for (const j of joints) {
    const p = lm[j];
    const vis = (p.visibility ?? 1) > 0.5;
    ctx.beginPath(); ctx.arc(p.x * W, p.y * H, j === LM.NOSE ? 10 : 8, 0, Math.PI * 2);
    ctx.fillStyle = vis ? '#22c55e' : '#ef4444'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#000'; ctx.stroke();
  }
}

export function fitCanvas(c: HTMLCanvasElement) {
  const dpr = window.devicePixelRatio || 1;
  const W = c.clientWidth, H = c.clientHeight;
  if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
  const ctx = c.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  return { ctx, W, H };
}
