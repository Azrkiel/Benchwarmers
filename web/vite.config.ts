import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const API = process.env.BW_API_URL ?? 'http://localhost:3001';

// credentialless (not require-corp): HuggingFace model downloads lack CORP.
const COI_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
};

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@shared': fileURLToPath(new URL('../server/src/shared', import.meta.url)) },
  },
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['@huggingface/transformers'] },
  server: {
    port: 5173,
    headers: COI_HEADERS,
    proxy: { '/api': API, '/mcp': API, '/healthz': API },
  },
  preview: {
    headers: COI_HEADERS,
    proxy: { '/api': API, '/mcp': API, '/healthz': API },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
