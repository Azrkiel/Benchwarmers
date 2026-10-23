// Calls + pregame browser run on the points/pregame rehearsal server (3012/5212).
const { chromium } = require('C:/Users/jiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out = process.argv[2]; const web = 'http://127.0.0.1:5212'; const api = 'http://127.0.0.1:3012/api/rooms';
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Users/jiang/AppData/Local/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-win64/chrome-headless-shell.exe' });
  const errs = [];
  const mk = async (w, h) => { const c = await b.newContext({ viewport: { width: w, height: h } }); const p = await c.newPage(); p.on('pageerror', (e) => errs.push(e.message)); return p; };
  const maya = await mk(390, 844); maya.on('response', async (r) => { if (r.request().method() === 'POST' && r.url().includes('/api/rooms/')) log('POST', r.url().split('/').slice(-1)[0], r.status(), (r.request().postData() || '').replace(/"participantToken":"[^"]+"/, 'TOKEN').slice(0, 140), '=>', (await r.text()).slice(0, 100)); }); const leo = await mk(390, 844);
  await maya.goto(web + '/', { waitUntil: 'networkidle' });
  await maya.click('text=Host a party'); await maya.click('text=Create party');
  await maya.waitForURL(/\/room\/[A-Z0-9]+$/); const code = maya.url().split('/').pop();
  await maya.fill('#rm-name', 'Maya'); await maya.click('button:has-text("Join room")');
  await maya.waitForSelector('text=Auto-pick lineup'); await maya.click('text=Auto-pick lineup'); await maya.waitForSelector('text=Lineup saved');
  // Pregame winner pick in the lobby (My lineup view shows it first).
  await maya.waitForSelector('section[aria-label="Pick the winner"]');
  await maya.click('section[aria-label="Pick the winner"] button:has-text("Pick HAR")');
  await maya.waitForSelector('button:has-text("✓ HAR picked")');
  const refText = await maya.textContent('section[aria-label="Pick the winner"]');
  await maya.screenshot({ path: `${out}/c1-pregame.png` });
  log('pregame:', refText.replace(/\s+/g, ' ').slice(0, 260));
  await leo.goto(`${web}/?join=${code}`, { waitUntil: 'networkidle' });
  await leo.fill('#rm-join-name', 'Leo'); await leo.click('text=Join party'); await leo.click('button:has-text("Join room")');
  await leo.waitForSelector('text=Auto-pick lineup'); await leo.click('text=Auto-pick lineup'); await leo.waitForSelector('text=Lineup saved');
  const display = await mk(960, 480); await display.goto(`${web}/room/${code}/display`, { waitUntil: 'networkidle' });
  await maya.click('summary:has-text("Host controls") >> nth=0'); await maya.click('button:has-text("Start game")');
  log('room', code, 'started');
  // Maya creates a call from the composer during the first open window.
  for (let i = 0; i < 240; i++) { const v = await (await fetch(`${api}/${code}`)).json(); if (v.question?.status === 'open' && v.question.remainingMs > 5000) break; await maya.waitForTimeout(250); }
  await maya.waitForSelector('button:has-text("Make a call")', { timeout: 10000 });
  await maya.click('button:has-text("Make a call")');
  await maya.waitForSelector('section[aria-label="Make a call"] h3');
  await maya.fill('#rm-call-phrase', 'Hawks score next, 25 points'); await maya.click('text=Fill in');
  const horizons = await maya.$$eval('section[aria-label="Make a call"] [aria-label="Window"] button', (els) => els.map((e) => `${e.textContent}${e.getAttribute('aria-pressed') === 'true' ? '*' : ''}`));
  log('horizons:', horizons.join(' | '));
  await maya.click('button:has-text("Review offer")');
  const reviewed = await maya.waitForSelector('section[aria-label="Make a call"] .rm-commit-offer, section[aria-label="Make a call"] .rm-error', { timeout: 8000 });
  log('review:', await reviewed.textContent());
  await maya.screenshot({ path: `${out}/c2-call-review.png`, fullPage: true });
  if (await maya.$('button:has-text("Create call and commit")')) {
    await maya.click('button:has-text("Create call and commit")');
    for (const ms of [200, 700, 1500]) { await maya.waitForTimeout(ms); log(`t+${ms}`, (await maya.$$eval('section[aria-label]', (els) => els.map((e) => e.getAttribute('aria-label')))).join(',')); }
    await maya.screenshot({ path: `${out}/c2b-after-create.png`, fullPage: true });
    log('create error:', await maya.textContent('section[aria-label="Make a call"] .rm-error').catch(() => 'none'));
    log('create section:', (await maya.textContent('section[aria-label="Make a call"], section[aria-label="Your call"]')).replace(/\s+/g, ' ').slice(0, 220));
  }
  await display.waitForTimeout(1500);
  const caption = await display.textContent('.rd-foot-play').catch(() => '');
  const callsTab = !!(await display.$('#rd-tab-calls'));
  if (callsTab) { await display.click('#rd-tab-calls'); await display.waitForTimeout(300); }
  await display.screenshot({ path: `${out}/c3-display-calls.png` });
  const pub = await (await fetch(`${api}/${code}`)).json();
  log('display caption:', caption.replace(/\s+/g, ' ').slice(0, 120), '| calls tab:', callsTab, '| public calls:', (pub.calls ?? []).map((c) => `${c.text} ${JSON.stringify(c.pickCounts)}`).join(';'));
  log('public has bank/quote?', /"bank"|"quoteId"/.test(JSON.stringify(pub)), '| errors:', errs.length ? errs.join(' | ') : 'none');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
