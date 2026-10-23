import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Blocked, assertGame, exists, host, roomPath, until } from './common.mjs';
import { simulatorScenario } from './simulator.mjs';

export const browserSmokeChecks = ['host-ui', 'join-lineup-ui', 'pick-ui', 'typed-assistant-ui', 'disconnect-recovery-ui', 'multi-display-ui', 'simulator-mcp-ui', 'page-errors'];
export const browserChecks = [...browserSmokeChecks, 'lost-response-ui', 'final-restart-ui'];
// CSS overrides let B adapt labels without weakening assertions or substituting fixtures.
export const defaultSelectors = {
  hostOpen: 'button:text-is("Host a party")', gameChoice: 'input[name="rm-game"][value="{game}"]',
  roomName: '#rm-room-name', create: 'button:text-is("Create party")',
  name: '#rm-name', join: 'button:text-is("Join room")', autoLineup: 'button:text-is("Auto-pick lineup")',
  hostPanel: '.rm-phone-host > summary', start: 'button:text-is("Start game")',
  option: '.rm-options button:not([disabled])', command: '#rm-command', send: '.rm-assistant button:text-is("Send")',
  displayPath: '/room/{code}/display', receipt: '.rm-receipt',
  final: '.rm-podium, [aria-label="Final standings"]',
  displayFinal: '.rd-final-score',
  homeScore: '.rd-team.is-home .rd-team-score', awayScore: '.rd-team.is-away .rd-team-score',
};
export async function browserScenario(server, game, report, options) {
  const { chromium } = await import('playwright');
  const selectors = { ...defaultSelectors, ...(options.selectors ? JSON.parse(await fs.readFile(options.selectors, 'utf8')) : {}) };
  for (const [key, value] of Object.entries(selectors)) assert.equal(typeof value, 'string', `Invalid selector ${key}`);
  assert.match(selectors.displayPath, /^\/[^?]*\{code\}[^?]*$/, 'Display must be a real route, without fixture parameters');
  const executablePath = process.env.CHROMIUM_PATH || (await exists('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  const contexts = [];
  const errors = [];
  const directory = path.join(path.dirname(report.output), `${report.data.runId}-screens`);
  await fs.mkdir(directory, { recursive: true });
  const pageFor = async viewport => {
    const context = await browser.newContext({ viewport }); contexts.push(context);
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', async response => {
      // Register credentials for redaction; never persist network payloads or browser storage.
      if (response.request().method() !== 'POST' || !response.url().includes('/api/rooms')) return;
      try { const value = await response.json(); for (const [key, token] of Object.entries(value)) if (/token$/i.test(key) && typeof token === 'string') report.secret(token); } catch {}
    });
    return page;
  };
  const snap = async (page, name) => { await page.screenshot({ path: path.join(directory, `${name}.png`), fullPage: true }); };
  const click = (page, key) => page.locator(selectors[key]).first().click();
  const post = (page, suffix) => {
    const pending = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname.endsWith(suffix));
    // A failed click may throw before the waiter is awaited; retain its rejection for the normal check without leaking an unhandled rejection.
    pending.catch(() => {}); return pending;
  };
  let room, seat;
  try {
    const phone = await pageFor({ width: 390, height: 844 });
    const second = await pageFor({ width: 360, height: 800 });
    const display = await pageFor({ width: 960, height: 480 });
    if (!await report.check('host-ui', async () => {
      await phone.goto(server.base);
      if (!await phone.locator(selectors.roomName).isVisible() && selectors.hostOpen) await click(phone, 'hostOpen');
      if (selectors.gameChoice) await phone.locator(selectors.gameChoice.replace('{game}', game)).check();
      await phone.locator(selectors.roomName).fill('C connected browser');
      const created = post(phone, '/api/rooms'); await click(phone, 'create');
      const response = await created; assert.equal(response.status(), 201);
      const result = await response.json(); report.secret(result.hostToken);
      assertGame(result.view, game);
      room = { code: result.view.room.code, hostToken: result.hostToken };
      await phone.waitForURL(`**/room/${room.code}`); await snap(phone, '01-host');
    })) return;
    if (!await report.check('join-lineup-ui', async () => {
      const joinUi = async (page, name) => {
        await page.locator(selectors.name).fill(name);
        const joined = post(page, '/join'); await click(page, 'join');
        const response = await joined; assert.equal(response.status(), 201);
        const result = await response.json(); report.secret(result.participantToken);
        const lineup = post(page, '/auto-lineup'); await click(page, 'autoLineup');
        const saved = await lineup; assert.equal(saved.status(), 200);
        const view = await saved.json(); assert.equal(view.me.lineup.flexIds.length, 4);
        assert.ok(view.me.lineup.salaryUsed <= view.rules.salaryCap);
        return result;
      };
      seat = await joinUi(phone, 'C Maya');
      await second.goto(`${server.base}/room/${room.code}`); await joinUi(second, 'C Leo');
      await display.goto(server.base + selectors.displayPath.replace('{code}', room.code));
      await snap(phone, '02-lineup'); await snap(display, '03-display-lobby');
      assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Phone horizontal overflow');
    })) return;
    if (!await report.check('pick-ui', async () => {
      if (selectors.hostPanel) await click(phone, 'hostPanel');
      const started = post(phone, '/host'); await click(phone, 'start'); assert.equal((await started).status(), 200);
      await until(async () => {
        const view = (await server.request(roomPath(room))).body;
        return view.question?.status === 'open' && view.question.remainingMs > 2000;
      }, options.timeout, 'Open browser prediction');
      const picked = post(phone, '/picks');
      await phone.locator(selectors.option).first().click();
      const result = await picked; assert.equal(result.status(), 200);
      const view = await result.json(); const snapshot = view.view ?? view;
      assert.ok(snapshot.me.currentPick); await snap(phone, '04-pick');
      await second.reload();
      await until(async () => !(await second.locator(selectors.name).count()) && (await second.locator('main').innerText()).includes('C Leo'), 15000, 'Saved second-player seat restores after reload');
    })) return;
    await report.check('typed-assistant-ui', async () => {
      await phone.locator(selectors.command).fill("what's the score?");
      const replied = post(phone, '/assistant'); await click(phone, 'send');
      const response = await replied; assert.equal(response.status(), 200);
      const result = await response.json(); assert.ok(result.reply?.length > 5);
      await phone.getByText(result.reply, { exact: true }).waitFor(); await snap(phone, '05-assistant');
      return { input: 'typed', realMicrophone: 'unrun', mcp: 'covered separately by service smoke; not claimed for this UI turn' };
    });
    await report.check('simulator-mcp-ui', () => simulatorScenario(phone, display, server, room, seat, directory));
    await report.check('disconnect-recovery-ui', async () => {
      const context = second.context(); await context.setOffline(true);
      // Enough time for the application's poll timeout and stale notice.
      try {
        await second.getByText(/reconnecting|connection interrupted|stale|last update/i).first().waitFor({ timeout: 20000 });
      } finally { await context.setOffline(false); }
      await second.reload();
      await until(async () => !(await second.locator(selectors.name).count()) && (await second.locator('main').innerText()).includes('C Leo'), 15000, 'Seat returns after reconnect');
    });
    await report.check('multi-display-ui', async () => {
      const phase = (await server.request(roomPath(room))).body.room.phase;
      if (phase === 'live') await host(server, room, 'pause');
      try {
        const expected = (await server.request(roomPath(room))).body;
        for (const viewport of [{ width: 960, height: 480 }, { width: 1280, height: 800 }, { width: 1920, height: 1080 }]) {
          await display.setViewportSize(viewport);
          await display.reload();
          await until(async () => (await display.locator('main').innerText()).includes(room.code), 15000, 'Connected display loads');
          for (const side of ['home', 'away']) await until(async () => Number(await display.locator(selectors[`${side}Score`]).first().innerText()) === expected.game[side].score, 10000, `Display ${side} score matches API`);
          assert.equal(await display.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Display horizontal overflow');
          const text = await display.locator('main').innerText();
          for (const credential of [room.hostToken, seat.participantToken]) assert.ok(!text.includes(credential), 'Display exposed a credential');
          await snap(display, `06-display-${viewport.width}`);
        }
      } finally { if (phase === 'live') await host(server, room, 'resume'); }
    });
    if (!options.smoke) {
      await report.check('lost-response-ui', async () => {
        const requests = [];
        let dropped = false;
        const pattern = `**/api/rooms/${room.code}/picks`;
        await phone.route(pattern, async route => {
          const payload = route.request().postDataJSON(); requests.push(payload);
          if (!payload.requestId) { await route.continue(); return; }
          if (!dropped) { dropped = true; await route.fetch(); await route.abort('failed'); }
          else await route.continue();
        });
        try {
          await until(async () => {
            const view = (await server.request(roomPath(room), { token: seat.participantToken })).body;
            return view.question?.status === 'open' && !view.me.currentPick && view.question.remainingMs > 3000;
          }, options.timeout, 'A fresh open question for dropped response');
          await phone.locator(selectors.option).first().click();
          await until(async () => requests.length > 0, 15000, 'UI pick request');
          if (!requests[0].requestId) throw new Blocked('UI pick has no stable requestId.');
          await until(async () => (await phone.locator(selectors.receipt).allTextContents()).some(t => /accepted|saved|locked in/i.test(t)), 20000, 'UI reconciles an accepted pick after response loss');
          assert.ok(dropped);
          for (const request of requests) assert.equal(request.requestId, requests[0].requestId);
          assert.equal((await server.request(`${roomPath(room)}/receipts/${requests[0].requestId}`, { token: seat.participantToken })).status, 200);
          await snap(phone, '07-reconciled-receipt');
        } finally { await phone.unroute(pattern); }
      });
      await report.check('final-restart-ui', async () => {
        const final = await until(async () => {
          const view = (await server.request(roomPath(room), { token: seat.participantToken })).body;
          return view.room.phase === 'final' && view;
        }, options.timeout, 'Connected final');
        await phone.locator(selectors.final).first().waitFor();
        await display.locator(selectors.displayFinal).first().waitFor();
        for (const side of ['home', 'away']) assert.equal(Number(await display.locator(selectors[`${side}Score`]).first().innerText()), final.game[side].score);
        await snap(display, '08-final-display');
        await server.stop(); await server.start(); await phone.reload(); await display.reload();
        await phone.locator(selectors.final).first().waitFor();
        await display.locator(selectors.displayFinal).first().waitFor();
        const restored = (await server.request(roomPath(room), { token: seat.participantToken })).body;
        assert.deepEqual(restored.season, final.season); assert.deepEqual(restored.standings, final.standings);
        await snap(phone, '09-final-restored');
      });
    }
    await report.check('page-errors', () => { assert.deepEqual(errors, []); return { pages: 3, screenshots: directory }; });
  } finally { await Promise.all(contexts.map(c => c.close())); await browser.close(); }
}
