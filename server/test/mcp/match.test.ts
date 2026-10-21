import { describe, expect, it } from 'vitest';
import type { Game, Prop } from '../../src/shared/types.js';
import { fallbackProps, getGame } from '../../src/game/games.js';
import { seedState } from '../../src/game/seed.js';
import {
  editDistance,
  matchCrew,
  matchGame,
  matchHousehold,
  matchMember,
  matchPlayer,
  matchPosition,
  matchPropOption,
  matchTeam,
  normalize,
  type MemberCandidate,
} from '../../src/mcp/match.js';

const game = getGame('harbor-vs-summit') as Game;
const props = fallbackProps('harbor-vs-summit');
const prop = (id: string): Prop => props.find((p) => p.id === id) as Prop;
const { crews, households } = seedState(Date.now());

const members: MemberCandidate[] = households.flatMap((h) =>
  h.members.map((m) => ({ memberId: m.id, name: m.name, household: h.name, householdId: h.id })),
);

function val<T>(r: { ok: boolean } & Record<string, unknown>): T {
  expect(r.ok, JSON.stringify(r)).toBe(true);
  return (r as unknown as { value: T }).value;
}
const playerId = (input: string, taken: string[] = []) => {
  const r = matchPlayer(input, game, { takenIds: taken });
  return r.ok ? r.value.id : `${r.code}: ${r.message}`;
};
const optId = (input: string, propId: string) => {
  const r = matchPropOption(input, prop(propId), game);
  return r.ok ? r.value.id : r.code;
};

describe('normalize / editDistance', () => {
  it('lowercases, strips diacritics and apostrophes, collapses punctuation', () => {
    expect(normalize("Sam's Place")).toBe('sams place');
    expect(normalize('Máya')).toBe('maya');
    expect(normalize('  Three-pointer!  ')).toBe('three pointer');
    expect(normalize('#34')).toBe('34');
    expect(normalize('no.  7')).toBe('no 7');
    expect(normalize('')).toBe('');
  });
  it('computes Levenshtein distance', () => {
    expect(editDistance('', '')).toBe(0);
    expect(editDistance('abc', '')).toBe(3);
    expect(editDistance('kitten', 'sitting')).toBe(3);
    expect(editDistance('maya', 'mya')).toBe(1);
    expect(editDistance('same', 'same')).toBe(0);
  });
});

describe('matchCrew', () => {
  it.each(['Sunday Crew', 'sunday', 'the sunday crew', 'sunday-crew', 'the Seattle crew', 'Austin', 'the Garcias', "Sam's place", 'sams place'])(
    '%s -> sunday-crew',
    (s) => {
      expect(val<{ id: string }>(matchCrew(s, crews, households)).id).toBe('sunday-crew');
    },
  );
  it('tolerates a speech error', () => {
    expect(val<{ id: string }>(matchCrew('sundey crew', crews, households)).id).toBe('sunday-crew');
  });
  it('NOT_FOUND lists crews', () => {
    const r = matchCrew('Tuesday Squad', crews, households);
    expect(r).toEqual({
      ok: false,
      code: 'NOT_FOUND',
      message: "I couldn't find a crew called Tuesday Squad. Your crews are: Sunday Crew.",
      options: ['Sunday Crew'],
    });
  });
  it('AMBIGUOUS when two crews share a household city', () => {
    const two = [...crews, { id: 'other', name: 'Other Crew', householdIds: ['garcias'] }];
    const r = matchCrew('Austin', two, households);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('AMBIGUOUS');
      expect(r.options).toEqual(['Sunday Crew', 'Other Crew']);
    }
  });
});

describe('matchHousehold', () => {
  it.each([
    ['Garcias', 'garcias'],
    ['the garcias', 'garcias'],
    ['Sam\'s Place', 'sams-place'],
    ['sams place', 'sams-place'],
    ['Seattle', 'sams-place'],
    ['austin', 'garcias'],
    ['garcias', 'garcias'],
    ['sams-place', 'sams-place'],
    ['The Garcia household', 'garcias'],
  ])('%s -> %s', (s, id) => {
    expect(val<{ id: string }>(matchHousehold(s, households)).id).toBe(id);
  });
  it('NOT_FOUND lists household names', () => {
    const r = matchHousehold('Denver', households);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('NOT_FOUND');
      expect(r.options).toEqual(['The Garcias', "Sam's Place"]);
      expect(r.message).toContain("The Garcias, Sam's Place");
    }
  });
});

