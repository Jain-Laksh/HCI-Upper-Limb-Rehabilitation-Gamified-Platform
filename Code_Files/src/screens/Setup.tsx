// Setup check + calibration. Makes the system's view of the user visible (Norman: feedback,
// visibility of system status) and guides them into a good position before any exercise.
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowRight, Armchair, Check, CheckCircle2, Hand, PersonStanding, RefreshCw, Ruler, Sun, Users, UserRound, Video, X,
} from 'lucide-react';
import { BigButton, CameraView, Meter, ScreenFrame, Segmented } from '../ui/components';
import { poseEngine, useVision, PoseFrame } from '../vision/poseEngine';
import { CheckResult, runChecks } from '../vision/checks';
import { calibrate, estimateCalibration, toIU } from '../vision/bodyFrame';
import { armIdx, dist, median } from '../vision/geometry';
import { useSettings } from '../store/settings';
import { useNav } from '../store/nav';
import { useSession } from '../store/shift';
import { useT, tNow } from '../i18n';
import { speak } from '../feedback/speech';
import { sfx } from '../feedback/sfx';
import { drawSkeleton, fitCanvas } from '../ui/skeleton';

function useEngine() {
  const model = useSettings((s) => s.model);
  useEffect(() => { poseEngine.start(model).catch(() => {}); }, [model]);
  return useVision();
}

function CameraProblem() {
  const { t } = useT();
  const vision = useVision();
  return (
    <div className="card problem">
      <Video className="hero-icon small" aria-hidden="true" />
      <h2>{vision.status === 'denied' ? t('setup.deniedTitle') : t('setup.errorTitle')}</h2>
      <p>{vision.status === 'denied' ? t('setup.deniedBody') : t('setup.errorBody')}</p>
      <small className="mono">{vision.error}</small>
      <BigButton icon={RefreshCw} label={t('setup.retry')} variant="primary" primary onClick={() => window.location.reload()} />
    </div>
  );
}

