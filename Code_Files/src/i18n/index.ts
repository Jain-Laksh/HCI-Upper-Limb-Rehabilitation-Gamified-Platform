import { useSettings } from '../store/settings';
import { Lang, Localised } from '../exercise/types';
import { STRINGS } from './strings';

export function tr(lang: Lang, key: string, vars?: Record<string, string | number>) {
  let s = STRINGS[lang]?.[key] ?? STRINGS.en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

/** Hook: translation function bound to the current language. */
export function useT() {
  const lang = useSettings((s) => s.lang);
  const t = (key: string, vars?: Record<string, string | number>) => tr(lang, key, vars);
  const loc = (l: Localised | undefined) => (l ? l[lang] ?? l.en : '');
  return { t, loc, lang };
}

/** Non-hook version (for event handlers / speech). */
export const tNow = (key: string, vars?: Record<string, string | number>) => tr(useSettings.getState().lang, key, vars);
export const locNow = (l: Localised | undefined) => (l ? l[useSettings.getState().lang] ?? l.en : '');
