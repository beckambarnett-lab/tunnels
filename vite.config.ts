import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages serves the game from /tunnels/; local dev stays at /
  base: process.env.BASE_PATH || '/',
  server: { host: true, port: 5173 },
  worker: { format: 'es' },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
} as any);
