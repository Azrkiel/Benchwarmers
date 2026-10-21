import { useEffect, useRef, useState } from 'react';
import type { UiResourcePayload } from '@shared/types';
import { getDeviceMcp, type CallToolResultLike, type DeviceMcp } from './mcpBrowser';
import { initialView, viewOf, viewToolFor, type WidgetView } from './widgetRefresh';
import './widget.css';

const MCP_APP_MIME = 'text/html;profile=mcp-app';
const SEASON_MIN_INTERVAL_MS = 10_000;

export type WidgetStatus = 'loading' | 'ready' | 'error';

export interface BridgeLike {
  oncalltool?: (
    params: { name: string; arguments?: Record<string, unknown> },
    extra?: unknown,
  ) => Promise<CallToolResultLike>;
  onreadresource?: (params: { uri: string }, extra?: unknown) => Promise<unknown>;
  onopenlink?: (params: { url: string }, extra?: unknown) => Promise<Record<string, unknown>>;
  onmessage?: (params: unknown, extra?: unknown) => Promise<Record<string, unknown>>;
  onsizechange?: (params: { width?: number; height?: number }) => void;
  oninitialized?: () => void;
  onloggingmessage?: (params: unknown) => void;
  connect(): Promise<void>;
  sendToolInput(params: { arguments: Record<string, unknown> }): Promise<void> | void;
  sendToolResult(result: unknown): Promise<void> | void;
  teardownResource(params: Record<string, never>): Promise<unknown>;
  close(): Promise<void> | void;
}

export type BridgeFactory = (iframe: HTMLIFrameElement) => Promise<BridgeLike>;

const HANDLER_KEYS = [
  'oncalltool',
  'onreadresource',
  'onopenlink',
  'onmessage',
  'onsizechange',
  'oninitialized',
  'onloggingmessage',
] as const;

export const defaultBridgeFactory: BridgeFactory = async (iframe) => {
  // Dynamic import: code-splits the bridge and keeps it out of unit tests.
  const { AppBridge, PostMessageTransport } = await import('@modelcontextprotocol/ext-apps/app-bridge');
  const bridge = new AppBridge(
    null,
    { name: 'Benchwarmers Device', version: '0.1.0' },
    { openLinks: {}, serverTools: {}, serverResources: {}, logging: {} },
    {
      hostContext: {
        theme: 'dark',
        platform: 'web',
        displayMode: 'inline',
        availableDisplayModes: ['inline'],
        containerDimensions: { maxHeight: 6000 },
      },
    },
  );
  const raw = bridge as unknown as Record<string, unknown>;
  const adapter = {
    connect: () => {
      const win = iframe.contentWindow!;
      return bridge.connect(new PostMessageTransport(win, win));
    },
    sendToolInput: (p: { arguments: Record<string, unknown> }) => bridge.sendToolInput(p),
    sendToolResult: (r: unknown) => bridge.sendToolResult(r as Parameters<typeof bridge.sendToolResult>[0]),
    teardownResource: (p: Record<string, never>) => bridge.teardownResource(p),
    close: () => bridge.close(),
  } as BridgeLike;
  for (const key of HANDLER_KEYS) {
    Object.defineProperty(adapter, key, {
      set(v: unknown) {
        raw[key] = v;
      },
      get() {
        return raw[key];
      },
      enumerable: true,
    });
  }
  return adapter;
};

export interface WidgetHostProps {
  uiResource: UiResourcePayload;
  partyCode?: string;
  stateVersion?: number;
  mcp?: DeviceMcp;
  createBridge?: BridgeFactory;
  initTimeoutMs?: number;
  onStatus?: (s: WidgetStatus, detail?: string) => void;
  onResult?: (structuredContent: Record<string, unknown>) => void;
}

type Session = {
  bridge?: BridgeLike;
  cancelled: boolean;
  initialized: boolean;
  view?: WidgetView;
  sentUi?: UiResourcePayload;
  dirty: boolean;
  refreshing: boolean;
  again: boolean;
  lastSeasonAt: number;
  timers: Set<ReturnType<typeof setTimeout>>;
  seasonTimer?: ReturnType<typeof setTimeout>;
};

