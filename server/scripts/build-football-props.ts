// Builds the fallback football drive props from the committed replay and writes them into
// src/ai/fallback/props.json (basketball entries are left untouched).
// Run from server/: npx tsx scripts/build-football-props.ts
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { FOOTBALL_GAME_ID, FOOTBALL_PICKS, buildFootballProps } from '../src/game/footballProps.js';
import type { Game, Prop } from '../src/shared/types.js';

export { FOOTBALL_GAME_ID, FOOTBALL_PICKS, autoFootballPicks, buildFootballProps } from '../src/game/footballProps.js';

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
