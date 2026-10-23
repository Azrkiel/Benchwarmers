// usage: node tools/video/render.mjs [sceneId ...]
// Renders docs/video/graphics.html frame by frame into docs/video/renders/:
//   cards    -> <id>.mp4 (H.264) + <id>.png (key frame)
//   overlays -> <id>.webm (VP9 with transparency, for OBS and editors that read alpha)
//               <id>-green.mp4 (green screen, for editors that only chroma-key) + <id>.png (transparent key frame)
// Needs ffmpeg on PATH and the root `playwright` devDependency. Set CHROMIUM_PATH to use an installed Chrome/Chromium.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const FPS = 30;
const dir = fileURLToPath(new URL('../../docs/video/', import.meta.url));
const pageUrl = pathToFileURL(path.join(dir, 'graphics.html')).href;
const outDir = path.join(dir, 'renders');
fs.mkdirSync(outDir, { recursive: true });

const ffmpeg = (...args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto(pageUrl);
const only = new Set(process.argv.slice(2));
const scenes = (await page.evaluate(() => SCENES.map(({ id, overlay, dur, hold }) => ({ id, overlay: !!overlay, dur, hold }))))
  .filter((s) => !only.size || only.has(s.id));

for (const scene of scenes) {
  const frames = fs.mkdtempSync(path.join(os.tmpdir(), `bw-${scene.id}-`));
  await page.goto(`${pageUrl}?scene=${scene.id}&render=1${scene.overlay ? '&alpha=1' : ''}`);
  await page.evaluate(async () => {
    await Promise.all(['800 100px "Barlow Condensed"', '700 100px "Barlow Condensed"', '600 100px "Barlow Condensed"', '600 40px Barlow', '500 40px Barlow'].map((f) => document.fonts.load(f)));
    await document.fonts.ready;
  });
  const count = Math.round((scene.dur / 1000) * FPS);
  for (let i = 0; i < count; i++) {
    await page.evaluate((ms) => window.__scene.seek(ms), (i * 1000) / FPS);
    await page.screenshot({ path: path.join(frames, `${String(i).padStart(4, '0')}.png`), omitBackground: scene.overlay });
  }
  const input = ['-framerate', String(FPS), '-i', path.join(frames, '%04d.png')];
  if (scene.overlay) {
    ffmpeg(...input, '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '30', '-auto-alt-ref', '0', path.join(outDir, `${scene.id}.webm`));
    ffmpeg('-f', 'lavfi', '-i', `color=c=0x00b140:s=1920x1080:r=${FPS}`, ...input, '-filter_complex', '[0][1]overlay=shortest=1,format=yuv420p',
      '-c:v', 'libx264', '-crf', '20', '-movflags', '+faststart', path.join(outDir, `${scene.id}-green.mp4`));
  } else {
    ffmpeg(...input, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-movflags', '+faststart', path.join(outDir, `${scene.id}.mp4`));
  }
  if (!['wipe', 'whip'].includes(scene.id)) {
    await page.evaluate((ms) => window.__scene.seek(ms), scene.hold);
    await page.screenshot({ path: path.join(outDir, `${scene.id}.png`), omitBackground: scene.overlay });
  }
  fs.rmSync(frames, { recursive: true, force: true });
  console.log(`rendered ${scene.id} (${count} frames)`);
}
await browser.close();
