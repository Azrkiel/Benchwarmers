import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { RoomRequestError } from './api';
import { BankPanel } from './BankPanel';
import { CommitPoints, offerSentence } from './CommitPoints';
import { basketballFixture } from './fixtures/basketball';
import type { BankSummary, CommitmentReceipt, CommitQuote } from './points/types';

afterEach(() => { cleanup(); vi.useRealTimers(); });

const question = basketballFixture('open').question!;
const bank: BankSummary = { grantPoints: 100, availablePoints: 100, reservedPoints: 0, settledRiskNet: 0, correctionDebt: 0 };
const quote = (over: Partial<CommitQuote> = {}): CommitQuote => ({ quoteId: 'q1', targetId: 't', questionId: question.id, optionId: 'three', optionLabel: 'Three', commitPoints: 25, totalReturnPoints: 75, multiplier: 3, probabilityLabel: 'Demo reference, 33%', firstCaller: false, expiresAt: Date.now() + 10_000, ...over });
const receipt = (over: Partial<CommitmentReceipt> = {}): CommitmentReceipt => ({ callId: 'c1', requestId: 'r', quoteId: 'q1', questionId: question.id, optionId: 'three', optionLabel: 'Three', commitPoints: 25, totalReturnPoints: 75, acceptedAt: 1_000_000, acceptedSequence: 7, state: 'pending', ...over });

describe('commit review', () => {
  it('states the exact terms from the plan', () => {
    expect(offerSentence({ commitPoints: 25, totalReturnPoints: 75 })).toBe('Commit 25 points. If correct: 75 returned total (+50 net). If wrong: lose 25.');
  });

  it('quotes without committing, and closing the review does nothing', async () => {
    const onQuote = vi.fn(async () => quote());
    const onConfirm = vi.fn();
    render(<CommitPoints question={question} bank={bank} defaultOptionId="three" onQuote={onQuote} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: '25 pts' }));
    expect(await screen.findByText('Commit 25 points. If correct: 75 returned total (+50 net). If wrong: lose 25.')).toBeTruthy();
    expect(onQuote).toHaveBeenCalledWith('three', 25);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByRole('group', { name: 'Review offer' })).toBeNull();
  });

  it('commits only on Confirm and then shows an unchangeable receipt', async () => {
    const onConfirm = vi.fn(async () => receipt());
    render(<CommitPoints question={question} bank={bank} onQuote={async () => quote()} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: '25 pts' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm commit' }));
    expect((await screen.findByText('Committed')).closest('p')!.textContent).toBe('Committed 25 on Three. If correct: 75 returned total.');
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ quoteId: 'q1' }), expect.any(String));
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText(/Cannot be changed/)).toBeTruthy();
  });

  it('shows a new offer for explicit review when the quote changed', async () => {
    const onQuote = vi.fn().mockResolvedValueOnce(quote()).mockResolvedValueOnce(quote({ quoteId: 'q2', totalReturnPoints: 62.5, multiplier: 2.5 }));
    const onConfirm = vi.fn().mockRejectedValueOnce(new RoomRequestError('changed', 409, 'QUOTE_CHANGED'));
    render(<CommitPoints question={question} bank={bank} onQuote={onQuote} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: '25 pts' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm commit' }));
    expect(await screen.findByText('Commit 25 points. If correct: 62.5 returned total (+37.5 net). If wrong: lose 25.')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toBe('The offer changed. Review the new offer before committing.');
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('retries a lost confirmation with the same request id', async () => {
    const onConfirm = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(receipt());
    render(<CommitPoints question={question} bank={bank} onQuote={async () => quote()} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: '25 pts' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm commit' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Retry commit' }));
    await screen.findByText(/Committed/);
    expect(onConfirm.mock.calls[0]![1]).toBe(onConfirm.mock.calls[1]![1]);
  });

  it('expires an offer instead of committing it late', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'Date'] });
    const onConfirm = vi.fn();
    render(<CommitPoints question={question} bank={bank} onQuote={async () => quote({ expiresAt: Date.now() + 2000 })} onConfirm={onConfirm} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '25 pts' })); });
    act(() => { vi.advanceTimersByTime(2500); });
    expect(screen.getByText('Offer expired.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Confirm commit' })).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('limits amounts to the available bank and pauses on correction debt', () => {
    render(<CommitPoints question={question} bank={{ ...bank, availablePoints: 30 }} onQuote={vi.fn()} onConfirm={vi.fn()} />);
    expect((screen.getByRole('button', { name: '50 pts' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '25 pts' }) as HTMLButtonElement).disabled).toBe(false);
    cleanup();
    render(<CommitPoints question={question} bank={{ ...bank, availablePoints: 0, correctionDebt: 12.5 }} onQuote={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByText(/Commitments are paused until a score correction of 12.5 points is cleared. Free picks still count./)).toBeTruthy();
    cleanup();
    render(<CommitPoints question={question} bank={{ ...bank, availablePoints: 5 }} onQuote={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByText(/Not enough points to commit \(5 available\). Free picks still count./)).toBeTruthy();
  });

  it('shows the settled outcome on an existing receipt', () => {
    render(<CommitPoints question={question} bank={bank} receipt={receipt({ state: 'void' })} onQuote={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByRole('status').textContent).toBe('Committed 25 on Three. Void · 25 refunded.');
  });
});

describe('bank panel', () => {
  it('keeps the night total, reserves, bank and debt separate', () => {
    render(<BankPanel standing={{ fantasyPoints: 40, predictionPoints: 20, total: 110 }} bank={{ grantPoints: 100, availablePoints: 75, reservedPoints: 25, settledRiskNet: 50, correctionDebt: 0 }} />);
    const text = document.body.textContent!;
    expect(text).toContain('Settled calls+50.0');
    expect(text).toContain('Total110.0');
    expect(text).toContain('Reserved on open calls25.0');
    expect(text).toContain('Available75.0');
    expect(text).toContain('that grant is not part of your total');
    cleanup();
    render(<BankPanel standing={{ fantasyPoints: 10, predictionPoints: 0, total: -15 }} bank={{ grantPoints: 100, availablePoints: 0, reservedPoints: 0, settledRiskNet: -25, correctionDebt: 10 }} />);
    expect(document.body.textContent).toContain('Correction to clear10.0');
    expect(document.body.textContent).toContain('New commitments are paused');
  });
});
