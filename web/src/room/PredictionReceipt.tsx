import { useCallback, useRef, useState } from 'react';
import type { RoomView } from '@shared/room';
import { RoomRequestError } from './api';

/**
 * Pick submission states. Only the server decides acceptance: a tapped option is
 * "sending" until a response shows that exact pick saved for this participant.
 */
export type ReceiptStatus = 'sending' | 'accepted' | 'rejected' | 'unknown' | 'checking';
export type PickReceipt = { questionId: string; optionId: string; label: string; requestId: string; status: ReceiptStatus; message?: string; acceptedAt?: number };

type ServerReceipt = { requestId: string; questionId: string; optionId: string; acceptedAt?: number; acceptanceSequence?: number };
const newRequestId = () => (globalThis.crypto?.randomUUID?.() ?? `req-${Date.now()}-${Math.random().toString(36).slice(2)}`);

/** True when this snapshot shows the participant's saved pick as the given answer. */
export function confirms(view: RoomView | undefined, questionId: string, optionId: string): boolean {
  const receipt = (view as (RoomView & { receipt?: ServerReceipt }) | undefined)?.receipt;
  // A server receipt only exists for an accepted pick (Worker A's PickReceipt).
  if (receipt && receipt.questionId === questionId) return receipt.optionId === optionId;
  return view?.me?.currentPick?.questionId === questionId && view.me.currentPick.optionId === optionId;
}

function rejection(problem: RoomRequestError): string {
  if (problem.code === 'PICKS_LOCKED' || problem.status === 409) return 'Not accepted before closing.';
  if (problem.code === 'BAD_CREDENTIAL' || problem.status === 401) return 'Your seat could not be confirmed. Rejoin to pick.';
  if (problem.code === 'IDEMPOTENCY_CONFLICT') return 'That request changed. Refresh and pick again.';
  return problem.message || 'Pick not accepted.';
}

/**
 * Sends picks with an idempotency request id. A retry of the same answer reuses the id.
 * When the response is lost, it checks the saved state before offering a new attempt.
 */
export function usePickReceipt({ send, refresh }: { send: (body: { questionId: string; optionId: string; requestId: string }) => Promise<RoomView>; refresh: () => Promise<RoomView> }) {
  const [receipt, setReceipt] = useState<PickReceipt>();
  const inFlight = useRef(false);
  const submit = useCallback(async (questionId: string, optionId: string, label: string, retryOf?: PickReceipt) => {
    if (inFlight.current) return;
    inFlight.current = true;
    const requestId = retryOf && retryOf.questionId === questionId && retryOf.optionId === optionId ? retryOf.requestId : newRequestId();
    const base = { questionId, optionId, label, requestId };
    setReceipt({ ...base, status: 'sending' });
    try {
      const view = await send({ questionId, optionId, requestId });
      const server = (view as RoomView & { receipt?: ServerReceipt }).receipt;
      setReceipt(confirms(view, questionId, optionId) ? { ...base, status: 'accepted', acceptedAt: server?.acceptedAt } : { ...base, status: 'rejected', message: 'Pick not saved.' });
    } catch (problem) {
      if (problem instanceof RoomRequestError) setReceipt({ ...base, status: 'rejected', message: rejection(problem) });
      else {
        // The request may or may not have landed. Look before offering a retry.
        setReceipt({ ...base, status: 'checking' });
        try {
          const view = await refresh();
          setReceipt(confirms(view, questionId, optionId) ? { ...base, status: 'accepted' } : { ...base, status: 'unknown', message: view.question?.id === questionId && view.question.status === 'open' ? 'Not confirmed.' : 'Not accepted before closing.' });
        } catch { setReceipt({ ...base, status: 'unknown', message: 'Connection lost. Not confirmed yet.' }); }
      }
    } finally { inFlight.current = false; }
  }, [send, refresh]);
  return { receipt, submit, clear: () => setReceipt(undefined) };
}

export function PredictionReceipt({ receipt, canRetry, onRetry }: { receipt?: PickReceipt; canRetry: boolean; onRetry: () => void }) {
  if (!receipt) return null;
  const { status, label } = receipt;
  const text = status === 'sending' ? `Sending ${label}…`
    : status === 'checking' ? `Checking whether ${label} was saved…`
    : status === 'accepted' ? `✓ ${label} accepted${receipt.acceptedAt ? ` at ${new Date(receipt.acceptedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}` : ''}`
    : `${label}: ${receipt.message ?? 'Not accepted.'}`;
  return <div className={`rm-receipt is-${status}`}>
    <p role={status === 'rejected' || status === 'unknown' ? 'alert' : 'status'}>{text}</p>
    {status === 'unknown' && canRetry && <button onClick={onRetry}>Retry {label}</button>}
  </div>;
}
