// Preset exercises, defined parametrically in body units (x outward, y up). Each exercise traces one
// body point in its own frame (see `Joint` in bodyFrame.ts):
//   wrist    -> origin shoulder, 1 unit = arm length      (shoulder and elbow exercises)
//   hand     -> origin wrist,    1 unit = hand length     (wrist exercises)
//   shoulder -> origin = relaxed shoulder, 1 unit = 1/4 arm length (shoulder-girdle exercises)
// Together they cover the upper limb: shoulder girdle, shoulder, elbow and wrist. They follow common upper-limb home-exercise descriptions and are
// intended to be replaced/approved by a physiotherapist through Expert Mode.
import { V2, resample } from '../vision/geometry';
import { Exercise } from './types';

const N = 60;

function arc(r: number, fromDeg: number, toDeg: number, n = 80): V2[] {
  const pts: V2[] = [];
  for (let i = 0; i < n; i++) {
    const a = ((fromDeg + ((toDeg - fromDeg) * i) / (n - 1)) * Math.PI) / 180;
    pts.push({ x: r * Math.cos(a), y: r * Math.sin(a) });
  }
  return pts;
}
const line = (a: V2, b: V2): V2[] => [a, b];

import VIDEO_PRESETS from './videoPresets.json';

export const PRESETS: Exercise[] = [
  {
    id: 'side-raise', area: 'shoulder',
    name: { en: 'Side arch', hi: 'साइड आर्च' },
    instruction: {
      en: 'Keep your arm straight. Raise it out to the side, following the tape, up to shoulder height.',
      hi: 'हाथ सीधा रखें। टेप के साथ-साथ हाथ को बगल से कंधे की ऊँचाई तक उठाएँ।',
    },
    tip: { en: 'Thumb pointing up, shoulders relaxed.', hi: 'अंगूठा ऊपर, कंधे ढीले रखें।' },
    path: resample(arc(0.95, -78, 12), N),
    tolerance: 0.15, reps: 5, holdMs: 600,
    metric: 'elevation', romTarget: 100, refDurationMs: 3000,
    postureChecks: true, color: '#3f7fbf', source: 'preset',
  },
  {
    id: 'sweep', area: 'shoulder',
    name: { en: 'Long sweep', hi: 'लंबा स्ट्रोक' },
    instruction: {
      en: 'Hold your hand at chest height. Sweep it across, from the side toward the middle of your body.',
      hi: 'हाथ को छाती की ऊँचाई पर रखें। उसे बगल से शरीर के बीच की ओर ले जाएँ।',
    },
    tip: { en: 'Elbow slightly bent, move slowly.', hi: 'कोहनी थोड़ी मुड़ी हुई, धीरे-धीरे चलाएँ।' },
    path: resample(line({ x: 0.82, y: -0.18 }, { x: -0.05, y: -0.24 }), N),
    tolerance: 0.15, reps: 5, holdMs: 400,
    metric: 'elevation', romTarget: 80, refDurationMs: 3000,
    postureChecks: true, color: '#c8743a', source: 'preset',
  },
  {
    id: 'reach-up', area: 'shoulder',
    name: { en: 'Ceiling stripe', hi: 'छत तक पट्टी' },
    instruction: {
      en: 'Start with your hand at chest level. Reach slowly straight up, as high as is comfortable.',
      hi: 'हाथ को छाती के पास से शुरू करें। आराम से जितना हो सके, सीधा ऊपर ले जाएँ।',
    },
    tip: { en: 'Stop if you feel pain. Comfort first.', hi: 'दर्द हो तो रुक जाएँ। आराम सबसे पहले।' },
    path: resample(line({ x: 0.22, y: -0.5 }, { x: 0.22, y: 0.62 }), N),
    tolerance: 0.15, reps: 4, holdMs: 800,
    metric: 'elevation', romTarget: 140, refDurationMs: 3500,
    postureChecks: true, color: '#5f9a55', source: 'preset',
  },
  {
    id: 'curl', area: 'elbow',
    name: { en: 'Brush lift', hi: 'ब्रश उठाना' },
    instruction: {
      en: 'Keep your elbow by your side. Bend it to lift the brush toward your shoulder, like lifting a cup.',
      hi: 'कोहनी को बगल में रखें। कप उठाने की तरह, ब्रश को कंधे की ओर ऊपर मोड़ें।',
    },
    tip: { en: 'The game measures depth here - your forearm comes toward the camera.', hi: 'यहाँ खेल गहराई मापता है - आपकी बाँह कैमरे की ओर आती है।' },
    path: resample(line({ x: 0.1, y: -0.95 }, { x: 0.1, y: -0.38 }), N),
    tolerance: 0.15, reps: 5, holdMs: 400,
    metric: 'elbowFlex', romTarget: 110, refDurationMs: 2500,
    postureChecks: false, color: '#9a5f9a', source: 'preset', depthCue: true,
  },
  {
    id: 'front-raise', area: 'shoulder',
    name: { en: 'Front lift', hi: 'आगे उठाना' },
    instruction: {
      en: 'Arm straight, thumb up. Raise it in front of you, toward the camera, up to chest height.',
      hi: 'हाथ सीधा, अंगूठा ऊपर। हाथ को सामने, कैमरे की ओर, छाती की ऊँचाई तक उठाएँ।',
    },
    tip: { en: 'Your hand comes toward the camera, so the game uses depth here.', hi: 'हाथ कैमरे की ओर आता है, इसलिए खेल यहाँ गहराई मापता है।' },
    path: resample(line({ x: 0.1, y: -0.95 }, { x: 0.1, y: -0.22 }), N),
    tolerance: 0.15, reps: 5, holdMs: 600,
    metric: 'elevation', romTarget: 80, refDurationMs: 3000,
    postureChecks: true, color: '#3f8f8f', source: 'preset', depthCue: true,
  },
  {
    id: 'cross-reach', area: 'shoulder',
    name: { en: 'Diagonal stripe', hi: 'तिरछी पट्टी' },
    instruction: {
      en: 'Start with your hand by your side. Reach across your body toward the opposite shoulder.',
      hi: 'हाथ को बगल में रखकर शुरू करें। शरीर के आर-पार, दूसरे कंधे की ओर ले जाएँ।',
    },
    tip: { en: 'Keep your back against the chair; only the arm moves.', hi: 'पीठ कुर्सी से टिकी रहे; केवल हाथ चले।' },
    path: resample(line({ x: 0.35, y: -0.8 }, { x: -0.42, y: -0.12 }), N),
    tolerance: 0.15, reps: 5, holdMs: 500,
    metric: 'elevation', romTarget: 70, refDurationMs: 3000,
    postureChecks: true, color: '#b0567a', source: 'preset',
  },
  {
    id: 'shrug', area: 'girdle', joint: 'shoulder',
    name: { en: 'Shoulder lift', hi: 'कंधा उचकाना' },
    instruction: {
      en: 'Let your arm hang relaxed. Lift your shoulder slowly up toward your ear, hold, then let it drop.',
      hi: 'हाथ को ढीला लटकने दें। कंधे को धीरे-धीरे कान की ओर उठाएँ, रोकें, फिर नीचे छोड़ दें।',
    },
    tip: { en: 'Here the brush is your shoulder, not your hand.', hi: 'यहाँ ब्रश आपका कंधा है, हाथ नहीं।' },
    // 0.28 units = 7% of arm length (about 4-5 cm) of shoulder elevation.
    path: resample(line({ x: 0, y: 0 }, { x: 0, y: 0.28 }), N),
    tolerance: 0.12, reps: 5, holdMs: 1000,
    metric: 'shrug', romTarget: 15, refDurationMs: 2000,
    postureChecks: false, color: '#7a7a3f', source: 'preset',
  },
  {
    id: 'wrist-wiper', area: 'wrist', joint: 'hand',
    name: { en: 'Window wiper', hi: 'वाइपर' },
    instruction: {
      en: 'Rest your elbow on the table, forearm upright, palm facing the screen. Tilt your hand toward your little finger, then sweep it across toward your thumb.',
      hi: 'कोहनी मेज़ पर टिकाएँ, बाँह सीधी खड़ी, हथेली स्क्रीन की ओर। हाथ को छोटी उँगली की ओर झुकाएँ, फिर अंगूठे की ओर घुमाएँ।',
    },
    tip: { en: 'Only the wrist moves. Keep the forearm still.', hi: 'केवल कलाई चले। बाँह स्थिर रखें।' },
    // Arc around the wrist, radius = 1 hand length: 30 deg ulnar -> 20 deg radial deviation.
    path: resample(arc(1, 120, 70), N),
    tolerance: 0.3, reps: 6, holdMs: 300,
    metric: 'wristDev', romTarget: 50, refDurationMs: 2000,
    postureChecks: false, color: '#4f6fae', source: 'preset',
  },
  // Extracted by the Expert Mode pipeline from the team's three demonstration videos
  // (team videos on Google Drive, see README: front lift, side lift, side-to-front swing). See extractReference.ts.
  ...(VIDEO_PRESETS as unknown as Exercise[]),
];

/** Gentle exercise used in the Training Day. */
export const TRAINING_EXERCISE: Exercise = {
  ...PRESETS[1],
  id: 'training',
  name: { en: 'Practice stroke', hi: 'अभ्यास स्ट्रोक' },
  path: resample(line({ x: 0.75, y: -0.2 }, { x: 0.2, y: -0.22 }), N),
  tolerance: 0.2, reps: 2, holdMs: 0, postureChecks: false, color: '#3f7fbf',
};
