import { useEffect, useRef, useState } from 'react';
import type { RoomQuestion } from '@shared/room';
import { RoomRequestError } from './api';
import { COMMIT_AMOUNTS, type BankSummary, type CommitAmount, type CommitmentReceipt, type CommitQuote } from './points/types';

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const newRequestId = () => (globalThis.crypto?.randomUUID?.() ?? `commit-${Date.now()}-${Math.random().toString(36).slice(2)}`);

/** The exact sentence the participant agrees to. */
export function offerSentence(quote: Pick<CommitQuote, 'commitPoints' | 'totalReturnPoints'>): string {
  const net = quote.totalReturnPoints - quote.commitPoints;
  return `Commit ${fmt(quote.commitPoints)} points. If correct: ${fmt(quote.totalReturnPoints)} returned total (+${fmt(net)} net). If wrong: lose ${fmt(quote.commitPoints)}.`;
}

function commitError(problem: unknown): { message: string; requote?: boolean; retry?: boolean } {
  if (!(problem instanceof RoomRequestError)) return { message: 'Not confirmed yet. Retry sends the same request, so it cannot commit twice.', retry: true };
  switch (problem.code) {
    case 'QUOTE_EXPIRED': case 'QUOTE_CHANGED': return { message: 'The offer changed. Review the new offer before committing.', requote: true };
    case 'INSUFFICIENT_POINTS': return { message: 'Not enough available points. Nothing was committed.' };
    case 'PICKS_LOCKED': return { message: 'The call closed. Nothing was committed.' };
    case 'CALL_ALREADY_COMMITTED': return { message: 'You already committed on this call.' };
    case 'SOURCE_STALE': return { message: 'Game data is catching up. Commitments are paused; free picks still work.' };
    default: return { message: problem.message || 'Nothing was committed.' };
  }
}

/**
 * Optional commitment on the current call (P10.6). Choosing an amount asks the server
 * for a quote; only "Confirm commit" commits, closing the review does nothing, and an
 * accepted commitment shows its receipt with no cancel or change.
 */
