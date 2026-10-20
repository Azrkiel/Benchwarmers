import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import type { McpServer } from '@modelcontextprotocol/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Store } from '../../src/game/store.js';
import { BOARD_URI, createServer } from '../../src/mcp/server.js';
import { escapeHtml, formatCountdown, readableText, renderApp, renderDraft, renderSeason, renderTonight } from '../../src/mcp/widget/src/render.js';
import type { PartyStateResponse, SeasonResponse } from '../../src/shared/types.js';

type ToolResult = { isError?: boolean; content: { type: string; text?: string }[]; structuredContent?: Record<string, any> };

const T0 = 1_000_000;
let dir: string;
let t: number;
let store: Store;
let server: McpServer;
let client: Client;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-widget-'));
  t = T0;
  store = new Store({ dataFile: path.join(dir, 'store.json'), now: () => t, speed: 4 });
  server = createServer(store);
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st);
  client = new Client({ name: 'widget-test', version: '1.0.0' });
  await client.connect(ct);
});

afterEach(async () => {
  await client.close();
  await server.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const call = async (name: string, args: Record<string, unknown> = {}) => (await client.callTool({ name, arguments: args })) as unknown as ToolResult;

async function liveState(): Promise<{ code: string; state: PartyStateResponse }> {
  const setup = await call('setup_watch_party', { crewName: 'Sunday Crew' });
  const code = setup.structuredContent!.code as string;
  await call('draft_player', { code, memberName: 'Maya', player: 'Big Mo' });
  await call('draft_player', { code, memberName: 'Sam', player: 'Splash' });
  await call('start_watch_party', { code });
  await call('make_pick', { code, memberName: 'Sam', choice: 'Hawks' });
  const res = await call('get_leaderboard', { code });
  return { code, state: res.structuredContent!.state as PartyStateResponse };
}

describe('render helpers', () => {
  it('escapeHtml escapes markup', () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(escapeHtml("a & b's")).toBe('a &amp; b&#39;s');
  });

  it('picks readable text colors and formats countdowns', () => {
    expect(readableText('#ffffff')).toBe('#111111');
    expect(readableText('#000000')).toBe('#ffffff');
    expect(formatCountdown(0)).toBe('Locked');
    expect(formatCountdown(65_000)).toBe('1:05');
  });
});

describe('widget views from real state', () => {
  it('draft board lists available players with Draft buttons and taken players with owner + household color', async () => {
    const code = (await call('setup_watch_party', { crewName: 'Sunday Crew' })).structuredContent!.code as string;
    await call('draft_player', { code, memberName: 'Maya', player: 'Big Mo' });
    const state = (await call('list_available_players', { code })).structuredContent!.state as PartyStateResponse;
    const html = renderDraft(state, 'Maya');
    const open = state.draftBoard.find((d) => !d.ownerMemberId)!.player.id;
    expect(html).toContain(`data-action="draft" data-player="${open}"`);
    expect(html).not.toContain('data-player="har-c-34"');
    const maya = state.households.find((h) => h.members.some((m) => m.name === 'Maya'))!;
    expect(html).toContain(`Maya · ${maya.name}`);
    expect(html).toContain(`background:${maya.color}`);
    expect(html).toContain('Big Mo');
    expect(html).toContain('1/3');
    expect(html).toContain('Harbor');
    expect(html).toContain('Summit');
  });

  it('tonight shows the question, option buttons, picks, and standings with badges and flames', async () => {
    const { state } = await liveState();
    const prop = state.activeProp!;
    const html = renderTonight(state, T0, T0 + 30_000);
    expect(html).toContain(escapeHtml(prop.question));
    for (const o of prop.options) expect(html).toContain(`data-action="pick" data-prop="${prop.id}" data-option="${o.id}"`);
    expect(html).toContain('0:30');
    expect(html).toContain('Sam: Hawks');
    expect(html).toContain('class="badge"');
    expect(html).toContain('draft ');
    expect(html).not.toContain('🔥');
    // a streak shows flames capped at 3 plus the number
    const hot = structuredClone(state);
    hot.standings[0].streak = 5;
    expect(renderTonight(hot, T0, T0 + 30_000)).toContain('🔥🔥🔥5');
    // after lock time the buttons are disabled
    expect(renderTonight(state, T0 + 31_000, T0 + 30_000)).toContain('Locked');
  });

  it('season shows all four seeded members', async () => {
    const res = await call('get_season_standings', {});
    const season = res.structuredContent!.season as SeasonResponse;
    const html = renderSeason(season);
    for (const n of ['Maya', 'Leo', 'Sam', 'Priya']) expect(html).toContain(n);
    expect(html).toContain('best streak');
    expect(html).toContain('nights won');
  });

  it('renders the whole app with tabs and the free-to-play footer, without Alexa/Amazon names', async () => {
    const { state, code } = await liveState();
    const html = renderApp({ view: 'tonight', code, state, now: T0, lockAt: T0 + 5000 });
    expect(html).toContain(code);
    for (const v of ['draft', 'tonight', 'season']) expect(html).toContain(`data-action="tab" data-view="${v}"`);
    expect(html).toContain('Free to play. No real money.');
    expect(html).not.toMatch(/alexa|amazon/i);
  });

  it('escapes hostile household and member names', async () => {
    const { state } = await liveState();
    const evil = structuredClone(state);
    const bad = '<img src=x onerror=alert(1)>';
    evil.households[0].name = bad;
    evil.households[0].color = 'red;background:url(x)';
    evil.households[0].members[0].name = bad;
    for (const d of evil.draftBoard) if (d.ownerMemberId) d.ownerName = bad;
    for (const s of evil.standings) {
      s.name = bad;
      s.household = bad;
    }
    const html = renderApp({ view: 'tonight', state: evil, now: T0 }) + renderDraft(evil, bad);
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('url(x)');
  });
});

describe('built widget bundle', () => {
  const dist = new URL('../../src/mcp/widget/dist/benchwarmers.html', import.meta.url);
  const built = fs.existsSync(dist);

  it.skipIf(!built)('is a single self-contained file', () => {
    const html = fs.readFileSync(dist, 'utf8');
    expect(html).not.toMatch(/<script[^>]*\ssrc=/i);
    expect(html).not.toMatch(/<link[^>]*rel=["']stylesheet["'][^>]*href=/i);
    expect(html).toContain('Free to play. No real money.');
  });

  it.skipIf(!built)('is what the MCP resource read returns', async () => {
    const res = await client.readResource({ uri: BOARD_URI });
    const first = res.contents[0] as { text?: string };
    expect(first.text).toBe(fs.readFileSync(dist, 'utf8'));
  });
});
