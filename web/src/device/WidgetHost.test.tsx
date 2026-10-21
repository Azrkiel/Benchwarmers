import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { UiResourcePayload } from '@shared/types';
import type { CallToolResultLike, DeviceMcp } from './mcpBrowser';
import { WidgetHost, type BridgeLike } from './WidgetHost';
import { initialView, viewOf, viewToolFor } from './widgetRefresh';

afterEach(cleanup);

const HTML = '<!doctype html><html><body>board</body></html>';
const URI = 'ui://benchwarmers/board.html';

const draftResult = { content: [], structuredContent: { view: 'draft', code: 'DEMO', state: {} } };
const tonightResult = { content: [], structuredContent: { view: 'tonight', code: 'DEMO', state: {} } };

function makeUi(over: Partial<UiResourcePayload> = {}): UiResourcePayload {
  return {
    uri: URI,
    toolName: 'draft_player',
    toolInput: { code: 'DEMO', memberName: 'Maya', player: 'Ace' },
    toolResult: draftResult,
    ...over,
  };
}

function makeMcp(over: Partial<DeviceMcp> = {}) {
  const mcp: DeviceMcp & { callTool: Mock<DeviceMcp['callTool']> } = {
    callTool: vi.fn<DeviceMcp['callTool']>(async () => ({ ...draftResult })),
    readResource: vi.fn(async () => ({
      contents: [{ uri: URI, mimeType: 'text/html;profile=mcp-app', text: HTML }],
    })),
    close: vi.fn(async () => undefined),
    ...over,
  } as DeviceMcp & { callTool: Mock<DeviceMcp['callTool']> };
  return mcp;
}

function makeFakeBridge() {
  let releaseConnect!: () => void;
  const connectGate = new Promise<void>((r) => (releaseConnect = r));
  const order: string[] = [];
  const bridge = {
    connect: vi.fn(async () => {
      await connectGate;
      order.push('connected');
    }),
    sendToolInput: vi.fn(async () => undefined),
    sendToolResult: vi.fn(async () => undefined),
    teardownResource: vi.fn(async () => ({})),
    close: vi.fn(async () => undefined),
  } as unknown as BridgeLike & {
    connect: ReturnType<typeof vi.fn>;
    sendToolInput: ReturnType<typeof vi.fn>;
    sendToolResult: ReturnType<typeof vi.fn>;
    teardownResource: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  };
  return { bridge, releaseConnect, order };
}

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

async function setup(opts: {
  ui?: UiResourcePayload;
  mcp?: ReturnType<typeof makeMcp>;
  stateVersion?: number;
  initTimeoutMs?: number;
  autoConnect?: boolean;
} = {}) {
  const fake = makeFakeBridge();
  const mcp = opts.mcp ?? makeMcp();
  const onStatus = vi.fn();
  const onResult = vi.fn();
  const createBridge = vi.fn(async () => fake.bridge);
  const ui = opts.ui ?? makeUi();
  const el = (ui2: UiResourcePayload, v?: number) => (
    <WidgetHost
      uiResource={ui2}
      partyCode="DEMO"
      stateVersion={v}
      mcp={mcp}
      createBridge={createBridge}
      initTimeoutMs={opts.initTimeoutMs}
      onStatus={onStatus}
      onResult={onResult}
    />
  );
  const view = render(el(ui, opts.stateVersion));
  if (opts.autoConnect !== false) fake.releaseConnect();
  await flush();
  const iframe = () => view.container.querySelector('iframe') as HTMLIFrameElement;
  return { ...fake, mcp, onStatus, onResult, createBridge, iframe, rerender: (u: UiResourcePayload, v?: number) => view.rerender(el(u, v)), ui };
}

async function initialize(h: Awaited<ReturnType<typeof setup>>) {
  await act(async () => {
    h.bridge.oninitialized!();
  });
  await flush();
}

