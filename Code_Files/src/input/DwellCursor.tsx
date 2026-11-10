// Hand-controlled cursor with dwell-to-select.
//
// Which hand? By default the hand that is NOT exercising (the "pointer hand"). The exercising
// hand is busy painting; using it for menus too meant every pop-up menu interrupted the exercise
// and a small shift in position made both the menu and the exercise unusable. With two hands the
// roles are separated: one hand paints, the other hand operates the menus.
//
// "Raise to point": the pointer only appears while the pointer hand is raised into a comfortable
// box around the chest. A hand resting on the lap or the armrest never selects anything
// (prevents accidental "Midas touch" selections and lets the user relax that arm).
//
// Why dwell (not pinch/grab): grip is often the impaired function, and mid-air "click" gestures
// cause accidental activations. Hovering a large target fills a ring over `dwellMs`; the target is
// activated once, then must be left before it re-arms.
import { useEffect, useRef } from 'react';
import { poseEngine, useVision } from '../vision/poseEngine';
import { OneEuro } from '../vision/oneEuro';
import { Arm, armIdx, dist } from '../vision/geometry';
import { toIU } from '../vision/bodyFrame';
import { useSettings } from '../store/settings';
import { sfx } from '../feedback/sfx';
import { useShift } from '../store/shift';
import { tNow } from '../i18n';

/** Shared, non-React cursor state. 'direct' = cursor follows the brush (only for pointerHand 'same'). */
export const cursorBus: { mode: 'box' | 'direct' | 'off'; direct: { x: number; y: number } | null } = { mode: 'box', direct: null };

export const otherArm = (a: Arm): Arm => (a === 'right' ? 'left' : 'right');
export function pointerArm(): Arm {
  const s = useSettings.getState();
  return s.pointerHand === 'other' ? otherArm(s.arm) : s.arm;
}

const R = 34; // ring radius
const CIRC = 2 * Math.PI * R;