export function SetupCheck() {
  const { t } = useT();
  const nav = useNav();
  const vision = useEngine();
  const settings = useSettings();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [res, setRes] = useState<CheckResult | null>(null);
  const [ready, setReady] = useState(false);
  const [aspect, setAspect] = useState(16 / 9);

  useEffect(() => {
    let okSince = 0, n = 0, wasReady = false;
    const unsub = poseEngine.subscribe((f) => {
      const r = runChecks(f, useSettings.getState().arm);
      const c = canvas.current;
      if (c) {
        const { ctx, W, H } = fitCanvas(c);
        if (f) drawSkeleton(ctx, f.lm, W, H, useSettings.getState().arm);
      }
      if (f && Math.abs(f.aspect - aspect) > 0.01) setAspect(f.aspect);
      const now = performance.now();
      if (r.allOk) { if (!okSince) okSince = now; } else okSince = 0;
      const isReady = !!okSince && now - okSince > 1200;
      if (isReady !== wasReady) { wasReady = isReady; setReady(isReady); if (isReady) { sfx.success(); speak(tNow('setup.allGood'), { key: 'setup.allGood', cooldownMs: 15000 }); } }
      if (++n % 5 === 0) setRes(r);
      // Spoken guidance for the first failing check (de-duplicated).
      if (!isReady && n % 30 === 0) {
        const key = !r.personFound ? 'setup.say.noPerson' : !r.visible ? 'setup.say.notVisible' : r.distance === 'tooFar' ? 'setup.say.tooFar'
          : r.distance === 'tooClose' ? 'setup.say.tooClose' : !r.centered ? 'setup.say.center' : r.light === 'dark' ? 'setup.say.dark' : null;
        if (key) speak(tNow(key), { key, cooldownMs: 7000 });
      }
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { speak(tNow('setup.speak'), { key: 'setup.speak', cooldownMs: 3000 }); }, []);

  const Row = ({ ok, icon: Icon, label, detail }: { ok: boolean; icon: typeof Check; label: string; detail?: string }) => (
    <li className={`check-row ${ok ? 'ok' : 'bad'}`}>
      <Icon aria-hidden="true" className="check-icon" />
      <div><strong>{label}</strong>{detail && <small>{detail}</small>}</div>
      {ok ? <Check aria-label={t('common.ok')} className="tick" /> : <X aria-label={t('common.notYet')} className="tick" />}
    </li>
  );

  return (
    <ScreenFrame title={t('setup.title')} wide>
      {vision.status === 'denied' || vision.status === 'error' ? <CameraProblem /> : (
        <div className="setup-layout">
          <div className="setup-cam">
            <div className="stage" style={{ ['--ar' as string]: aspect } as React.CSSProperties}>
              <CameraView className="mirrored" />
              <canvas ref={canvas} className="stage-canvas" />
              {vision.status === 'loading' && <div className="stage-hint">{t('setup.loading')}</div>}
            </div>
            <div className="setup-options">
              <Segmented label={t('settings.posture')} value={settings.posture} onChange={(v) => settings.update({ posture: v })}
                options={[{ value: 'seated', label: t('settings.seated'), icon: Armchair }, { value: 'standing', label: t('settings.standing'), icon: PersonStanding }]} />
              <Segmented label={t('settings.arm')} value={settings.arm} onChange={(v) => settings.update({ arm: v })}
                options={[{ value: 'left', label: t('settings.left'), icon: Hand }, { value: 'right', label: t('settings.right'), icon: Hand }]} />
            </div>
          </div>
          <div className="setup-side">
            <p className="lead">{t('setup.lead')}</p>
            <ul className="checklist">
              <Row ok={vision.status === 'ready'} icon={Video} label={t('setup.cameraOn')} />
              <Row ok={!!res?.personFound} icon={UserRound} label={t('setup.personFound')} />
              <Row ok={!!res?.visible} icon={PersonStanding} label={t('setup.visible')}
                detail={res && !res.visible && res.personFound ? t('setup.missing', { parts: res.missing.map((m) => t(m)).join(', ') }) : undefined} />
              <li className={`check-row ${res?.distance === 'ok' ? 'ok' : 'bad'}`}>
                <Ruler aria-hidden="true" className="check-icon" />
                <div className="grow">
                  <strong>{t('setup.distance')}: {res ? t(`setup.dist.${res.distance}`) : '…'}</strong>
                  <div className="dist-meter" aria-hidden="true">
                    <span>{t('setup.far')}</span>
                    <div className="dist-track"><div className="dist-ok" /><div className="dist-dot" style={{ left: `${((res?.distanceScore ?? -1) + 1) * 50}%` }} /></div>
                    <span>{t('setup.close')}</span>
                  </div>
                </div>
                {res?.distance === 'ok' ? <Check className="tick" /> : <X className="tick" />}
              </li>
              <Row ok={!!res?.centered} icon={ArrowRight} label={t('setup.centered')} />
              <Row ok={res?.light !== 'dark'} icon={Sun} label={t('setup.light')} />
              <Row ok={vision.people <= 1} icon={Users} label={vision.people > 1 ? t('setup.many', { n: vision.people }) : t('setup.one')} />
            </ul>
            {vision.people > 1 && <BigButton icon={RefreshCw} label={t('setup.relock')} size="md" onClick={() => poseEngine.resetLock()} />}
            <BigButton icon={ready ? CheckCircle2 : ArrowRight} label={ready ? t('setup.continue') : t('setup.waiting')} variant="primary" primary size="xl"
              disabled={!ready} onClick={() => nav.go('calibrate')} />
            {!ready && vision.status === 'ready' && res?.personFound && (
              <button className="link-btn" data-dwell="" onClick={() => nav.go('calibrate')}>{t('setup.continueAnyway')}</button>
            )}
          </div>
        </div>
      )}
    </ScreenFrame>
  );
}

/** Is the active arm held straight out to the side at about shoulder height? */
function armOutPose(f: PoseFrame, arm: 'left' | 'right') {
  const ix = armIdx(arm);
  const s = toIU(f.lm[ix.shoulder], f.aspect), e = toIU(f.lm[ix.elbow], f.aspect), w = toIU(f.lm[ix.wrist], f.aspect);
  const out = arm === 'right' ? 1 : -1;
  const v1 = { x: e.x - s.x, y: e.y - s.y }, v2 = { x: w.x - e.x, y: w.y - e.y };
  const a1 = Math.atan2(-v1.y, v1.x * out) * 180 / Math.PI;   // 0 = horizontal outward
  const a2 = Math.atan2(-v2.y, v2.x * out) * 180 / Math.PI;
  // Tolerant on purpose: older users rarely hold the arm dead straight or exactly level.
  const straight = Math.abs(a1 - a2) < 35;
  const horizontal = Math.abs(a1) < 35 && Math.abs(a2) < 40;
  const vis = [ix.shoulder, ix.elbow, ix.wrist].every((i) => (f.lm[i].visibility ?? 1) > 0.5);
  return { ok: straight && horizontal && vis, a1 };
}

export function Calibrate() {
  const { t } = useT();
  const nav = useNav();
  const vision = useEngine();
  const arm = useSettings((s) => s.arm);
  const setSession = useSession((s) => s.set);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<'position' | 'holding' | 'done'>('position');
  const [count, setCount] = useState(3);
  const [armCm, setArmCm] = useState<number | null>(null);
  const [aspect, setAspect] = useState(16 / 9);
  const phaseRef = useRef(phase); phaseRef.current = phase;

  const goNext = () => {
    const after = useNav.getState().after;
    nav.reset(['menu', after]);
  };

  useEffect(() => { speak(tNow('cal.speak', { arm: tNow(`settings.${arm}`) })); }, [arm]);

  useEffect(() => {
    let buf: PoseFrame[] = [];
    let since = 0, lastSec = -1, lostSince = 0;
    const unsub = poseEngine.subscribe((f) => {
      const c = canvas.current;
      if (c) { const { ctx, W, H } = fitCanvas(c); if (f) drawSkeleton(ctx, f.lm, W, H, arm); }
      if (!f || phaseRef.current === 'done') return;
      if (Math.abs(f.aspect - aspect) > 0.01) setAspect(f.aspect);
      const p = armOutPose(f, arm);
      const now = performance.now();
      if (!p.ok) {
        // A brief dropout (tracking jitter, a wobble) does not restart the countdown; 0.4 s does.
        if (!lostSince) lostSince = now;
        if (since && now - lostSince < 400) return;
        if (phaseRef.current === 'holding') { setPhase('position'); speak(tNow('cal.lost'), { key: 'cal.lost', cooldownMs: 3000 }); }
        buf = []; since = 0; lastSec = -1;
        return;
      }
      lostSince = 0;
      if (!since) { since = now; setPhase('holding'); }
      buf.push(f);
      const sec = Math.floor((now - since) / 1000);
      if (sec !== lastSec) { lastSec = sec; const left = 3 - sec; if (left > 0) { setCount(left); sfx.tick(); speak(String(left), { interrupt: true }); } }
      if (now - since >= 3000) {
        const cal = calibrate(buf, arm);
        if (cal) {
          const ix = armIdx(arm);
          const cm = median(buf.map((b) => dist(b.world[ix.shoulder], b.world[ix.elbow]) + dist(b.world[ix.elbow], b.world[ix.wrist]))) * 100;
          setArmCm(Math.round(cm));
          setSession({ calibration: cal });
          setPhase('done'); sfx.success();
          speak(tNow('cal.done'));
        }
      }
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arm]);

  const skip = () => {
    const f = poseEngine.latest;
    if (f) { setSession({ calibration: estimateCalibration(f, arm) }); goNext(); }
  };

  return (
    <ScreenFrame title={t('cal.title')} wide>
      <div className="setup-layout">
        <div className="setup-cam">
          <div className="stage" style={{ ['--ar' as string]: aspect } as React.CSSProperties}>
            <CameraView className="mirrored" />
            <canvas ref={canvas} className="stage-canvas" />
            {phase === 'holding' && <motion.div key={count} className="countdown" initial={{ scale: 1.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>{count}</motion.div>}
            {phase === 'done' && <div className="countdown done"><Check /></div>}
            {vision.status !== 'ready' && <div className="stage-hint">{t('setup.loading')}</div>}
          </div>
        </div>
        <div className="setup-side">
          <ArmOutFigure arm={arm} />
          {phase !== 'done' ? (
            <>
              <h2>{t('cal.instruction', { arm: t(`settings.${arm}`) })}</h2>
              <p className="lead">{t('cal.why')}</p>
              <Meter value={phase === 'holding' ? (3 - count + 1) / 3 : 0} label={t('cal.title')} />
              <p className="status-line">{phase === 'holding' ? t('cal.hold') : t('cal.waiting')}</p>
              <button className="link-btn" data-dwell="" onClick={skip}>{t('cal.skip')}</button>
            </>
          ) : (
            <>
              <h2>{t('cal.doneTitle')}</h2>
              <p className="lead">{armCm ? t('cal.armLength', { cm: armCm }) : ''}</p>
              <p>{t('cal.stayPut')}</p>
              <BigButton icon={ArrowRight} label={t('common.continue')} variant="primary" primary size="xl" onClick={goNext} />
            </>
          )}
        </div>
      </div>
    </ScreenFrame>
  );
}

function ArmOutFigure({ arm }: { arm: 'left' | 'right' }) {
  // Simple pictogram: person facing you (mirrored, like the camera view), active arm out to the side.
  const out = arm === 'right' ? 1 : -1;
  const sx = 100 + out * 22;
  return (
    <svg className="figure" viewBox="0 0 200 170" role="img" aria-label="arm out to the side">
      <circle cx="100" cy="35" r="18" className="fig-body" />
      <line x1="78" y1="62" x2="122" y2="62" className="fig-body-line" />
      <line x1="100" y1="62" x2="100" y2="125" className="fig-body-line" />
      <line x1={200 - sx} y1="62" x2={200 - sx + -out * 8} y2="120" className="fig-body-line" />
      <line x1={sx} y1="62" x2={sx + out * 70} y2="62" className="fig-arm" />
      <circle cx={sx + out * 74} cy="62" r="7" className="fig-hand" />
      <path d={`M ${sx + out * 40} 95 q ${out * 25} -5 ${out * 30} -25`} className="fig-arrow" />
    </svg>
  );
}
