// Scrolling without a scroll wheel. A hand pointer cannot "scroll", so whenever the page (or an
// open dialog) is taller than the screen, two large Scroll up / Scroll down buttons appear on the
// right edge. Hovering one scrolls by half a screen, and keeps scrolling while the pointer stays
// there. The hand pointer is clamped to the screen, so a target on the edge is effectively
// unmissable (Fitts' law: edge targets have infinite depth). Mouse, touch and keyboard still work.
import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useSettings } from '../store/settings';
import { useVision } from '../vision/poseEngine';
import { useT } from '../i18n';

/** The element that currently scrolls: an open dialog if it overflows, otherwise the page. */
function scroller(): HTMLElement {
  const cards = [...document.querySelectorAll<HTMLElement>('.overlay-card')];
  const card = cards.reverse().find((c) => c.scrollHeight > c.clientHeight + 4);
  return card ?? (document.scrollingElement as HTMLElement) ?? document.documentElement;
}

export function ScrollAssist() {
  const { t } = useT();
  const handControl = useSettings((s) => s.handControl);
  const status = useVision((s) => s.status);
  const [can, setCan] = useState({ up: false, down: false });
  const active = handControl && status === 'ready';

  useEffect(() => {
    if (!active) { document.documentElement.classList.remove('scroll-assist'); return; }
    const check = () => {
      const el = scroller();
      const up = el.scrollTop > 4;
      const down = el.scrollTop + el.clientHeight < el.scrollHeight - 4;
      setCan((c) => (c.up === up && c.down === down ? c : { up, down }));
      document.documentElement.classList.toggle('scroll-assist', up || down);
    };
    check();
    const id = window.setInterval(check, 300);
    window.addEventListener('scroll', check, true);
    window.addEventListener('resize', check);
    return () => { clearInterval(id); window.removeEventListener('scroll', check, true); window.removeEventListener('resize', check); document.documentElement.classList.remove('scroll-assist'); };
  }, [active]);

  if (!active || (!can.up && !can.down)) return null;
  const scroll = (dir: 1 | -1) => {
    const el = scroller();
    const reduce = useSettings.getState().reducedMotion;
    el.scrollBy({ top: dir * window.innerHeight * 0.5, behavior: reduce ? 'auto' : 'smooth' });
  };
  return (
    <div className="scroll-assist-bar" role="group" aria-label={`${t('scroll.up')} / ${t('scroll.down')}`}>
      <button type="button" className="scroll-btn" data-dwell="" data-dwell-ms="700" data-dwell-repeat="900"
        disabled={!can.up} onClick={() => scroll(-1)} aria-label={t('scroll.up')}>
        <span className="dwell-fill" aria-hidden="true" />
        <ChevronUp aria-hidden="true" /><span>{t('scroll.up')}</span>
      </button>
      <button type="button" className="scroll-btn" data-dwell="" data-dwell-ms="700" data-dwell-repeat="900"
        disabled={!can.down} onClick={() => scroll(1)} aria-label={t('scroll.down')}>
        <span className="dwell-fill" aria-hidden="true" />
        <span>{t('scroll.down')}</span><ChevronDown aria-hidden="true" />
      </button>
    </div>
  );
}
