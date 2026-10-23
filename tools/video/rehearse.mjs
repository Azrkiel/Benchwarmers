// usage: node tools/video/rehearse.mjs [baseUrl] [outDir]
// Plays docs/VIDEO_SCRIPT.md end to end against a running server (`npm run demo`): Maya hosts on a phone,
// the shared display shows the QR lobby, Leo opens the QR's join URL and joins, Maya builds her lineup and
// starts the game through the simulated smart display, both pick on the first call, and the game runs to the final.
// Saves one PNG per beat plus captions.json (every call-out the shared display made) and meta.json.
// Typed input proves routing, not microphone accuracy. Set CHROMIUM_PATH to use an installed Chrome/Chromium.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [base = 'http://localhost:3001', outArg] = process.argv.slice(2);
const out = outArg ?? fileURLToPath(new URL('./rehearsal/', import.meta.url));
fs.mkdirSync(out, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const maya = await browser.newContext(phone);
const leo = await browser.newContext(phone);
const tv = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const errors = [];
const watch = (page, who) => page.on('pageerror', (e) => errors.push(`${who}: ${e.message}`));
const shot = async (page, name) => { await page.screenshot({ path: path.join(out, `${name}.png`) }); log('shot', name); };
const replies = {};

// 0:20 Maya hosts
const mp = await maya.newPage(); watch(mp, 'maya');
await mp.goto(`${base}/`);
await shot(mp, '01-home');
await mp.getByRole('button', { name: 'Host a party' }).first().click();
const game = mp.locator('input[name="rm-game"][value="harbor-vs-summit"]');
if (await game.count()) await game.check();
await mp.fill('#rm-room-name', 'Friday Basketball');
await mp.getByRole('button', { name: 'Create party' }).click();
await mp.waitForURL(/\/room\/[A-Z0-9]+/);
const code = mp.url().match(/\/room\/([A-Z0-9]+)/)[1];
log('room', code);
if (await mp.locator('#rm-name').waitFor({ timeout: 10_000 }).then(() => true, () => false)) { await mp.fill('#rm-name', 'Maya'); await mp.getByRole('button', { name: /Join/ }).click(); }
await mp.waitForTimeout(1500);
await shot(mp, '02-maya-room');

// Shared display lobby: Scan to join
const tp = await tv.newPage(); watch(tp, 'display');
await tp.goto(`${base}/room/${code}/display`);
await tp.locator('.rd-lobby').waitFor();
await shot(tp, '03-display-lobby-qr');
const qr = await tp.locator('.rd-qr svg').count();
const joinUrl = await tp.locator('.rd-lobby-join small').textContent();

// Leo "scans": opens the URL the QR encodes
const lp = await leo.newPage(); watch(lp, 'leo');
await lp.goto(`${base}/room/${code}`);
await shot(lp, '04-leo-join-page');
await lp.fill('#rm-name', 'Leo');
await lp.getByRole('button', { name: /Join/ }).click();
await lp.waitForTimeout(1500);
await shot(lp, '05-leo-joined');
await tp.waitForTimeout(2500);
await shot(tp, '06-display-lobby-two-seats');

// 0:45 voice lineup on the simulated smart display; Maya's browser holds her seat
const sp = await maya.newPage(); watch(sp, 'simulator');
await sp.setViewportSize({ width: 1600, height: 900 });
await sp.goto(`${base}/display/room/${code}`);
await sp.getByRole('button', { name: /Compact 960x480/ }).click();
await sp.getByLabel('Speaking as').selectOption('seat');
const ask = async (text, name) => {
  const box = sp.getByRole('textbox', { name: 'Ask the display' });
  await box.fill(text);
  await box.press('Enter');
  await sp.waitForTimeout(1500);
  replies[text] = (await sp.locator('.rd-caption').textContent().catch(() => null))?.trim() ?? null;
  log(`"${text}" ->`, replies[text]);
  await shot(sp, name);
};
await ask('Build a balanced lineup for me', '07-sim-lineup');
await ask('Make Big Mo my captain', '08-sim-captain');
await mp.reload();
await mp.getByRole('tab', { name: 'My lineup' }).click().catch(() => mp.getByText('My lineup').first().click());
await mp.waitForTimeout(800);
await shot(mp, '09-maya-lineup-saved');

await lp.getByRole('button', { name: 'Auto-pick lineup' }).click().catch(() => log('Leo: no auto-pick button'));
await lp.waitForTimeout(1500);

// 1:05 speed from the host phone, then start by voice
const speed = process.env.REPLAY_SPEED || '4';
await mp.locator('.rm-phone-host > summary').click();
await mp.getByRole('button', { name: `Replay ${speed} times speed` }).click();
await mp.waitForTimeout(800);
await ask('Start the game', '10-sim-start');
await shot(tp, '11-display-live');

// 1:15 the live call, call-outs and celebrations, through to the final
const captions = [];
let picked = false; let celebrations = 0;
const started = Date.now();
while (Date.now() - started < 15 * 60_000) {
  const cap = await tp.locator('.rd-caption').textContent().catch(() => null);
  if (cap && captions.at(-1) !== cap) { captions.push(cap); log('call-out:', cap); }
  const q = await tp.locator('.rd-call h2').first().textContent().catch(() => '');
  if (!picked && /scores next/i.test(q ?? '')) {
    await shot(tp, '12-display-call-open');
    await ask('Harbor Hawks', '13-sim-pick-hawks');
    const summit = lp.locator('.rm-options button:not([disabled])', { hasText: 'Summit' });
    if (await summit.count()) await summit.first().click(); else log('Leo: call closed before his pick');
    await lp.waitForTimeout(800);
    await shot(lp, '14-leo-pick');
    await shot(mp, '15-maya-pick-receipt');
    await shot(tp, '16-display-picks-in');
    picked = true;
  }
  if (celebrations < 2 && await tp.locator('[class*="celebration"]:visible').count()) await shot(tp, `17-display-celebration-${++celebrations}`);
  if (await tp.locator('.rd-final-score').count()) break;
  await tp.waitForTimeout(300);
}
const gameMs = Date.now() - started;
await shot(tp, '18-display-final');
await tp.waitForTimeout(6000);
await shot(tp, '19-display-final-settled');

// 1:50 season memory
await ask("What's my rank?", '20-sim-rank');
await ask("Who's leading the season?", '21-sim-season');
await shot(mp, '22-maya-results');

fs.writeFileSync(path.join(out, 'captions.json'), JSON.stringify(captions, null, 2));
fs.writeFileSync(path.join(out, 'meta.json'), JSON.stringify({ base, code, qr: qr > 0, joinUrl, speed: Number(speed), picked, gameSeconds: Math.round(gameMs / 1000), replies, errors }, null, 2));
log(`done in ${Math.round(gameMs / 1000)} s of game; page errors: ${errors.length || 'none'}`);
await browser.close();
if (errors.length || !picked || !qr) process.exitCode = 1;
