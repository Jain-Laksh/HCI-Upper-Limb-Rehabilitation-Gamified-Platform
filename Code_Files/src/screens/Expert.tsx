// Expert Mode (for physiotherapists): upload an exercise video, review the extracted reference
// stroke, adjust tolerance / reps / hold, and approve it as a new wall in the game.
import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, FileVideo, Library, Trash2, Upload, X } from 'lucide-react';
import { BigButton, Meter, ScreenFrame, Segmented } from '../ui/components';
import { Extraction, draftExercise, processVideo } from '../exercise/extractReference';
import { Exercise } from '../exercise/types';
import { allExercises, useLibrary } from '../store/library';
import { useT } from '../i18n';
import { StrokeDemo } from './Shift';
import { useSettings } from '../store/settings';
import { Arm } from '../vision/geometry';
import { speak } from '../feedback/speech';

const COLORS = ['#3f7fbf', '#c8743a', '#5f9a55', '#9a5f9a', '#b8483f', '#2f8f8f'];

function BodyPlot({ ex: e, reps }: { ex: Exercise; reps?: { path: { x: number; y: number }[]; include: boolean }[] }) {
  const P = (p: { x: number; y: number }) => `${(p.x * 100).toFixed(1)},${(-p.y * 100).toFixed(1)}`;
  return (
    <svg className="body-plot" viewBox="-80 -110 210 230" role="img" aria-label="reference path">
      <line x1={-80} x2={130} y1={0} y2={0} className="grid" />
      <line x1={0} x2={0} y1={-110} y2={120} className="grid" />
      <circle cx={0} cy={0} r={100} className="reach" />
      <line x1={-60} y1={0} x2={0} y2={0} className="fig-body-line" />
      <circle cx={-30} cy={-38} r={16} className="fig-body" />
      {reps?.map((r, i) => <polyline key={i} points={r.path.map(P).join(' ')} className={`rep-line ${r.include ? '' : 'excluded'}`} />)}
      {e.path.length > 1 && <>
        <polyline points={e.path.map(P).join(' ')} className="demo-tape" style={{ strokeWidth: e.tolerance * 200 }} />
        <polyline points={e.path.map(P).join(' ')} className="avg-line" />
        <circle cx={e.path[0].x * 100} cy={-e.path[0].y * 100} r={6} className="demo-start" />
      </>}
      <text x={-75} y={115} className="axis">1 unit = arm length</text>
    </svg>
  );
}

function AngleChart({ x }: { x: Extraction }) {
  const W = 560, H = 160;
  const vals = x.frames.map((f) => (x.metric === 'elbowFlex' ? f.elbowFlex : x.metric === 'horizontal' ? f.horizontal : f.elevation));
  const max = Math.max(180, ...vals);
  const px = (t: number) => (t / x.duration) * W;
  const py = (v: number) => H - 20 - (v / max) * (H - 30);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="joint angle over time">
      {x.reps.map((r, i) => <rect key={i} x={px(r.start)} width={Math.max(2, px(r.end) - px(r.start))} y={0} height={H - 20} className={`rep-band ${r.include ? '' : 'excluded'}`} />)}
      {[0, 90, 180].map((v) => <g key={v}><line x1={0} x2={W} y1={py(v)} y2={py(v)} className="grid" /><text x={4} y={py(v) - 3} className="axis">{v}°</text></g>)}
      <polyline points={x.frames.map((f, i) => `${px(f.t)},${py(vals[i])}`).join(' ')} className="line" />
      <text x={W - 4} y={H - 4} textAnchor="end" className="axis">{x.duration.toFixed(1)} s</text>
    </svg>
  );
}

