import fs from 'node:fs/promises';

const WIDGET_URL = new URL('./widget/dist/benchwarmers.html', import.meta.url);
const WIDGET_FALLBACK = '<!doctype html><html><body><p>Widget not built. Run npm run build:widget -w server.</p></body></html>';

/** The single-file widget bundle. One build serves both the household board and the room board. */
export async function readWidgetHtml(): Promise<string> {
  try { return await fs.readFile(WIDGET_URL, 'utf8'); } catch { return WIDGET_FALLBACK; }
}