describe('matchMember', () => {
  it.each([
    ['Maya', 'maya'],
    ['maya', 'maya'],
    ['MAYA', 'maya'],
    ['Máya', 'maya'],
    ['Mya', 'maya'],
    ['priya', 'priya'],
    ['Leo', 'leo'],
    ['sam', 'sam'],
  ])('%s -> %s', (s, id) => {
    expect(val<MemberCandidate>(matchMember(s, members)).memberId).toBe(id);
  });
  it('matches by memberId', () => {
    expect(val<MemberCandidate>(matchMember('priya', members)).household).toBe("Sam's Place");
  });
  it('does not fuzzy-match short names', () => {
    const r = matchMember('Pam', members);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('NOT_FOUND');
    expect(matchMember('Lea', members).ok).toBe(false);
  });
  it('NOT_FOUND message lists players', () => {
    const r = matchMember('Zed', members);
    expect(r).toEqual({
      ok: false,
      code: 'NOT_FOUND',
      message: "I don't know anyone called Zed in this party. Players tonight: Maya, Leo, Sam, Priya.",
      options: ['Maya', 'Leo', 'Sam', 'Priya'],
    });
  });
  it('accepts a household hint', () => {
    expect(val<MemberCandidate>(matchMember('Maya from the Garcias', members)).memberId).toBe('maya');
    expect(val<MemberCandidate>(matchMember("Sam at Sam's Place", members)).memberId).toBe('sam');
  });

  const dupes: MemberCandidate[] = [
    { memberId: 'maya-a', name: 'Maya', household: 'The Garcias', householdId: 'garcias' },
    { memberId: 'maya-b', name: 'Maya', household: "Sam's Place", householdId: 'sams-place' },
    { memberId: 'leo', name: 'Leo', household: 'The Garcias', householdId: 'garcias' },
  ];
  it('duplicate names without a hint -> AMBIGUOUS', () => {
    const r = matchMember('Maya', dupes);
    expect(r).toEqual({
      ok: false,
      code: 'AMBIGUOUS',
      message: "There's more than one Maya here. Which household are you in: The Garcias or Sam's Place?",
      options: ['The Garcias', "Sam's Place"],
    });
  });
  it('duplicate names are disambiguated by a hint', () => {
    expect(val<MemberCandidate>(matchMember('Maya from the Garcias', dupes)).memberId).toBe('maya-a');
    expect(val<MemberCandidate>(matchMember("maya at sam's place", dupes)).memberId).toBe('maya-b');
  });
  it('an exact name beats a fuzzy neighbour', () => {
    const mixed: MemberCandidate[] = [
      { memberId: 'maya', name: 'Maya', household: 'A', householdId: 'a' },
      { memberId: 'mara', name: 'Mara', household: 'B', householdId: 'b' },
    ];
    expect(val<MemberCandidate>(matchMember('Maya', mixed)).memberId).toBe('maya');
  });
});

