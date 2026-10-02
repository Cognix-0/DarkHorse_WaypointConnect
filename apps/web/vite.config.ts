import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Offline: public/sw.js (service worker) + src/offline (IndexedDB outbox). No PWA plugin needed.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:3000' } },
});