describe('WidgetHost', () => {
  it('reads the resource and sets a sandboxed srcdoc only after connect', async () => {
    const h = await setup({ autoConnect: false });
    expect(h.mcp.readResource).toHaveBeenCalledWith(URI);
    expect(h.iframe().getAttribute('sandbox')).toBe('allow-scripts');
    expect(h.bridge.connect).toHaveBeenCalled();
    expect(h.iframe().getAttribute('srcdoc')).toBeNull();
    h.releaseConnect();
    await flush();
    expect(h.iframe().srcdoc).toBe(HTML);
    expect(h.onStatus).toHaveBeenCalledWith('loading');
  });

  it('sends nothing before initialized, then input and result', async () => {
    const h = await setup();
    expect(h.bridge.sendToolInput).not.toHaveBeenCalled();
    expect(h.bridge.sendToolResult).not.toHaveBeenCalled();
    await initialize(h);
    expect(h.bridge.sendToolInput).toHaveBeenCalledWith({ arguments: h.ui.toolInput });
    expect(h.bridge.sendToolResult).toHaveBeenCalledWith(h.ui.toolResult);
    expect(h.onStatus).toHaveBeenCalledWith('ready');
  });

  it('falls back to a blob when the resource has no text', async () => {
    const mcp = makeMcp({
      readResource: vi.fn(async () => ({
        contents: [{ uri: URI, mimeType: 'text/html;profile=mcp-app', blob: btoa(HTML) }],
      })),
    });
    const h = await setup({ mcp });
    expect(h.iframe().srcdoc).toBe(HTML);
  });

  it('forwards widget tool calls and maps errors to isError results', async () => {
    const h = await setup();
    const res = await h.bridge.oncalltool!({ name: 'get_leaderboard', arguments: { code: 'DEMO' } });
    expect(h.mcp.callTool).toHaveBeenCalledWith('get_leaderboard', { code: 'DEMO' });
    expect(res).toEqual(draftResult);
    expect(h.onResult).toHaveBeenCalledWith(draftResult.structuredContent);

    h.mcp.callTool.mockRejectedValueOnce(new Error('boom'));
    const bad = await h.bridge.oncalltool!({ name: 'x' });
    expect(h.mcp.callTool).toHaveBeenLastCalledWith('x', {});
    expect(bad).toEqual({ isError: true, content: [{ type: 'text', text: 'boom' }] });
  });

  it('clamps size changes', async () => {
    const h = await setup();
    h.bridge.onsizechange!({ height: 5000 });
    expect(h.iframe().style.height).toBe('1200px');
    h.bridge.onsizechange!({ height: 10 });
    expect(h.iframe().style.height).toBe('260px');
  });

  it('refreshes via the read-only view tool when stateVersion changes', async () => {
    const h = await setup({ stateVersion: 1 });
    await initialize(h);
    h.bridge.sendToolResult.mockClear();
    const fresh = { content: [], structuredContent: { view: 'draft', code: 'DEMO', state: { v: 2 } } };
    h.mcp.callTool.mockResolvedValueOnce(fresh);
    h.rerender(h.ui, 2);
    await flush();
    expect(h.mcp.callTool).toHaveBeenCalledWith('list_available_players', { code: 'DEMO' });
    expect(h.mcp.callTool).not.toHaveBeenCalledWith('draft_player', expect.anything());
    expect(h.bridge.sendToolResult).toHaveBeenCalledWith(fresh);
    expect(h.onResult).toHaveBeenCalledWith(fresh.structuredContent);
  });

  it('uses the view of the widget\'s own last call for the next refresh', async () => {
    const h = await setup({ stateVersion: 1 });
    await initialize(h);
    h.mcp.callTool.mockResolvedValueOnce(tonightResult);
    await h.bridge.oncalltool!({ name: 'make_pick', arguments: {} });
    h.mcp.callTool.mockResolvedValueOnce(tonightResult);
    h.rerender(h.ui, 2);
    await flush();
    expect(h.mcp.callTool).toHaveBeenLastCalledWith('get_leaderboard', { code: 'DEMO' });
  });

  it('runs at most one refresh at a time and one follow-up', async () => {
    const h = await setup({ stateVersion: 1 });
    await initialize(h);
    let release!: (r: CallToolResultLike) => void;
    h.mcp.callTool.mockImplementationOnce(() => new Promise((r) => (release = r)));
    h.rerender(h.ui, 2);
    await flush();
    h.rerender(h.ui, 3);
    h.rerender(h.ui, 4);
    await flush();
    expect(h.mcp.callTool).toHaveBeenCalledTimes(1);
    await act(async () => release(draftResult));
    await flush();
    expect(h.mcp.callTool).toHaveBeenCalledTimes(2);
  });

  it('reports error when readResource rejects', async () => {
    const mcp = makeMcp({ readResource: vi.fn(async () => { throw new Error('nope'); }) });
    const h = await setup({ mcp });
    expect(h.onStatus).toHaveBeenCalledWith('error', 'nope');
    expect(h.iframe().getAttribute('srcdoc')).toBeNull();
  });

  it('reports error when the widget never initializes', async () => {
    const h = await setup({ initTimeoutMs: 20 });
    await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
    expect(h.onStatus).toHaveBeenCalledWith('error', expect.stringContaining('did not initialize'));
  });

  it('reports error when connect throws', async () => {
    const fake = makeFakeBridge();
    fake.bridge.connect.mockRejectedValue(new Error('conn'));
    const onStatus = vi.fn();
    render(<WidgetHost uiResource={makeUi()} mcp={makeMcp()} createBridge={async () => fake.bridge} onStatus={onStatus} />);
    await flush();
    expect(onStatus).toHaveBeenCalledWith('error', 'conn');
  });

  it('same-uri new payload pushes without reloading', async () => {
    const h = await setup();
    await initialize(h);
    h.bridge.sendToolResult.mockClear();
    const next = makeUi({ toolName: 'get_leaderboard', toolInput: { code: 'DEMO' }, toolResult: tonightResult });
    h.rerender(next);
    await flush();
    expect(h.mcp.readResource).toHaveBeenCalledTimes(1);
    expect(h.createBridge).toHaveBeenCalledTimes(1);
    expect(h.bridge.sendToolInput).toHaveBeenLastCalledWith({ arguments: { code: 'DEMO' } });
    expect(h.bridge.sendToolResult).toHaveBeenCalledWith(tonightResult);
  });

  it('tears down on unmount', async () => {
    const h = await setup();
    await initialize(h);
    cleanup();
    await flush();
    expect(h.bridge.teardownResource).toHaveBeenCalled();
    expect(h.bridge.close).toHaveBeenCalled();
  });
});

