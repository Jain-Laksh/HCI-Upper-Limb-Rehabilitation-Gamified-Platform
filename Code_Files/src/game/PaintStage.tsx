// The painting stage: mirrored camera + wall tint + masking-tape path + paint + brush.
// The tape path is the physiotherapist's reference stroke, re-scaled to THIS user's arm length
// and anchored to THEIR shoulder (body-relative frame), so it is always within reach.
import { useEffect, useRef, useState } from 'react';
import { poseEngine } from '../vision/poseEngine';
import { BoneLengthTracker, Calibration, bodyScale, fromFrame, handIU, scaledCal } from '../vision/bodyFrame';
import { useSession } from '../store/shift';
import { OneEuro } from '../vision/oneEuro';
import { V2, armIdx } from '../vision/geometry';
import { StrokeScorer, ScorerEvent, ScorerSnapshot } from '../exercise/scorer';
import { Exercise, RepResult } from '../exercise/types';
import { useSettings } from '../store/settings';
import { CameraView } from '../ui/components';
import { cursorBus } from '../input/DwellCursor';
import { brushSound, sfx } from '../feedback/sfx';
import { useT } from '../i18n';

export interface StageCallbacks {
  onStarted?: () => void;
  onError?: (reason: string) => void;
  onComplete?: (r: RepResult) => void;
  onHint?: (key: string) => void;
  onTracking?: (ok: boolean) => void;
  onDrift?: (ratio: number) => void;
}

