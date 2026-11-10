import { Download, Home, RotateCcw, BarChart3, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { BigButton, Confirm, ScreenFrame } from '../ui/components';
import { useSession } from '../store/shift';
import { ShiftRecord, useProfile } from '../store/profile';
import { useNav } from '../store/nav';
import { getExercise } from '../store/library';
import { formatMoney, strokePay } from '../game/economy';
import { RepResult } from '../exercise/types';
import { useT, tNow } from '../i18n';
import { useSpeakOnMount } from './basic';

const avg = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const mins = (ms: number) => Math.max(0, Math.round(ms / 60000));

function byExercise(reps: RepResult[]) {
  const m = new Map<string, RepResult[]>();
  reps.forEach((r) => m.set(r.exerciseId, [...(m.get(r.exerciseId) ?? []), r]));
  return [...m.entries()];
}

function exportRecord(rec: ShiftRecord) {
  // Anonymised export for the evaluation (no name, no video, no images): only numbers.
  const data = { ...rec, participant: 'P?', exportedAt: new Date().toISOString(), app: 'day-shift-painter@1.0' };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `session-${new Date(rec.date).toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function PaySlip() {
  const { t, loc } = useT();
  const nav = useNav();
  const history = useProfile((s) => s.history);
  const rec = useSession((s) => s.lastRecord) ?? history[history.length - 1];
  const prev = rec ? history.filter((h) => h.date < rec.date) : [];
  useSpeakOnMount(rec ? tNow('pay.speak', { walls: rec.wallsDone, pay: formatMoney(rec.earnings) }) : '');

  if (!rec) return <ScreenFrame title={t('pay.title')}><p className="lead">{t('pay.none')}</p></ScreenFrame>;
  const base = rec.reps.length * strokePay(0).base;
  const bonus = rec.reps.reduce((s, r) => s + strokePay(r.accuracy).bonus, 0);
  const wallBonus = rec.earnings - base - bonus;

  return (
    <ScreenFrame title={t('pay.title')} noBack wide>
      <div className="payslip-layout">
        <section className="card payslip">
          <p className="eyebrow">{new Date(rec.date).toLocaleDateString()} · {rec.jobName}</p>
          <h2>{rec.completed ? t('pay.dayDone') : t('pay.dayEnded')}</h2>
          <table className="pay-table">
            <tbody>
              <tr><td>{t('pay.strokes', { n: rec.reps.length })}</td><td>{formatMoney(base)}</td></tr>
              <tr><td>{t('pay.neatness')}</td><td>{formatMoney(bonus)}</td></tr>
              <tr><td>{t('pay.walls', { n: rec.wallsDone, m: rec.wallsPlanned })}</td><td>{formatMoney(wallBonus)}</td></tr>
              <tr className="total"><td>{t('pay.total')}</td><td>{formatMoney(rec.earnings)}</td></tr>
            </tbody>
          </table>
          <p className="muted">{t('pay.noDeductions')}</p>
        </section>

        <section className="card">
          <h2>{t('pay.exerciseTitle')}</h2>
          <p className="muted">{t('pay.exerciseNote')}</p>
          <div className="stat-tiles">
            <div className="tile"><span>{t('pay.activeTime')}</span><strong>{mins(rec.activeMs)} {t('common.min')}</strong></div>
            <div className="tile"><span>{t('pay.restTime')}</span><strong>{mins(rec.restMs)} {t('common.min')}</strong></div>
            <div className="tile"><span>{t('pay.avgNeat')}</span><strong>{Math.round(avg(rec.reps.map((r) => r.accuracy)))}%</strong></div>
            <div className="tile"><span>{t('pay.redos')}</span><strong>{rec.reps.reduce((s, r) => s + r.attempts - 1, 0)}</strong></div>
          </div>
          <table className="data-table">
            <thead><tr><th>{t('pay.col.exercise')}</th><th>{t('pay.col.strokes')}</th><th>{t('pay.col.neat')}</th><th>{t('pay.col.rom')}</th><th>{t('pay.col.rom2d')}</th><th>{t('pay.col.change')}</th></tr></thead>
            <tbody>
              {byExercise(rec.reps).map(([id, reps]) => {
                const ex = getExercise(id);
                const best = Math.max(...reps.map((r) => r.peakMetric3D));
                const best2 = Math.max(...reps.map((r) => r.peakMetric2D));
                const prevReps = prev.flatMap((h) => h.reps.filter((r) => r.exerciseId === id));
                const prevBest = prevReps.length ? Math.max(...prevReps.map((r) => r.peakMetric3D)) : null;
                const diff = prevBest === null ? null : best - prevBest;
                return (
                  <tr key={id}>
                    <td>{ex ? loc(ex.name) : id}<small>{ex ? t(`metric.${ex.metric}`) : ''}</small></td>
                    <td>{reps.length}</td>
                    <td>{Math.round(avg(reps.map((r) => r.accuracy)))}%</td>
                    <td><strong>{best}°</strong></td>
                    <td>{best2}°</td>
                    <td>{diff === null ? t('pay.first') : `${diff >= 0 ? '+' : ''}${diff}°`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="muted small">{t('pay.romNote')}</p>
        </section>
      </div>
      <div className="btn-row">
        <BigButton icon={Home} label={t('pay.done')} variant="primary" primary size="xl" onClick={() => nav.home()} />
        <BigButton icon={RotateCcw} label={t('pay.repeat')} onClick={() => nav.reset(['menu', 'roles'])} />
        <BigButton icon={BarChart3} label={t('menu.progress')} onClick={() => nav.go('progress')} />
        <BigButton icon={Download} label={t('pay.export')} onClick={() => exportRecord(rec)} />
      </div>
    </ScreenFrame>
  );
}

export function Progress() {
  const { t, loc } = useT();
  const history = useProfile((s) => s.history);
  const clear = useProfile((s) => s.clearHistory);
  const [confirm, setConfirm] = useState(false);
  useSpeakOnMount(tNow('progress.speak', { n: history.length }));
  const sorted = [...history].sort((a, b) => a.date - b.date);
  const pts = sorted.map((h) => avg(h.reps.map((r) => r.accuracy)));
  const W = 600, H = 220, P = 36;
  const x = (i: number) => P + (sorted.length <= 1 ? (W - 2 * P) / 2 : (i * (W - 2 * P)) / (sorted.length - 1));
  const y = (v: number) => H - P - (v / 100) * (H - 2 * P);
  const exIds = Array.from(new Set(sorted.flatMap((h) => h.reps.map((r) => r.exerciseId))));

  return (
    <ScreenFrame title={t('progress.title')} wide>
      {!history.length ? <p className="lead center">{t('progress.empty')}</p> : (
        <div className="payslip-layout">
          <section className="card">
            <h2>{t('progress.neatTitle')}</h2>
            <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('progress.neatTitle')}>
              {[0, 50, 100].map((v) => (
                <g key={v}><line x1={P} x2={W - P} y1={y(v)} y2={y(v)} className="grid" /><text x={P - 8} y={y(v) + 5} className="axis" textAnchor="end">{v}%</text></g>
              ))}
              <polyline points={pts.map((v, i) => `${x(i)},${y(v)}`).join(' ')} className="line" />
              {pts.map((v, i) => <g key={i}><circle cx={x(i)} cy={y(v)} r={7} className="pt" /><text x={x(i)} y={y(v) - 14} textAnchor="middle" className="label">{Math.round(v)}%</text></g>)}
              {sorted.map((h, i) => <text key={h.id} x={x(i)} y={H - 10} textAnchor="middle" className="axis">{new Date(h.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</text>)}
            </svg>
          </section>
          <section className="card">
            <h2>{t('progress.romTitle')}</h2>
            <table className="data-table">
              <thead><tr><th>{t('pay.col.exercise')}</th><th>{t('progress.first')}</th><th>{t('progress.latest')}</th><th>{t('progress.best')}</th></tr></thead>
              <tbody>
                {exIds.map((id) => {
                  const ex = getExercise(id);
                  const per = sorted.map((h) => h.reps.filter((r) => r.exerciseId === id)).filter((r) => r.length).map((r) => Math.max(...r.map((q) => q.peakMetric3D)));
                  return <tr key={id}><td>{ex ? loc(ex.name) : id}</td><td>{per[0]}°</td><td>{per[per.length - 1]}°</td><td><strong>{Math.max(...per)}°</strong></td></tr>;
                })}
              </tbody>
            </table>
          </section>
          <section className="card span2">
            <h2>{t('progress.shifts')}</h2>
            <table className="data-table">
              <thead><tr><th>{t('progress.date')}</th><th>{t('progress.job')}</th><th>{t('progress.walls')}</th><th>{t('pay.col.strokes')}</th><th>{t('pay.col.neat')}</th><th>{t('pay.total')}</th></tr></thead>
              <tbody>
                {[...sorted].reverse().map((h) => (
                  <tr key={h.id}><td>{new Date(h.date).toLocaleString()}</td><td>{h.jobName}</td><td>{h.wallsDone}/{h.wallsPlanned}</td><td>{h.reps.length}</td><td>{Math.round(avg(h.reps.map((r) => r.accuracy)))}%</td><td>{formatMoney(h.earnings)}</td></tr>
                ))}
              </tbody>
            </table>
            <BigButton icon={Trash2} label={t('progress.clear')} variant="danger" size="md" onClick={() => setConfirm(true)} />
          </section>
        </div>
      )}
      {confirm && <Confirm title={t('progress.clearConfirm')} yes={t('progress.clearYes')} no={t('common.cancel')} onYes={() => { clear(); setConfirm(false); }} onNo={() => setConfirm(false)} />}
    </ScreenFrame>
  );
}