describe('widgetRefresh', () => {
  it('viewOf reads structuredContent.view', () => {
    expect(viewOf(draftResult)).toBe('draft');
    expect(viewOf(tonightResult)).toBe('tonight');
    expect(viewOf({ structuredContent: { view: 'season', season: {} } })).toBe('season');
    expect(viewOf({ structuredContent: { view: 'bogus' } })).toBeUndefined();
    expect(viewOf({})).toBeUndefined();
    expect(viewOf(null)).toBeUndefined();
    expect(viewOf('x')).toBeUndefined();
  });

  it('viewToolFor maps views to read-only tools', () => {
    expect(viewToolFor('draft', 'DEMO')).toEqual({ name: 'list_available_players', args: { code: 'DEMO' } });
    expect(viewToolFor('tonight', 'DEMO')).toEqual({ name: 'get_leaderboard', args: { code: 'DEMO' } });
    expect(viewToolFor('season', 'DEMO')).toEqual({ name: 'get_season_standings', args: {} });
    expect(viewToolFor('draft')).toEqual({ name: 'list_available_players', args: {} });
    expect('code' in viewToolFor('tonight').args).toBe(false);
  });

  it('initialView prefers the result, then the tool name', () => {
    expect(initialView(makeUi({ toolResult: tonightResult }))).toBe('tonight');
    const byName = (toolName: string) => initialView(makeUi({ toolName, toolResult: null }));
    expect(byName('draft_player')).toBe('draft');
    expect(byName('list_available_players')).toBe('draft');
    expect(byName('make_pick')).toBe('tonight');
    expect(byName('get_leaderboard')).toBe('tonight');
    expect(byName('get_season_standings')).toBe('season');
    expect(byName('other')).toBeUndefined();
  });
});
