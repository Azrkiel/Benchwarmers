import type { PartyStateResponse } from '@shared/types';
import { draftingFixture } from './drafting';
import { liveFixture } from './live';
import { finalFixture } from './final';

export type FixtureName = 'drafting' | 'live' | 'final';

export const FIXTURES: Record<FixtureName, PartyStateResponse> = {
  drafting: draftingFixture,
  live: liveFixture,
  final: finalFixture,
};

export const FIXTURE_ORDER: FixtureName[] = ['drafting', 'live', 'final'];

export function isFixtureName(x: unknown): x is FixtureName {
  return typeof x === 'string' && (FIXTURE_ORDER as string[]).includes(x);
}

export { draftingFixture, liveFixture, finalFixture };
export { seasonFixture } from './season';
