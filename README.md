# Day Shift — Age-Respectful Upper-Limb Rehabilitation Games

CS 435 HCI Course Project, Assignment 3: High-Fidelity Prototype. **Group 1.**
Team: Akshat A. Nishad · Rudra P. Singh · Laksh Jain · Harshil H Shah. IIT Gandhinagar.

**Day Shift** is a set of vocational role-play games for **upper-limb tele-rehabilitation**: older adults do home exercises for the shoulder girdle, shoulder, elbow and wrist by working a "day shift" in a familiar trade. The vertical slice implements the **House Painter** trade (other trades are shown as coming later). In the painter game, the webcam follows the body, and each exercise appears on the wall as **masking tape to paint along**. The tape comes from a reference movement recorded by a physiotherapist. The game rescales it to each user's own segment lengths and anchors it to the body part that moves.

> Research prototype. Not a medical device. Stop if you feel pain.

---

## Repository layout

```
.                     (= Group_1/ in the submitted zip)
├── Code_Files/       the app (run everything from here)
│   ├── src/          React + TypeScript source
│   ├── public/models/  MediaPipe pose models (bundled, so the app works offline)
│   ├── tests/        algorithm checks (npm test)
│   ├── scripts/      copies the MediaPipe WASM runtime on npm install
│   ├── package.json  npm dependencies
│   └── requirements.txt  system + package requirements
├── Evaluation_Data/  consent form, moderator script and tasks, questionnaire, result sheets
├── Report.pdf
├── Demo_Video.mp4
└── README.md
```

## How to run

