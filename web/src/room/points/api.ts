import { roomRequest } from '../api';
import type { CallDraft } from '../CreateCall';
import type { CallCatalog, CommitAmount, CommitmentReceipt, CommitQuote } from './types';

/**
 * Worker A's room points and call routes (77d16d0, fc66bf6). This is the only place the
 * client names them. Every mutation carries the participant credential in the body,
 * like the existing room mutations.
 */
export function pointsApi(code: string, participantToken: string | undefined) {
  const base = `/api/rooms/${encodeURIComponent(code)}`;
  return {
    quote: (questionId: string, optionId: string, commitPoints: CommitAmount) =>
      roomRequest<{ quote: CommitQuote }>(`${base}/commitment-quotes`, { body: { participantToken, questionId, optionId, commitPoints } }).then((r) => r.quote),
    commit: (quote: CommitQuote, requestId: string) =>
      roomRequest<{ commitment: CommitmentReceipt }>(`${base}/commitments`, { body: { participantToken, quoteId: quote.quoteId, requestId } }).then((r) => r.commitment),
    catalog: () => roomRequest<CallCatalog>(`${base}/call-catalog`),
    /** The anchor comes from the catalog window the composer was opened with. */
    quoteCall: (draft: CallDraft, anchorSequence: number) =>
      roomRequest<{ quote: CommitQuote }>(`${base}/call-quotes`, { body: { participantToken, templateId: draft.templateId, anchorSequence, horizonGameElapsedMs: Number(draft.horizonId), optionId: draft.optionId, commitPoints: draft.amount } }).then((r) => r.quote),
    createCall: (quote: CommitQuote, requestId: string) =>
      roomRequest<{ commitment: CommitmentReceipt }>(`${base}/calls`, { body: { participantToken, quoteId: quote.quoteId, requestId } }).then((r) => r.commitment),
  };
}
