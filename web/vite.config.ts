import { defineConfig, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const API = process.env.BW_API_URL ?? 'http://localhost:3001';

// credentialless (not require-corp): HuggingFace model downloads lack CORP.
const COI_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
};

// /watch embeds a YouTube iframe, which COEP blocks (YouTube sends no CORP/COEP),
// so its documents skip the isolation headers. Voice ID pages keep them.
const coiHeaders: Connect.NextHandleFunction = (req, res, next) => {
  if (!req.url?.startsWith('/watch')) for (const [k, v] of Object.entries(COI_HEADERS)) res.setHeader(k, v);
  next();
};
const crossOriginIsolation: Plugin = {
  name: 'bw-cross-origin-isolation',
  configureServer: (server) => { server.middlewares.use(coiHeaders); },
  configurePreviewServer: (server) => { server.middlewares.use(coiHeaders); },
};

export default defineConfig({
  plugins: [react(), crossOriginIsolation],
  resolve: {
    alias: { '@shared': fileURLToPath(new URL('../server/src/shared', import.meta.url)) },
  },
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['@huggingface/transformers'] },
  server: {
    host: '0.0.0.0',
    port: 5173,
    // The browser MCP host checks Origin against Host, so keep the page's Host on that path.
    proxy: { '/api/mcp-widget': { target: API, changeOrigin: false }, '/api': API, '/mcp': API, '/healthz': API },
  },
  preview: {
    proxy: { '/api': API, '/mcp': API, '/healthz': API },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
