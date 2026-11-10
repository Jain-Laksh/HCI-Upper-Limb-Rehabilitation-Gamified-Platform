// Settings are grouped into a few tabs (Hick's law: fewer choices at once). Every change applies
// immediately to the whole app, so the screen itself is the live preview.
import { useState } from 'react';
import {
  Accessibility, AudioLines, Contrast, Eye, Gauge, Hand, Languages, Mic, MonitorCog, Moon, PaintRoller, RotateCcw, Sun, Type,
  Volume2, VolumeX, Captions, Stethoscope, Dumbbell,
} from 'lucide-react';
import { BigButton, ScreenFrame, Segmented } from '../ui/components';
import { useSettings } from '../store/settings';
import { useNav } from '../store/nav';
import { useT, tNow } from '../i18n';
import { hasVoiceFor, speak } from '../feedback/speech';
import { sfx } from '../feedback/sfx';
import { speechRecognitionSupported, useVoice } from '../input/voice';

type Tab = 'display' | 'sound' | 'control' | 'exercise' | 'advanced';

export function Settings() {
  const { t, lang } = useT();
  const s = useSettings();
  const nav = useNav();
  const voice = useVoice();
  const [tab, setTab] = useState<Tab>('display');
  const on = t('common.on'), off = t('common.off');
  const onOff = [{ value: true, label: on }, { value: false, label: off }];

  const tabs: { id: Tab; label: string; icon: typeof Type }[] = [
    { id: 'display', label: t('settings.tab.display'), icon: Eye },
    { id: 'sound', label: t('settings.tab.sound'), icon: Volume2 },
    { id: 'control', label: t('settings.tab.control'), icon: Hand },
    { id: 'exercise', label: t('settings.tab.exercise'), icon: Dumbbell },
    { id: 'advanced', label: t('settings.tab.advanced'), icon: MonitorCog },
  ];

  return (
    <ScreenFrame title={t('settings.title')} wide>
      <div className="settings-layout">
        <nav className="tabs" aria-label={t('settings.title')}>
          {tabs.map((x) => (
            <BigButton key={x.id} icon={x.icon} label={x.label} size="md" variant={tab === x.id ? 'primary' : 'secondary'} onClick={() => setTab(x.id)} />
          ))}
        </nav>
        <div className="settings-panel card">
          {tab === 'display' && (<>
            <Segmented label={t('settings.textSize')} value={s.textScale} onChange={(v) => s.update({ textScale: v })}
              options={[{ value: 1, label: 'A' }, { value: 1.2, label: 'A+' }, { value: 1.4, label: 'A++' }, { value: 1.7, label: 'A+++' }]} />
            <Segmented label={t('settings.buttonSize')} value={s.buttonScale} onChange={(v) => s.update({ buttonScale: v })}
              options={[{ value: 1, label: t('settings.normal') }, { value: 1.25, label: t('settings.large') }, { value: 1.5, label: t('settings.xlarge') }]} />
            <Segmented label={t('settings.theme')} value={s.theme} onChange={(v) => s.update({ theme: v })}
              options={[{ value: 'contrast', label: t('settings.contrast'), icon: Contrast }, { value: 'warm', label: t('settings.warm'), icon: Sun }, { value: 'dark', label: t('settings.dark'), icon: Moon }]} />
            <Segmented label={t('settings.cameraOpacity')} describe={t('settings.cameraOpacityDesc')} value={s.cameraOpacity} onChange={(v) => s.update({ cameraOpacity: v })}
              options={[{ value: 0.25, label: t('settings.low') }, { value: 0.5, label: t('settings.medium') }, { value: 0.8, label: t('settings.high') }]} />
            <Segmented label={t('settings.reducedMotion')} value={s.reducedMotion} onChange={(v) => s.update({ reducedMotion: v })} options={onOff} />
            <div className="preview card">
              <strong>{t('settings.preview')}</strong>
              <p>{t('settings.previewText')}</p>
              <BigButton icon={PaintRoller} label={t('settings.previewButton')} variant="primary" onClick={() => sfx.success()} />
            </div>
          </>)}

          {tab === 'sound' && (<>
            <Segmented label={t('settings.language')} value={s.lang} onChange={(v) => { s.update({ lang: v }); setTimeout(() => speak(tNow('settings.langChanged')), 50); }}
              options={[{ value: 'en', label: 'English', icon: Languages }, { value: 'hi', label: 'हिन्दी', icon: Languages }]} />
            {!hasVoiceFor(lang) && <p className="warn-note">{t('settings.noVoice')}</p>}
            <Segmented label={t('settings.voice')} value={s.voiceOn} onChange={(v) => s.update({ voiceOn: v })}
              options={[{ value: true, label: on, icon: Volume2 }, { value: false, label: off, icon: VolumeX }]} />
            <Segmented label={t('settings.voiceRate')} value={s.voiceRate} onChange={(v) => { s.update({ voiceRate: v }); setTimeout(() => speak(tNow('settings.voiceTest')), 50); }}
              options={[{ value: 0.7, label: t('settings.slow') }, { value: 0.9, label: t('settings.normal') }, { value: 1.1, label: t('settings.fast') }]} />
            <Segmented label={t('settings.voiceVolume')} value={s.voiceVolume} onChange={(v) => { s.update({ voiceVolume: v }); setTimeout(() => speak(tNow('settings.voiceTest')), 50); }}
              options={[{ value: 0.5, label: t('settings.low') }, { value: 0.8, label: t('settings.medium') }, { value: 1, label: t('settings.high') }]} />
            <Segmented label={t('settings.sfx')} value={s.sfxOn} onChange={(v) => s.update({ sfxOn: v })} options={onOff} />
            <Segmented label={t('settings.sfxVolume')} value={s.sfxVolume} onChange={(v) => { s.update({ sfxVolume: v }); setTimeout(() => sfx.success(), 50); }}
              options={[{ value: 0.3, label: t('settings.low') }, { value: 0.6, label: t('settings.medium') }, { value: 1, label: t('settings.high') }]} />
            <Segmented label={t('settings.captions')} describe={t('settings.captionsDesc')} value={s.captions} onChange={(v) => s.update({ captions: v })}
              options={[{ value: true, label: on, icon: Captions }, { value: false, label: off }]} />
            <div className="btn-row">
              <BigButton icon={AudioLines} label={t('settings.testVoice')} size="md" onClick={() => speak(tNow('settings.voiceTest'))} />
              <BigButton icon={Volume2} label={t('settings.testSound')} size="md" onClick={() => sfx.fanfare()} />
            </div>
          </>)}

          {tab === 'control' && (<>
            <Segmented label={t('settings.handControl')} describe={t('settings.handControlDesc')} value={s.handControl} onChange={(v) => s.update({ handControl: v })} options={onOff} />
            <Segmented label={t('settings.pointerHand')} describe={t('settings.pointerHandDesc', { hand: t(`settings.${s.arm === 'right' ? 'left' : 'right'}`) })}
              value={s.pointerHand} onChange={(v) => s.update({ pointerHand: v })}
              options={[{ value: 'other', label: t('settings.otherHand') }, { value: 'same', label: t('settings.sameHand') }]} />
            <Segmented label={t('settings.dwell')} describe={t('settings.dwellDesc')} value={s.dwellMs} onChange={(v) => s.update({ dwellMs: v })}
              options={[{ value: 1000, label: '1 s' }, { value: 1500, label: '1.5 s' }, { value: 2000, label: '2 s' }, { value: 3000, label: '3 s' }]} />
            <Segmented label={t('settings.voiceCommands')} describe={speechRecognitionSupported() ? t('settings.voiceCommandsDesc') : t('settings.voiceUnsupported')}
              value={s.voiceCommands} onChange={(v) => s.update({ voiceCommands: v })}
              options={[{ value: true, label: on, icon: Mic }, { value: false, label: off }]} />
            {s.voiceCommands && <div className="muted">
              <p>{t('settings.voiceStatus')}: <strong>{t(`voice.${voice.status}`)}</strong> — {t('settings.voiceWords')}</p>
              <p>{t('settings.voiceHeard')}: <strong>{voice.heard ? `“${voice.heard}”` : '—'}</strong> · {t('settings.voiceTip')}</p>
            </div>}
            <Segmented label={t('settings.arm')} value={s.arm} onChange={(v) => s.update({ arm: v })}
              options={[{ value: 'left', label: t('settings.left') }, { value: 'right', label: t('settings.right') }]} />
          </>)}

          {tab === 'exercise' && (<>
            <Segmented label={t('settings.sessionLength')} describe={t('settings.sessionLengthDesc')} value={s.sessionLength} onChange={(v) => s.update({ sessionLength: v })}
              options={[{ value: 'short', label: t('settings.short') }, { value: 'standard', label: t('settings.standard') }, { value: 'long', label: t('settings.long') }]} />
            <Segmented label={t('settings.posture')} value={s.posture} onChange={(v) => s.update({ posture: v })}
              options={[{ value: 'seated', label: t('settings.seated') }, { value: 'standing', label: t('settings.standing') }]} />
            <Segmented label={t('settings.tapeWidth')} describe={t('settings.tapeWidthDesc')} value={s.tapeWidth} onChange={(v) => s.update({ tapeWidth: v })}
              options={[{ value: 'gentle', label: t('settings.wide') }, { value: 'standard', label: t('settings.standard') }, { value: 'precise', label: t('settings.narrow') }]} />
            <Segmented label={t('settings.autoAdjust')} describe={t('settings.autoAdjustDesc')} value={s.autoAdjust} onChange={(v) => s.update({ autoAdjust: v })} options={onOff} />
            <Segmented label={t('settings.postureChecks')} describe={t('settings.postureChecksDesc')} value={s.postureChecks} onChange={(v) => s.update({ postureChecks: v })} options={onOff} />
            <div className="card muted-card">
              <h3><Stethoscope aria-hidden="true" /> {t('settings.forTherapists')}</h3>
              <p>{t('settings.forTherapistsDesc')}</p>
              <BigButton icon={Stethoscope} label={t('settings.openExpert')} onClick={() => nav.go('expert')} />
            </div>
          </>)}

          {tab === 'advanced' && (<>
            <Segmented label={t('settings.model')} describe={t('settings.modelDesc')} value={s.model} onChange={(v) => { s.update({ model: v }); }}
              options={[{ value: 'full', label: t('settings.accurate'), icon: Gauge }, { value: 'lite', label: t('settings.faster'), icon: Gauge }]} />
            <p className="muted">{t('settings.modelReload')}</p>
            <Segmented label={t('settings.debug')} describe={t('settings.debugDesc')} value={s.showDebug} onChange={(v) => s.update({ showDebug: v })} options={onOff} />
            <BigButton icon={RotateCcw} label={t('settings.reset')} variant="danger" onClick={() => { s.reset(); speak(tNow('settings.resetDone')); }} />
            <p className="muted"><Accessibility aria-hidden="true" /> {t('settings.privacy')}</p>
          </>)}
        </div>
      </div>
    </ScreenFrame>
  );
}
