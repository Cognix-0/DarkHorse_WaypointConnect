import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Offline: public/sw.js (service worker) + src/offline (IndexedDB outbox). No PWA plugin needed.

/** One id per build. The app knows its own id; /version.json holds the deployed one, so an open tab can tell
 * that a new version is out and offer to load it (src/live.tsx). */
const BUILD_ID = new Date().toISOString();
const versionFile = (): Plugin => ({
  name: 'waypoint-version',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_ID }) });
  },
});

export default defineConfig({
  plugins: [react(), versionFile()],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  server: { port: 5173, proxy: { '/api': 'http://localhost:3000' } },
});