**Requirements** (also listed in [Code_Files/requirements.txt](Code_Files/requirements.txt)):
- [Node.js](https://nodejs.org) 18 or newer (npm comes with it);
- Google Chrome or Microsoft Edge (voice commands need one of these; everything else also works in Firefox);
- a webcam.

There is no Python and no server: `npm install` installs every package listed in `package.json`.

**Steps.** Run these from the **`Code_Files`** folder, not the repository root:

```bash
cd Code_Files
npm install        # installs the packages and copies the MediaPipe WASM runtime into public/wasm
npm run dev        # starts the app at http://localhost:5173 and opens it in the browser
```

Allow camera access when the browser asks. If the page does not open by itself, open <http://localhost:5173> in Chrome or Edge.

After `npm install`, the game runs **offline**: the pose models are bundled in `Code_Files/public/models/`. Only voice *commands* need internet, because they use the browser's speech service.

| Command (in `Code_Files/`) | Purpose |
|---|---|
| `npm run dev` | Start the development server (http://localhost:5173) |
| `npm run build` | Production build into `Code_Files/dist/` (static files; can be hosted on GitHub Pages) |
| `npm run preview` | Serve the production build locally |
| `npm test` | Headless checks of the core algorithms (calibration, 3D depth, scoring, resets, rep segmentation, video walls) |
| `npm run typecheck` | TypeScript type check |

**Troubleshooting**
- *Camera not found or blocked:* close other apps that use the camera (Zoom, Teams), then reload. Check the camera permission in the address bar.
- *Slow on an older laptop:* choose *Settings → Advanced → Tracking quality → Faster*, then reload the page.
- *Voice commands do nothing:* use Chrome or Edge, be online, and turn them on in *Settings → Control*. Brave blocks the speech service.

**Sample exercise videos.** The three demonstration videos are too large for GitHub, so they are on Google Drive: **[sample videos folder](https://drive.google.com/drive/folders/1zNrh0UHeJPDhy7wdvKA5KDEEcO0iknv5?usp=sharing)**. To try Expert mode with them, download one, go to *Settings → Exercise → For therapists*, and choose the file with the mouse or drag it onto the drop zone.

**Demo tips**
- Sit 1.5–2 m from the webcam, in good light, with your upper body visible.
- *Settings → Advanced → Show measurements* shows live angles (3D vs 2D), depth, lean and drift. This is useful for the viva.
- The keyboard works throughout: Tab/Enter, **Space** = pause/resume, **R** = repeat the last spoken line, **Esc** = back.

---

## What is implemented (vertical slice)

**The full Painter journey runs end to end:**

Welcome → Main menu → Choose trade → **Plan today's work** (choose walls / exercises, strokes, tape width) → Setup check → Arm calibration → Training day → Shift (briefing → wall intro → painting → wall done → lunch → …) → Pay slip → My progress.

### Expert validation (ground truth from a physiotherapist)
Path: *Settings → Exercise → For therapists → Expert mode*.
1. Upload a video of the exercise, filmed from the front: upper body visible, camera still, 3–5 slow repetitions. Click "Choose video file" with the mouse or drag the file in (browsers do not open the file chooser from a hand-pointer dwell). No photos are needed: arm length is measured from the video itself.
2. Pose is extracted per frame (MediaPipe, in the browser; the video never leaves the device).
3. The wrist path is converted to **body units** (origin = shoulder, 1 unit = arm length) and 3D joint angles are computed.
4. The main movement is detected (shoulder lift, elbow bend or side-to-front swing) and repetitions are segmented automatically; a rep whose start or end is far from the others is unticked. The expert can exclude bad reps, adjust the tape width (tolerance), strokes per wall and hold time, then **approve**.
5. The averaged stroke becomes a new wall in the game, drawn from each user's own shoulder and scaled by their own arm length. The tape ends at 92% of the averaged stroke: an average peak is above half of the reps, so ending exactly there meant even the demonstrator could not finish their own stroke (found by feeding the video to the game as the camera).

The team's three demonstration videos (`front_lift.mp4`, `side_lift.mp4`, `side_to_front_swing.mp4`, on [Google Drive](https://drive.google.com/drive/folders/1zNrh0UHeJPDhy7wdvKA5KDEEcO0iknv5?usp=sharing)) were run through this pipeline. The results ship as built-in walls in `src/exercise/videoPresets.json`: **Front lift (video)** 80°, **Side lift (video)** 93°, **Side-to-front swing (video)** 88°. They are team recordings, not checked by a physiotherapist.

### Exercises (upper limb, not only the arm)
Each exercise traces **one body point in a frame anchored to the body part it moves**, measured in that user's own segment length. The same tape, scorer and error bounds therefore work for every joint.

| Area | Walls (exercise) | Traced point · frame · unit | Metric |
|---|---|---|---|
| Shoulder girdle | Shoulder lift (shrug) | shoulder · relative to the ear (start = the user's own relaxed shoulder) · ¼ arm length | shoulder elevation ° |
| Shoulder | Side arch (abduction), Front lift (flexion, uses depth), Ceiling stripe (overhead reach), Long sweep (horizontal), Diagonal stripe (cross-body reach) | wrist · relative to the shoulder · arm length | shoulder elevation ° (3D and 2D) |
| Elbow | Brush lift (curl, uses depth) | wrist · relative to the shoulder · arm length | elbow flexion ° (3D and 2D) |
| Wrist | Window wiper (radial/ulnar deviation) | middle of the hand · relative to the wrist · hand length | wrist tilt ° |

Not covered: finger, grip and forearm-rotation exercises. They need a hand-landmark model (MediaPipe HandLandmarker, 21 points per hand), and are listed as future work. Expert mode extracts wrist paths (shoulder lifts, side-to-front swing, elbow bend); shrug and wrist exercises are presets only.

### Personalisation and scaling
A 3-second calibration pose (arm out to the side) measures the user's upper arm, forearm and hand. The pose check tolerates a slightly bent or not-quite-level arm, and dropouts under 0.4 s do not restart the countdown. A bone can only *look* shorter than it is (when it turns toward the camera), so calibration uses a high percentile, not the median. The lengths keep being **refined live**: if a bone is consistently seen longer than calibrated (about 10 frames), the arm length grows (by at most 25%). Before this fix, a fully extended arm could overshoot the tape when the arm had been held slightly forward during calibration. Every reference path is rescaled to their arm and drawn from their own shoulder, so taller and shorter users both get reachable paths.

### Depth (3D)
- **Scaled-orthographic reconstruction:** a bone that looks shorter than its calibrated length has turned toward or away from the camera, so Δz = √(L₀² − l²). The sign comes from MediaPipe's world landmarks.
- This recovers forward raises and elbow curls, which a 2D-only system under-reports. `npm test` shows 60° → 60° (3D) versus 0° (2D).
- It is valid because the user stays at a fixed distance. This is checked continuously: small changes are absorbed by the adaptive scale between strokes; if the body scale leaves 0.70–1.45 of the calibration for 1.5 s, the game pauses and asks the user to return to their spot (it resumes by itself inside 0.78–1.32).

### Tracking robustness
- **Target lock** on one person when several people are in view.
- **Visibility check** for head, shoulders, elbows and hands.
- **Distance meter**, centring check, lighting check.
- **Auto-pause** when tracking is lost.

### Scoring and error bounds
- Paint is laid only while the brush is inside the tape corridor. The corridor uses **hysteresis** (enter < tol, leave > 1.25 × tol), so jitter at the edge does not flicker.
- A stroke **restarts from its start point** if the brush stays off the tape for more than **1 s**, or the trunk **tilts > 15°** during the stroke. A small shoulder hike gives a spoken hint; only a large one restarts the stroke.
- Posture is judged **relative to the start of each stroke**, and the body scale **adapts between strokes**. Shifting in the chair or leaning in a little is therefore never an error. Only large distance changes pause the game, and the pause menu offers **Measure again**.
- Tracking problems are never the user's fault: the off-tape timer freezes while the wrist is barely visible, and the brush is re-acquired further along the tape after a gap.
- **Tape width:** a user setting (wide / standard / narrow) plus **automatic adjustment**. Two misses in a row widen the tape by 20% (up to 1.6×); three neat strokes narrow it back.
- The pause menu also offers **Skip this wall** and **Restart this wall**.
- There is **no penalty**: pay is never deducted.
- Neatness is scored with DTW.

### Game layer
- The **9-to-5 clock advances with work done**, not with real time, so there is no time pressure.
- The 1 PM lunch is a built-in rest.
- The wage is ₹40 per stroke, plus a neatness bonus and a wall bonus.
- The pay slip shows a separate clinical summary: range of motion in 3D vs 2D, neatness, active and rest time, strokes redone.
- Progress is saved after every stroke, and an interrupted shift can be resumed.

### Multimodal input
- **Two-hand control:** one hand paints, the **other hand** works the menus. The pointer appears only while that hand is raised ("raise to point"), so a resting hand never selects anything. *Settings → Control → Hand for the pointer* switches back to the same hand.
- Hand pointer with **dwell-to-select** (hold over a big button; the ring fills).
- **Hand pointer from the main menu:** with hand control on, the camera starts as soon as you reach the main menu, so every screen can be used by hand (not only after the first shift starts). The Welcome screen says this before it happens.
- **Hand-side layout (one-handed reach):** the layout follows the hand that works the pointer, so you never reach across your body to the far end of the screen.
  - **Comfortable reach box:** the pointer box sits on that hand's own side, from about ½ shoulder-width inward of the shoulder (short of the body's midline) to 1.2 shoulder-widths outward. The whole screen maps onto this box.
  - **Controls on the pointer side:**
    - Back and Help;
    - the primary button (Start shift, Resume);
    - the side column with the options;
    - the Settings tabs and their option buttons;
    - the Pause button in the shift header;
    - dialogs;
    - the scroll buttons.
  - **Mirroring:** the layout mirrors when you switch the exercising arm or the pointer hand (*Settings → Control*). With the mouse (hand pointer off), the standard layout is used.
- **Scroll buttons for the hand pointer:** when a page or dialog is taller than the screen, large *Scroll up / Scroll down* buttons appear on the right edge. Hovering scrolls half a screen, and keeps scrolling while the pointer stays there.
- Mouse and touch.
- Keyboard.
- Voice commands (*pause, resume, repeat, next, back, help*, in English or Hindi). Turn them on in *Settings → Control*; the status and the last phrase heard are shown there.
  - Matching ignores punctuation and capitals ("Pause." used to fail).
  - A command fires on interim results, so there's no 1–3 s wait.
  - The game's own speech is ignored, so it can't trigger commands.
  - Errors are reported precisely: no internet, a blocked service (e.g. Brave), or no microphone.

### Multimodal feedback
- Visual: paint, colour, icons and text.
- Spoken guidance, with captions for everything spoken.
- Earcons designed for older ears (260–1100 Hz, soft attack).

### Settings (persisted, applied live)
- text size (4 levels) and button size (3 levels);
- theme: high contrast (default), warm paper or dark;
- language: English / हिन्दी;
- voice on/off, speed and volume;
- sound effects on/off and volume, captions;
- dwell time;
- exercising arm, seated/standing;
- posture checks, shift length;
- reduced motion;
- camera visibility behind the wall.

### Horizontal (shallow) parts
- The Gardener, Postal sorter and Carpenter trades appear as "coming in a later version".
- There are no accounts, reminders or cloud sync.

---

## Architecture

```
Webcam ─► PoseEngine (MediaPipe PoseLandmarker, BlazePose GHUM, WASM/GPU, in-browser)
            │  33 landmarks + 33 world landmarks / frame, target lock, One-Euro smoothing
            ▼
        bodyFrame: calibration · body-relative coords · 3D depth reconstruction · posture/drift
            │
   ┌────────┴─────────┐
   ▼                  ▼
StrokeScorer        DwellCursor (interaction box → screen, dwell select)
(corridor, resets,  Voice (Web Speech API) · Keyboard ─► command bus
 DTW, ROM)
   │
   ▼
Shift store (zustand, persisted) ─► PaintStage canvas · HUD · overlays · Pay slip · Progress
Feedback: speechSynthesis + captions · Web Audio earcons
Expert mode: video file ─► per-frame pose ─► rep segmentation ─► averaged reference ─► library
```

| Concern | Technology |
|---|---|
| UI | React 18 + TypeScript + Vite |
| Pose estimation | `@mediapipe/tasks-vision` PoseLandmarker (bundled `full` and `lite` models) |
| State | zustand + localStorage persistence |
| Animation | Framer Motion (respects reduced motion) |
| Icons and font | Lucide; Atkinson Hyperlegible |
| Speech | Web Speech API (speechSynthesis for output, SpeechRecognition for commands); no model download, no API key |
| Sound | Web Audio API (generated earcons) |

### Code map (`Code_Files/src`)

| Folder | Contents |
|---|---|
| `vision/` | `poseEngine.ts` (camera, model, target lock), `bodyFrame.ts` (calibration, body frame, depth), `checks.ts`, `oneEuro.ts`, `geometry.ts` |
| `exercise/` | `presets.ts`, `scorer.ts` (stroke state machine), `dtw.ts`, `extractReference.ts` (expert video pipeline) |
| `game/` | `PaintStage.tsx` (canvas: tape, paint, brush, depth meter), `economy.ts` |
| `input/` | `DwellCursor.tsx`, `voice.ts`, `commands.ts` |
| `feedback/` | `speech.ts`, `sfx.ts` |
| `screens/` | all screens |
| `store/` | settings, profile/history, shift, exercise library, navigation |
| `i18n/` | English and Hindi strings |

---

## Privacy

- Camera frames are processed **on this computer only**. No video or images are stored or sent.
- Saved data is a nickname (optional), settings, and numeric session results, kept in the browser's localStorage.
- *Pay slip → Export session data* downloads an anonymised JSON for the evaluation (no name, no images).
- Voice commands, when switched on, use the browser's cloud speech service. This is disclosed in Settings.

## Evaluation data

`Evaluation_Data/` holds the study materials:
- `01_consent_form`, `02_moderator_script_and_tasks` and `03_questionnaire`, each as `.md` (to edit) and `.pdf` (to print);
- the result sheets `observation_log.csv`, `questionnaire_responses.csv` and `angle_validation.csv`, one row per participant and task;
- `raw/`, for the anonymised session JSON files exported from the pay slip.
