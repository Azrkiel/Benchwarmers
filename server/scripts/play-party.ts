// Plays one whole Benchwarmers party against a temp store and prints standings.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GameError, Store } from '../src/game/store.js';
import type { PartyStateResponse, StandingRow } from '../src/shared/types.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-play-'));
let clock = Date.now();
const store = new Store({ dataFile: path.join(tmp, 'store.json'), now: () => clock, speed: 4 });
const CREW = 'sunday-crew';
const MEMBERS = ['maya', 'sam', 'priya', 'leo'];

let exitCode = 0;
function fail(msg: string): void {
  console.error(`SELF-CHECK FAILED: ${msg}`);
  exitCode = 1;
}

// Per-member scripted choices by prop id (valid option ids from props.json); mix of right and wrong.
const CHOICES: Record<string, Record<string, string>> = {
  maya: { 'fb-1': 'home', 'fb-2': 'three', 'fb-3': 'over', 'fb-4': 'home', 'fb-5': 'two', 'fb-6': 'over', 'fb-7': 'home', 'fb-8': 'over' },
  sam: { 'fb-1': 'away', 'fb-2': 'other', 'fb-3': 'under', 'fb-4': 'away', 'fb-5': 'three', 'fb-6': 'under', 'fb-7': 'away', 'fb-8': 'under' },
  priya: { 'fb-1': 'home', 'fb-2': 'other', 'fb-3': 'over', 'fb-4': 'none', 'fb-5': 'ft', 'fb-6': 'over', 'fb-7': 'none', 'fb-8': 'over' },
  leo: { 'fb-1': 'away', 'fb-2': 'three', 'fb-3': 'under', 'fb-4': 'home', 'fb-5': 'three', 'fb-6': 'under', 'fb-7': 'home', 'fb-8': 'under' },
};

function describe(err: unknown): string {
  return err instanceof GameError ? `${err.code}: ${err.message}` : String(err);
}

try {
  const party = store.createParty({ crewId: CREW, gameId: 'harbor-vs-summit' });
  const code = party.code;
  console.log(`Party created: code ${code}`);

  store.onLifecycle((e) => {
    if (e.type === 'party_started') console.log('[lifecycle] party_started');
    else if (e.type === 'party_final') console.log('[lifecycle] party_final');
    else if (e.type === 'prop_resolved') {
      const p = store.getState(code).props.find((x) => x.id === e.propId);
      const label = p?.options.find((o) => o.id === p.correctOptionId)?.label ?? '?';
      console.log(`[lifecycle] prop_resolved ${e.propId}: "${p?.question}" -> ${label}`);
    }
  });

  // ---- Draft ----
  console.log('\n== Draft ==');
  const draft = (who: string, playerId: string): void => {
    store.draft(code, who, playerId);
    console.log(`  ${who} drafted ${playerId}`);
  };
  draft('maya', 'har-c-34'); // Big Mo
  draft('sam', 'har-sg-7'); // Splash
  draft('priya', 'sum-pg-2'); // Quick Kai
  draft('leo', 'sum-c-50');
  try {
    draft('sam', 'har-c-34'); // already taken by Maya
    fail('expected PLAYER_TAKEN');
  } catch (err) {
    console.log(`  caught ${describe(err)}`);
    if (err instanceof GameError && err.alternatives?.length) {
      console.log(`  suggested: ${err.alternatives.map((a) => a.nickname ?? a.name).join(', ')}`);
      draft('sam', err.alternatives[0]!.id);
    } else {
      draft('sam', 'har-pg-1');
    }
  }
  draft('maya', 'sum-sf-14');
  draft('priya', 'har-sf-11');
  draft('priya', 'sum-pf-32');
  draft('sam', 'sum-sg-10');

  // Two members pick during drafting (gameT 0).
  for (const who of ['maya', 'sam']) {
    try {
      store.pick(code, who, CHOICES[who]!['fb-1']!, 'fb-1');
      console.log(`  ${who} picked early on fb-1`);
    } catch (err) {
      console.log(`  ${who} early pick error: ${describe(err)}`);
    }
  }

  store.start(code);
  const s0 = store.getState(code);
  console.log('\nAuto-filled by the bench:');
  for (const e of s0.draftBoard.filter((x) => x.auto)) {
    console.log(`  ${e.ownerName}: ${e.player.name}${e.player.nickname ? ` (${e.player.nickname})` : ''}`);
  }

  // ---- Live ----
  console.log('\n== Live ==');
  const picked = new Set<string>(['maya:fb-1', 'sam:fb-1']);
  let lastMinute = -1;
  let st: PartyStateResponse = s0;
  let guard = 0;
  while (st.party.status !== 'final' && guard++ < 10000) {
    clock += 500;
    store.tick();
    st = store.getState(code);
    const gt = st.game.gameT;
    for (const p of st.props) {
      if (gt < p.opensAt || gt >= p.locksAt) continue;
      for (const who of MEMBERS) {
        const key = `${who}:${p.id}`;
        if (picked.has(key)) continue;
        picked.add(key);
        const opt = CHOICES[who]?.[p.id];
        if (!opt) continue;
        try {
          store.pick(code, who, opt, p.id);
        } catch (err) {
          console.log(`  ${who} pick on ${p.id} failed: ${describe(err)}`);
        }
      }
    }
    const minute = Math.floor(gt / 60);
    if (minute !== lastMinute) {
      lastMinute = minute;
      const leader = st.standings[0];
      console.log(
        `  ${st.game.clock.padEnd(8)} ${st.game.home.short} ${st.game.home.score} - ${st.game.away.score} ${st.game.away.short}  leader: ${leader ? `${leader.name} (${leader.total})` : '-'}`,
      );
    }
  }
  if (st.party.status !== 'final') fail('party never reached final');

  // ---- Results ----
  const nameOf = new Map(st.draftBoard.map((e) => [e.player.id, e.player.nickname ?? e.player.name]));
  console.log(`\nFINAL: ${st.game.home.name} ${st.game.home.score} - ${st.game.away.score} ${st.game.away.name}\n`);
  console.table(
    st.standings.map((r: StandingRow) => ({
      Rank: r.rank,
      Name: r.name,
      Household: r.household,
      Draft: r.draftPoints,
      Picks: r.pickPoints,
      Total: r.total,
      Streak: r.streak,
      Roster: r.roster.map((f) => `${nameOf.get(f.playerId) ?? f.playerId} ${f.points}`).join(', '),
    })),
  );
  const bw = st.benchwarmerOfTheNight;
  console.log(bw ? `Benchwarmer of the night: ${bw.playerName} (${bw.ownerName}, ${bw.points} pts)\n` : 'No benchwarmer\n');

  const season = store.getSeason(CREW);
  console.log('Season:');
  console.table(
    season.rows.map((r) => ({
      Rank: r.rank,
      Name: r.name,
      Points: r.points,
      Fantasy: r.fantasyPoints,
      'Nights won': r.nightsWon,
      'Best streak': r.bestStreak,
      'Correct/Total': `${r.correct}/${r.total}`,
      'Best draft pick': r.bestDraftPick ?? '-',
    })),
  );

  if (st.standings.length !== 4) fail(`expected 4 standings rows, got ${st.standings.length}`);
  if (st.standings.every((r) => r.draftPoints === 0)) fail('every draftPoints is 0');
  if (st.standings.every((r) => r.pickPoints === 0)) fail('every pickPoints is 0');
} catch (err) {
  console.error(`play-party crashed: ${describe(err)}`);
  if (err instanceof Error && err.stack) console.error(err.stack);
  exitCode = 1;
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
process.exit(exitCode);
