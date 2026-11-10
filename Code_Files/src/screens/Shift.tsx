// The working day. Clock advances with work done (not real time) -> no time pressure.
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Clock, Coffee, Home, Pause, Play, Paintbrush, RotateCcw, Settings as SettingsIcon, Square, Sun, Wallet, X, ArrowRight, GraduationCap, Hand, SkipForward, Ruler,
} from 'lucide-react';
import { PaintStage } from '../game/PaintStage';
import { BigButton, Confirm, StatusChips } from '../ui/components';
import { useShift, useSession } from '../store/shift';
import { getExercise } from '../store/library';
import { useNav } from '../store/nav';
import { useProfile } from '../store/profile';
import { useSettings, TAPE_MULT } from '../store/settings';
import { PRESETS, TRAINING_EXERCISE } from '../exercise/presets';
import { Exercise, RepResult } from '../exercise/types';
import { DAY_END, DAY_START, formatClock, formatMoney, strokePay, WALL_BONUS } from '../game/economy';
import { useT, tNow, locNow } from '../i18n';
import { speak } from '../feedback/speech';
import { sfx } from '../feedback/sfx';
import { useCommands } from '../input/commands';
import { poseEngine } from '../vision/poseEngine';

type PauseReason = null | 'user' | 'tracking' | 'drift' | 'resume';

const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

/** Animated demonstration of the stroke in body space (stick arm + moving brush). */
export function StrokeDemo({ ex, arm }: { ex: Exercise; arm: 'left' | 'right' }) {
  const reduced = useSettings((s) => s.reducedMotion);
  const flip = arm === 'left' ? -1 : 1;
  const joint = ex.joint ?? 'wrist';
  // Where the tape is anchored on the figure, and how big one tape unit is (shoulder at 0,0; arm = 100).
  const anchor = joint === 'hand' ? { x: 38 * flip, y: -20 } : { x: 0, y: 0 };
  const k = joint === 'hand' ? 45 : joint === 'shoulder' ? 110 : 100;
  const Q = (p: { x: number; y: number }) => ({ x: anchor.x + p.x * flip * k, y: anchor.y - p.y * k });
  const P = (p: { x: number; y: number }) => { const q = Q(p); return `${q.x.toFixed(1)},${q.y.toFixed(1)}`; };
  const d = 'M ' + ex.path.map(P).join(' L ');
  const tol = ex.tolerance * k;
  const sx = -60 * flip; // other shoulder
  const s0 = Q(ex.path[0]), s1 = Q(ex.path[ex.path.length - 1]);
  return (
    <svg className="stroke-demo" viewBox="-130 -110 260 230" role="img" aria-label={locNow(ex.name)}>
      <circle cx={(sx) / 2} cy={-38} r={18} className="fig-body" />
      <line x1={sx} y1={0} x2={0} y2={0} className="fig-body-line" />
      <line x1={sx / 2} y1={0} x2={sx / 2} y2={95} className="fig-body-line" />
      {joint === 'hand' && <polyline points={`0,0 ${30 * flip},62 ${anchor.x},${anchor.y}`} className="fig-body-line" fill="none" />}
      <path d={d} className="demo-tape" style={{ strokeWidth: tol * 2 }} />
      <path d={d} className="demo-tape-edge" />
      <circle cx={s0.x} cy={s0.y} r={tol * 1.2} className="demo-start" />
      {!reduced ? (
        <circle r={9} className="demo-brush" style={{ fill: ex.color }}>
          <animateMotion dur={`${Math.max(2, ex.refDurationMs / 1000)}s`} repeatCount="indefinite" path={d} keyPoints="0;1;1" keyTimes="0;0.8;1" calcMode="linear" />
        </circle>
      ) : (
        <circle cx={s1.x} cy={s1.y} r={9} className="demo-brush" style={{ fill: ex.color }} />
      )}
      <circle cx={anchor.x} cy={anchor.y} r={6} className="fig-hand" />
    </svg>
  );
}

