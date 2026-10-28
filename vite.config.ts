import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
// @ts-expect-error Node-only build helper; it has no declaration file.
import serviceWorker from './scripts/service-worker-plugin.mjs';

export default defineConfig(({ mode }) => {
  const buildHash = createHash('sha256');
  buildHash.update(readFileSync('pnpm-lock.yaml'));
  for (const path of readdirSync('src', { recursive: true }).map(String).filter(path => /\.(ts|tsx)$/.test(path) && !path.includes('.test.')).sort()) buildHash.update(path).update(readFileSync(`src/${path}`));
  // Explicitly expose only this browser credential, never all unprefixed env vars.
  // Static capture scripts continue to read VITE_GOOGLE_MAPS_API_KEY directly.
  const demo = loadEnv(mode, process.cwd(), 'GOOGLE_MAPS_DEMO_API_KEY').GOOGLE_MAPS_DEMO_API_KEY?.trim();
  return {
  plugins: [react(), serviceWorker()],
  server: { proxy: { '/api/adventure': 'http://127.0.0.1:3001', '/api/rooms': { target: 'http://127.0.0.1:8787', ws: true } } },
  define: { 'import.meta.env.VITE_ROOM_BUILD': JSON.stringify(buildHash.digest('hex').slice(0, 16)), ...(mode === 'sites' || mode === 'cloudflare'
    ? { 'import.meta.env.VITE_GOOGLE_MAPS_API_KEY': JSON.stringify(mode === 'sites' ? '' : demo || '') }
    : demo ? { 'import.meta.env.VITE_GOOGLE_MAPS_API_KEY': JSON.stringify(demo) } : {}) },
  build: {
    rollupOptions: {
      output: { manualChunks: { three: ['three'] } },
    },
  },
  };
});