export function Expert() {
  const { t, loc } = useT();
  const lib = useLibrary();
  const lang = useSettings((s) => s.lang);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [armChoice, setArmChoice] = useState<Arm | 'auto'>('auto');
  const [busy, setBusy] = useState<{ p: number; msg: string } | null>(null);
  const [error, setError] = useState('');
  const [x, setX] = useState<Extraction | null>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [form, setForm] = useState({ nameEn: '', nameHi: '', instrEn: '', instrHi: '', tolerance: 0.15, reps: 5, holdMs: 500, color: COLORS[4], approvedBy: '', postureChecks: true });
  const [saved, setSaved] = useState('');
  const [drag, setDrag] = useState(false);
  const [pickNote, setPickNote] = useState(false);
  // Browsers only open the file chooser after a real click or key press. A hand-pointer (dwell)
  // selection is a synthetic click, so the chooser silently would not open: say so instead.
  const pick = () => {
    const ua = (navigator as any).userActivation;
    if (ua && !ua.isActive) { setPickNote(true); speak(t('expert.pickNote')); return; }
    setPickNote(false);
    fileRef.current?.click();
  };

  const onFile = async (file: File) => {
    setError(''); setX(null); setSaved('');
    setVideoUrl(URL.createObjectURL(file));
    setBusy({ p: 0, msg: 'loading' });
    try {
      const res = await processVideo(file, armChoice, (p, msg) => setBusy({ p, msg }));
      setX(res);
      speak(t('expert.doneSpeak', { n: res.reps.length }));
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally { setBusy(null); }
  };

  const draft: Exercise | null = useMemo(() => (x ? draftExercise(x, form) : null), [x, form]);

  // Overlay the tracked wrist trail on the playing video.
  useEffect(() => {
    const v = videoRef.current, c = overlayRef.current;
    if (!v || !c || !x) return;
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const W = c.clientWidth, H = c.clientHeight; c.width = W; c.height = H;
      const ctx = c.getContext('2d')!;
      const now = v.currentTime;
      const trail = x.frames.filter((f) => f.t <= now && f.t > now - 2.5);
      ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(255, 214, 0, 0.9)';
      ctx.beginPath(); trail.forEach((f, i) => { const X = f.wristDN.x * W, Y = f.wristDN.y * H; i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }); ctx.stroke();
      const inRep = x.reps.find((r) => r.include && now >= r.start && now <= r.end);
      if (inRep) { ctx.fillStyle = 'rgba(30,160,90,0.85)'; ctx.fillRect(8, 8, 150, 34); ctx.fillStyle = '#fff'; ctx.font = 'bold 18px sans-serif'; ctx.fillText(`Rep ${x.reps.indexOf(inRep) + 1}`, 18, 32); }
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [x]);

  const save = () => {
    if (!draft || draft.path.length < 2 || !form.nameEn.trim()) return;
    lib.addCustom(draft);
    setSaved(loc(draft.name));
    speak(t('expert.saved', { name: loc(draft.name) }));
  };

  const toggleRep = (i: number) => setX((prev) => prev && { ...prev, reps: prev.reps.map((r, k) => (k === i ? { ...r, include: !r.include } : r)) });
  const exercises = allExercises(lib.custom);

  return (
    <ScreenFrame title={t('expert.title')} wide>
      <div className="expert-layout">
        <section className="card">
          <h2>{t('expert.step1')}</h2>
          <p>{t('expert.step1Body')}</p>
          <Segmented label={t('expert.arm')} value={armChoice} onChange={setArmChoice}
            options={[{ value: 'auto', label: t('expert.auto') }, { value: 'left', label: t('settings.left') }, { value: 'right', label: t('settings.right') }]} />
          <input ref={fileRef} type="file" accept="video/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f); }} />
          <div className={`drop-zone ${drag ? 'over' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f && !busy) onFile(f); }}>
            <BigButton icon={Upload} label={t('expert.upload')} variant="primary" primary onClick={pick} disabled={!!busy} />
            <small>{t('expert.dropHint')}</small>
          </div>
          {pickNote && <p className="warn-note">{t('expert.pickNote')}</p>}
          {busy && <div className="busy"><Meter value={busy.p} /><p>{t(`expert.${busy.msg}`)} {Math.round(busy.p * 100)}%</p></div>}
          {error && <p className="warn-note">{error}</p>}
        </section>

        {x && draft && (
          <>
            <section className="card">
              <h2>{t('expert.step2')}</h2>
              <div className="expert-video">
                <video ref={videoRef} src={videoUrl} controls muted playsInline className="mirrored" />
                <canvas ref={overlayRef} className="stage-canvas" />
              </div>
              <p className="muted">{t('expert.detected', { n: x.reps.length, arm: t(`settings.${x.arm}`), metric: t(`metric.${x.metric}`) })}</p>
              <AngleChart x={x} />
              <div className="rep-chips">
                {x.reps.map((r, i) => (
                  <button key={i} type="button" data-dwell="" className={`seg-btn ${r.include ? 'on' : ''}`} onClick={() => toggleRep(i)} aria-pressed={r.include}>
                    <span className="dwell-fill" />{r.include ? <CheckCircle2 /> : <X />} {t('expert.rep', { n: i + 1 })}: {r.peak}° · {(r.durationMs / 1000).toFixed(1)} s
                  </button>
                ))}
              </div>
            </section>

            <section className="card">
              <h2>{t('expert.step3')}</h2>
              <div className="review-grid">
                <BodyPlot ex={draft} reps={x.reps} />
                <div className="form-grid">
                  <label className="field"><span>{t('expert.nameEn')}</span><input value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} /></label>
                  <label className="field"><span>{t('expert.nameHi')}</span><input value={form.nameHi} onChange={(e) => setForm({ ...form, nameHi: e.target.value })} /></label>
                  <label className="field"><span>{t('expert.instrEn')}</span><textarea rows={2} value={form.instrEn} onChange={(e) => setForm({ ...form, instrEn: e.target.value })} /></label>
                  <label className="field"><span>{t('expert.instrHi')}</span><textarea rows={2} value={form.instrHi} onChange={(e) => setForm({ ...form, instrHi: e.target.value })} /></label>
                  <label className="field"><span>{t('expert.tolerance')}: {form.tolerance.toFixed(2)} ({t('expert.toleranceHint')})</span>
                    <input type="range" min={0.08} max={0.3} step={0.01} value={form.tolerance} onChange={(e) => setForm({ ...form, tolerance: Number(e.target.value) })} /></label>
                  <label className="field"><span>{t('expert.reps')}: {form.reps}</span>
                    <input type="range" min={2} max={12} step={1} value={form.reps} onChange={(e) => setForm({ ...form, reps: Number(e.target.value) })} /></label>
                  <label className="field"><span>{t('expert.hold')}: {(form.holdMs / 1000).toFixed(1)} s</span>
                    <input type="range" min={0} max={3000} step={100} value={form.holdMs} onChange={(e) => setForm({ ...form, holdMs: Number(e.target.value) })} /></label>
                  <label className="field"><span>{t('expert.approvedBy')}</span><input value={form.approvedBy} onChange={(e) => setForm({ ...form, approvedBy: e.target.value })} placeholder={t('expert.approvedByPh')} /></label>
                  <div className="field"><span>{t('expert.color')}</span>
                    <div className="swatches">{COLORS.map((c) => <button key={c} type="button" className={`swatch-btn ${form.color === c ? 'on' : ''}`} style={{ background: c }} onClick={() => setForm({ ...form, color: c })} aria-label={c} />)}</div>
                  </div>
                  <Segmented label={t('settings.postureChecks')} value={form.postureChecks} onChange={(v) => setForm({ ...form, postureChecks: v })}
                    options={[{ value: true, label: t('common.on') }, { value: false, label: t('common.off') }]} />
                </div>
              </div>
              <p className="muted">{t('expert.summary', { rom: draft.romTarget, metric: t(`metric.${draft.metric}`), dur: (draft.refDurationMs / 1000).toFixed(1) })}</p>
              <BigButton icon={CheckCircle2} label={t('expert.approve')} variant="primary" primary size="xl" onClick={save} disabled={!draft.path.length || !form.nameEn.trim()} />
              {!form.nameEn.trim() && <p className="muted">{t('expert.nameNeeded')}</p>}
              {saved && <p className="ok-note">{t('expert.saved', { name: saved })}</p>}
            </section>
          </>
        )}

        <section className="card span-all">
          <h2><Library aria-hidden="true" /> {t('expert.library')}</h2>
          <p className="muted">{t('expert.libraryBody')}</p>
          <div className="library-grid">
            {exercises.map((e) => (
              <div key={e.id} className={`lib-item ${lib.enabled[e.id] === false ? 'disabled' : ''}`}>
                <StrokeDemo ex={e} arm="right" />
                <div>
                  <strong>{e.name[lang] ?? e.name.en}</strong>
                  <small>{e.source === 'expert' ? t('expert.fromVideo') + (e.approvedBy ? ` · ${e.approvedBy}` : '') : t('expert.preset')} · {t(`metric.${e.metric}`)} {e.romTarget}°</small>
                </div>
                <Segmented label={t('expert.inShift')} value={lib.enabled[e.id] !== false} onChange={(v) => lib.toggle(e.id, v)}
                  options={[{ value: true, label: t('common.on') }, { value: false, label: t('common.off') }]} />
                {lib.custom.some((c) => c.id === e.id) && <BigButton icon={Trash2} label={t('common.delete')} size="md" variant="danger" onClick={() => lib.removeCustom(e.id)} />}
              </div>
            ))}
          </div>
          <p className="muted"><FileVideo aria-hidden="true" /> {t('expert.privacy')}</p>
        </section>
      </div>
    </ScreenFrame>
  );
}
