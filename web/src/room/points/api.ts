import { roomRequest } from '../api';
import type { CallDraft } from '../CreateCall';
import type { CallTemplate, CommitAmount, CommitmentReceipt, CommitQuote } from './types';

/**
 * PROPOSED endpoints from the master plan §12.1 (Phases 10, 11, 13). Worker A owns the
 * routes; these are the only places the client names them, so adopting A's final paths
 * is a one-file change. Every mutation carries the participant credential in the body,
 * like the existing room mutations.
 */
export function pointsApi(code: string, participantToken: string | undefined) {
  const base = `/api/rooms/${encodeURIComponent(code)}`;
  return {
    quote: (questionId: string, optionId: string, commitPoints: CommitAmount) =>
      roomRequest<{ quote: CommitQuote }>(`${base}/commitment-quotes`, { body: { participantToken, questionId, optionId, commitPoints } }).then((r) => r.quote),
    commit: (quote: CommitQuote, requestId: string) =>
      roomRequest<{ commitment: CommitmentReceipt }>(`${base}/commitments`, { body: { participantToken, quoteId: quote.quoteId, requestId } }).then((r) => r.commitment),
    catalog: () => roomRequest<{ templates: CallTemplate[] }>(`${base}/call-catalog`).then((r) => r.templates),
    quoteCall: (draft: CallDraft) =>
      roomRequest<{ quote: CommitQuote }>(`${base}/commitment-quotes`, { body: { participantToken, templateId: draft.templateId, optionId: draft.optionId, horizonId: draft.horizonId, commitPoints: draft.amount } }).then((r) => r.quote),
    createCall: (quote: CommitQuote, draft: CallDraft, requestId: string) =>
      roomRequest<{ commitment: CommitmentReceipt }>(`${base}/calls`, { body: { participantToken, quoteId: quote.quoteId, templateId: draft.templateId, requestId } }).then((r) => r.commitment),
  };
}