function pickHtml(res: { contents: { mimeType?: string; text?: string; blob?: string }[] }): string {
  const items = res.contents ?? [];
  const item = items.find((c) => c.mimeType === MCP_APP_MIME) ?? items.find((c) => typeof c.text === 'string');
  if (!item) throw new Error('widget resource has no content');
  if (typeof item.text === 'string') return item.text;
  if (typeof item.blob === 'string') {
    const bin = atob(item.blob);
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  throw new Error('widget resource has no text or blob');
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function WidgetHost(props: WidgetHostProps) {
  const { uiResource, stateVersion } = props;
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [failed, setFailed] = useState(false);

  // Latest props for async callbacks; the load effect only re-runs on uri change.
  const latest = useRef(props);
  latest.current = props;
  const sessionRef = useRef<Session | undefined>(undefined);
  const lastVersion = useRef<number | undefined>(stateVersion);

  function runRefresh(s: Session) {
    if (s.cancelled || !s.initialized) return;
    if (s.refreshing) {
      s.again = true;
      return;
    }
    const first = s.view ?? initialView(latest.current.uiResource);
    if (!first) return;
    if (first === 'season') {
      const wait = s.lastSeasonAt + SEASON_MIN_INTERVAL_MS - Date.now();
      if (wait > 0) {
        if (!s.seasonTimer) {
          s.seasonTimer = setTimeout(() => {
            s.seasonTimer = undefined;
            runRefresh(s);
          }, wait);
        }
        return;
      }
    }
    s.refreshing = true;
    void (async () => {
      try {
        let view: WidgetView = first;
        do {
          s.again = false;
          const { name, args } = viewToolFor(view, latest.current.partyCode);
          if (view === 'season') s.lastSeasonAt = Date.now();
          const mcp = latest.current.mcp ?? getDeviceMcp();
          const result = await mcp.callTool(name, args);
          if (s.cancelled) return;
          const v = viewOf(result);
          if (v) s.view = v;
          await s.bridge?.sendToolResult(result);
          if (s.cancelled) return;
          if (result.structuredContent) latest.current.onResult?.(result.structuredContent);
          view = s.view ?? view;
          if (s.again && view === 'season') {
            // Season refreshes are throttled: reschedule instead of looping.
            s.again = false;
            s.refreshing = false;
            runRefresh(s);
            return;
          }
        } while (s.again && !s.cancelled);
      } catch (e) {
        console.debug('[WidgetHost] refresh failed', errMsg(e));
      } finally {
        s.refreshing = false;
      }
    })();
  }

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const s: Session = {
      cancelled: false,
      initialized: false,
      dirty: false,
      refreshing: false,
      again: false,
      lastSeasonAt: 0,
      timers: new Set(),
    };
    sessionRef.current = s;
    setFailed(false);
    const status = (st: WidgetStatus, detail?: string) => {
      if (s.cancelled) return;
      if (detail === undefined) latest.current.onStatus?.(st);
      else latest.current.onStatus?.(st, detail);
    };
    const fail = (e: unknown) => {
      if (s.cancelled) return;
      setFailed(true);
      status('error', errMsg(e));
    };
    status('loading');

    void (async () => {
      try {
        const mcp = latest.current.mcp ?? getDeviceMcp();
        const res = await mcp.readResource(latest.current.uiResource.uri);
        if (s.cancelled) return;
        const html = pickHtml(res);
        const createBridge = latest.current.createBridge ?? defaultBridgeFactory;
        const bridge = await createBridge(iframe);
        s.bridge = bridge;
        if (s.cancelled) return;

        bridge.oncalltool = async (params) => {
          const m = latest.current.mcp ?? getDeviceMcp();
          try {
            const result = await m.callTool(params.name, params.arguments ?? {});
            if (!s.cancelled) {
              const v = viewOf(result);
              if (v) s.view = v;
              if (result.structuredContent) latest.current.onResult?.(result.structuredContent);
            }
            return result;
          } catch (e) {
            return { isError: true, content: [{ type: 'text', text: errMsg(e) }] };
          }
        };
        bridge.onreadresource = async ({ uri }) => (latest.current.mcp ?? getDeviceMcp()).readResource(uri);
        bridge.onopenlink = async ({ url }) => {
          window.open(url, '_blank', 'noopener,noreferrer');
          return {};
        };
        bridge.onmessage = async () => ({});
        bridge.onsizechange = ({ height }) => {
          if (typeof height === 'number' && Number.isFinite(height)) {
            iframe.style.height = `${Math.min(1200, Math.max(260, Math.round(height)))}px`;
          }
        };
        bridge.onloggingmessage = (p) => console.debug('[widget]', p);
        bridge.oninitialized = () => {
          if (s.cancelled || s.initialized) return;
          s.initialized = true;
          for (const t of s.timers) clearTimeout(t);
          s.timers.clear();
          const ui = latest.current.uiResource;
          s.sentUi = ui;
          s.view = initialView(ui);
          void (async () => {
            try {
              await bridge.sendToolInput({ arguments: ui.toolInput });
              await bridge.sendToolResult(ui.toolResult);
              status('ready');
              if (s.dirty) {
                s.dirty = false;
                runRefresh(s);
              }
            } catch (e) {
              fail(e);
            }
          })();
        };

        await bridge.connect();
        if (s.cancelled) return;
        // Sandbox: allow-scripts WITHOUT allow-same-origin -> the widget gets an opaque
        // origin and cannot touch the host page or its storage. The ext-apps spec wants a
        // separate-origin sandbox proxy for web hosts; we use a single opaque-origin srcdoc
        // iframe because this page is cross-origin isolated (COOP same-origin + COEP
        // credentialless for voice-ID threaded WASM) and a cross-origin proxy without
        // CORP/COEP headers would be blocked. Acceptable for this demo host.
        iframe.srcdoc = html;
        const timeoutMs = latest.current.initTimeoutMs ?? 8000;
        const t = setTimeout(() => {
          s.timers.delete(t);
          if (!s.initialized) fail(new Error(`widget did not initialize within ${timeoutMs}ms`));
        }, timeoutMs);
        s.timers.add(t);
      } catch (e) {
        fail(e);
      }
    })();

    return () => {
      s.cancelled = true;
      for (const t of s.timers) clearTimeout(t);
      s.timers.clear();
      if (s.seasonTimer) clearTimeout(s.seasonTimer);
      if (sessionRef.current === s) sessionRef.current = undefined;
      const bridge = s.bridge;
      if (bridge) {
        void (async () => {
          try {
            await Promise.race([
              Promise.resolve(bridge.teardownResource({})).catch(() => undefined),
              new Promise((r) => setTimeout(r, 500)),
            ]);
          } catch {
            /* ignore */
          }
          try {
            await bridge.close();
          } catch {
            /* ignore */
          }
        })();
      }
    };
  }, [uiResource.uri]);

  // Same uri, new payload: push into the live widget without reloading.
  useEffect(() => {
    const s = sessionRef.current;
    if (!s || !s.initialized || s.cancelled || s.sentUi === uiResource) return;
    s.sentUi = uiResource;
    s.view = initialView(uiResource);
    const bridge = s.bridge;
    void (async () => {
      try {
        await bridge?.sendToolInput({ arguments: uiResource.toolInput });
        await bridge?.sendToolResult(uiResource.toolResult);
      } catch (e) {
        console.debug('[WidgetHost] push failed', errMsg(e));
      }
    })();
  }, [uiResource]);

  // Live refresh on party state change.
  useEffect(() => {
    if (lastVersion.current === stateVersion) return;
    lastVersion.current = stateVersion;
    const s = sessionRef.current;
    if (!s || s.cancelled) return;
    if (!s.initialized) {
      s.dirty = true;
      return;
    }
    runRefresh(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateVersion]);

  return (
    <iframe ref={iframeRef} className="widget-frame" title="Party board" sandbox="allow-scripts" hidden={failed} />
  );
}
