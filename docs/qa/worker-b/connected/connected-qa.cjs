// Connected basketball scenario: homepage host -> two phones -> shared display -> picks -> baskets -> final.
const { chromium } = require('C:/Users/jiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out = process.argv[2]; const base = 'http://127.0.0.1:5211';
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Users/jiang/AppData/Local/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-win64/chrome-headless-shell.exe' });
  const errors = [];
  const phone = async () => { const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'no-preference' }); const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(e.message)); return p; };
  const maya = await phone(); const leo = await phone();
  // Host from the homepage, basketball selected by default.
  await maya.goto(base + '/', { waitUntil: 'networkidle' });
  await maya.click('text=Host a party');
  await maya.fill('#rm-room-name', 'Friday Basketball');
  await maya.click('text=Create party');
  await maya.waitForURL(/\/room\/[A-Z0-9]+$/);
  const code = maya.url().split('/').pop();
  log('room', code);
  await maya.fill('#rm-name', 'Maya'); await maya.click('button:has-text("Join room")');
  await maya.waitForSelector('text=Your lineup');
  // Maya builds manually: captain + four flex via the sorted list (projection order).
  const caps = await maya.$$('button[aria-label^="Captain "]');
  await caps[1].click();
  for (const name of ['Danny Cho', 'Luis Navarro', 'Caleb Frost', 'Nate Kimura']) await maya.click(`button[aria-label="Add ${name}"]`);
  const budget = await maya.textContent('.rm-budget strong');
  await maya.click('button:has-text("Save lineup")');
  await maya.waitForSelector('text=Lineup saved');
  log('maya lineup', budget);
  await maya.screenshot({ path: `${out}/c1-maya-lineup.png` });
  // Leo joins from the homepage join form and auto-picks.
  await leo.goto(`${base}/?join=${code}`, { waitUntil: 'networkidle' });
  await leo.fill('#rm-join-name', 'Leo'); await leo.click('text=Join party');
  await leo.click('button:has-text("Join room")');
  await leo.waitForSelector('text=Auto-pick lineup'); await leo.click('text=Auto-pick lineup');
  await leo.waitForSelector('text=Lineup saved');
  // Shared display at 960x480.
  const dctx = await browser.newContext({ viewport: { width: 960, height: 480 } });
  const display = await dctx.newPage(); display.on('pageerror', (e) => errors.push('display: ' + e.message));
  await display.goto(`${base}/room/${code}/display`, { waitUntil: 'networkidle' });
  await display.waitForSelector('text=Join on your phone');
  await display.screenshot({ path: `${out}/c2-display-lobby.png` });
  // Host starts at 4x from the phone host controls.
  await maya.click('summary:has-text("Host controls")');
  await maya.click('button[aria-label="Replay 4 times speed"]');
  await maya.click('button:has-text("Start game")');
  log('started');
  const seenQ = new Set(); const receipts = []; let celebrations = 0; let lastCelebration = ''; let shots = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 240000) {
    // Phones answer each newly opened call (Maya first option, Leo last option).
    for (const [who, page, pickLast] of [['Maya', maya, false], ['Leo', leo, true]]) {
      if (await page.$('#rm-tab-game[aria-selected="false"]')) await page.click('#rm-tab-game').catch(() => {});
      const qid = await page.textContent('#rm-question-title').catch(() => '');
      const buttons = await page.$$('.rm-options button:not(:disabled)');
      if (buttons.length && !seenQ.has(who + qid)) {
        seenQ.add(who + qid);
        await (pickLast ? buttons[buttons.length - 1] : buttons[0]).click();
        await page.waitForSelector('.rm-receipt.is-accepted, .rm-receipt.is-rejected, .rm-receipt.is-unknown', { timeout: 8000 }).catch(() => {});
        const r = await page.textContent('.rm-receipt').catch(() => 'no receipt');
        receipts.push(`${who}: ${qid} -> ${r}`); log(who, qid, '->', r);
        if (who === 'Maya' && shots < 2) { await page.screenshot({ path: `${out}/c3-maya-pick-${shots}.png` }); }
      }
    }
    const bc = await display.$('.bc-label b');
    if (bc) {
      const label = await bc.textContent(); const score = await display.textContent('.rd-score');
      if (label + score !== lastCelebration) { celebrations++; lastCelebration = label + score; if (shots < 3) { await display.screenshot({ path: `${out}/c4-display-celebration-${shots}.png` }); shots++; } }
    }
    if (await display.$('text=Winner') || await display.$('text=Tied winners')) break;
    await display.waitForTimeout(400);
  }
  await display.waitForTimeout(500);
  await display.screenshot({ path: `${out}/c5-display-final.png` });
  const pub = await (await fetch(`http://127.0.0.1:3011/api/rooms/${code}`)).json();
  const displayScore = await display.textContent('.rd-score');
  await maya.waitForTimeout(1500);
  await maya.screenshot({ path: `${out}/c6-maya-final.png` });
  const mayaHasResults = !!(await maya.$('#rm-tab-results[aria-selected="true"]'));
  log('final api', pub.game.away.short, pub.game.away.score, pub.game.home.short, pub.game.home.score, 'phase', pub.room.phase);
  log('display score text', displayScore.replace(/\s+/g, ' '));
  log('standings api', pub.standings.map((s) => `${s.rank}.${s.name}:${s.total}`).join(' '));
  log('season api', pub.season.standings.map((s) => `${s.name}:${s.points}`).join(' '));
  log('celebrations seen on display', celebrations, 'maya results tab', mayaHasResults, 'receipts', receipts.length);
  log('errors', errors.length ? errors.join(' | ') : 'none');
  console.log(JSON.stringify({ code }));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
