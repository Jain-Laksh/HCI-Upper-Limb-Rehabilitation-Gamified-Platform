import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' so the build works on GitHub Pages or any static host / file server.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5173, open: true },
});