export function PaintStage(props: {
  exercise: Exercise; cal: Calibration; paused: boolean; callbacks: StageCallbacks; showDepth?: boolean;
  onSnapshot?: (s: ScorerSnapshot) => void;
}) {
  const { exercise, cal, paused } = props;
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const cbRef = useRef(props.callbacks); cbRef.current = props.callbacks;
  const pausedRef = useRef(paused); pausedRef.current = paused;
  const snapRef = useRef(props.onSnapshot); snapRef.current = props.onSnapshot;
  const settings = useSettings();
  const postureChecks = settings.postureChecks;
  const { t } = useT();
  const [aspect, setAspect] = useState(poseEngine.latest?.aspect ?? 16 / 9);
  const [snap, setSnap] = useState<ScorerSnapshot | null>(null);
  const [debug, setDebug] = useState({ scale: 1, raw: 1 });

  useEffect(() => {
    const scorer = new StrokeScorer(exercise, cal, postureChecks);
    const ox = new OneEuro(0.4, 0.002), oy = new OneEuro(0.4, 0.002);
    let lastSeen = performance.now();
    let trackingOk = true;
    let frameN = 0;
    // The menu pointer normally belongs to the OTHER hand; only in 'same hand' mode does the brush drive it.
    const sameHand = useSettings.getState().pointerHand === 'same';
    if (sameHand) cursorBus.mode = 'direct';
    // Adaptive scale: follows small changes in distance, updated only BETWEEN strokes (frozen while
    // painting, so raising the arm - which moves the shoulder landmarks - never distorts the tape).
    let scale = 1;
    // Bone lengths keep being refined from what the camera sees (a bone can only look shorter than it
    // is), so if calibration under-estimated the arm the tape grows to the user's real reach.
    let calRef = cal;
    const bones = new BoneLengthTracker(cal);

    const unsub = poseEngine.subscribe((f) => {
      const c = canvas.current;
      if (!c) return;
      const now = performance.now();
      if (!f) {
        if (trackingOk && now - lastSeen > 1200) { trackingOk = false; cbRef.current.onTracking?.(false); brushSound(false); }
        cursorBus.direct = null;
        return;
      }
      lastSeen = now;
      if (!trackingOk) { trackingOk = true; cbRef.current.onTracking?.(true); }
      if (Math.abs(f.aspect - aspect) > 0.01) setAspect(f.aspect);

      const raw = bodyScale(f, calRef);
      if (scorer.state === 'waitStart' && raw > 0.5 && raw < 2) scale += (raw - scale) * 0.06;
      bones.push(f, scale);
      if (frameN % 5 === 0) { const r = bones.refine(calRef); if (r) calRef = r; }
      const calNow = scaledCal(calRef, scale);
      // Large distance change only (the fixed-position assumption is violated): ask the user to return.
      cbRef.current.onDrift?.(raw);

      let events: ScorerEvent[] = [];
      if (!pausedRef.current) events = scorer.update(f, calNow);
      const s = scorer.snap;
      if (import.meta.env.DEV) (window as any).__stroke = { ...s, L: calNow.L, events: events.map((e) => e.type) };
      for (const e of events) {
        if (e.type === 'started') { sfx.start(); cbRef.current.onStarted?.(); }
        if (e.type === 'error') { sfx.reset(); cbRef.current.onError?.(e.reason); }
        if (e.type === 'complete') { sfx.success(); cbRef.current.onComplete?.(e.result); }
        if (e.type === 'hint') cbRef.current.onHint?.(e.key);
      }
      brushSound(!pausedRef.current && s.state !== 'waitStart' && s.inCorridor);

      // ---- drawing ----
      const dpr = window.devicePixelRatio || 1;
      const W = c.clientWidth, H = c.clientHeight;
      if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
      const ctx = c.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      // The tape is anchored to the body part the exercise moves (shoulder / wrist / ear), in that
      // user's own segment length.
      const fr = s.frame ?? scorer.frame(f, calNow);
      const O = { x: ox.filter(fr.origin.x, f.t), y: oy.filter(fr.origin.y, f.t) };
      const frS = { ...fr, origin: O };
      const px = (p: V2) => { const iu = fromFrame(p, frS); return { x: (iu.x / f.aspect) * W, y: iu.y * H }; };
      const unit = fr.unit * H; // px per tape unit
      const path = exercise.path;
      const tol = exercise.tolerance;

      // Tape band (signifier of where to paint).
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      path.forEach((p, i) => { const q = px(p); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); });
      ctx.strokeStyle = 'rgba(244, 228, 178, 0.92)'; ctx.lineWidth = tol * 2 * unit; ctx.stroke();
      ctx.setLineDash([12, 10]); ctx.strokeStyle = 'rgba(120, 90, 30, 0.9)'; ctx.lineWidth = 3;
      ctx.stroke(); ctx.setLineDash([]);

      // Paint laid so far.
      const n = Math.round(s.progress * (path.length - 1));
      if (s.state !== 'waitStart' && n > 0) {
        ctx.beginPath();
        for (let i = 0; i <= n; i++) { const q = px(path[i]); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); }
        ctx.strokeStyle = exercise.color; ctx.lineWidth = tol * 1.7 * unit; ctx.stroke();
      }

      // Direction chevrons while waiting to start.
      if (s.state === 'waitStart') {
        ctx.fillStyle = 'rgba(120, 90, 30, 0.95)';
        for (let k = 1; k < 5; k++) {
          const i = Math.floor((k / 5) * (path.length - 2));
          const a = px(path[i]), b = px(path[i + 1]);
          const ang = Math.atan2(b.y - a.y, b.x - a.x);
          ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(ang);
          ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-6, -9); ctx.lineTo(-6, 9); ctx.closePath(); ctx.fill();
          ctx.restore();
        }
      }

      // Start dot (pulsing) + end target.
      const st = px(path[0]), en = px(path[path.length - 1]);
      const pulse = 1 + 0.12 * Math.sin(now / 250);
      ctx.beginPath(); ctx.arc(st.x, st.y, tol * 1.4 * unit * (s.state === 'waitStart' ? pulse : 1), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(30, 160, 90, 0.35)'; ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = '#1ea05a'; ctx.stroke();
      if (s.startFrac > 0) {
        ctx.beginPath(); ctx.arc(st.x, st.y, tol * 1.4 * unit + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * s.startFrac);
        ctx.lineWidth = 8; ctx.strokeStyle = '#ffffff'; ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(en.x, en.y, tol * 1.1 * unit, 0, Math.PI * 2);
      ctx.lineWidth = 4; ctx.setLineDash([6, 6]); ctx.strokeStyle = '#1b3a6b'; ctx.stroke(); ctx.setLineDash([]);
      if (s.state === 'holding' && s.holdFrac > 0) {
        ctx.beginPath(); ctx.arc(en.x, en.y, tol * 1.1 * unit + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * s.holdFrac);
        ctx.lineWidth = 8; ctx.strokeStyle = '#ffffff'; ctx.stroke();
      }

      // Active arm skeleton (self-awareness / mapping).
      const ix = armIdx(cal.arm);
      const toPx = (i: number) => ({ x: f.lm[i].x * W, y: f.lm[i].y * H });
      const sP = toPx(ix.shoulder), eP = toPx(ix.elbow), wP = toPx(ix.wrist);
      ctx.beginPath(); ctx.moveTo(sP.x, sP.y); ctx.lineTo(eP.x, eP.y); ctx.lineTo(wP.x, wP.y);
      ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.stroke();
      [sP, eP].forEach((p) => { ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); });
      if (exercise.joint === 'hand') {
        const h = handIU(f, cal.arm); const hP = { x: (h.x / f.aspect) * W, y: h.y * H };
        ctx.beginPath(); ctx.moveTo(wP.x, wP.y); ctx.lineTo(hP.x, hP.y); ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.stroke();
        ctx.beginPath(); ctx.arc(wP.x, wP.y, 7, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
      }

      // Brush (size grows as the hand comes toward the camera = depth cue).
      if (s.brush) {
        const b = px(s.brush);
        const r = Math.max(exercise.joint && exercise.joint !== 'wrist' ? 10 : 14, tol * 0.9 * unit * (1 + Math.max(-0.4, Math.min(0.8, s.depth)) * 0.9));
        const warn = s.offPathFrac > 0;
        ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
        ctx.fillStyle = warn ? 'rgba(255, 176, 0, 0.9)' : s.state === 'waitStart' ? 'rgba(255,255,255,0.85)' : exercise.color;
        ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = warn ? '#7a4b00' : '#111'; ctx.stroke();
        // bristle mark
        ctx.beginPath(); ctx.moveTo(b.x - r * 0.45, b.y); ctx.lineTo(b.x + r * 0.45, b.y);
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.stroke();
        if (sameHand) { const rect = c.getBoundingClientRect(); cursorBus.direct = { x: rect.left + b.x, y: rect.top + b.y }; }
      }

      if (++frameN % 3 === 0) {
        setSnap({ ...s });
        snapRef.current?.(s);
        if (useSettings.getState().showDebug) setDebug({ scale, raw });
      }
    });

    return () => {
      // Keep the refined arm length for the rest of the session (next walls, next shift).
      if (calRef !== cal && useSession.getState().calibration === cal) useSession.getState().set({ calibration: calRef });
      unsub(); brushSound(false); if (sameHand) cursorBus.mode = 'box'; cursorBus.direct = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercise, cal, postureChecks]);

  useEffect(() => { if (paused) brushSound(false); }, [paused]);

  const showDepth = props.showDepth ?? !!exercise.depthCue;
  const depthVal = snap ? Math.max(0, Math.min(1, snap.depth / 0.5)) : 0;

  return (
    <div className="stage-wrap" ref={wrap}>
      <div className="stage" style={{ ['--ar' as string]: aspect } as React.CSSProperties}>
        <CameraView className="mirrored" opacity={1} />
        <div className="wall-tint" style={{ opacity: 1 - settings.cameraOpacity }} />
        <canvas ref={canvas} className="stage-canvas" />
        {snap && snap.state === 'waitStart' && !paused && (
          <div className="stage-hint">{t('stage.toStart')}</div>
        )}
        {snap && snap.offPathFrac > 0.15 && !paused && (
          <div className="stage-hint warn">{t('stage.backToTape')}</div>
        )}
        {showDepth && (
          <div className="depth-meter" aria-label={t('stage.depth')}>
            <span>{t('stage.depthNear')}</span>
            <div className="depth-track"><div className="depth-fill" style={{ height: `${depthVal * 100}%` }} /></div>
            <span>{t('stage.depth')}</span>
          </div>
        )}
        {settings.showDebug && snap && (
          <div className="debug-box">
            <div>state: {snap.state} · prog {(snap.progress * 100).toFixed(0)}%</div>
            <div>{exercise.metric} 3D {snap.metric3D.toFixed(0)}° · 2D {snap.metric2D.toFixed(0)}°</div>
            <div>depth z {snap.depth.toFixed(2)} BU · conf {snap.confidence.toFixed(2)}</div>
            <div>tape ±{exercise.tolerance.toFixed(2)} BU · off-tape {snap.dist.toFixed(2)} · {snap.inCorridor ? 'ON' : 'off'}</div>
            <div>lean Δ{snap.lean.toFixed(1)}° · hike Δ{snap.hike.toFixed(2)} · scale {debug.scale.toFixed(2)} (now {debug.raw.toFixed(2)})</div>
          </div>
        )}
      </div>
    </div>
  );
}
