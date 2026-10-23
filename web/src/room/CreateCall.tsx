import { useRef, useState, type FormEvent } from 'react';
import { RoomRequestError } from './api';
import { offerSentence } from './CommitPoints';
import { COMMIT_AMOUNTS, type BankSummary, type CallTemplate, type CommitAmount, type CommitmentReceipt, type CommitQuote } from './points/types';

export type CallDraft = { templateId: CallTemplate['id']; optionId: string; horizonId: string; amount: CommitAmount };
export type ParsedCall = { draft: Partial<CallDraft> } | { unsupported: string; suggestions: string[] };

const words = (text: string) => ` ${text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()} `;
const SUBTYPE = /\b(layup|lay up|dunk|jumper|jump shot|floater|hook|alley.?oop|free throw|foul shot|and one)\b/;

function optionFor(template: CallTemplate, said: string): string | undefined {
  const hits = template.options.filter((o) => {
    const label = o.label.toLowerCase();
    return said.includes(` ${label} `) || label.split(' ').some((w) => w.length > 3 && said.includes(` ${w} `)) || said.includes(` ${o.id.toLowerCase()} `);
  });
  return hits.length === 1 ? hits[0]!.id : undefined;
}

/**
 * Maps a spoken or typed idea onto the supported catalog, producing only a preview.
 * Anything outside the catalog is rejected with the closest supported calls; nothing
 * is rewritten into a different proposition and nothing is committed here.
 */
export function parseCallPhrase(text: string, catalog: CallTemplate[]): ParsedCall {
  const said = words(text);
  const available = catalog.filter((t) => t.available);
  const suggestions = available.map((t) => t.label);
  const amount = COMMIT_AMOUNTS.find((n) => said.includes(` ${n} `));
  const withAmount = (draft: Partial<CallDraft>) => ({ draft: amount ? { ...draft, amount } : draft });
  if (SUBTYPE.test(said)) return { unsupported: 'Calls about a specific shot type are not supported.', suggestions };
  const byId = (id: CallTemplate['id']) => catalog.find((t) => t.id === id);
  // Possession-specific calls need possession-start data the game does not supply.
  if (/ next possession /.test(said)) return { unsupported: 'Next-possession calls are not supported for this game.', suggestions };
  if (/ (next (made )?(basket|bucket|shot made|field goal)) /.test(said) || / (a|is a|be a) (two|three) /.test(said)) {
    const t = byId('next_made_field_goal_value');
    if (!t?.available) return { unsupported: 'That call is not available right now.', suggestions };
    const option = / (three|3|trey) /.test(said) ? 'three' : / (two|2) /.test(said) ? 'two' : undefined;
    return withAmount({ templateId: t.id, optionId: t.options.some((o) => o.id === option) ? option : undefined });
  }
  if (/ (score|scores|scoring) next | next (to )?score /.test(said)) {
    const t = byId('next_score_team');
    if (!t?.available) return { unsupported: 'That call is not available right now.', suggestions };
    return withAmount({ templateId: t.id, optionId: optionFor(t, said) });
  }
  return { unsupported: 'That is not one of the supported calls.', suggestions };
}

function createError(problem: unknown): { message: string; retry?: boolean } {
  // A lost response or a server error (5xx) is not a rejection: retry the same request.
  if (!(problem instanceof RoomRequestError) || problem.status >= 500) return { message: 'Not confirmed yet. Retry sends the same request.', retry: true };
  const messages: Record<string, string> = {
    CALL_LIMIT_REACHED: 'You already have an active call or are cooling down. Try again shortly.',
    TARGET_UNSUPPORTED: 'That call is not supported for this game.',
    QUOTE_EXPIRED: 'The offer changed. Review a new offer before creating the call.',
    QUOTE_CHANGED: 'The offer changed. Review a new offer before creating the call.',
    INSUFFICIENT_POINTS: 'Not enough available points. No call was created.',
    PICKS_LOCKED: 'That moment has passed. No call was created.',
    STALE_ANCHOR: 'The game moved on. Reopen the composer for a fresh call window.',
    BAD_HORIZON: 'That deadline is outside the allowed window. Choose another.',
    FEATURE_DISABLED: 'Calls are off in this room.',
    PROBABILITY_UNAVAILABLE: 'No offer for that call right now. Try another answer or deadline.',
  };
  return { message: (problem.code && messages[problem.code]) || problem.message || 'No call was created.' };
}