export function DwellCursor() {
  const handControl = useSettings((s) => s.handControl);
  const status = useVision((s) => s.status);
  const el = useRef<HTMLDivElement>(null);
  const ring = useRef<SVGCircleElement>(null);
  const hint = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!handControl || status !== 'ready') return;
    const fx = new OneEuro(1.0, 0.01), fy = new OneEuro(1.0, 0.01);
    let target: HTMLElement | null = null;
    let since = 0;
    let fired: HTMLElement | null = null;
    let hiddenSince = performance.now();

    const clearTarget = () => {
      target?.classList.remove('dwell-hover');
      target?.style.removeProperty('--dwell');
      target = null; fired = null;
    };
    const hide = (now: number) => {
      const node = el.current;
      if (node) node.style.opacity = '0';
      clearTarget();
      if (!hiddenSince) hiddenSince = now;
      // Show "raise your other hand" hint when buttons are on screen and the pointer has been hidden a while.
      if (hint.current) {
        const show = now - hiddenSince > 1500 && !!document.querySelector('[data-dwell]:not([disabled])');
        hint.current.style.opacity = show ? '1' : '0';
        const arm = pointerArm();
        const txt = tNow('pointer.raise', { hand: tNow(`settings.${arm}`) });
        if (hint.current.textContent !== txt) hint.current.textContent = txt;
      }
    };

    const unsub = poseEngine.subscribe((f) => {
      const node = el.current;
      if (!node) return;
      const now = performance.now();
      let x: number, y: number;
      if (cursorBus.mode === 'off') { hide(now); return; }
      if (cursorBus.mode === 'direct') {
        if (!cursorBus.direct) { hide(now); return; }
        x = cursorBus.direct.x; y = cursorBus.direct.y;
      } else {
        if (!f) { hide(now); return; }
        const arm = pointerArm();
        const ix = armIdx(arm);
        const s = toIU(f.lm[ix.shoulder], f.aspect), o = toIU(f.lm[ix.other], f.aspect), h = toIU(f.lm[ix.index], f.aspect);
        const sw = dist(s, o) || 0.1;
        const out = arm === 'right' ? 1 : -1;
        // One-handed reach box. It sits on the hand's OWN side: from 0.45 shoulder-widths inward of
        // the shoulder (still short of the body's midline, so the hand never crosses the chest) to
        // 1.2 outward, and from just above the shoulder to the lower chest. The whole screen maps
        // onto this small, comfortable box, so the far edge of the screen needs no long reach.
        const IN = 0.45, OUT = 1.2;
        const xmin = out > 0 ? s.x - IN * sw : s.x - OUT * sw;
        const xmax = out > 0 ? s.x + OUT * sw : s.x + IN * sw;
        const ymin = s.y - 0.85 * sw, ymax = s.y + 0.85 * sw;
        // Raise-to-point: hidden when the hand is lowered (below the box) or not visible.
        const vis = (f.lm[ix.index].visibility ?? 1) > 0.5 || (f.lm[ix.wrist].visibility ?? 1) > 0.5;
        if (!vis || h.y > ymax + 0.15 * sw) { hide(now); return; }
        const nx = Math.max(0, Math.min(1, (h.x - xmin) / (xmax - xmin)));
        const ny = Math.max(0, Math.min(1, (h.y - ymin) / (ymax - ymin)));
        x = fx.filter(nx * window.innerWidth, now);
        y = fy.filter(ny * window.innerHeight, now);
      }
      hiddenSince = 0;
      if (hint.current) hint.current.style.opacity = '0';
      node.style.opacity = '1';
      node.style.transform = `translate(${x}px, ${y}px)`;

      // Hit test against dwell-able elements (the cursor itself has pointer-events: none).
      const hit = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest('[data-dwell]') as HTMLElement | null;
      const usable = hit && !(hit as HTMLButtonElement).disabled ? hit : null;
      if (usable !== target) {
        target?.classList.remove('dwell-hover');
        target?.style.removeProperty('--dwell');
        target = usable; since = now;
        if (fired && fired !== usable) fired = null;
        if (usable && usable !== fired) { usable.classList.add('dwell-hover'); sfx.hover(); }
      }
      let p = 0;
      if (target && target !== fired) {
        const ms = Number(target.dataset.dwellMs) || useSettings.getState().dwellMs;
        p = Math.min(1, (now - since) / ms);
        target.style.setProperty('--dwell', String(p));
        if (p >= 1) {
          if (target.dataset.dwellRepeat) {
            // Repeating targets (scroll buttons): keep firing while the pointer stays on them.
            target.click();
            since = now - Math.max(0, ms - Number(target.dataset.dwellRepeat));
            p = 0;
          } else {
            fired = target;
            target.classList.remove('dwell-hover');
            target.style.removeProperty('--dwell');
            if (useShift.getState().active) useShift.getState().log('dwellSelect');
            target.click();
            p = 0;
          }
        }
      }
      if (ring.current) ring.current.style.strokeDashoffset = String(CIRC * (1 - p));
      node.classList.toggle('on-target', !!target && target !== fired);
    });
    return () => { unsub(); clearTarget(); };
  }, [handControl, status]);

  if (!handControl || status !== 'ready') return null;
  return (
    <>
      <div ref={el} className="hand-cursor" aria-hidden="true">
        <svg width={R * 2 + 12} height={R * 2 + 12} viewBox={`0 0 ${R * 2 + 12} ${R * 2 + 12}`}>
          <circle cx={R + 6} cy={R + 6} r={R} className="ring-bg" />
          <circle ref={ring} cx={R + 6} cy={R + 6} r={R} className="ring-fg" strokeDasharray={CIRC} strokeDashoffset={CIRC}
            transform={`rotate(-90 ${R + 6} ${R + 6})`} />
          <circle cx={R + 6} cy={R + 6} r={9} className="dot" />
        </svg>
      </div>
      <div ref={hint} className="pointer-hint" aria-hidden="true" />
    </>
  );
}
