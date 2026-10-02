import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Part 3 adds vite-plugin-pwa here (offline driver and loader apps).
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:3000' } },
});
