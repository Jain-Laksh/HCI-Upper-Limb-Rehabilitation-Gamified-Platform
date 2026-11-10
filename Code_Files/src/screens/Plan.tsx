// "Plan today's work": the user (or their therapist) chooses which exercises - walls - to do,
// in which order, how many strokes each, and how wide the tape is. Supports autonomy/control.
import { useState } from 'react';
import { CheckCircle2, Circle, Paintbrush } from 'lucide-react';
import { BigButton, ScreenFrame, Segmented } from '../ui/components';
import { StrokeDemo } from './Shift';
import { allExercises, useLibrary } from '../store/library';
import { useSettings, TapeWidth } from '../store/settings';
import { useSession, useShift } from '../store/shift';
import { useNav } from '../store/nav';
import { useT, tNow } from '../i18n';
import { sfx, unlockAudio } from '../feedback/sfx';
import { useSpeakOnMount } from './basic';

export function Plan() {
  const { t, loc } = useT();
  const nav = useNav();
  const lib = useLibrary();
  const settings = useSettings();
  const exercises = allExercises(lib.custom);
  const [picked, setPicked] = useState<string[]>(() => exercises.filter((e) => lib.enabled[e.id] !== false).map((e) => e.id).slice(0, 3));
  const [reps, setReps] = useState<number | 'auto'>('auto');
  useSpeakOnMount(tNow('plan.speak'));

  const toggle = (id: string) => {
    unlockAudio(); sfx.select();
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };
  const chosen = picked.map((id) => exercises.find((e) => e.id === id)!).filter(Boolean);
  const totalStrokes = chosen.reduce((s, e) => s + (reps === 'auto' ? e.reps : reps), 0);
  const minutes = Math.max(1, Math.round(chosen.reduce((s, e) => s + (reps === 'auto' ? e.reps : reps) * (e.refDurationMs + 4000), 0) / 60000) + chosen.length);

  const start = () => {
    useShift.getState().start(settings.sessionLength, { ids: picked, reps });
    const cal = useSession.getState().calibration;
    // Re-use a fresh calibration from this session (e.g. right after the training day).
    if (cal && Date.now() - cal.at < 15 * 60 * 1000 && cal.arm === settings.arm) nav.reset(['menu', 'shift']);
    else { nav.setAfter('shift'); nav.go('setup'); }
  };

  return (
    <ScreenFrame title={t('plan.title')} wide>
      <p className="lead center">{t('plan.lead')}</p>
      {/* Everything fits on one screen: hand-pointer users cannot scroll. */}
      <div className="plan-layout">
      <div className="ex-grid">
        {exercises.map((e) => {
          const n = picked.indexOf(e.id);
          const on = n >= 0;
          return (
            <button key={e.id} type="button" data-dwell="" aria-pressed={on} className={`ex-card ${on ? 'on' : ''}`} onClick={() => toggle(e.id)}>
              <span className="dwell-fill" aria-hidden="true" />
              <span className="ex-check" aria-hidden="true">{on ? <><CheckCircle2 /><b>{t('plan.wallN', { n: n + 1 })}</b></> : <Circle />}</span>
              <StrokeDemo ex={e} arm={settings.arm} />
              <strong>{loc(e.name)}</strong>
              <small>{e.area ? `${t(`area.${e.area}`)} · ` : ''}{t(`metric.${e.metric}`)} · {t('plan.strokesN', { n: reps === 'auto' ? e.reps : reps })}{e.source === 'expert' ? ` · ${t('expert.fromVideo')}` : ''}</small>
            </button>
          );
        })}
      </div>
      <aside className="card plan-options">
      <div className="plan-start">
        <BigButton icon={Paintbrush} label={chosen.length ? t('plan.start') : t('plan.pickOne')}
          sub={chosen.length ? t('plan.summary', { n: chosen.length, strokes: totalStrokes, min: minutes }) : undefined}
          variant="primary" primary size="xl" disabled={!chosen.length} onClick={start} />
      </div>
        <Segmented label={t('plan.strokes')} value={reps} onChange={setReps}
          options={[{ value: 'auto', label: t('plan.recommended') }, { value: 3, label: '3' }, { value: 5, label: '5' }, { value: 8, label: '8' }]} />
        <Segmented label={t('settings.tapeWidth')} describe={t('settings.tapeWidthDesc')} value={settings.tapeWidth} onChange={(v: TapeWidth) => settings.update({ tapeWidth: v })}
          options={[{ value: 'gentle', label: t('settings.wide') }, { value: 'standard', label: t('settings.standard') }, { value: 'precise', label: t('settings.narrow') }]} />
      </aside>
      </div>
    </ScreenFrame>
  );
}
