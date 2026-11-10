import { useEffect, useState } from 'react';
import {
  BarChart3, Briefcase, CircleHelp, DoorOpen, GraduationCap, Hammer, Home, LogIn, Mail, PaintRoller, Play, RotateCcw,
  Settings as SettingsIcon, Sprout, Volume2,
} from 'lucide-react';
import { BigButton, ScreenFrame } from '../ui/components';
import { useNav } from '../store/nav';
import { useProfile } from '../store/profile';
import { useShift } from '../store/shift';
import { useT, tNow } from '../i18n';
import { speak } from '../feedback/speech';
import { unlockAudio } from '../feedback/sfx';
import { formatMoney } from '../game/economy';

export function useSpeakOnMount(text: string, deps: unknown[] = []) {
  useEffect(() => { const id = setTimeout(() => speak(text, { key: `mount:${text}`, cooldownMs: 1500 }), 350); return () => clearTimeout(id); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export function Welcome() {
  const { t } = useT();
  const nav = useNav();
  const profile = useProfile();
  const [name, setName] = useState(profile.name);
  const begin = () => {
    unlockAudio();
    profile.setName(name.trim());
    speak(name.trim() ? tNow('welcome.hello', { name: name.trim() }) : tNow('welcome.helloAnon'));
    nav.replace('menu');
  };
  return (
    <div className="screen welcome">
      <div className="welcome-hero">
        <Briefcase className="hero-icon" aria-hidden="true" />
        <h1 className="title">{t('app.title')}</h1>
        <p className="eyebrow">{t('app.kind')}</p>
        <p className="lead">{t('app.tagline')}</p>
      </div>
      <div className="welcome-card">
        <label className="field">
          <span>{t('welcome.nameLabel')}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('welcome.namePlaceholder')}
            maxLength={24} autoComplete="off" onKeyDown={(e) => e.key === 'Enter' && begin()} />
          <small>{t('welcome.nameNote')}</small>
        </label>
        <BigButton icon={LogIn} label={profile.name ? t('welcome.back', { name: profile.name }) : t('welcome.begin')} variant="primary" primary size="xl" onClick={begin} />
        <small className="welcome-camera-note">{t('welcome.cameraNote')}</small>
      </div>
      <p className="disclaimer">{t('app.disclaimer')}</p>
    </div>
  );
}

export function MainMenu() {
  const { t } = useT();
  const nav = useNav();
  const name = useProfile((s) => s.name);
  const trained = useProfile((s) => s.trained);
  const shift = useShift();
  const canContinue = shift.active && shift.reps.length > 0 && shift.phase !== 'done';
  useSpeakOnMount(t('menu.speak'));
  const startShift = () => nav.go('roles');
  const continueShift = () => { nav.setAfter('shift'); nav.go('setup'); };
  return (
    <ScreenFrame title={name ? t('menu.titleName', { name }) : t('menu.title')} noBack>
      <div className="menu-grid">
        {canContinue ? (
          <BigButton icon={Play} label={t('menu.continue')} sub={t('menu.continueSub', { wall: shift.wallIndex + 1, walls: shift.walls.length, pay: formatMoney(shift.earnings) })}
            variant="primary" primary size="xl" onClick={continueShift} />
        ) : (
          <BigButton icon={Play} label={t('menu.start')} sub={trained ? t('menu.startSub') : t('menu.startSubTrain')} variant="primary" primary size="xl" onClick={startShift} />
        )}
        {canContinue && <BigButton icon={RotateCcw} label={t('menu.newShift')} size="xl" onClick={() => { shift.finish(false); startShift(); }} />}
        <BigButton icon={GraduationCap} label={t('menu.training')} sub={t('menu.trainingSub')} size="xl" onClick={() => { nav.setAfter('training'); nav.go('setup'); }} />
        <BigButton icon={BarChart3} label={t('menu.progress')} sub={t('menu.progressSub')} size="xl" onClick={() => nav.go('progress')} />
        <BigButton icon={SettingsIcon} label={t('menu.settings')} sub={t('menu.settingsSub')} size="xl" onClick={() => nav.go('settings')} />
        <BigButton icon={CircleHelp} label={t('menu.help')} sub={t('menu.helpSub')} size="xl" onClick={() => nav.go('help')} />
        {!canContinue && <BigButton icon={DoorOpen} label={t('menu.exit')} size="xl" onClick={() => nav.go('goodbye')} />}
      </div>
    </ScreenFrame>
  );
}

export function RoleSelect() {
  const { t } = useT();
  const nav = useNav();
  const trained = useProfile((s) => s.trained);
  useSpeakOnMount(t('roles.speak'));
  const choose = () => { if (trained) nav.go('plan'); else { nav.setAfter('training'); nav.go('setup'); } };
  return (
    <ScreenFrame title={t('roles.title')}>
      <p className="lead center">{t('roles.lead')}</p>
      <div className="role-grid">
        <BigButton icon={PaintRoller} label={t('roles.painter')} sub={t('roles.painterSub')} variant="primary" primary size="xl" onClick={choose}
          badge={trained ? undefined : t('roles.trainingFirst')} />
        <BigButton icon={Sprout} label={t('roles.gardener')} sub={t('roles.comingSoon')} size="xl" disabled />
        <BigButton icon={Mail} label={t('roles.postal')} sub={t('roles.comingSoon')} size="xl" disabled />
        <BigButton icon={Hammer} label={t('roles.carpenter')} sub={t('roles.comingSoon')} size="xl" disabled />
      </div>
    </ScreenFrame>
  );
}

export function Help() {
  const { t } = useT();
  const items = ['start', 'paint', 'restart', 'pause', 'voice', 'safety'];
  useSpeakOnMount(t('help.speak'));
  return (
    <ScreenFrame title={t('help.title')} noHelp>
      <div className="help-grid">
        {items.map((k) => (
          <section key={k} className="card">
            <h2>{t(`help.${k}.title`)}</h2>
            <p>{t(`help.${k}.body`)}</p>
            <BigButton icon={Volume2} label={t('help.readAloud')} size="md" onClick={() => speak(`${t(`help.${k}.title`)}. ${t(`help.${k}.body`)}`)} />
          </section>
        ))}
        <section className="card muted-card">
          <h2>{t('help.support.title')}</h2>
          <p>{t('help.support.body')}</p>
        </section>
      </div>
    </ScreenFrame>
  );
}

export function Goodbye() {
  const { t } = useT();
  const nav = useNav();
  useSpeakOnMount(t('bye.speak'));
  return (
    <div className="screen center-screen">
      <Briefcase className="hero-icon" aria-hidden="true" />
      <h1 className="title">{t('bye.title')}</h1>
      <p className="lead">{t('bye.body')}</p>
      <BigButton icon={Home} label={t('bye.menu')} variant="primary" primary size="xl" onClick={() => nav.home()} />
    </div>
  );
}
