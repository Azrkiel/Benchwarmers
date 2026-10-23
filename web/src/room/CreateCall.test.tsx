import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { RoomRequestError } from './api';
import { CreateCall, parseCallPhrase } from './CreateCall';
import { CallsList, useCallNotices } from './Calls';
import { basketballFixture } from './fixtures/basketball';
import { catalogTemplates, gameClockLabel, type BankSummary, type CallCatalog, type CommitQuote, type RoomPlayerCall } from './points/types';

afterEach(cleanup);

const teams = [{ id: 'harbor', name: 'Harbor Hawks' }, { id: 'summit', name: 'Summit Foxes' }];
const serverCatalog: CallCatalog = {
  enabled: true,
  templates: [
    { templateId: 'next_score_team', requiredCapabilities: [], resolver: 'next_score_team', fields: [], options: 'teams', optionIds: ['harbor', 'summit'], includesFreeThrows: true },
    { templateId: 'next_made_field_goal_value', requiredCapabilities: [], resolver: 'next_made_field_goal_value', fields: [], options: 'two_three', optionIds: ['two', 'three'], includesFreeThrows: false },
  ],
  window: { questionId: 'q', anchorSequence: 40, minimumHorizonGameElapsedMs: 1_560_000, maximumHorizonGameElapsedMs: 1_740_000, locksAt: 1 },
};
const catalog = catalogTemplates(serverCatalog, teams);
const bank: BankSummary = { grantPoints: 100, availablePoints: 100, reservedPoints: 0, settledRiskNet: 0, correctionDebt: 0 };
const quote: CommitQuote = { quoteId: 'q', targetId: 't', questionId: 'call', optionId: 'harbor', optionLabel: 'Harbor Hawks', commitPoints: 25, totalReturnPoints: 60, multiplier: 2.4, probabilityLabel: 'Authored test probability', firstCaller: true, expiresAt: Date.now() + 10_000, maximumLossPoints: 25 };

describe('catalog labels', () => {
  it('labels teams, two/three and up to three game-clock deadlines inside the safe window', () => {
    expect(catalog.map((t) => t.label)).toEqual(['Which team scores next', 'Next made basket: two or three']);
    expect(catalog[0]!.options).toEqual([{ id: 'harbor', label: 'Harbor Hawks' }, { id: 'summit', label: 'Summit Foxes' }]);
    expect(catalog[1]!.options.map((o) => o.label)).toEqual(['Two', 'Three']);
    expect(catalog[0]!.horizons).toEqual([{ id: '1560000', label: 'By Q3 10:00 game clock' }, { id: '1650000', label: 'By Q3 8:30 game clock' }, { id: '1740000', label: 'By Q3 7:00 game clock' }]);
    expect(gameClockLabel(0)).toBe('Q1 12:00');
  });

  it('puts the featured call deadline first when it is inside the window', () => {
    expect(catalogTemplates(serverCatalog, teams, 1_600_000)[0]!.horizons[0]).toEqual({ id: '1600000', label: 'By Q3 9:20 game clock (same as the featured call)' });
    expect(catalogTemplates(serverCatalog, teams, 2_000_000)[0]!.horizons[0]!.id).toBe('1560000');
  });

  it('marks templates unavailable when calls are off or no window is open', () => {
    expect(catalogTemplates({ ...serverCatalog, window: null }, teams)[0]).toMatchObject({ available: false, unavailableReason: 'No call window right now', horizons: [] });
    expect(catalogTemplates({ ...serverCatalog, enabled: false, window: null }, teams)[0]!.unavailableReason).toBe('Calls are off in this room');
  });
});

describe('call phrases', () => {
  it('maps supported phrases to a preview only', () => {
    expect(parseCallPhrase('Hawks score next, 25 points', catalog)).toEqual({ draft: { templateId: 'next_score_team', optionId: 'harbor', amount: 25 } });
    expect(parseCallPhrase('next basket is a three', catalog)).toEqual({ draft: { templateId: 'next_made_field_goal_value', optionId: 'three' } });
  });

  it('rejects shot-type, possession and unknown calls with the supported choices', () => {
    expect(parseCallPhrase("Reyes' next shot is a layup", catalog)).toMatchObject({ unsupported: 'Calls about a specific shot type are not supported.', suggestions: ['Which team scores next', 'Next made basket: two or three'] });
    expect(parseCallPhrase('Hawks hit a three on the next possession', catalog)).toMatchObject({ unsupported: 'Next-possession calls are not supported for this game.' });
    expect(parseCallPhrase('somebody does something cool', catalog)).toMatchObject({ unsupported: 'That is not one of the supported calls.' });
  });
});

