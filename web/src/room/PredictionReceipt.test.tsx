import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import type { RoomView } from '@shared/room';
import { RoomRequestError } from './api';
import { basketballFixture } from './fixtures/basketball';
import { confirms, PredictionReceipt, usePickReceipt } from './PredictionReceipt';

afterEach(cleanup);

type Body = { questionId: string; optionId: string; requestId: string };
const sender = (impl: (body: Body) => Promise<RoomView>) => vi.fn(impl);
const open = basketballFixture('open');
const withPick = (optionId: string): RoomView => ({ ...open, me: { participantId: 'fx-0', name: 'Maya', currentPick: { questionId: 'bball-q-004', optionId } } });

describe('pick receipts', () => {
  it('is accepted only when the server shows that exact pick saved', async () => {
    const send = sender(async () => withPick('three'));
    const { result } = renderHook(() => usePickReceipt({ send, refresh: vi.fn() }));
    await act(() => result.current.submit('bball-q-004', 'three', 'Three'));
    expect(result.current.receipt).toMatchObject({ status: 'accepted', optionId: 'three' });
    expect(send.mock.calls[0]![0]).toMatchObject({ questionId: 'bball-q-004', optionId: 'three', requestId: expect.any(String) });
    expect(confirms(withPick('two'), 'bball-q-004', 'three')).toBe(false);
  });

  it('reports a closed call as not accepted', async () => {
    const send = sender(async () => { throw new RoomRequestError('Picks are locked', 409, 'PICKS_LOCKED'); });
    const { result } = renderHook(() => usePickReceipt({ send, refresh: vi.fn() }));
    await act(() => result.current.submit('bball-q-004', 'two', 'Two'));
    expect(result.current.receipt).toMatchObject({ status: 'rejected', message: 'Not accepted before closing.' });
  });

  it('checks saved state after a lost response before offering a retry', async () => {
    const send = sender(async () => { throw new Error('The room took too long to respond. Try again.'); });
    const refresh = vi.fn(async () => withPick('three'));
    const { result } = renderHook(() => usePickReceipt({ send, refresh }));
    await act(() => result.current.submit('bball-q-004', 'three', 'Three'));
    expect(refresh).toHaveBeenCalled();
    expect(result.current.receipt?.status).toBe('accepted');
  });

  it('looks up the original receipt by request id before anything else', async () => {
    const send = sender(async () => { throw new Error('offline'); });
    const refresh = vi.fn(async () => open);
    const lookup = vi.fn(async (requestId: string) => ({ requestId, questionId: 'bball-q-004', optionId: 'three', acceptedAt: 5000 }));
    const { result } = renderHook(() => usePickReceipt({ send, refresh, lookup }));
    await act(() => result.current.submit('bball-q-004', 'three', 'Three'));
    expect(lookup).toHaveBeenCalledWith(send.mock.calls[0]![0].requestId);
    expect(refresh).not.toHaveBeenCalled();
    expect(result.current.receipt).toMatchObject({ status: 'accepted', acceptedAt: 5000 });
  });

  it('retries an unconfirmed pick with the same request id', async () => {
    const send = sender(async () => { throw new Error('offline'); });
    const refresh = vi.fn(async () => open);
    const { result } = renderHook(() => usePickReceipt({ send, refresh }));
    await act(() => result.current.submit('bball-q-004', 'three', 'Three'));
    const first = result.current.receipt!;
    expect(first).toMatchObject({ status: 'unknown', message: 'Not confirmed.' });
    send.mockResolvedValueOnce(withPick('three'));
    await act(() => result.current.submit('bball-q-004', 'three', 'Three', first));
    expect(send.mock.calls[1]![0].requestId).toBe(first.requestId);
    expect(result.current.receipt?.status).toBe('accepted');
  });

  it('ignores a second tap while a request is in flight', async () => {
    let finish!: (view: RoomView) => void;
    const send = sender(() => new Promise<RoomView>((resolve) => { finish = resolve; }));
    const { result } = renderHook(() => usePickReceipt({ send, refresh: vi.fn() }));
    let first!: Promise<void>;
    act(() => { first = result.current.submit('bball-q-004', 'three', 'Three'); });
    await act(() => result.current.submit('bball-q-004', 'two', 'Two'));
    expect(send).toHaveBeenCalledTimes(1);
    await act(async () => { finish(withPick('three')); await first; });
  });
});

describe('receipt display', () => {
  it('distinguishes sending, accepted, rejected and unknown', () => {
    const base = { questionId: 'q', optionId: 'three', label: 'Three', requestId: 'r1' };
    const onRetry = vi.fn();
    const { rerender } = render(<PredictionReceipt receipt={{ ...base, status: 'sending' }} canRetry onRetry={onRetry} />);
    expect(screen.getByRole('status').textContent).toBe('Sending Three…');
    rerender(<PredictionReceipt receipt={{ ...base, status: 'accepted' }} canRetry onRetry={onRetry} />);
    expect(screen.getByRole('status').textContent).toBe('✓ Three accepted');
    rerender(<PredictionReceipt receipt={{ ...base, status: 'rejected', message: 'Not accepted before closing.' }} canRetry onRetry={onRetry} />);
    expect(screen.getByRole('alert').textContent).toBe('Three: Not accepted before closing.');
    expect(screen.queryByRole('button')).toBeNull();
    rerender(<PredictionReceipt receipt={{ ...base, status: 'unknown', message: 'Not confirmed.' }} canRetry onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry Three' }));
    expect(onRetry).toHaveBeenCalled();
  });
});
