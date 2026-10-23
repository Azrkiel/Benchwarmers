import { describe, expect, it } from 'vitest';
import { RoomStore } from '../../src/room/store.js';
import { answerRoom } from '../../src/room/assistant.js';
import { executeCommand, parseCommand, resolvePlayer } from '../../src/room/commands.js';
import type { RoomView } from '../../src/room/types.js';

function room() {
  let now = 1_000_000;
  const store = new RoomStore({ persist: false, now: () => now, speed: 4 });
  const created = store.create();
  const code = created.view.room.code;
  const seat = store.join(code, { name: 'Maya' });
  const advanceUntil = (done: (view: RoomView) => boolean) => {
    for (let i = 0; i < 2000 && !done(store.view(code)); i++) { now += 500; store.tick(); }
  };
  return { store, code, host: created.hostToken, token: seat.participantToken, advanceUntil, tick: (ms: number) => { now += ms; store.tick(); } };
}

/** A basketball-shaped public view for parser checks until A registers the adapter. */
function basketballView(base: RoomView, options: { id: string; label: string }[]): RoomView {
  return {
    ...base,
    game: { ...base.game, home: { id: 'harbor', short: 'HAR', name: 'Harbor Hawks', color: '#1F7AE0', score: 42 }, away: { id: 'summit', short: 'SUM', name: 'Summit Foxes', color: '#E8642C', score: 39 }, sport: 'basketball', context: { sport: 'basketball', possessionTeamId: 'harbor', possessionPlayerId: null, ball: null, tracking: 'team_possession' } },
    players: [
      { id: 'har-c-34', name: 'Moses Adeyemi', nickname: 'Big Mo', teamId: 'harbor', teamShort: 'HAR', position: 'C', role: '', salary: 8500, multiplier: 1, stats: {}, rawPoints: 0, points: 0, statLine: '' },
      { id: 'har-pg-1', name: 'Jalen Reyes', teamId: 'harbor', teamShort: 'HAR', position: 'PG', role: '', salary: 6500, multiplier: 1, stats: {}, rawPoints: 0, points: 0, statLine: '' },
      { id: 'sum-pg-9', name: 'Kai Reyes', teamId: 'summit', teamShort: 'SUM', position: 'PG', role: '', salary: 6000, multiplier: 1, stats: {}, rawPoints: 0, points: 0, statLine: '' },
    ] as RoomView['players'],
    question: { id: 'bball-q-004', kind: 'next_made_field_goal_value', text: 'Next basket: two or three?', opensAt: 0, locksAt: 1, remainingMs: 8000, status: 'open', pickCounts: {}, options: options.map((o) => ({ ...o, basePoints: 10 })) },
  };
}

describe('command parsing', () => {
  const { store, code } = room();
  const base = store.view(code);

  it('maps "I choose three" to the current target\'s three option', () => {
    const view = basketballView(base, [{ id: 'two', label: 'Two' }, { id: 'three', label: 'Three' }]);
    expect(parseCommand('I choose three', view)).toEqual({ kind: 'pick', questionId: 'bball-q-004', optionId: 'three' });
    expect(parseCommand('Alexa, two', view)).toEqual({ kind: 'pick', questionId: 'bball-q-004', optionId: 'two' });
  });

  it('resolves a team alias within the current options and asks when ambiguous', () => {
    const teams = basketballView(base, [{ id: 'harbor', label: 'Harbor Hawks' }, { id: 'summit', label: 'Summit Foxes' }]);
    expect(parseCommand('Pick the Hawks', teams)).toMatchObject({ kind: 'pick', optionId: 'harbor' });
    const both = basketballView(base, [{ id: 'a', label: 'Harbor Hawks' }, { id: 'b', label: 'Hawks win big' }]);
    expect(parseCommand('hawks win big', both)).toMatchObject({ kind: 'clarify' });
  });

  it('resolves athletes by nickname and asks when a name is ambiguous', () => {
    const view = basketballView(base, []);
    expect(parseCommand('Make Big Mo my captain', view)).toEqual({ kind: 'set_captain', playerId: 'har-c-34' });
    expect(resolvePlayer(view, 'Reyes')).toEqual({ reply: 'Which one: Jalen Reyes or Kai Reyes?' });
    expect(parseCommand('make Reyes my captain', view)).toMatchObject({ kind: 'clarify' });
  });

  it('treats questions as reads, not picks', () => {
    const view = basketballView(base, [{ id: 'two', label: 'Two' }, { id: 'three', label: 'Three' }]);
    expect(parseCommand('Who has the ball?', view)).toEqual({ kind: 'read', topic: 'possession' });
    expect(parseCommand("What's my rank?", view)).toEqual({ kind: 'read', topic: 'rank' });
    expect(parseCommand("what's the score", view)).toEqual({ kind: 'read', topic: 'score' });
    expect(parseCommand('Build a balanced lineup for me', view)).toEqual({ kind: 'auto_lineup', style: 'balanced' });
    expect(parseCommand('Show season standings', view)).toEqual({ kind: 'navigate', view: 'season' });
  });
});

