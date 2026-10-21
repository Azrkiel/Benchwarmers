// Markdown rules served at benchwarmers://rules. Numbers come from the shared scoring config.
import { FANTASY_SCORING, PICK_BASE_POINTS, ROSTER_SIZE, STREAK_MULTIPLIERS, type StatType } from '../shared/types.js';

const STAT_LABELS: Record<StatType, string> = {
  pts2: '2-point basket',
  pts3: '3-pointer',
  ft: 'Free throw',
  reb: 'Rebound',
  ast: 'Assist',
  stl: 'Steal',
  blk: 'Block',
  tov: 'Turnover',
};

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function rulesMarkdown(): string {
  const scoring = (Object.keys(STAT_LABELS) as StatType[])
    .map((s) => `| ${STAT_LABELS[s]} | ${fmt(FANTASY_SCORING[s])} |`)
    .join('\n');
  const multipliers = STREAK_MULTIPLIERS.map((m, i) => {
    const when = i === 0 ? 'no correct picks in a row' : i === STREAK_MULTIPLIERS.length - 1 ? `${i}+ correct in a row` : `${i} correct in a row`;
    return `- ${when}: ${fmt(m)}x`;
  }).join('\n');

  return `# Benchwarmers rules

Free to play. No real money, no wagers. Probabilities are info only.

## Draft
- Each person drafts ${ROSTER_SIZE} players from the two teams. Say the player's name or nickname.
- A player already on someone else's team can't be drafted. The reply suggests two alternatives.
- Nobody can draft more than ${ROSTER_SIZE} players.
- When the party starts, empty roster slots are filled automatically by the bench.

## Fantasy scoring (draft players)
| Stat | Points |
| --- | --- |
${scoring}

A drafted player's points are the sum of their stats above. Draft points are the total for all of a person's players.

## Live picks
- Each question is a yes/no or multiple-choice call on what happens next in the game.
- A correct pick earns ${PICK_BASE_POINTS} points before the streak multiplier.
- Streak multipliers:
${multipliers}
- Picks lock when a question locks. Late picks are not accepted.

## Night score
- Night score = draft points + pick points.
- The highest night score wins the night.

## Season
- Season standings persist across watch parties for the crew.
- Season points add up pick points and draft points from every night.
`;
}