describe('matchPlayer', () => {
  it('exact name, last name, first name, nickname, id', () => {
    expect(playerId('Moses Adeyemi')).toBe('har-c-34');
    expect(playerId('Adeyemi')).toBe('har-c-34');
    expect(playerId('Moses')).toBe('har-c-34');
    expect(playerId('Big Mo')).toBe('har-c-34');
    expect(playerId('big mo')).toBe('har-c-34');
    expect(playerId('har-c-34')).toBe('har-c-34');
    expect(playerId('Splash')).toBe('har-sg-7');
    expect(playerId('Quick Kai')).toBe('sum-pg-2');
    expect(playerId('Kai')).toBe('sum-pg-2');
    expect(playerId('the Viking')).toBe('har-sf-11');
    expect(playerId('Tower')).toBe('sum-c-50');
  });

  it('jersey numbers in digits and words', () => {
    expect(playerId('number 7')).toBe('har-sg-7');
    expect(playerId('#7')).toBe('har-sg-7');
    expect(playerId('7')).toBe('har-sg-7');
    expect(playerId('no. 7')).toBe('har-sg-7');
    expect(playerId('number seven')).toBe('har-sg-7');
    expect(playerId('#34')).toBe('har-c-34');
    expect(playerId('number thirty four')).toBe('har-c-34');
    expect(playerId('thirty-four')).toBe('har-c-34');
    expect(playerId('number fifty')).toBe('sum-c-50');
    expect(playerId('two')).toBe('sum-pg-2');
    expect(playerId("Summit's number 2")).toBe('sum-pg-2');
    expect(playerId('Harbor number 3')).toBe('har-pg-1');
  });

  it('unknown jersey number -> NOT_FOUND', () => {
    expect(playerId('number 99')).toMatch(/^NOT_FOUND/);
  });

  it('number on both teams -> AMBIGUOUS unless a team is given', () => {
    const g: Game = structuredClone(game);
    g.away.roster[0].number = 3; // sum-pg-2 now also wears 3
    const amb = matchPlayer('number 3', g);
    expect(amb.ok).toBe(false);
    if (!amb.ok) {
      expect(amb.code).toBe('AMBIGUOUS');
      expect(amb.options).toEqual(['Jalen Reyes', 'Kai Thompson']);
    }
    expect(val<{ id: string }>(matchPlayer('Summit number 3', g)).id).toBe('sum-pg-2');
    expect(val<{ id: string }>(matchPlayer('Harbor number 3', g)).id).toBe('har-pg-1');
  });

  it('position + team picks the best projected player', () => {
    expect(playerId("Harbor's point guard")).toBe('har-pg-1');
    expect(playerId('Harbor point guard')).toBe('har-pg-1');
    expect(playerId('Harbor Hawks pg')).toBe('har-pg-1');
    expect(playerId('HAR PG')).toBe('har-pg-1');
    expect(playerId('the Foxes center')).toBe('sum-c-50');
    expect(playerId('Summit PG')).toBe('sum-pg-2');
    expect(playerId('Summit shooting guard')).toBe('sum-sg-10');
    expect(playerId('Hawks small forward')).toBe('har-sf-11');
    expect(playerId('the Foxes power forward')).toBe('sum-pf-32');
    expect(playerId('Harbor centre')).toBe('har-c-34');
    expect(playerId('Harbor big man')).toBe('har-c-34');
  });

  it('position without a team spans both teams', () => {
    expect(playerId('point guard')).toBe('sum-pg-2'); // 20.6 beats 18.4
    expect(playerId('center')).toBe('har-c-34');
  });

  it('skips taken players, falls back to the best when all are taken', () => {
    expect(playerId("Harbor's point guard", ['har-pg-1'])).toBe('har-pg-5');
    expect(playerId("Harbor's point guard", ['har-pg-1', 'har-pg-5'])).toBe('har-pg-1');
    expect(playerId('point guard', ['sum-pg-2'])).toBe('har-pg-1');
  });

  it('fuzzy names with edit-distance tolerance', () => {
    expect(playerId('big moe')).toBe('har-c-34');
    expect(playerId('Okafur')).toBe('har-sg-7');
    expect(playerId('Jallen Reyes')).toBe('har-pg-1');
    expect(playerId('Splash Okafur')).toBe('har-sg-7');
    expect(playerId('Adayemi')).toBe('har-c-34');
  });

  it('unknown player -> NOT_FOUND with guidance', () => {
    const r = matchPlayer('Zorbo the Great', game);
    expect(r).toEqual({
      ok: false,
      code: 'NOT_FOUND',
      message:
        "I couldn't find a player called Zorbo the Great. Try a name, a nickname like Big Mo, a jersey number, or something like Harbor's point guard.",
    });
  });
});

describe('matchPropOption', () => {
  it.each([
    ['Hawks', 'home'],
    ['harbor', 'home'],
    ['Harbor Hawks', 'home'],
    ['HAR', 'home'],
    ['home', 'home'],
    ['Foxes', 'away'],
    ['Summit', 'away'],
    ['away', 'away'],
    ['nobody', 'none'],
    ['no one', 'none'],
    ['neither', 'none'],
    ['none', 'none'],
  ])('fb-4: %s -> %s', (s, id) => {
    expect(optId(s, 'fb-4')).toBe(id);
  });

  it.each([
    ['the over', 'over'],
    ['over', 'over'],
    ['more', 'over'],
    ['higher', 'over'],
    ['yes', 'over'],
    ['Over 41.5', 'over'],
    ['under', 'under'],
    ['the under', 'under'],
    ['less', 'under'],
    ['fewer', 'under'],
    ['lower', 'under'],
    ['no', 'under'],
  ])('fb-3: %s -> %s', (s, id) => {
    expect(optId(s, 'fb-3')).toBe(id);
  });

  it.each([
    ['a three', 'three'],
    ['three-pointer', 'three'],
    ['three pointer', 'three'],
    ['3', 'three'],
    ['trey', 'three'],
    ['from downtown', 'three'],
    ['free throw', 'ft'],
    ['foul shot', 'ft'],
    ['from the line', 'ft'],
    ['ft', 'ft'],
    ['one', 'ft'],
    ['two', 'two'],
    ['2', 'two'],
    ['layup', 'two'],
    ['dunk', 'two'],
    ['jumper', 'two'],
    ['bucket', 'two'],
  ])('fb-5: %s -> %s', (s, id) => {
    expect(optId(s, 'fb-5')).toBe(id);
  });

  it.each([
    ['anything else', 'other'],
    ['something else', 'other'],
    ['not a three', 'other'],
    ['other', 'other'],
    ['no', 'other'],
    ['three', 'three'],
    ['a three', 'three'],
  ])('fb-2: %s -> %s', (s, id) => {
    expect(optId(s, 'fb-2')).toBe(id);
  });

  it('only returns options that exist on the prop', () => {
    const r = matchPropOption('free throw', prop('fb-2'), game);
    expect(r).toEqual({
      ok: false,
      code: 'NOT_FOUND',
      message: "That's not one of the choices. You can pick Three-pointer or Anything else.",
      options: ['Three-pointer', 'Anything else'],
    });
    expect(optId('layup', 'fb-2')).toBe('NOT_FOUND');
  });

  it('lists three choices with a comma and "or"', () => {
    const r = matchPropOption('banana', prop('fb-4'), game);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).toBe("That's not one of the choices. You can pick Hawks, Foxes or Nobody.");
      expect(r.options).toEqual(['Hawks', 'Foxes', 'Nobody']);
    }
  });

  it('matches option ids and fuzzy labels', () => {
    expect(optId('under', 'fb-6')).toBe('under');
    expect(optId('Foxs', 'fb-4')).toBe('away');
    expect(optId('thre pointer', 'fb-5')).toBe('three');
  });
});

