import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { PartyStateResponse } from '@shared/types';
import { draftingFixture, finalFixture, liveFixture, seasonFixture } from '../lib/fixtures';
import { FallbackCard } from './FallbackCard';
import { mergeModel, modelFromState, modelFromStructured } from './fallbackModel';

afterEach(cleanup);

const withVersion = (s: PartyStateResponse, version: number): PartyStateResponse => ({ ...s, version });

describe('modelFromStructured', () => {
  it('accepts each view', () => {
    const d = modelFromStructured({ view: 'draft', code: 'DEMO', state: draftingFixture });
    expect(d).toMatchObject({ view: 'draft', code: 'DEMO' });
    expect(d?.state).toBe(draftingFixture);
    expect(modelFromStructured({ view: 'tonight', code: 'DEMO', state: liveFixture })?.view).toBe('tonight');
    const s = modelFromStructured({ view: 'season', season: seasonFixture });
    expect(s).toEqual({ view: 'season', season: seasonFixture });
  });

  it('rejects garbage and errors', () => {
    expect(modelFromStructured(undefined)).toBeUndefined();
    expect(modelFromStructured({})).toBeUndefined();
    expect(modelFromStructured({ error: 'nope' })).toBeUndefined();
    expect(modelFromStructured({ view: 'bogus', state: draftingFixture })).toBeUndefined();
    expect(modelFromStructured({ view: 'draft', code: 'X' })).toBeUndefined();
    expect(modelFromStructured({ view: 'draft', state: { draftBoard: 'x' } })).toBeUndefined();
    expect(modelFromStructured({ view: 'season', season: { rows: 3 } })).toBeUndefined();
    expect(modelFromStructured({ view: 'season', state: draftingFixture })).toBeUndefined();
  });
});

describe('modelFromState', () => {
  it('maps status to view', () => {
    expect(modelFromState(undefined)).toBeUndefined();
    expect(modelFromState(draftingFixture)?.view).toBe('draft');
    const scheduled = { ...draftingFixture, party: { ...draftingFixture.party, status: 'scheduled' as const } };
    expect(modelFromState(scheduled)?.view).toBe('draft');
    expect(modelFromState(liveFixture)?.view).toBe('tonight');
    expect(modelFromState(finalFixture)?.view).toBe('tonight');
  });
});

describe('mergeModel', () => {
  const structured = modelFromStructured({ view: 'draft', code: draftingFixture.party.code, state: draftingFixture });

  it('prefers a newer polled state for the same party', () => {
    const newer = withVersion(draftingFixture, draftingFixture.version + 1);
    const merged = mergeModel(structured, modelFromState(newer));
    expect(merged?.view).toBe('draft');
    expect(merged?.state).toBe(newer);
  });

  it('keeps structured when polled state is older or a different party', () => {
    const older = withVersion(draftingFixture, draftingFixture.version - 1);
    expect(mergeModel(structured, modelFromState(older))).toBe(structured);
    const other = { ...draftingFixture, version: 99, party: { ...draftingFixture.party, code: 'ZZZZ' } };
    expect(mergeModel(structured, modelFromState(other))).toBe(structured);
  });

  it('keeps season and falls back to whichever exists', () => {
    const season = modelFromStructured({ view: 'season', season: seasonFixture });
    expect(mergeModel(season, modelFromState(liveFixture))).toBe(season);
    const polled = modelFromState(liveFixture);
    expect(mergeModel(undefined, polled)).toBe(polled);
    expect(mergeModel(structured, undefined)).toBe(structured);
    expect(mergeModel(undefined, undefined)).toBeUndefined();
  });
});

describe('FallbackCard', () => {
  it('shows an empty-state hint without a model', () => {
    render(<FallbackCard model={undefined} />);
    expect(screen.getByText(/who's available\?/)).toBeTruthy();
    expect(screen.getByLabelText('Party board')).toBeTruthy();
  });

  it('renders the draft board with owners and top available', () => {
    render(<FallbackCard model={modelFromState(draftingFixture)} />);
    const root = screen.getByLabelText('Party board');
    expect(root.getAttribute('data-view')).toBe('draft');
    const row = screen.getByTestId('drafted-har-sg-7');
    expect(row.textContent).toContain('Tommy Okafor');
    expect(row.textContent).toContain('R1');
    expect(row.getAttribute('aria-label')).toContain('Maya');
    expect(screen.getAllByRole('heading', { name: 'Maya' }).length).toBe(1);
    expect(screen.getByText('Top available')).toBeTruthy();
    const items = within(screen.getByTestId('top-available')).getAllByRole('listitem');
    expect(items.length).toBeGreaterThan(0);
    expect(items.length).toBeLessThanOrEqual(8);
    const drafted = new Set(draftingFixture.draftBoard.filter((e) => e.ownerMemberId).map((e) => e.player.name));
    for (const li of items) expect([...drafted].some((n) => li.textContent?.includes(n))).toBe(false);
  });

  it('renders tonight standings and highlights the household', () => {
    const { container } = render(<FallbackCard model={modelFromState(liveFixture)} householdId="garcias" />);
    expect(screen.getByLabelText('Party board').getAttribute('data-view')).toBe('tonight');
    for (const r of liveFixture.standings) expect(screen.getAllByText(r.name).length).toBeGreaterThan(0);
    expect(container.querySelectorAll('tr.fb-mine').length).toBe(
      liveFixture.standings.filter((r) => r.householdId === 'garcias').length,
    );
  });

  it('renders season rows', () => {
    render(<FallbackCard model={modelFromStructured({ view: 'season', season: seasonFixture })} />);
    expect(screen.getByLabelText('Party board').getAttribute('data-view')).toBe('season');
    for (const r of seasonFixture.rows) expect(screen.getAllByText(r.name).length).toBeGreaterThan(0);
  });
});
