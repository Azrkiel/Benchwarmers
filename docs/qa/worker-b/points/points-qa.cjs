const { chromium } = require('C:/Users/jiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out = process.argv[2]; const web = 'http://127.0.0.1:5212'; const api = 'http://127.0.0.1:3012/api/rooms';
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Users/jiang/AppData/Local/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-win64/chrome-headless-shell.exe' });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const phone = await ctx.newPage(); const errs = []; phone.on('pageerror', (e) => errs.push('phone ' + e.message));
  await phone.goto(web + '/', { waitUntil: 'networkidle' });
  await phone.click('text=Host a party'); await phone.click('text=Create party');
  await phone.waitForURL(/\/room\/[A-Z0-9]+$/); const code = phone.url().split('/').pop();
  await phone.fill('#rm-name', 'Maya'); await phone.click('button:has-text("Join room")');
  await phone.waitForSelector('text=Auto-pick lineup'); await phone.click('text=Auto-pick lineup'); await phone.waitForSelector('text=Lineup saved');
  const creds = await phone.evaluate((c) => JSON.parse(localStorage.getItem(`bw.room.${c}`)), code);
  await phone.click('summary:has-text("Host controls")'); await phone.click('button[aria-label="Replay 2 times speed"]'); await phone.click('button:has-text("Start game")');
  log('room', code);
  // 1) Phone commitment on the first call.
  await phone.waitForSelector('section[aria-label="Commit points"] button:has-text("25 pts")', { timeout: 60000 });
  await phone.click('section[aria-label="Commit points"] button:has-text("25 pts")');
  const offer = await (await phone.waitForSelector('.rm-commit-offer')).textContent();
  await phone.screenshot({ path: `${out}/p1-review.png` });
  await phone.click('button:has-text("Confirm commit")');
  const committed = await (await phone.waitForSelector('.rm-commit.is-committed p')).textContent();
  const fixed = !!(await phone.$('text=Your pick on this call is fixed by your commitment.'));
  await phone.screenshot({ path: `${out}/p2-committed.png` });
  const firstQ = (await (await fetch(`${api}/${code}`)).json()).question.id;
  log('offer:', offer); log('receipt:', committed, '| pick fixed:', fixed);
  // 2) Voice on the simulator (same browser profile, Maya's seat) on the next call.
  const sim = await ctx.newPage(); await sim.setViewportSize({ width: 1536, height: 864 }); sim.on('pageerror', (e) => errs.push('sim ' + e.message));
  await sim.goto(`${web}/display/room/${code}?trace=1`, { waitUntil: 'networkidle' });
  await sim.selectOption('.sim-speaker select', 'seat');
  let q2 = null; for (let i = 0; i < 240 && !q2; i++) { await sim.waitForTimeout(500); const v = await (await fetch(`${api}/${code}`)).json(); if (v.question?.status === 'open' && v.question.id !== firstQ) q2 = v.question; }
  const say = async (t) => { await sim.fill('input[aria-label="Ask the display"]', t); await sim.click('.sd-type button:has-text("Send")'); await sim.waitForFunction((x) => !document.querySelector('.sd-type button:not(.sim-mic)')?.textContent.includes('Sending'), null); await sim.waitForTimeout(300); return sim.textContent('.rd-caption'); };
  const voiceOffer = await say(`put 10 points on ${q2.options[0].label}`);
  const voiceYes = await say('yes');
  const voiceConfirm = await say('confirm');
  await sim.screenshot({ path: `${out}/p3-sim-voice-commit.png` });
  log('voice offer:', voiceOffer); log('voice yes:', voiceYes); log('voice confirm:', voiceConfirm);
  const mine = await (await fetch(`${api}/${code}`, { headers: { Authorization: `Bearer ${creds.participantToken}` } })).json();
  log('bank after two commitments', JSON.stringify(mine.me.bank), 'commitments', mine.me.commitments.map((c) => `${c.optionLabel}:${c.commitPoints}:${c.state}`).join(','));
  // 3) Play to final and read settlement.
  for (let i = 0; i < 400; i++) { await phone.waitForTimeout(500); const v = await (await fetch(`${api}/${code}`)).json(); if (v.room.phase === 'final') break; }
  const fin = await (await fetch(`${api}/${code}`, { headers: { Authorization: `Bearer ${creds.participantToken}` } })).json();
  await phone.click('#rm-tab-standings').catch(() => {}); await phone.waitForTimeout(800);
  const bankPanel = await phone.textContent('section[aria-label="Points and bank"]').catch(() => 'none');
  await phone.screenshot({ path: `${out}/p4-final-bank.png`, fullPage: true });
  const pub = await (await fetch(`${api}/${code}`)).json();
  log('final bank', JSON.stringify(fin.me.bank), 'commitments', fin.me.commitments.map((c) => `${c.optionLabel}:${c.commitPoints}->${c.state}`).join(','));
  log('standing total', fin.standings[0].total, 'settledRiskNet', fin.standings[0].settledRiskNet, '| bank panel:', bankPanel.replace(/\s+/g, ' ').slice(0, 220));
  log('public snapshot has bank?', JSON.stringify(pub).includes('"bank"'), '| errors:', errs.length ? errs.join(' | ') : 'none');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