export function CommitPoints({ question, bank, receipt, defaultOptionId, onQuote, onConfirm, now = Date.now }: {
  question: RoomQuestion;
  bank: BankSummary;
  receipt?: CommitmentReceipt;
  defaultOptionId?: string;
  onQuote: (optionId: string, amount: CommitAmount) => Promise<CommitQuote>;
  onConfirm: (quote: CommitQuote, requestId: string) => Promise<CommitmentReceipt>;
  now?: () => number;
}) {
  const [optionId, setOptionId] = useState(defaultOptionId ?? question.options[0]?.id ?? '');
  const [amount, setAmount] = useState<CommitAmount | null>(null);
  const [quote, setQuote] = useState<CommitQuote>();
  const [busy, setBusy] = useState<'quote' | 'confirm' | null>(null);
  const [error, setError] = useState<{ message: string; retry?: boolean }>();
  const [accepted, setAccepted] = useState<CommitmentReceipt>();
  const [clock, setClock] = useState(now);
  const requestId = useRef<string | null>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (defaultOptionId && !quote) setOptionId(defaultOptionId); }, [defaultOptionId, quote]);
  useEffect(() => { if (!quote) return; const timer = setInterval(() => setClock(now()), 250); return () => clearInterval(timer); }, [quote, now]);
  useEffect(() => { if (quote) confirmButton.current?.focus(); }, [quote?.quoteId]);

  const done = receipt ?? accepted;
  if (done) {
    const settled = done.state === 'won' ? `Won · ${fmt(done.totalReturnPoints)} returned` : done.state === 'lost' ? `Lost ${fmt(done.commitPoints)}` : done.state === 'void' ? `Void · ${fmt(done.commitPoints)} refunded` : `If correct: ${fmt(done.totalReturnPoints)} returned total`;
    return <section className="rm-commit is-committed" aria-label="Committed points">
      <p role="status"><b>Committed</b> {fmt(done.commitPoints)} on {done.optionLabel}. {settled}.</p>
      <small>Receipt #{done.acceptedSequence} · {new Date(done.acceptedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })} · Cannot be changed</small>
    </section>;
  }
  if (question.status !== 'open') return null;
  if (bank.correctionDebt > 0) return <section className="rm-commit" aria-label="Commit points"><p>Commitments are paused until a score correction of {fmt(bank.correctionDebt)} points is cleared. Free picks still count.</p></section>;
  if (bank.availablePoints < COMMIT_AMOUNTS[0]) return <section className="rm-commit" aria-label="Commit points"><p>Not enough points to commit ({fmt(bank.availablePoints)} available). Free picks still count.</p></section>;

  const expired = !!quote && clock >= quote.expiresAt;
  const secs = quote ? Math.max(0, Math.ceil((quote.expiresAt - clock) / 1000)) : 0;
  async function requestQuote(nextAmount: CommitAmount, keepError = false) {
    setAmount(nextAmount); setBusy('quote'); if (!keepError) setError(undefined);
    try { setQuote(await onQuote(optionId, nextAmount)); requestId.current = newRequestId(); setClock(now()); }
    catch (problem) { setQuote(undefined); setError(commitError(problem)); }
    finally { setBusy(null); }
  }
  async function confirm() {
    if (!quote || expired || busy) return;
    setBusy('confirm'); setError(undefined);
    requestId.current ??= newRequestId();
    try { setAccepted(await onConfirm(quote, requestId.current)); setQuote(undefined); }
    catch (problem) {
      const failure = commitError(problem);
      setError(failure);
      if (failure.requote && amount) { setQuote(undefined); await requestQuote(amount, true); }
    } finally { setBusy(null); }
  }
  function close() { setQuote(undefined); setAmount(null); setError(undefined); requestId.current = null; }

  return <section className="rm-commit" aria-label="Commit points">
    <div className="rm-commit-head"><h3>Commit points <span className="rm-muted">(optional)</span></h3><span>{fmt(bank.availablePoints)} available</span></div>
    {!quote && <>
      <div className="rm-commit-row" role="group" aria-label="Answer to commit on">{question.options.map((o) => <button key={o.id} aria-pressed={optionId === o.id} onClick={() => setOptionId(o.id)}>{o.label}</button>)}</div>
      <div className="rm-commit-row" role="group" aria-label="Points to commit">{COMMIT_AMOUNTS.map((n) => <button key={n} disabled={n > bank.availablePoints || busy !== null} onClick={() => { void requestQuote(n); }}>{busy === 'quote' && amount === n ? 'Getting offer…' : `${n} pts`}</button>)}</div>
    </>}
    {quote && <div className="rm-commit-review" role="group" aria-label="Review offer">
      <p className="rm-commit-offer">{offerSentence(quote)}</p>
      <p className="rm-muted">On {quote.optionLabel} · {quote.multiplier.toFixed(2)}× total return · {quote.probabilityLabel}{quote.firstCaller ? ' · First caller bonus' : ''}</p>
      <p className={expired ? 'rm-error' : 'rm-muted'} role="status">{expired ? 'Offer expired.' : `Offer good for ${secs}s`}</p>
      <div className="rm-commit-row">
        {expired ? <button className="rm-primary" onClick={() => amount && void requestQuote(amount)}>Get a new offer</button>
          : <button ref={confirmButton} className="rm-primary" disabled={busy !== null} onClick={() => { void confirm(); }}>{busy === 'confirm' ? 'Committing…' : error?.retry ? 'Retry commit' : 'Confirm commit'}</button>}
        <button onClick={close} disabled={busy === 'confirm'}>Close</button>
      </div>
    </div>}
    {error && <p className="rm-error" role="alert">{error.message}</p>}
  </section>;
}
