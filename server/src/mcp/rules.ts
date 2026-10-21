// Markdown rules served at benchwarmers://rules. Numbers come from the shared scoring config.
import {
  CONTRARIAN,
  FANTASY_SCORING,
  ODDS_MULTIPLIER,
  PICK_BASE_POINTS,
  PICK_FACTOR_CAP,
  ROSTER_SIZE,
  SPEED_BUCKETS,
  STREAK_MULTIPLIERS,
  type StatType,
} from '../shared/types.js';

const STAT_LABELS: Record<StatType, string> = {
  pts2: '2-point basket',
  pts3: '3-pointer',
  ft: 'Free throw',
  reb: 'Rebound',
  ast: 'Assist',
  stl: 'Steal',
  blk: 'Block',
  tov: 'Turnover',
  pass_td: 'Passing touchdown',
  rush_td: 'Rushing touchdown',
  rec_td: 'Receiving touchdown',
  fg: 'Field goal',
  xp: 'Extra point',
  pass_yds: 'Passing yard',
  rush_yds: 'Rushing yard',
  rec_yds: 'Receiving yard',
  int: 'Interception thrown',
  fumble: 'Fumble lost',
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

  const pct = (f: number) => `${Math.round(f * 100)}%`;
  const speed = SPEED_BUCKETS.map((b) => `| Within the first ${pct(b.maxF)} of the window | ${b.factor}x |`).join('\n');

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

## Pick bonuses
Bonuses multiply the ${PICK_BASE_POINTS} base points on a correct pick. A wrong pick scores 0.

### Speed
| When you call it | Multiplier |
| --- | --- |
${speed}

The window runs from when a question opens to when it locks. Later calls get no speed bonus.

### Against the room
| Call | Multiplier |
| --- | --- |
| Lone call: the only person on an option, with at least ${CONTRARIAN.loneMinPickers} people picking | ${CONTRARIAN.lone}x |
| Call against the room: under half the pickers on your option, with at least ${CONTRARIAN.minorityMinPickers} people picking | ${CONTRARIAN.minority}x |

### Rarer calls (football drives)
On football drive questions the multiplier is the target chance (${ODDS_MULTIPLIER.target}) divided by the chance of your option, kept between ${ODDS_MULTIPLIER.min}x and ${ODDS_MULTIPLIER.max}x. The rarer the call, the more it earns. Anything above 1x is a bold call.

### Cap and rounding
Streak multiplier times all bonuses is capped at ${PICK_FACTOR_CAP}x combined. Points round to the nearest half point.

## Night score
- Night score = draft points + pick points.
- The highest night score wins the night.

## Season
- Season standings persist across watch parties for the crew.
- Season points add up pick points and draft points from every night.
`;
}