describe('matchGame', () => {
  const games = [game];
  it.each([undefined, '', '   ', 'Hawks vs Foxes', 'Harbor Hawks vs. Summit Foxes', 'harbor-vs-summit', "Sunday's game", 'the game'])(
    '%s -> harbor-vs-summit',
    (s) => {
      expect(val<Game>(matchGame(s, games)).id).toBe('harbor-vs-summit');
    },
  );

  const other: Game = { ...structuredClone(game), id: 'lakes-vs-peaks', title: 'Lake Loons vs. Peak Pumas' };
  other.home = { ...other.home, id: 'lake', name: 'Lake Loons', short: 'LAK' };
  other.away = { ...other.away, id: 'peak', name: 'Peak Pumas', short: 'PEK' };
  const two = [game, other];

  it('several games: loose token match', () => {
    expect(val<Game>(matchGame('Foxes', two)).id).toBe('harbor-vs-summit');
    expect(val<Game>(matchGame('pumas', two)).id).toBe('lakes-vs-peaks');
    expect(val<Game>(matchGame('LAK', two)).id).toBe('lakes-vs-peaks');
  });
  it('several games, undefined -> first', () => {
    expect(val<Game>(matchGame(undefined, two)).id).toBe('harbor-vs-summit');
  });
  it('several games, no match -> NOT_FOUND listing titles', () => {
    const r = matchGame("Sunday's game", two);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('NOT_FOUND');
      expect(r.options).toEqual(['Harbor Hawks vs. Summit Foxes', 'Lake Loons vs. Peak Pumas']);
      expect(r.message).toContain('Lake Loons vs. Peak Pumas');
    }
  });
  it('no games -> NOT_FOUND', () => {
    const r = matchGame(undefined, []);
    expect(r.ok).toBe(false);
  });
});

describe('matchTeam', () => {
  it.each([
    ['Harbor', 'home'],
    ['the Hawks', 'home'],
    ["Harbor's", 'home'],
    ['home', 'home'],
    ['Foxes', 'away'],
    ['Summit Foxes', 'away'],
    ['SUM', 'away'],
    ['away', 'away'],
  ])('%s -> %s', (input, side) => {
    expect(val(matchTeam(input, game))).toBe(side);
  });
  it('is NOT_FOUND for an unknown team, listing both teams', () => {
    const r = matchTeam('the Lakers', game);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('NOT_FOUND');
      expect(r.options).toEqual([game.home.name, game.away.name]);
    }
  });
  it('is NOT_FOUND when both teams are named', () => {
    expect(matchTeam('Hawks Foxes', game).ok).toBe(false);
  });
});

describe('matchPosition', () => {
  it.each([
    ['point guard', 'PG'],
    ['Point Guards', 'PG'],
    ['PG', 'PG'],
    ['shooting guard', 'SG'],
    ['small forward', 'SF'],
    ['power forward', 'PF'],
    ['C', 'C'],
    ['center', 'C'],
    ['the centers', 'C'],
    ['big man', 'C'],
  ])('%s -> %s', (input, pos) => {
    expect(val(matchPosition(input))).toBe(pos);
  });
  it('is NOT_FOUND for nonsense and lists examples', () => {
    const r = matchPosition('goalie');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('NOT_FOUND');
      expect(r.options?.length).toBeGreaterThan(0);
    }
  });
});
