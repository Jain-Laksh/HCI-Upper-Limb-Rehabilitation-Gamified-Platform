// Copies MediaPipe WASM runtime into public/ so the app works fully offline.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
const src = 'node_modules/@mediapipe/tasks-vision/wasm';
const dst = 'public/wasm';
if (existsSync(src)) {
  mkdirSync(dst, { recursive: true });
  cpSync(src, dst, { recursive: true });
  console.log('[assets] MediaPipe wasm copied to public/wasm');
} else {
  console.warn('[assets] @mediapipe/tasks-vision not installed yet');
}
