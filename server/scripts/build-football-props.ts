// Builds the fallback football drive props from the committed replay and writes them into
// src/ai/fallback/props.json (basketball entries are left untouched).
// Run from server/: npx tsx scripts/build-football-props.ts
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { driveOddsProp } from '../src/game/odds.js';
import type { DriveState, Game, Prop } from '../src/shared/types.js';

export const FOOTBALL_GAME_ID = 'riverton-vs-ironwood';

/** Which drives become props, and which question each asks. Windows never overlap (drives are sequential). */
export const FOOTBALL_PICKS: { driveId: string; outcome: 'score' | 'td' }[] = [
  { driveId: 'd01', outcome: 'score' },
  { driveId: 'd02', outcome: 'td' },
  { driveId: 'd03', outcome: 'score' },
  { driveId: 'd04', outcome: 'td' },
  { driveId: 'd07', outcome: 'td' },
  { driveId: 'd08', outcome: 'score' },
  { driveId: 'd09', outcome: 'td' },
  { driveId: 'd10', outcome: 'score' },
];

const LOCK_AFTER_SEC = 30;

function teamNickname(game: Game, side: 'home' | 'away'): string {
  const name = (side === 'home' ? game.home : game.away).name;
  return name.split(' ').at(-1)!;
}

/** Pure: the 8 football drive props for a game. */
export function buildFootballProps(game: Game): Prop[] {
  return FOOTBALL_PICKS.map(({ driveId, outcome }, i) => {
    const start = game.events.find((e) => e.type === 'drive' && !e.driveResult && e.drive?.id === driveId);
    const end = game.events.find((e) => e.driveResult !== undefined && e.drive?.id === driveId);
    if (!start?.drive || !end) throw new Error(`drive ${driveId} not found in ${game.id}`);
    const drive: DriveState = start.drive;
    const nick = teamNickname(game, drive.team);
    const question =
      outcome === 'td' ? `Will the ${nick} get a touchdown on this drive?` : `Will the ${nick} score on this drive?`;
    return {
      id: `ff-${i + 1}`,
      gameId: game.id,
      question,
      options: [
        { id: 'yes', label: 'Yes' },
        { id: 'no', label: 'No' },
      ],
      opensAt: start.t,
      locksAt: start.t + LOCK_AFTER_SEC,
      resolvesAt: end.t,
      resolver: { kind: 'driveResult', driveId, outcome },
      source: 'fallback',
      odds: driveOddsProp(drive, outcome),
    } satisfies Prop;
  });
}

function main(): void {
  const gameUrl = new URL(`../src/game/games/${FOOTBALL_GAME_ID}.json`, import.meta.url);
  const propsUrl = new URL('../src/ai/fallback/props.json', import.meta.url);
  const game = JSON.parse(fs.readFileSync(gameUrl, 'utf8')) as Game;
  const raw = fs.readFileSync(propsUrl, 'utf8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const existing = JSON.parse(raw) as Prop[];
  const kept = existing.filter((p) => p.gameId !== FOOTBALL_GAME_ID);
  const out = JSON.stringify([...kept, ...buildFootballProps(game)], null, 2).replace(/\n/g, eol) + eol;
  fs.writeFileSync(propsUrl, out);
  console.log(`wrote ${kept.length} existing + ${FOOTBALL_PICKS.length} football props`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
