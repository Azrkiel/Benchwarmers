import type { UiResourcePayload } from '@shared/types';

export type WidgetView = 'draft' | 'tonight' | 'season';

const VIEWS: readonly string[] = ['draft', 'tonight', 'season'];

function structuredOf(result: unknown): Record<string, unknown> | undefined {
  if (!result || typeof result !== 'object') return undefined;
  const sc = (result as { structuredContent?: unknown }).structuredContent;
  return sc && typeof sc === 'object' ? (sc as Record<string, unknown>) : undefined;
}

export function viewOf(result: unknown): WidgetView | undefined {
  const v = structuredOf(result)?.view;
  return typeof v === 'string' && VIEWS.includes(v) ? (v as WidgetView) : undefined;
}

/** Read-only tool used to re-fetch a view. Never a mutating tool. */
export function viewToolFor(
  view: WidgetView,
  code?: string,
): { name: string; args: Record<string, unknown> } {
  const args: Record<string, unknown> = code === undefined ? {} : { code };
  switch (view) {
    case 'draft':
      return { name: 'list_available_players', args };
    case 'tonight':
      return { name: 'get_leaderboard', args };
    case 'season':
      return { name: 'get_season_standings', args: {} };
  }
}

export function initialView(ui: UiResourcePayload): WidgetView | undefined {
  const fromResult = viewOf(ui.toolResult);
  if (fromResult) return fromResult;
  switch (ui.toolName) {
    case 'draft_player':
    case 'list_available_players':
      return 'draft';
    case 'make_pick':
    case 'get_leaderboard':
      return 'tonight';
    case 'get_season_standings':
      return 'season';
    default:
      return undefined;
  }
}
