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

describe('football positions, drive odds, bonus chips', () => {
  const driveProp = (state: PartyStateResponse, outcome: 'score' | 'td', bucket: string, yes: number) => {
    const s = structuredClone(state);
    const prop = s.activeProp!;
    prop.resolver = { kind: 'driveResult', driveId: 'd1', outcome } as any;
    prop.odds = { source: 'drive_odds', bucket, n: 100, p: { yes, no: 1 - yes } };
    return s;
  };

  it('shows football positions on draft cards', async () => {
    const { state } = await liveState();
    const s = structuredClone(state);
    s.draftBoard[0].ownerMemberId = undefined;
    const positions = ['QB', 'RB', 'WR', 'TE', 'K'];
    positions.forEach((pos, i) => {
      if (s.draftBoard[i]) s.draftBoard[i].player.position = pos as any;
    });
    const html = renderDraft(s);
    for (const pos of positions.slice(0, Math.min(5, s.draftBoard.length))) expect(html).toContain(`<span class="pos">${pos}</span>`);
  });

  it('renders the drive-odds line for score and td props, with the late-half variant', async () => {
    const { state } = await liveState();
    expect(renderTonight(driveProp(state, 'score', '40-49|normal', 0.36), T0, T0 + 30_000)).toContain('Drives like this score 36% of the time');
    expect(renderTonight(driveProp(state, 'td', '40-49|normal', 0.224), T0, T0 + 30_000)).toContain('Drives like this get a touchdown 22% of the time');
    expect(renderTonight(driveProp(state, 'score', '40-49|two-minute', 0.41), T0, T0 + 30_000)).toContain('Drives like this late in the half score 41% of the time');
  });

  it('shows no odds line without odds or for non-drive props', async () => {
    const { state } = await liveState();
    expect(renderTonight(state, T0, T0 + 30_000)).not.toContain('Drives like this');
    const s = driveProp(state, 'score', 'x|normal', 0.5);
    delete s.activeProp!.odds;
    expect(renderTonight(s, T0, T0 + 30_000)).not.toContain('Drives like this');
  });

  it('renders bonus chips for correct picks on the last resolved prop', async () => {
    const { state } = await liveState();
    const s = structuredClone(state);
    const prev = s.activeProp!;
    s.lastResolvedProp = { ...prev, status: 'resolved', correctOptionId: prev.options[0].id };
    const base = { propId: prev.id, memberId: 'm1', optionId: prev.options[0].id, base: 10, streak: 1, odds: 1, speed: 1, contrarian: 1, factor: 1 };
    s.picks = [
      { ...s.picks[0], propId: prev.id, memberName: 'Sam', score: { ...base, correct: true, points: 19, bonuses: ['lone_call'] } },
      { ...s.picks[0], propId: prev.id, memberName: 'Maya', score: { ...base, correct: false, points: 0, bonuses: [] } },
    ] as any;
    const html = renderTonight(s, T0, T0 + 30_000);
    expect(html).toContain('Lone call · 19 pts');
    expect(html).not.toContain('Maya</span> ');
    expect((html.match(/class="bonus"/g) ?? []).length).toBe(1);
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