describe('command execution', () => {
  it('builds a legal lineup and reports the saved cost', () => {
    const { store, code, token } = room();
    const result = answerRoom(store, code, { text: 'Build a balanced lineup for me', participantToken: token });
    expect(result.accepted).toBe(true);
    expect(result.view.me!.lineup!.flexIds).toHaveLength(4);
    expect(result.reply).toContain(`$${result.view.me!.lineup!.salaryUsed.toLocaleString('en-US')}`);
  });

  it('accepts a spoken pick once and never repeats it', () => {
    const r = room();
    r.store.host(r.code, { hostToken: r.host, action: 'start' });
    r.advanceUntil((v) => v.question?.status === 'open');
    const q = r.store.view(r.code).question!;
    const option = q.options[0]!;
    const first = executeCommand(r.store, r.code, { kind: 'pick', questionId: q.id, optionId: option.id }, { participantToken: r.token });
    expect(first).toMatchObject({ accepted: true, reply: `${option.label} accepted.` });
    const version = r.store.view(r.code).version;
    const again = executeCommand(r.store, r.code, { kind: 'pick', questionId: q.id, optionId: option.id }, { participantToken: r.token });
    expect(again.reply).toBe(`${option.label} is already your pick.`);
    expect(r.store.view(r.code).version).toBe(version);
  });

  it('rejects an answer that arrives after the call closed', () => {
    const r = room();
    r.store.host(r.code, { hostToken: r.host, action: 'start' });
    r.advanceUntil((v) => v.question?.status === 'open');
    const q = r.store.view(r.code).question!;
    r.advanceUntil((v) => v.question?.id !== q.id || v.question.status !== 'open');
    const late = executeCommand(r.store, r.code, { kind: 'pick', questionId: q.id, optionId: q.options[0]!.id }, { participantToken: r.token });
    expect(late.accepted).toBe(false);
    expect(late.reply).toBe('That call has closed. Nothing was accepted.');
    expect(late.view.me?.currentPick?.questionId).not.toBe(q.id);
  });

  it('never spends points without a bound participant', () => {
    const r = room();
    r.store.host(r.code, { hostToken: r.host, action: 'start' });
    r.advanceUntil((v) => v.question?.status === 'open');
    const before = r.store.view(r.code).version;
    const result = answerRoom(r.store, r.code, { text: r.store.view(r.code).question!.options[0]!.label });
    expect(result).toMatchObject({ accepted: false, reply: 'Choose who you are first. Nothing was changed.' });
    expect(r.store.view(r.code).version).toBe(before);
  });

  it('refuses host commands without a valid host credential', () => {
    const r = room();
    const before = r.store.view(r.code).version;
    expect(answerRoom(r.store, r.code, { text: 'start the game', participantToken: r.token }).reply).toBe('Only the host can start the game.');
    expect(answerRoom(r.store, r.code, { text: 'start the game', hostToken: 'wrong' }).reply).toBe('Only the host can start the game.');
    expect(r.store.view(r.code).room.phase).toBe('lobby');
    expect(r.store.view(r.code).version).toBe(before);
    expect(answerRoom(r.store, r.code, { text: 'start the game', hostToken: r.host }).accepted).toBe(true);
    expect(answerRoom(r.store, r.code, { text: 'pause the replay', hostToken: r.host }).reply).toBe('Replay paused. Answer time is paused too.');
  });

  it('answers public reads without a seat and keeps rank private to a bound seat', () => {
    const r = room();
    expect(answerRoom(r.store, r.code, { text: 'who has the ball?' }).reply).toBe('Possession is unknown right now.');
    expect(answerRoom(r.store, r.code, { text: "what's my rank?" }).reply).toBe('Choose who you are first, then ask again.');
    expect(answerRoom(r.store, r.code, { text: "what's my rank?", participantToken: r.token }).reply).toMatch(/^Maya, you are number 1 of 1/);
    expect(answerRoom(r.store, r.code, { text: 'show season standings' }).reply).toBe('Season standings open after the final.');
  });
});

