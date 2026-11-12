# Day Shift: Age-Respectful Upper-Limb Rehabilitation Games

CS 435 HCI Course Project, Assignment 3 (High-Fidelity Prototype), **Group 1**, IIT Gandhinagar.

**Team:** Akshat A. Nishad, Rudra P. Singh, Laksh Jain, Harshil H Shah

**Links:** [Report](https://github.com/Jain-Laksh/HCI-Upper-Limb-Rehabilitation-Gamified-Platform/blob/main/Report.pdf) · [Demo video](https://drive.google.com/file/d/1J38DBpJ5eY5m0iKNOVhc_1249CBgIX_T/view?usp=sharing) · [Sample exercise videos](https://drive.google.com/drive/folders/1zNrh0UHeJPDhy7wdvKA5KDEEcO0iknv5?usp=sharing)

> Research prototype. Not a medical device. Stop if you feel pain.

## About

Day Shift turns home arm exercises for older adults into a working day as a **house painter**. The webcam follows the body, each exercise appears as masking tape on a wall, and paint appears only while the hand follows the tape. Everything runs in the browser.

Main features:

- One reference movement is rescaled to every user's own arm length.
- Depth toward the camera is estimated from a normal webcam.
- A therapist can turn a phone video of an exercise into a new wall (Expert mode).
- Designed for older adults: large text, high contrast, dwell selection with the free hand, speech with captions, voice commands, English and Hindi.

## How to run

**Requirements:** [Node.js](https://nodejs.org) 18+, Chrome or Edge, and a webcam. See [Code_Files/requirements.txt](Code_Files/requirements.txt).

Run these commands from the `Code_Files` folder:

```bash
cd Code_Files
npm install
npm run dev
```

The app opens at <http://localhost:5173>. Allow camera access when asked.

| Command | Purpose |
|---|---|
| `npm run dev` | Start the app |
| `npm run build` | Build static files into `dist/` |
| `npm test` | Run the algorithm checks |

**Tips**

- Sit 1.5–2 m from the webcam, in good light, with your upper body visible.
- After `npm install` the app works offline. Only voice commands need internet.
- On a slow laptop, choose *Settings → Advanced → Tracking quality → Faster*.
- To try Expert mode, download a [sample video](https://drive.google.com/drive/folders/1zNrh0UHeJPDhy7wdvKA5KDEEcO0iknv5?usp=sharing) and open *Settings → Exercise → For therapists*.

## Tech stack

React 18, TypeScript and Vite · MediaPipe Pose Landmarker (models bundled) · zustand · Framer Motion · Web Speech API · Web Audio API

## Repository layout

```
Code_Files/        the app (src/, tests/, public/models/, package.json, requirements.txt)
Evaluation_Data/   consent form, Google Form (PDF) and its anonymised responses (CSV)
Report.pdf         project report
```

The demo video is on Google Drive (link above) because it is too large for GitHub.

## Privacy

Camera images are processed on the device and never stored or sent. Only settings and numeric results are saved, in the browser. Voice commands are off by default; when turned on, they use the browser's online speech service.
