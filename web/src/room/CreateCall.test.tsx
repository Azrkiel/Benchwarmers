import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { RoomRequestError } from './api';
import { CreateCall, parseCallPhrase } from './CreateCall';
import { CallsList, useCallNotices } from './Calls';
import type { BankSummary, CallTemplate, CommitQuote, VoluntaryCall } from './points/types';

afterEach(cleanup);

const catalog: CallTemplate[] = [
  { id: 'next_score_team', label: 'Which team scores next', options: [{ id: 'harbor', label: 'Harbor Hawks' }, { id: 'summit', label: 'Summit Foxes' }], horizons: [{ id: 'h180', label: 'Next 3 game minutes' }], available: true },
  { id: 'next_made_field_goal_value', label: 'Next made basket: two or three', options: [{ id: 'two', label: 'Two' }, { id: 'three', label: 'Three' }], horizons: [{ id: 'h180', label: 'Next 3 game minutes' }], available: true },
  { id: 'team_next_possession_three', label: 'Team hits a three on its next possession', options: [{ id: 'harbor', label: 'Harbor Hawks' }], horizons: [{ id: 'poss', label: 'Next possession' }], available: false, unavailableReason: 'Needs possession-start data' },
];
const bank: BankSummary = { grantPoints: 100, availablePoints: 100, reservedPoints: 0, settledRiskNet: 0, correctionDebt: 0 };
const quote: CommitQuote = { quoteId: 'q', targetId: 't', questionId: 'call', optionId: 'harbor', optionLabel: 'Harbor Hawks score next', commitPoints: 25, totalReturnPoints: 60, multiplier: 2.4, probabilityLabel: 'Demo reference, 45%', firstCaller: true, expiresAt: Date.now() + 10_000 };

describe('call phrases', () => {
  it('maps supported phrases to a preview only', () => {
    expect(parseCallPhrase('Hawks score next, 25 points', catalog)).toEqual({ draft: { templateId: 'next_score_team', optionId: 'harbor', amount: 25 } });
    expect(parseCallPhrase('next basket is a three', catalog)).toEqual({ draft: { templateId: 'next_made_field_goal_value', optionId: 'three' } });
  });

  it('rejects shot-type and unavailable calls with the closest supported choices', () => {
    const layup = parseCallPhrase("Reyes' next shot is a layup", catalog);
    expect(layup).toMatchObject({ unsupported: 'Calls about a specific shot type are not supported.', suggestions: ['Which team scores next', 'Next made basket: two or three'] });
    expect(parseCallPhrase('Hawks hit a three on the next possession', catalog)).toMatchObject({ unsupported: 'Needs possession-start data' });
    expect(parseCallPhrase('somebody does something cool', catalog)).toMatchObject({ unsupported: 'That is not one of the supported calls.' });
  });
});

describe('call composer', () => {
  it('fills the form from a phrase, requires review, and creates with a commitment', async () => {
    const onQuote = vi.fn(async () => quote);
    const onCreate = vi.fn(async () => ({ callId: 'c', requestId: 'r', quoteId: 'q', questionId: 'call', optionId: 'harbor', optionLabel: 'Harbor Hawks score next', commitPoints: 25, totalReturnPoints: 60, acceptedAt: 1, acceptedSequence: 3, state: 'pending' as const }));
    render(<CreateCall catalog={catalog} bank={bank} onQuote={onQuote} onCreate={onCreate} />);
    expect((screen.getByRole('button', { name: 'Review offer' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Describe your call'), { target: { value: 'Hawks score next, 25 points' } });
    fireEvent.click(screen.getByRole('button', { name: 'Fill in' }));
    expect(screen.getByRole('button', { name: 'Harbor Hawks' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '25 pts' }).getAttribute('aria-pressed')).toBe('true');
    expect(onCreate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Review offer' }));
    expect(await screen.findByText('Commit 25 points. If correct: 60 returned total (+35 net). If wrong: lose 25.')).toBeTruthy();
    expect(onQuote).toHaveBeenCalledWith({ templateId: 'next_score_team', optionId: 'harbor', horizonId: 'h180', amount: 25 });
    fireEvent.click(screen.getByRole('button', { name: 'Create call and commit' }));
    expect(await screen.findByText('Call created')).toBeTruthy();
  });

  it('shows the unsupported reason and suggestions without changing the form', () => {
    render(<CreateCall catalog={catalog} bank={bank} onQuote={vi.fn()} onCreate={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Describe your call'), { target: { value: 'next shot is a dunk' } });
    fireEvent.click(screen.getByRole('button', { name: 'Fill in' }));
    expect(screen.getByText('Calls about a specific shot type are not supported.')).toBeTruthy();
    expect(screen.getByText('Next made basket: two or three', { selector: 'li' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: /Team hits a three/ })).toHaveProperty('disabled', true);
  });

  it('reports limits from the server and needs points to create', async () => {
    render(<CreateCall catalog={catalog} bank={bank} onQuote={async () => { throw new RoomRequestError('limit', 409, 'CALL_LIMIT_REACHED'); }} onCreate={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Summit Foxes' }));
    fireEvent.click(screen.getByRole('button', { name: '10 pts' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review offer' }));
    expect((await screen.findByRole('alert')).textContent).toBe('You already have an active call or are cooling down. Try again shortly.');
    cleanup();
    render(<CreateCall catalog={catalog} bank={{ ...bank, availablePoints: 5 }} onQuote={vi.fn()} onCreate={vi.fn()} />);
    expect(screen.getByText(/Calls need at least 10 available points/)).toBeTruthy();
  });
});

describe('shared-screen calls', () => {
  const call = (id: string, name: string): VoluntaryCall => ({ id, templateId: 'next_score_team', creatorName: name, optionLabel: 'Hawks score next', horizonLabel: 'Next 3 game minutes', followers: 1, createdAt: 1, state: 'pending' });
  it('announces only newly created calls with one short line', () => {
    const { result, rerender } = renderHook(({ calls }) => useCallNotices(calls), { initialProps: { calls: [call('a', 'Leo')] } });
    expect(result.current).toBe('');
    rerender({ calls: [call('a', 'Leo'), call('b', 'Maya')] });
    expect(result.current).toBe('Maya called Hawks score next');
  });
  it('lists calls on their own view', () => {
    render(<CallsList calls={[call('a', 'Leo')]} />);
    expect(screen.getByRole('region', { name: 'Player calls' }).textContent).toContain('Leo Hawks score next');
  });
});