/** Phone composer for a player-created call (P11.5). A call always requires a commitment. */
export function CreateCall({ catalog, bank, onQuote, onCreate, onClose }: {
  catalog: CallTemplate[]; bank: BankSummary;
  onQuote: (draft: CallDraft) => Promise<CommitQuote>;
  onCreate: (quote: CommitQuote, draft: CallDraft, requestId: string) => Promise<CommitmentReceipt>;
  onClose?: () => void;
}) {
  const first = catalog.find((t) => t.available);
  const [draft, setDraft] = useState<Partial<CallDraft>>({ templateId: first?.id, horizonId: first?.horizons[0]?.id });
  const [phrase, setPhrase] = useState('');
  const [hint, setHint] = useState<{ text: string; suggestions?: string[] }>();
  const [quote, setQuote] = useState<CommitQuote>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; retry?: boolean }>();
  const [created, setCreated] = useState<CommitmentReceipt>();
  const requestId = useRef<string | null>(null);
  const template = catalog.find((t) => t.id === draft.templateId);
  const complete = !!(template && draft.optionId && draft.horizonId && draft.amount);

  if (created) return <section className="rm-create-call" aria-label="Your call"><p role="status"><b>Call created</b> · {created.optionLabel} · {created.commitPoints} committed. Returns {created.totalReturnPoints} if correct. Cannot be changed.</p>{onClose && <button onClick={onClose}>Done</button>}</section>;
  if (!first) return <section className="rm-create-call" aria-label="Make a call"><p>{catalog[0]?.unavailableReason === 'Calls are off in this room' ? 'Calls are off in this room.' : 'Calls open while a featured call is open. Try again at the next call.'}</p>{onClose && <button onClick={onClose}>Close</button>}</section>;
  if (bank.correctionDebt > 0 || bank.availablePoints < COMMIT_AMOUNTS[0]) return <section className="rm-create-call" aria-label="Make a call"><p>Calls need at least {COMMIT_AMOUNTS[0]} available points{bank.correctionDebt > 0 ? ' and no open correction' : ''}. Free picks still count.</p></section>;

  function fromPhrase(event: FormEvent) {
    event.preventDefault();
    const parsed = parseCallPhrase(phrase, catalog);
    if ('unsupported' in parsed) { setHint({ text: parsed.unsupported, suggestions: parsed.suggestions }); return; }
    const t = catalog.find((c) => c.id === parsed.draft.templateId)!;
    // A different call type starts fresh so no answer from the old type carries over.
    const base = parsed.draft.templateId !== draft.templateId ? { amount: draft.amount, horizonId: t.horizons[0]?.id } : draft;
    setDraft({ ...base, ...parsed.draft });
    setQuote(undefined);
    setHint({ text: parsed.draft.optionId ? 'Check the call below, then review the offer.' : 'Pick the answer below to finish the call.' });
  }
  async function review() {
    if (!complete) return;
    setBusy(true); setError(undefined);
    try { setQuote(await onQuote(draft as CallDraft)); requestId.current = globalThis.crypto?.randomUUID?.() ?? `call-${Date.now()}`; }
    catch (problem) { setError(createError(problem)); }
    finally { setBusy(false); }
  }
  async function create() {
    if (!quote) return;
    setBusy(true); setError(undefined);
    try { setCreated(await onCreate(quote, draft as CallDraft, requestId.current!)); }
    catch (problem) { const failure = createError(problem); setError(failure); if (!failure.retry) setQuote(undefined); }
    finally { setBusy(false); }
  }
  const set = (patch: Partial<CallDraft>) => { setDraft({ ...draft, ...patch }); setQuote(undefined); };

  return <section className="rm-create-call" aria-label="Make a call">
    <h3>Make a call</h3>
    <form className="rm-input-row" onSubmit={fromPhrase}><label className="rm-sr" htmlFor="rm-call-phrase">Describe your call</label><input id="rm-call-phrase" value={phrase} onChange={(e) => setPhrase(e.target.value)} placeholder="“Hawks score next, 25 points”" /><button disabled={!phrase.trim()}>Fill in</button></form>
    {hint && <div className="rm-call-hint" role="status"><p>{hint.text}</p>{hint.suggestions && <ul>{hint.suggestions.map((s) => <li key={s}>{s}</li>)}</ul>}</div>}
    <fieldset><legend>Call</legend>{catalog.map((t) => <label key={t.id} className={t.available ? '' : 'is-unavailable'}><input type="radio" name="rm-call-template" checked={draft.templateId === t.id} disabled={!t.available} onChange={() => set({ templateId: t.id, optionId: undefined, horizonId: t.horizons[0]?.id })} />{t.label}{!t.available && <small> · {t.unavailableReason ?? 'Unavailable'}</small>}</label>)}</fieldset>
    {template && <>
      <div className="rm-commit-row" role="group" aria-label="Answer">{template.options.map((o) => <button key={o.id} type="button" aria-pressed={draft.optionId === o.id} onClick={() => set({ optionId: o.id })}>{o.label}</button>)}</div>
      <div className="rm-commit-row" role="group" aria-label="Window">{template.horizons.map((h) => <button key={h.id} type="button" aria-pressed={draft.horizonId === h.id} onClick={() => set({ horizonId: h.id })}>{h.label}</button>)}</div>
    </>}
    <div className="rm-commit-row" role="group" aria-label="Points to commit">{COMMIT_AMOUNTS.map((n) => <button key={n} type="button" aria-pressed={draft.amount === n} disabled={n > bank.availablePoints} onClick={() => set({ amount: n })}>{n} pts</button>)}</div>
    {quote ? <div className="rm-commit-review" role="group" aria-label="Review offer">
      <p className="rm-commit-offer">{offerSentence(quote)}</p>
      <p className="rm-muted">{quote.multiplier.toFixed(2)}× total return · {quote.probabilityLabel}{quote.firstCaller ? ' · First caller bonus' : ''}</p>
      <div className="rm-commit-row"><button className="rm-primary" disabled={busy} onClick={() => { void create(); }}>{busy ? 'Creating…' : error?.retry ? 'Retry' : 'Create call and commit'}</button><button onClick={() => setQuote(undefined)} disabled={busy}>Back</button></div>
    </div> : <div className="rm-commit-row"><button className="rm-primary" disabled={!complete || busy} onClick={() => { void review(); }}>{busy ? 'Getting offer…' : 'Review offer'}</button>{onClose && <button onClick={onClose}>Close</button>}</div>}
    {error && <p className="rm-error" role="alert">{error.message}</p>}
  </section>;
}
