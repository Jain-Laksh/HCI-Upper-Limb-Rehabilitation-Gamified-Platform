// Wage model. Pay is NEVER deducted: errors simply mean the stroke is redone.
import { Localised } from '../exercise/types';

export const DAY_START = 9 * 60;   // 09:00
export const DAY_END = 17 * 60;    // 17:00
export const LUNCH_AT = 13 * 60;   // 13:00
export const LUNCH_LEN = 60;

export const BASE_PER_STROKE = 40;
export const MAX_NEATNESS_BONUS = 20;
export const WALL_BONUS = 50;

export function strokePay(accuracy: number) {
  const bonus = Math.round(((accuracy / 100) * MAX_NEATNESS_BONUS) / 5) * 5;
  return { base: BASE_PER_STROKE, bonus, total: BASE_PER_STROKE + bonus };
}

export const formatMoney = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

export function formatClock(min: number) {
  const h = Math.floor(min / 60), m = Math.floor(min % 60);
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${m.toString().padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

export const JOBS: Localised[] = [
  { en: "Mrs. Shah's living room", hi: 'श्रीमती शाह का बैठक कक्ष' },
  { en: 'The corner bakery', hi: 'नुक्कड़ की बेकरी' },
  { en: 'Community library hall', hi: 'सामुदायिक पुस्तकालय हॉल' },
  { en: "Dr. Iyer's clinic", hi: 'डॉ. अय्यर का क्लिनिक' },
];

export const WALL_NAMES: Localised[] = [
  { en: 'North wall', hi: 'उत्तर की दीवार' },
  { en: 'Window wall', hi: 'खिड़की वाली दीवार' },
  { en: 'Door wall', hi: 'दरवाज़े वाली दीवार' },
  { en: 'Feature wall', hi: 'मुख्य दीवार' },
  { en: 'Hallway', hi: 'गलियारा' },
  { en: 'Staircase wall', hi: 'सीढ़ी वाली दीवार' },
];
