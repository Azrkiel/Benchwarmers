const { chromium } = require('C:/Users/jiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out = process.argv[2]; const api = 'http://127.0.0.1:3011/api/rooms';
const post = async (u, b) => (await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })).json();
(async () => {
  const r = await post(api, { name: 'Simulator QA', gameId: 'harbor-vs-summit' }); const code = r.view.room.code;
  const seat = await post(`${api}/${code}/join`, { name: 'Maya' }); await post(`${api}/${code}/auto-lineup`, { participantToken: seat.participantToken });
  const b = await chromium.launch({ executablePath: 'C:/Users/jiang/AppData/Local/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-win64/chrome-headless-shell.exe' });
  const ctx = await b.newContext({ viewport: { width: 1536, height: 864 } });
  await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [`bw.room.${code}`, JSON.stringify({ participantToken: seat.participantToken, hostToken: r.hostToken })]);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(`http://127.0.0.1:5211/display/room/${code}?size=compact&trace=1`, { waitUntil: 'networkidle' });
  await p.waitForSelector('.trace-item'); const list = await p.textContent('.trace-item');
  await p.click('.sd-chips button:has-text("What\'s the score?")'); await p.waitForSelector('.rd-caption'); const guest = await p.textContent('.rd-caption');
  await p.screenshot({ path: `${out}/sim-compact-guest.png` });
  // Host starts by voice/text through MCP (host credential held by this browser).
  await p.fill('input[aria-label="Ask the display"]', 'start the game'); await p.click('.sd-type button:has-text("Send")');
  await p.waitForFunction(() => document.querySelector('.rd-caption')?.textContent?.includes('Tip-off'));
  await p.selectOption('.sim-speaker select', 'seat');
  let label = ''; for (let i = 0; i < 80 && !label; i++) { await p.waitForTimeout(500); const q = await (await fetch(`${api}/${code}`)).json(); if (q.question?.status === 'open') label = q.question.options[0].label; }
  await p.fill('input[aria-label="Ask the display"]', label); await p.click('.sd-type button:has-text("Send")');
  await p.waitForFunction((l) => document.querySelector('.rd-caption')?.textContent?.includes(`${l} accepted`), label, { timeout: 8000 });
  const mine = await (await fetch(`${api}/${code}`, { headers: { Authorization: `Bearer ${seat.participantToken}` } })).json();
  await p.screenshot({ path: `${out}/sim-compact-pick.png` });
  const traceText = await p.textContent('.sim-trace');
  for (const s of ['small', 'large']) { await p.click(`.sd-sizes button:has-text("${s === 'small' ? 'Small' : 'Large'}")`); await p.waitForTimeout(400); await p.screenshot({ path: `${out}/sim-${s}.png` }); }
  console.log(JSON.stringify({ code, toolsList: list.slice(0, 80), guest, picked: label, serverPick: mine.me.currentPick, tokenInTrace: traceText.includes(seat.participantToken) || traceText.includes(r.hostToken), errs }));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