/** The wall being painted: one stripe per stroke (progress at a glance). */
function WallMural({ reps, done, progress, color }: { reps: number; done: number; progress: number; color: string }) {
  const { t } = useT();
  return (
    <div className="mural" aria-label={t('shift.strokeOf', { n: Math.min(done + 1, reps), m: reps })}>
      <svg viewBox={`0 0 ${reps * 20} 100`} preserveAspectRatio="none">
        <rect x={0} y={0} width={reps * 20} height={100} className="mural-wall" />
        {Array.from({ length: reps }, (_, i) => {
          const h = i < done ? 100 : i === done ? progress * 100 : 0;
          return <rect key={i} x={i * 20 + 1} y={100 - h} width={18} height={h} style={{ fill: color }} />;
        })}
      </svg>
    </div>
  );
}

function Toast({ msg }: { msg: { text: string; kind: 'good' | 'warn' | 'info'; id: number } | null }) {
  return (
    <div className="toast-area" aria-live="assertive">
      <AnimatePresence>
        {msg && (
          <motion.div key={msg.id} className={`toast ${msg.kind}`} initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }}>
            {msg.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function useToast() {
  const [msg, setMsg] = useState<{ text: string; kind: 'good' | 'warn' | 'info'; id: number } | null>(null);
  const timer = useRef<number>();
  const show = (text: string, kind: 'good' | 'warn' | 'info' = 'info', ms = 2600) => {
    setMsg({ text, kind, id: Date.now() });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMsg(null), ms);
  };
  return { msg, show };
}

function Overlay({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="overlay" role="dialog" aria-modal="true">
      <motion.div className={`overlay-card ${wide ? 'wide' : ''}`} initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.25 }}>
        {children}
      </motion.div>
    </div>
  );
}

