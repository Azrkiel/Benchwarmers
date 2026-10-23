import { BrandLockup } from '../brand/Brand';
import { RoomRequestError } from './api';
import { BankPanel } from './BankPanel';
import { CallsList } from './Calls';
import { CommitPoints } from './CommitPoints';
import { CreateCall } from './CreateCall';
import { basketballFixture } from './fixtures/basketball';
import { PregamePick } from './PregamePick';
import { catalogTemplates, type CallCatalog, type CommitQuote, type RoomPlayerCall } from './points/types';
import './room.css';

/**
 * DEV-ONLY fixture preview of the Phase 10/11/13 screens (route /preview/points, dev
 * builds only). The quote/commit callbacks are local stand-ins: nothing here talks to
 * Worker A's services, which do not exist yet.
 */
const view = basketballFixture('open');
const bank = { grantPoints: 100, availablePoints: 75, reservedPoints: 25, settledRiskNet: 0, correctionDebt: 0 };
const catalog: CallCatalog = {
  enabled: true,
  templates: [
    { templateId: 'next_score_team', requiredCapabilities: [], resolver: 'next_score_team', fields: [], options: 'teams', optionIds: ['harbor', 'summit'], includesFreeThrows: true },
    { templateId: 'next_made_field_goal_value', requiredCapabilities: [], resolver: 'next_made_field_goal_value', fields: [], options: 'two_three', optionIds: ['two', 'three'], includesFreeThrows: false },
  ],
  window: { questionId: 'fx', anchorSequence: 40, minimumHorizonGameElapsedMs: 1_560_000, maximumHorizonGameElapsedMs: 1_740_000, locksAt: Date.now() + 8000 },
};
const call: RoomPlayerCall = { ...view.question!, id: 'call-1', text: 'Which team scores next?', options: [{ id: 'harbor', label: 'Harbor Hawks', basePoints: 0 }, { id: 'summit', label: 'Summit Foxes', basePoints: 0 }], pickCounts: { harbor: 2, summit: 0 }, creatorId: view.standings[0]!.participantId, createdAt: 1, target: { templateId: 'next_score_team', anchorSequence: 40, horizonGameElapsedMs: 1_620_000, eligibleParticipantIds: [] } };
const fakeQuote = (optionLabel: string, amount: number): CommitQuote => ({ quoteId: `fx-${amount}`, targetId: 'fx', questionId: view.question!.id, optionId: 'three', optionLabel, commitPoints: amount, totalReturnPoints: amount * 3, multiplier: 3, probabilityLabel: 'Demo reference, 33% (fixture)', firstCaller: true, expiresAt: Date.now() + 15000 });

export function PointsPreview() {
  return <main className="rm rm-phone" style={{ maxWidth: 520 }}>
    <header className="rm-header"><BrandLockup size={26} /><span className="rd-fixture" style={{ background: 'var(--bw-warning)', color: '#0b0b0d', padding: '4px 8px', borderRadius: 3, fontWeight: 600 }}>FIXTURE PREVIEW</span></header>
    <PregamePick pregame={{ id: 'pregame', status: 'open', acceptingPicks: true, text: 'Who wins tonight?', options: [{ id: 'summit', label: 'Summit Foxes' }, { id: 'harbor', label: 'Harbor Hawks' }], pickCounts: { harbor: 3, summit: 1 }, cutoff: 'replay_start', correctPoints: 10, resolutionRule: 'The replay final score decides the winner; a tied final voids the pick.' }}
      teams={[view.game.away, view.game.home]} reference={{ status: 'unavailable', reason: 'fictional_game', label: 'Fictional game', reference: null, commitmentQuotingEnabled: false }} onPick={async () => undefined} />
    <CommitPoints question={view.question!} bank={bank} defaultOptionId="three" onQuote={async (_o, amount) => fakeQuote('Three', amount)} onConfirm={async () => { throw new RoomRequestError('Fixture preview: nothing is committed.', 409, 'PREVIEW'); }} />
    <CreateCall catalog={catalogTemplates(catalog, [view.game.home, view.game.away])} bank={bank} onQuote={async (draft) => fakeQuote(draft.optionId ?? '', draft.amount)} onCreate={async () => { throw new RoomRequestError('Fixture preview: no call is created.', 409, 'PREVIEW'); }} />
    <BankPanel standing={view.standings[0]!} bank={bank} />
    <CallsList className="rm-calls" calls={[call]} standings={view.standings} />
  </main>;
}
