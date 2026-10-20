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
    rollupOptions: { input: fileURLToPath(new URL('./benchwarmers.html', import.meta.url)) },
  },
});
