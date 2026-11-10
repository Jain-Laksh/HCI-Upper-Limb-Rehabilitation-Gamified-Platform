import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import './styles.css';
import App from './App';
import { useNav } from './store/nav';
import { useSession, useShift } from './store/shift';
import { useProfile } from './store/profile';
import { useSettings } from './store/settings';
import { poseEngine } from './vision/poseEngine';
import { draftExercise, processVideo } from './exercise/extractReference';

// Dev-only debug handles (used by the automated UI smoke test and for demo preparation).
if (import.meta.env.DEV) Object.assign(window as any, { __nav: useNav, __session: useSession, __shift: useShift, __profile: useProfile, __settings: useSettings, __pose: poseEngine, __extract: processVideo, __draft: draftExercise });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