describe('call composer', () => {
  it('fills the form from a phrase, requires review, and creates with a commitment', async () => {
    const onQuote = vi.fn(async () => quote);
    const onCreate = vi.fn(async () => ({ callId: 'c', requestId: 'r', quoteId: 'q', questionId: 'call', optionId: 'harbor', optionLabel: 'Harbor Hawks', commitPoints: 25, totalReturnPoints: 60, acceptedAt: 1, acceptedSequence: 3, state: 'pending' as const }));
    render(<CreateCall catalog={catalog} bank={bank} onQuote={onQuote} onCreate={onCreate} />);
    expect((screen.getByRole('button', { name: 'Review offer' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Describe your call'), { target: { value: 'Hawks score next, 25 points' } });
    fireEvent.click(screen.getByRole('button', { name: 'Fill in' }));
    expect(screen.getByRole('button', { name: 'Harbor Hawks' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '25 pts' }).getAttribute('aria-pressed')).toBe('true');
    expect(onCreate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Review offer' }));
    expect(await screen.findByText('Commit 25 points. If correct: 60 returned total (+35 net). If wrong: lose 25.')).toBeTruthy();
    expect(onQuote).toHaveBeenCalledWith({ templateId: 'next_score_team', optionId: 'harbor', horizonId: '1560000', amount: 25 });
    fireEvent.click(screen.getByRole('button', { name: 'Create call and commit' }));
    expect(await screen.findByText('Call created')).toBeTruthy();
  });

  it('treats a server error on create as unconfirmed and retries with the same request id', async () => {
    const onCreate = vi.fn().mockRejectedValueOnce(new RoomRequestError('Could not complete the room request.', 500, 'INTERNAL')).mockResolvedValueOnce({ callId: 'c', requestId: 'r', quoteId: 'q', questionId: 'call', optionId: 'harbor', optionLabel: 'Harbor Hawks', commitPoints: 25, totalReturnPoints: 60, acceptedAt: 1, acceptedSequence: 3, state: 'pending' });
    render(<CreateCall catalog={catalog} bank={bank} onQuote={async () => quote} onCreate={onCreate} />);
    fireEvent.click(screen.getByRole('button', { name: 'Harbor Hawks' }));
    fireEvent.click(screen.getByRole('button', { name: '25 pts' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review offer' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Create call and commit' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Call created')).toBeTruthy();
    expect(onCreate.mock.calls[0]![2]).toBe(onCreate.mock.calls[1]![2]);
  });

  it('shows the unsupported reason and suggestions without changing the form', () => {
    render(<CreateCall catalog={catalog} bank={bank} onQuote={vi.fn()} onCreate={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Describe your call'), { target: { value: 'next shot is a dunk' } });
    fireEvent.click(screen.getByRole('button', { name: 'Fill in' }));
    expect(screen.getByText('Calls about a specific shot type are not supported.')).toBeTruthy();
    expect(screen.getByText('Next made basket: two or three', { selector: 'li' })).toBeTruthy();
  });

  it('reports server limits and stale windows, and needs points to create', async () => {
    const onQuote = vi.fn().mockRejectedValueOnce(new RoomRequestError('limit', 409, 'CALL_LIMIT_REACHED')).mockRejectedValueOnce(new RoomRequestError('stale', 409, 'STALE_ANCHOR'));
    render(<CreateCall catalog={catalog} bank={bank} onQuote={onQuote} onCreate={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Summit Foxes' }));
    fireEvent.click(screen.getByRole('button', { name: '10 pts' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review offer' }));
    expect((await screen.findByRole('alert')).textContent).toBe('You already have an active call or are cooling down. Try again shortly.');
    fireEvent.click(screen.getByRole('button', { name: 'Review offer' }));
    expect(await screen.findByText('The game moved on. Reopen the composer for a fresh call window.')).toBeTruthy();
    cleanup();
    render(<CreateCall catalog={catalog} bank={{ ...bank, availablePoints: 5 }} onQuote={vi.fn()} onCreate={vi.fn()} />);
    expect(screen.getByText(/Calls need at least 10 available points/)).toBeTruthy();
  });
});

describe('shared-screen calls', () => {
  const view = basketballFixture('open', 3);
  const call = (id: string, creator: number, counts: Record<string, number>): RoomPlayerCall => ({ ...view.question!, id, text: 'Which team scores next?', options: [{ id: 'harbor', label: 'Harbor Hawks', basePoints: 0 }, { id: 'summit', label: 'Summit Foxes', basePoints: 0 }], pickCounts: counts, creatorId: view.standings[creator]!.participantId, createdAt: 1, target: { templateId: 'next_score_team', anchorSequence: 40, horizonGameElapsedMs: 1_620_000, eligibleParticipantIds: [] } });

  it('announces only newly created calls, naming the creator and their side', () => {
    const { result, rerender } = renderHook(({ calls }) => useCallNotices(calls, view.standings), { initialProps: { calls: [call('a', 1, { harbor: 1 })] } });
    expect(result.current).toBe('');
    rerender({ calls: [call('a', 1, { harbor: 1 }), call('b', 0, { summit: 1 })] });
    expect(result.current).toBe(`${view.standings[0]!.name} called Summit Foxes`);
  });

  it('lists calls on their own view with deadline and accepted counts', () => {
    render(<CallsList calls={[call('a', 0, { harbor: 2, summit: 1 })]} standings={view.standings} />);
    const text = screen.getByRole('region', { name: 'Player calls' }).textContent!;
    expect(text).toContain(view.standings[0]!.name);
    expect(text).toContain('By Q3 9:00');
    expect(text).toContain('Harbor Hawks 2 · Summit Foxes 1 · 3 committed');
  });
});
