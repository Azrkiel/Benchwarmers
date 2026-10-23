import { BrandLockup } from '../brand/Brand';
import { RoomRequestError } from './api';
import { BankPanel } from './BankPanel';
import { CallsList } from './Calls';
import { CommitPoints } from './CommitPoints';
import { CreateCall } from './CreateCall';
import { basketballFixture } from './fixtures/basketball';
import { PregamePick } from './PregamePick';
import type { CallTemplate, CommitQuote } from './points/types';
import './room.css';

/**
 * DEV-ONLY fixture preview of the Phase 10/11/13 screens (route /preview/points, dev
 * builds only). The quote/commit callbacks are local stand-ins: nothing here talks to
 * Worker A's services, which do not exist yet.
 */
const view = basketballFixture('open');
const bank = { grantPoints: 100, availablePoints: 75, reservedPoints: 25, settledRiskNet: 0, correctionDebt: 0 };
const catalog: CallTemplate[] = [
  { id: 'next_score_team', label: 'Which team scores next', options: [{ id: 'harbor', label: 'Harbor Hawks' }, { id: 'summit', label: 'Summit Foxes' }], horizons: [{ id: 'h180', label: 'Next 3 game minutes' }], available: true },
  { id: 'next_made_field_goal_value', label: 'Next made basket: two or three', options: [{ id: 'two', label: 'Two' }, { id: 'three', label: 'Three' }], horizons: [{ id: 'h180', label: 'Next 3 game minutes' }], available: true },
  { id: 'team_next_possession_three', label: 'Team hits a three on its next possession', options: [{ id: 'harbor', label: 'Harbor Hawks' }], horizons: [{ id: 'poss', label: 'Next possession' }], available: false, unavailableReason: 'Needs possession-start data' },
];
const fakeQuote = (optionLabel: string, amount: number): CommitQuote => ({ quoteId: `fx-${amount}`, targetId: 'fx', questionId: view.question!.id, optionId: 'three', optionLabel, commitPoints: amount, totalReturnPoints: amount * 3, multiplier: 3, probabilityLabel: 'Demo reference, 33% (fixture)', firstCaller: true, expiresAt: Date.now() + 15000 });

export function PointsPreview() {
  return <main className="rm rm-phone" style={{ maxWidth: 520 }}>
    <header className="rm-header"><BrandLockup size={26} /><span className="rd-fixture" style={{ background: 'var(--bw-warning)', color: '#0b0b0d', padding: '4px 8px', borderRadius: 3, fontWeight: 600 }}>FIXTURE PREVIEW</span></header>
    <PregamePick state={{ questionId: 'pg', closesAt: Date.now() + 90000, status: 'open', resolutionRule: 'The final score decides it, not a market settlement.', crowd: { home: 3, away: 1 } }} home={view.game.home} away={view.game.away} onPick={async () => undefined} />
    <CommitPoints question={view.question!} bank={bank} defaultOptionId="three" onQuote={async (_o, amount) => fakeQuote('Three', amount)} onConfirm={async () => { throw new RoomRequestError('Fixture preview: nothing is committed.', 409, 'PREVIEW'); }} />
    <CreateCall catalog={catalog} bank={bank} onQuote={async (draft) => fakeQuote(draft.optionId ?? '', draft.amount)} onCreate={async () => { throw new RoomRequestError('Fixture preview: no call is created.', 409, 'PREVIEW'); }} />
    <BankPanel standing={view.standings[0]!} bank={bank} />
    <CallsList className="rm-calls" calls={[{ id: 'c1', templateId: 'next_score_team', creatorName: 'Maya', optionLabel: 'Hawks score next', horizonLabel: 'Next 3 game minutes', followers: 2, createdAt: 1, state: 'pending' }]} />
  </main>;
}
