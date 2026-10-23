import type { RoomStanding } from '@shared/room';
import type { BankSummary } from './points/types';

const fmt = (n: number) => Number(n || 0).toFixed(1);
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmt(Math.abs(n))}`;

/**
 * Night total vs. call bank, kept apart (P10.8). Standings count lineup + free picks +
 * settled call net; open reserves and the 100-point starting grant never move them.
 * The bank is what can be committed next. The total is the server's, never recomputed here.
 */
export function BankPanel({ standing, bank }: { standing: Pick<RoomStanding, 'fantasyPoints' | 'predictionPoints' | 'total'>; bank: BankSummary }) {
  return <section className="rm-bank" aria-label="Points and bank">
    <div className="rm-bank-col">
      <h3>Tonight's total</h3>
      <dl>
        <div><dt>Lineup</dt><dd>{fmt(standing.fantasyPoints)}</dd></div>
        <div><dt>Free picks</dt><dd>{fmt(standing.predictionPoints)}</dd></div>
        <div><dt>Settled calls</dt><dd>{signed(bank.settledRiskNet)}</dd></div>
        <div className="rm-bank-sum"><dt>Total</dt><dd>{fmt(standing.total)}</dd></div>
      </dl>
    </div>
    <div className="rm-bank-col">
      <h3>Call bank</h3>
      <dl>
        <div><dt>Available</dt><dd>{fmt(bank.availablePoints)}</dd></div>
        <div><dt>Reserved on open calls</dt><dd>{fmt(bank.reservedPoints)}</dd></div>
        {bank.correctionDebt > 0 && <div className="rm-bank-debt"><dt>Correction to clear</dt><dd>{fmt(bank.correctionDebt)}</dd></div>}
      </dl>
      <p className="rm-muted">Started with {fmt(bank.grantPoints)}; that grant is not part of your total.{bank.correctionDebt > 0 ? ' New commitments are paused until the correction is cleared by later points.' : bank.availablePoints < 10 ? ' Free picks still count while the bank is low.' : ''}</p>
    </div>
  </section>;
}
