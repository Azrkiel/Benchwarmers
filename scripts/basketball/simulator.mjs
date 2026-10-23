import assert from 'node:assert/strict';
import path from 'node:path';

// Uses the real phone's context, including the seat it obtained from the UI. No credential injection.
export async function simulatorScenario(phone, display, server, room, seat, directory) {
  const guest = await display.context().newPage();
  const actor = await phone.context().newPage();
  const calls = [];
  const errors = [];
  for (const page of [guest, actor]) page.on('pageerror', error => errors.push(error.message));
  const observe = page => page.on('request', request => {
    if (request.method() !== 'POST' || !request.url().includes('/api/mcp-widget')) return;
    const payload = request.postDataJSON();
    calls.push({ method: payload.method, name: payload.params?.name, actor: page === actor ? 'seat' : 'guest' });
  });
  observe(guest); observe(actor);
  try {
    for (const page of [guest, actor]) {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(`${server.base}/display/room/${room.code}?trace=1`);
      await page.locator('[data-testid="trace-item"]:has(.trace-name:text-is("tools/list")) .trace-ok.is-ok').waitFor();
      assert.match(await page.locator('.sd-label').innerText(), /Simulated smart display/i);
      assert.equal(await page.locator('.sd-root').getAttribute('data-size'), 'compact');
      assert.equal(await page.getByTestId('sim-screen').evaluate(el => el.style.width), '960px');
    }
    await guest.getByRole('textbox', { name: 'Ask the display' }).fill("What's the score?");
    await guest.locator('.sd-type button:text-is("Send")').click();
    await guest.locator('[data-testid="trace-item"]:has(.trace-name:text-is("room_ask")) .trace-ok.is-ok').waitFor();
    const guestTrace = await guest.getByTestId('trace-list').innerText();
    assert.match(guestTrace, /"actor":"guest"/);
    await actor.getByLabel('Speaking as').selectOption('seat');
    await actor.getByRole('textbox', { name: 'Ask the display' }).fill("What's my rank?");
    await actor.locator('.sd-type button:text-is("Send")').click();
    await actor.locator('[data-testid="trace-item"]:has(.trace-name:text-is("room_ask")) .trace-ok.is-ok').waitFor();
    const actorTrace = await actor.getByTestId('trace-list').innerText();
    assert.match(actorTrace, /C Maya/); assert.match(actorTrace, /seat: C Maya/);
    for (const trace of [guestTrace, actorTrace]) for (const credential of [room.hostToken, seat.participantToken]) assert.ok(!trace.includes(credential), 'Visible simulator trace exposed a credential');
    assert.ok(calls.some(c => c.method === 'tools/list'));
    for (const role of ['guest', 'seat']) assert.ok(calls.some(c => c.method === 'tools/call' && c.name === 'room_ask' && c.actor === role));
    assert.deepEqual(errors, [], 'Simulator JavaScript exceptions');
    await actor.screenshot({ path: path.join(directory, 'simulator-mcp-seat.png'), fullPage: true });
    return { transport: 'actual same-origin Streamable HTTP', input: 'typed', roles: ['guest', 'saved seat'], calls, realMicrophone: 'unrun', physicalAlexa: 'out of scope' };
  } finally { await guest.close(); await actor.close(); }
}