export function Shift() {
  const { t, loc } = useT();
  const nav = useNav();
  const shift = useShift();
  const cal = useSession((s) => s.calibration);
  const setSession = useSession((s) => s.set);
  const name = useProfile((s) => s.name);
  const arm = useSettings((s) => s.arm);
  const sessionLength = useSettings((s) => s.sessionLength);
  const [paused, setPaused] = useState<PauseReason>(shift.phase === 'working' ? 'resume' : null);
  const [confirm, setConfirm] = useState<null | 'end' | 'restart'>(null);
  const [progress, setProgress] = useState(0);
  const toast = useToast();
  const lunchStart = useRef(0);

  // Start a new shift if none is active; make sure the camera/pose engine is running.
  useEffect(() => { if (!useShift.getState().active) useShift.getState().start(sessionLength); }, [sessionLength]);
  useEffect(() => { poseEngine.start(useSettings.getState().model).catch(() => {}); }, []);
  // Calibration is required every session.
  useEffect(() => { if (!cal) { nav.setAfter('shift'); nav.reset(['menu', 'setup']); } }, [cal, nav]);

  const wall = shift.walls[shift.wallIndex];
  const baseEx = useMemo(() => (wall ? getExercise(wall.exerciseId) ?? PRESETS[0] : PRESETS[0]), [wall?.exerciseId]);
  // ---- Error bounds: tape width = exercise tolerance x user setting x adaptive factor ----
  // Adaptive difficulty: two misses in a row on a wall widen the tape by 20% (max 1.6x);
  // three neat strokes in a row narrow it back toward the prescribed width.
  const tapeWidth = useSettings((s) => s.tapeWidth);
  const autoAdjust = useSettings((s) => s.autoAdjust);
  const [adapt, setAdapt] = useState(1);
  const streak = useRef({ miss: 0, neat: 0 });
  useEffect(() => { setAdapt(1); streak.current = { miss: 0, neat: 0 }; }, [shift.wallIndex]);
  const ex = useMemo(() => ({ ...baseEx, tolerance: baseEx.tolerance * TAPE_MULT[tapeWidth] * adapt }), [baseEx, tapeWidth, adapt]);

  // Active/rest time accounting.
  useEffect(() => {
    const id = setInterval(() => {
      const s = useShift.getState();
      if (!s.active) return;
      const working = s.phase === 'working' && !pausedRef.current;
      s.addTime(working ? 1000 : 0, working ? 0 : 1000);
    }, 1000);
    return () => clearInterval(id);
  }, []);
  const pausedRef = useRef(paused); pausedRef.current = paused;

  // Spoken prompts on phase changes.
  useEffect(() => {
    if (!wall) return;
    if (shift.phase === 'briefing') speak(tNow('shift.briefingSpeak', { name: name || tNow('common.friend'), job: locNow(shift.job), n: shift.walls.length }));
    if (shift.phase === 'wallIntro') speak(`${locNow(wall.name)}. ${locNow(ex.name)}. ${locNow(ex.instruction)}`);
    if (shift.phase === 'lunch') { lunchStart.current = Date.now(); speak(tNow('shift.lunchSpeak')); }
    if (shift.phase === 'wallDone') speak(tNow('shift.wallDoneSpeak', { bonus: WALL_BONUS }));
    const live = useShift.getState();
    if (live.phase === 'done' && live.active) endShift(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shift.phase, shift.wallIndex, shift.id]);

  const pause = (reason: PauseReason = 'user') => {
    if (shift.phase !== 'working' || paused) return;
    setPaused(reason); sfx.pause(); shift.log(`pause:${reason}`);
    if (reason === 'user') speak(tNow('pause.speak'));
  };
  const resume = () => { if (!paused) return; setPaused(null); sfx.resume(); speak(tNow('pause.resumeSpeak'), { key: 'resume', cooldownMs: 1500 }); };

  useCommands({
    pause: () => { shift.log('voice:pause'); pause('user'); },
    resume: () => { shift.log('voice:resume'); resume(); },
  });

  // Keyboard: Space toggles pause (one-key access for carers / evaluation).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' && shift.phase === 'working') { e.preventDefault(); pausedRef.current ? resume() : pause('user'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function endShift(completed: boolean) {
    const rec = useShift.getState().finish(completed);
    setSession({ lastRecord: rec });
    if (completed) sfx.fanfare();
    nav.reset(['menu', 'payslip']);
  }

  const onComplete = (r: RepResult) => {
    const { wallFinished } = useShift.getState().recordRep(r);
    const pay = strokePay(r.accuracy);
    setTimeout(() => sfx.coin(), 350);
    const s = useShift.getState();
    const left = wall.reps - s.repIndex;
    toast.show(`${t('shift.paid', { pay: formatMoney(pay.total) })}${pay.bonus ? ` · ${t('shift.neat', { bonus: formatMoney(pay.bonus) })}` : ''}`, 'good');
    const praise = pick([tNow('fb.good1'), tNow('fb.good2'), tNow('fb.good3'), tNow('fb.good4')]);
    streak.current.miss = 0;
    streak.current.neat = r.accuracy >= 85 ? streak.current.neat + 1 : 0;
    if (autoAdjust && streak.current.neat >= 3 && adapt > 1) { streak.current.neat = 0; setAdapt((a) => Math.max(1, a / 1.15)); shift.log('tapeNarrowed'); }
    if (wallFinished) { s.setPhase('wallDone'); }
    else speak(`${praise} ${left === 1 ? tNow('fb.oneMore') : tNow('fb.nMore', { n: left })}`);
  };
  const onError = (reason: string) => {
    shift.log(`reset:${reason}`);
    streak.current.neat = 0;
    if (reason === 'offPath') streak.current.miss++;
    if (autoAdjust && streak.current.miss >= 2 && adapt < 1.6) {
      streak.current.miss = 0;
      setAdapt((a) => Math.min(1.6, a * 1.2));
      shift.log('tapeWidened');
      toast.show(t('fb.widened'), 'info', 4000);
      speak(`${tNow(`fb.error.${reason}`)} ${tNow('fb.widened')}`, { key: `err:${reason}`, cooldownMs: 2000 });
      return;
    }
    toast.show(t(`fb.error.${reason}`), 'warn', 4000);
    speak(tNow(`fb.error.${reason}`), { key: `err:${reason}`, cooldownMs: 4000 });
  };
  const onHint = (key: string) => { speak(tNow(`fb.hint.${key}`), { key: `hint:${key}`, cooldownMs: 10000 }); toast.show(t(`fb.hint.${key}`), 'info'); };
  const onTracking = (ok: boolean) => {
    if (!ok) { shift.log('trackingLost'); if (!pausedRef.current) { setPaused('tracking'); sfx.attention(); speak(tNow('pause.trackingSpeak'), { key: 'tracking', cooldownMs: 6000 }); } }
    else if (pausedRef.current === 'tracking') { setTimeout(() => { if (pausedRef.current === 'tracking') resume(); }, 900); }
  };
  const driftSince = useRef(0);
  const onDrift = (ratio: number) => {
    const now = performance.now();
    // Small changes are absorbed by the adaptive scale; only large ones (fixed-position assumption broken) pause.
    if (ratio < 0.7 || ratio > 1.45) {
      if (!driftSince.current) driftSince.current = now;
      if (now - driftSince.current > 1500 && !pausedRef.current) {
        setPaused('drift'); sfx.attention(); shift.log('drift');
        speak(tNow(ratio > 1 ? 'pause.driftCloser' : 'pause.driftFurther'), { key: 'drift', cooldownMs: 6000 });
      }
    } else if (ratio > 0.78 && ratio < 1.32) {
      driftSince.current = 0;
      if (pausedRef.current === 'drift') resume();
    }
  };

  if (!cal || !wall) return <div className="screen center-screen"><p className="lead">{t('setup.loading')}</p></div>;

  const dayFrac = (shift.clockMin - DAY_START) / (DAY_END - DAY_START);
  const working = shift.phase === 'working';

  return (
    <div className="shift-screen">
      <header className="hud">
        <BigButton icon={Pause} label={t('shift.pause')} size="md" onClick={() => pause('user')} disabled={!working} dwellMs={2000} className="hud-pause" />
        <div className="hud-clock" aria-label={t('shift.time')}>
          <Clock aria-hidden="true" />
          <div>
            <strong>{formatClock(shift.clockMin)}</strong>
            <div className="day-bar" aria-hidden="true"><div style={{ width: `${dayFrac * 100}%` }} /><span className="lunch-mark" style={{ left: `${(4 / 8) * 100}%` }} /></div>
            <small>{t('shift.dayRange')}</small>
          </div>
        </div>
        <div className="hud-job">
          <Paintbrush aria-hidden="true" />
          <div>
            <strong>{loc(wall.name)} · {t('shift.wallOf', { n: shift.wallIndex + 1, m: shift.walls.length })}</strong>
            <small>{loc(ex.name)} · {t('shift.strokeOf', { n: Math.min(shift.repIndex + 1, wall.reps), m: wall.reps })}</small>
          </div>
        </div>
        <div className="hud-pay" aria-label={t('shift.earnings')}>
          <Wallet aria-hidden="true" />
          <div><strong>{formatMoney(shift.earnings)}</strong><small>{t('shift.earnedToday')}</small></div>
        </div>
        <StatusChips />
      </header>

      <div className="shift-body">
        <PaintStage key={`${shift.wallIndex}-${ex.id}`} exercise={ex} cal={cal} paused={!working || !!paused}
          onSnapshot={(s) => setProgress(s.state === 'waitStart' ? 0 : s.progress)}
          callbacks={{ onComplete, onError, onHint, onTracking, onDrift }} />
        <aside className="shift-side">
          <WallMural reps={wall.reps} done={shift.repIndex} progress={progress} color={ex.color} />
          <p className="side-instruction">{loc(ex.instruction)}</p>
          {ex.tip && <p className="side-tip">{loc(ex.tip)}</p>}
        </aside>
        <Toast msg={toast.msg} />
      </div>

      {shift.phase === 'briefing' && (
        <Overlay wide>
          <Sun className="hero-icon small" aria-hidden="true" />
          <h2>{t('shift.briefingTitle', { name: name || t('common.friend') })}</h2>
          <p className="lead">{t('shift.briefingBody', { job: loc(shift.job), n: shift.walls.length })}</p>
          <ul className="brief-list">
            {shift.walls.map((w, i) => { const e = getExercise(w.exerciseId) ?? PRESETS[0]; return <li key={i}><span className="swatch" style={{ background: e.color }} />{loc(w.name)} — {loc(e.name)} ({w.reps})</li>; })}
          </ul>
          <p>{t('shift.briefingNote')}</p>
          <div className="btn-row">
            <BigButton icon={Play} label={t('shift.letsStart')} variant="primary" primary size="xl" onClick={() => shift.setPhase('wallIntro')} />
            <BigButton icon={Home} label={t('common.menu')} onClick={() => nav.home()} />
          </div>
        </Overlay>
      )}

      {shift.phase === 'wallIntro' && (
        <Overlay wide>
          <div className="intro-layout">
            <StrokeDemo ex={ex} arm={arm} />
            <div>
              <p className="eyebrow">{loc(wall.name)} · {t('shift.wallOf', { n: shift.wallIndex + 1, m: shift.walls.length })}</p>
              <h2>{loc(ex.name)}</h2>
              <p className="lead">{loc(ex.instruction)}</p>
              {ex.tip && <p className="side-tip">{loc(ex.tip)}</p>}
              <p>{t('shift.introStrokes', { n: wall.reps })}</p>
            </div>
          </div>
          <div className="btn-row">
            <BigButton icon={Paintbrush} label={t('shift.startPainting')} variant="primary" primary size="xl" onClick={() => { shift.setPhase('working'); setPaused(null); speak(tNow('shift.goToStart')); }} />
            <BigButton icon={Pause} label={t('shift.notYet')} onClick={() => { shift.setPhase('working'); setPaused('user'); }} />
          </div>
        </Overlay>
      )}

      {shift.phase === 'wallDone' && (
        <Overlay>
          <h2>{t('shift.wallDoneTitle')}</h2>
          <p className="lead">{t('shift.wallDoneBody', { bonus: formatMoney(WALL_BONUS), total: formatMoney(shift.earnings) })}</p>
          <div className="btn-row">
            <BigButton icon={ArrowRight} label={shift.wallIndex + 1 >= shift.walls.length ? t('shift.finishDay') : t('shift.nextWall')} variant="primary" primary size="xl" onClick={() => shift.nextWall()} />
            <BigButton icon={Coffee} label={t('shift.restFirst')} onClick={() => { shift.nextWall(); }} sub={t('shift.restFirstSub')} />
          </div>
        </Overlay>
      )}

      {shift.phase === 'lunch' && (
        <Overlay>
          <Coffee className="hero-icon small" aria-hidden="true" />
          <h2>{t('shift.lunchTitle')}</h2>
          <p className="lead">{t('shift.lunchBody')}</p>
          <BigButton icon={Play} label={t('shift.backToWork')} variant="primary" primary size="xl" onClick={() => shift.takeLunch()} />
        </Overlay>
      )}

      {working && paused && !confirm && (
        <Overlay>
          {paused === 'tracking' ? (
            <><Hand className="hero-icon small" aria-hidden="true" /><h2>{t('pause.trackingTitle')}</h2><p className="lead">{t('pause.trackingBody')}</p></>
          ) : paused === 'drift' ? (
            <><Square className="hero-icon small" aria-hidden="true" /><h2>{t('pause.driftTitle')}</h2><p className="lead">{t('pause.driftBody')}</p></>
          ) : (
            <><Pause className="hero-icon small" aria-hidden="true" /><h2>{paused === 'resume' ? t('pause.readyTitle') : t('pause.title')}</h2><p className="lead">{t('pause.body')}</p></>
          )}
          <div className="pause-grid">
            <BigButton icon={Play} label={t('pause.resume')} variant="primary" primary size="xl" onClick={resume} />
            <BigButton icon={Ruler} label={t('pause.remeasure')} sub={t('pause.remeasureSub')} variant={paused === 'drift' ? 'primary' : 'secondary'}
              onClick={() => { shift.log('remeasure'); nav.setAfter('shift'); nav.go('calibrate'); }} />
            <BigButton icon={SkipForward} label={t('pause.skipWall')} onClick={() => { setPaused(null); shift.skipWall(); }} />
            <BigButton icon={RotateCcw} label={t('pause.restartWall')} onClick={() => setConfirm('restart')} />
            <BigButton icon={SettingsIcon} label={t('pause.settings')} onClick={() => nav.go('settings')} />
            <BigButton icon={X} label={t('pause.end')} variant="danger" onClick={() => setConfirm('end')} />
          </div>
        </Overlay>
      )}

      {confirm === 'end' && (
        <Confirm title={t('pause.endConfirm')} body={t('pause.endConfirmBody', { pay: formatMoney(shift.earnings) })}
          yes={t('pause.endYes')} no={t('pause.keepWorking')} yesIcon={X} noIcon={Play}
          onYes={() => { setConfirm(null); endShift(false); }} onNo={() => setConfirm(null)} />
      )}
      {confirm === 'restart' && (
        <Confirm title={t('pause.restartConfirm')} body={t('pause.restartConfirmBody')}
          yes={t('pause.restartYes')} no={t('common.cancel')} yesIcon={RotateCcw} noIcon={X}
          onYes={() => { setConfirm(null); setPaused(null); shift.restartWall(); }} onNo={() => setConfirm(null)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Training Day
export function Training() {
  const { t, loc } = useT();
  const nav = useNav();
  const cal = useSession((s) => s.calibration);
  const arm = useSettings((s) => s.arm);
  const setTrained = useProfile((s) => s.setTrained);
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(0);
  const [sawReset, setSawReset] = useState(false);
  const [pauseDemo, setPauseDemo] = useState(false);
  const toast = useToast();

  useEffect(() => { if (!cal) { nav.setAfter('training'); nav.reset(['menu', 'setup']); } }, [cal, nav]);
  useEffect(() => { poseEngine.start(useSettings.getState().model).catch(() => {}); }, []);
  useEffect(() => { speak(tNow(`train.s${step}.speak`)); }, [step]);
  useCommands({ pause: () => step === 3 && setPauseDemo(true), resume: () => { if (pauseDemo) { setPauseDemo(false); setStep(4); } } });

  if (!cal) return null;
  const steps = 5;
  return (
    <div className="shift-screen">
      <header className="hud">
        <BigButton icon={Home} label={t('common.menu')} size="md" onClick={() => nav.home()} back />
        <div className="hud-job"><GraduationCap aria-hidden="true" /><div><strong>{t('train.title')}</strong><small>{t('train.stepOf', { n: step + 1, m: steps })}</small></div></div>
        <div className="steps-dots" aria-hidden="true">{Array.from({ length: steps }, (_, i) => <span key={i} className={i <= step ? 'on' : ''} />)}</div>
        <StatusChips />
      </header>
      <div className="shift-body">
        {step === 2 ? (
          <>
            <PaintStage exercise={TRAINING_EXERCISE} cal={cal} paused={false}
              callbacks={{
                onComplete: () => { const n = done + 1; setDone(n); toast.show(t('train.strokeDone', { n, m: 2 }), 'good'); speak(n >= 2 ? tNow('train.s2.done') : tNow('fb.good1')); if (n >= 2) setTimeout(() => setStep(3), 1800); },
                onError: (r) => { setSawReset(true); toast.show(t(`fb.error.${r}`), 'warn', 4000); speak(`${tNow('train.resetExplain')} ${tNow(`fb.error.${r}`)}`, { key: 'train-err', cooldownMs: 5000 }); },
              }} />
            <aside className="shift-side">
              <WallMural reps={2} done={done} progress={0} color={TRAINING_EXERCISE.color} />
              <p className="side-instruction">{t('train.s2.body')}</p>
              {sawReset && <p className="side-tip">{t('train.resetExplain')}</p>}
              <BigButton icon={ArrowRight} label={t('train.skipStep')} size="md" onClick={() => setStep(3)} />
            </aside>
          </>
        ) : (
          <div className="train-card card">
            <h2>{t(`train.s${step}.title`)}</h2>
            <p className="lead">{t(`train.s${step}.body`, { hand: t(`settings.${arm === 'right' ? 'left' : 'right'}`) })}</p>
            {step === 0 && <BigButton icon={ArrowRight} label={t('common.next')} variant="primary" primary size="xl" onClick={() => setStep(1)} />}
            {step === 1 && (
              <div className="btn-row">
                <BigButton icon={Hand} label={t('train.s1.button')} variant="primary" primary size="xl" onClick={() => { toast.show(t('train.s1.well'), 'good'); setStep(2); }} />
              </div>
            )}
            {step === 3 && (
              <>
                <StrokeDemo ex={TRAINING_EXERCISE} arm={arm} />
                <BigButton icon={Pause} label={t('shift.pause')} variant="primary" primary size="xl" onClick={() => setPauseDemo(true)} />
              </>
            )}
            {step === 4 && (
              <div className="btn-row">
                <BigButton icon={Paintbrush} label={t('train.s4.start')} variant="primary" primary size="xl" onClick={() => { setTrained(true); nav.reset(['menu', 'plan']); }} />
                <BigButton icon={Home} label={t('common.menu')} onClick={() => { setTrained(true); nav.home(); }} />
              </div>
            )}
          </div>
        )}
        <Toast msg={toast.msg} />
      </div>
      {pauseDemo && (
        <Overlay>
          <Pause className="hero-icon small" aria-hidden="true" />
          <h2>{t('pause.title')}</h2>
          <p className="lead">{t('train.pauseDemo')}</p>
          <BigButton icon={Play} label={t('pause.resume')} variant="primary" primary size="xl" onClick={() => { setPauseDemo(false); setStep(4); }} />
        </Overlay>
      )}
    </div>
  );
}
