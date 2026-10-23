import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const root = fileURLToPath(new URL('.', import.meta.url));

// Output is exactly <widgetDir>/dist/benchwarmers.html with JS and CSS inlined.
export default defineConfig({
  root,
  plugins: [viteSingleFile()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000, // fonts must be data: URLs inside the single-file HTML (sandboxed iframe)
    rollupOptions: { input: fileURLToPath(new URL('./benchwarmers.html', import.meta.url)) },
  },
});