describe('voice on a real basketball room', () => {
  function basketball() {
    let now = 2_000_000;
    const store = new RoomStore({ persist: false, now: () => now, speed: 4 });
    const created = store.create({ gameId: 'harbor-vs-summit' });
    const code = created.view.room.code;
    const seat = store.join(code, { name: 'Maya' });
    store.autoLineup(code, { participantToken: seat.participantToken });
    store.host(code, { hostToken: created.hostToken, action: 'start' });
    for (let i = 0; i < 4000 && store.view(code).question?.status !== 'open'; i++) { now += 250; store.tick(); }
    return { store, code, token: seat.participantToken };
  }

  it('answers an open basketball call by voice with a receipt-backed acceptance', () => {
    const { store, code, token } = basketball();
    const q = store.view(code).question!;
    expect(store.view(code).game.sport).toBe('basketball');
    const [first, second] = q.options;
    const said = answerRoom(store, code, { text: first!.label, participantToken: token });
    expect(said).toMatchObject({ accepted: true, reply: `${first!.label} accepted.` });
    expect(said.view.me!.currentPick).toEqual({ questionId: q.id, optionId: first!.id });
    // Change, then change back: each is a new request, so the latest answer wins.
    expect(answerRoom(store, code, { text: second!.label, participantToken: token }).view.me!.currentPick!.optionId).toBe(second!.id);
    expect(answerRoom(store, code, { text: first!.label, participantToken: token }).view.me!.currentPick!.optionId).toBe(first!.id);
  });

  it('reports possession from the basketball context', () => {
    const { store, code } = basketball();
    const reply = answerRoom(store, code, { text: 'who has the ball?' }).reply;
    const view = store.view(code);
    const id = view.game.context!.possessionTeamId;
    const team = id === view.game.home.id ? view.game.home : id === view.game.away.id ? view.game.away : undefined;
    expect(reply).toBe(team ? `${team.name} have the ball.` : 'Possession is unknown right now.');
  });
});

describe('commitment phrases', () => {
  it('never turns "put 25 points on the Hawks" into a free pick', () => {
    const { store, code } = room();
    const view = basketballView(store.view(code), [{ id: 'harbor', label: 'Harbor Hawks' }, { id: 'summit', label: 'Summit Foxes' }]);
    expect(parseCommand('Put 25 points on the Hawks scoring next', view)).toEqual({ kind: 'commit', questionId: 'bball-q-004', optionId: 'harbor', amount: 25 });
    expect(parseCommand('confirm', view)).toEqual({ kind: 'commit_confirm' });
  });

  it('refuses commitments without changing anything until the room supports them', () => {
    const r = room();
    r.store.host(r.code, { hostToken: r.host, action: 'start' });
    r.advanceUntil((v) => v.question?.status === 'open');
    const before = r.store.view(r.code).version;
    const label = r.store.view(r.code).question!.options[0]!.label;
    const result = answerRoom(r.store, r.code, { text: `put 25 points on ${label}`, participantToken: r.token });
    expect(result).toMatchObject({ accepted: false, reply: 'Committing points is not available in this room yet. Nothing was changed.' });
    expect(r.store.view(r.code).version).toBe(before);
  });
});
