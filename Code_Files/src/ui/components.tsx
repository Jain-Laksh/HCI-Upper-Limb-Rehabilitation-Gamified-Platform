import { ReactNode, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, CircleHelp, Mic, MicOff, Video, VideoOff, Volume2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { sfx, unlockAudio } from '../feedback/sfx';
import { useCaption } from '../feedback/speech';
import { useNav } from '../store/nav';
import { useT } from '../i18n';
import { poseEngine, useVision } from '../vision/poseEngine';
import { useVoice } from '../input/voice';
import { useSettings } from '../store/settings';

/**
 * Big, labelled button. Icon + text always (never icon-only), large target (Fitts' law),
 * activatable by mouse/touch, keyboard (Enter/Space) or hand dwell (data-dwell).
 */
export function BigButton(props: {
  icon?: LucideIcon; label: string; sub?: string; onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; disabled?: boolean; primary?: boolean;
  back?: boolean; size?: 'lg' | 'md' | 'xl'; dwellMs?: number; badge?: string; className?: string; ariaLabel?: string;
}) {
  const { icon: Icon, label, sub, onClick, variant = 'secondary', disabled, size = 'lg' } = props;
  return (
    <button
      type="button"
      className={`big-btn ${variant} ${size} ${props.className ?? ''}`}
      data-dwell=""
      data-primary={props.primary ? '' : undefined}
      data-back={props.back ? '' : undefined}
      data-dwell-ms={props.dwellMs}
      disabled={disabled}
      aria-label={props.ariaLabel}
      onClick={() => { unlockAudio(); if (!disabled) { sfx.select(); onClick?.(); } }}
    >
      <span className="dwell-fill" aria-hidden="true" />
      {Icon && <Icon className="btn-icon" aria-hidden="true" strokeWidth={2.2} />}
      <span className="btn-text">
        <span className="btn-label">{label}</span>
        {sub && <span className="btn-sub">{sub}</span>}
      </span>
      {props.badge && <span className="btn-badge">{props.badge}</span>}
    </button>
  );
}

/** Standard screen frame: consistent header (back, title, help) on every screen. */
export function ScreenFrame(props: { title: string; children: ReactNode; noBack?: boolean; noHelp?: boolean; wide?: boolean; onBack?: () => void }) {
  const { t } = useT();
  const nav = useNav();
  return (
    <div className={`screen ${props.wide ? 'wide' : ''}`}>
      <header className="screen-header">
        {!props.noBack ? (
          <BigButton icon={ArrowLeft} label={t('common.back')} size="md" back onClick={props.onBack ?? nav.back} />
        ) : <span />}
        <h1>{props.title}</h1>
        {!props.noHelp ? <BigButton icon={CircleHelp} label={t('common.help')} size="md" onClick={() => nav.go('help')} /> : <span />}
      </header>
      <main className="screen-body">{props.children}</main>
    </div>
  );
}

/** Segmented choice control, each option a dwell-able button. */
export function Segmented<T extends string | number | boolean>(props: {
  label: string; value: T; options: { value: T; label: string; icon?: LucideIcon }[]; onChange: (v: T) => void; describe?: string;
}) {
  return (
    <div className="setting-row" role="group" aria-label={props.label}>
      <div className="setting-label">
        <span>{props.label}</span>
        {props.describe && <small>{props.describe}</small>}
      </div>
      <div className="segmented">
        {props.options.map((o) => {
          const Icon = o.icon;
          const on = o.value === props.value;
          return (
            <button key={String(o.value)} type="button" data-dwell="" aria-pressed={on}
              className={`seg-btn ${on ? 'on' : ''}`}
              onClick={() => { unlockAudio(); sfx.select(); props.onChange(o.value); }}>
              <span className="dwell-fill" aria-hidden="true" />
              {Icon && <Icon aria-hidden="true" />}
              <span>{o.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Page transition wrapper (respects reduced-motion). */
export function Page({ children, k }: { children: ReactNode; k: string }) {
  const reduced = useSettings((s) => s.reducedMotion);
  return (
    <motion.div key={k} className="page"
      initial={reduced ? { opacity: 0 } : { opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, x: -40 }}
      transition={{ duration: reduced ? 0.1 : 0.28, ease: 'easeOut' }}>
      {children}
    </motion.div>
  );
}

/** Live mirrored camera view bound to the pose engine's stream. */
export function CameraView({ className, opacity = 1 }: { className?: string; opacity?: number }) {
  const ref = useRef<HTMLVideoElement>(null);
  const status = useVision((s) => s.status);
  useEffect(() => {
    if (ref.current && poseEngine.stream && ref.current.srcObject !== poseEngine.stream) {
      ref.current.srcObject = poseEngine.stream;
      ref.current.play().catch(() => {});
    }
  }, [status]);
  return <video ref={ref} className={`camera-view ${className ?? ''}`} style={{ opacity }} muted playsInline autoPlay />;
}

/** Caption bar: every spoken line is also displayed (redundant visual channel). */
export function CaptionBar() {
  const { text, at, speaking } = useCaption();
  const captions = useSettings((s) => s.captions);
  const [, tick] = useState(0);
  // Re-render when the caption should hide (7 s after the last line, unless still speaking).
  useEffect(() => { const id = setTimeout(() => tick((n) => n + 1), 7100); return () => clearTimeout(id); }, [at, speaking]);
  const visible = captions && text && (speaking || Date.now() - at < 7000);
  return (
    <div className={`caption-bar ${visible ? 'show' : ''}`} role="status" aria-live="polite">
      <Volume2 aria-hidden="true" />
      <span>{text}</span>
    </div>
  );
}

/** Small status chips: camera + microphone state (visibility of system status). */
export function StatusChips() {
  const { t } = useT();
  const vision = useVision();
  const voice = useVoice();
  const voiceOn = useSettings((s) => s.voiceCommands);
  const recent = voice.heard && Date.now() - voice.heardAt < 4000;
  return (
    <div className="status-chips" aria-live="polite">
      {vision.status === 'ready' ? (
        <span className={`chip ${vision.locked ? 'ok' : 'warn'}`}><Video aria-hidden="true" />{vision.locked ? t('status.tracking') : t('status.searching')}</span>
      ) : vision.status === 'loading' ? (
        <span className="chip"><Video aria-hidden="true" />{t('status.loading')}</span>
      ) : (
        <span className="chip muted"><VideoOff aria-hidden="true" />{t('status.cameraOff')}</span>
      )}
      {voiceOn && (
        voice.status === 'listening'
          ? <span className="chip ok"><Mic aria-hidden="true" />{recent ? `“${voice.heard}”` : t('status.listening')}</span>
          : <span className="chip warn"><MicOff aria-hidden="true" />{t(`voice.${voice.status}`)}</span>
      )}
    </div>
  );
}

/** Modal confirmation (constraint for destructive actions). */
export function Confirm(props: { title: string; body?: string; yes: string; no: string; onYes: () => void; onNo: () => void; yesIcon?: LucideIcon; noIcon?: LucideIcon }) {
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={props.title}>
      <motion.div className="overlay-card" initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
        <h2>{props.title}</h2>
        {props.body && <p className="lead">{props.body}</p>}
        <div className="btn-row">
          <BigButton icon={props.noIcon} label={props.no} variant="primary" primary onClick={props.onNo} />
          <BigButton icon={props.yesIcon} label={props.yes} variant="danger" onClick={props.onYes} />
        </div>
      </motion.div>
    </div>
  );
}

export function Meter({ value, label }: { value: number; label?: string }) {
  return (
    <div className="meter" aria-label={label} role="meter" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className="meter-fill" style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  );
}
