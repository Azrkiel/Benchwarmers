import { BONUS_COPY, type PartyStateResponse, type PickScore } from '@shared/types';
import { formatPoints } from './pops';

export function PickBonus({ score, compact = false }: { score?: PickScore; compact?: boolean }) {
  if (!score?.correct || score.bonuses.length === 0) return null;
  const labels = score.bonuses.map((bonus) => BONUS_COPY[bonus]);
  return (
    <span className="tv-bonus" title={`${labels.join(' + ')} · ${score.factor}× multiplier`}>
      <strong>+{formatPoints(score.points)} pts</strong><span>{(compact ? labels.slice(0, 1) : labels).join(' + ')}</span>
    </span>
  );
}

export function PickBonuses({ state }: { state: PartyStateResponse }) {
  const winners = state.picks.filter((p) => p.propId === state.lastResolvedProp?.id
    && p.score?.correct && p.score.bonuses.length > 0);
  if (winners.length === 0) return null;
  return (
    <details className="tv-bonus-details"><summary>Pick bonuses</summary><section className="tv-pick-bonuses" aria-label="Last pick bonuses">
      
      {winners.map((pick) => (
        <div className="tv-pick-bonus-person" key={pick.memberId}>
          <span>{pick.memberName}</span><PickBonus score={pick.score} />
        </div>
      ))}
    </section></details>
  );
}
