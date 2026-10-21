// In-memory game store, persisted as one JSON file. Implements AiSink for the background AI worker.
import fs from 'node:fs';
import path from 'node:path';
import type {
  AiSink,
  Crew,
  DraftBoardEntry,
  DraftPick,
  EventView,
  FantasyPop,
  Game,
  Household,
  Member,
  PartyLifecycleEvent,
  PartyStateResponse,
  Pick,
  Prop,
  PropView,
  RecapContext,
  SeasonResponse,
  SeasonRow,
  SeasonStats,
  StandingRow,
  TeamScore,
  WatchParty,
} from '../shared/types.js';
import * as engine from './engine.js';
import { GameError } from './engine.js';
import { fallbackProps, getGame as lookupGame } from './games.js';
import { seedState, type PartyRecord, type StoreState } from './seed.js';

export type { PartyRecord, StoreState } from './seed.js';
export { GameError } from './engine.js';

export type StoreOptions = { dataFile?: string; now?: () => number; speed?: number; persist?: boolean };

const DEFAULT_GAME = 'harbor-vs-summit';
const TICKER_CAP = 20;

function zeroStats(memberId: string): SeasonStats {
  return { memberId, points: 0, bestStreak: 0, currentStreak: 0, correct: 0, total: 0, partiesPlayed: 0, fantasyPoints: 0, nightsWon: 0 };
}

export class Store implements AiSink {
  readonly speed: number;
  private readonly now: () => number;
  private readonly file: string;
  private readonly persistEnabled: boolean;
  private state: StoreState;
  private listeners = new Set<(e: PartyLifecycleEvent) => void>();

  constructor(opts: StoreOptions = {}) {
    this.now = opts.now ?? Date.now;
    this.speed = opts.speed ?? (Number(process.env.SPEED) || 4);
    this.persistEnabled = opts.persist ?? true;
    // Relative to the process cwd: with `npm start -w server` that is server/data/store.json.
    this.file = path.resolve(process.cwd(), opts.dataFile ?? process.env.DATA_FILE ?? 'data/store.json');
    if (this.persistEnabled && fs.existsSync(this.file)) {
      this.state = JSON.parse(fs.readFileSync(this.file, 'utf8')) as StoreState;
    } else {
      this.state = seedState(this.now());
      this.persist();
    }
  }

  // ---------- persistence + plumbing ----------

  private persist(): void {
    if (!this.persistEnabled) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.state));
    fs.renameSync(tmp, this.file);
  }

  private emit(e: PartyLifecycleEvent): void {
    for (const l of [...this.listeners]) {
      try {
        l(e);
      } catch (err) {
        console.error('[store] lifecycle listener failed', err);
      }
    }
  }

  onLifecycle(listener: (e: PartyLifecycleEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private rec(code: string): PartyRecord {
    const r = this.state.parties[code.trim().toUpperCase()];
    if (!r) throw new GameError('NOT_FOUND', "I couldn't find that watch party.");
    return r;
  }

  private recById(id: string): PartyRecord | undefined {
    return Object.values(this.state.parties).find((r) => r.party.id === id);
  }

  private gameOf(r: PartyRecord): Game {
    const g = lookupGame(r.party.gameId);
    if (!g) throw new GameError('NOT_FOUND', "I couldn't find that game.");
    return g;
  }

  private gameT(r: PartyRecord): number {
    const g = this.gameOf(r);
    switch (r.party.status) {
      case 'final':
        return g.durationSec;
      case 'live':
        return engine.computeGameT(this.now(), r.party.startedAt, this.speed, g.durationSec);
      default:
        return 0;
    }
  }

  private addTicker(r: PartyRecord, line: string): void {
    r.ticker.unshift(line);
    if (r.ticker.length > TICKER_CAP) r.ticker.length = TICKER_CAP;
  }

  private fingerprintOf(r: PartyRecord): string {
    const g = this.gameOf(r);
    const gt = this.gameT(r);
    const visible = g.events.filter((e) => e.t <= gt).length;
    const statuses = r.props.map((p) => engine.propStatus(p, gt)).join(',');
    const ranks = this.standingsOf(r)
      .map((s) => `${s.memberId}${s.rank}`)
      .join(',');
    return `${r.party.status}|${visible}|${statuses}|${ranks}`;
  }

  /** Mutation bookkeeping: refresh fingerprint, bump version, persist. */
  private touch(r: PartyRecord): void {
    r.fingerprint = this.fingerprintOf(r);
    r.party.version += 1;
    this.persist();
  }

  // ---------- lookups ----------

  getCrew(id: string): Crew | undefined {
    return this.state.crews.find((c) => c.id === id);
  }
  getHousehold(id: string): Household | undefined {
    return this.state.households.find((h) => h.id === id);
  }
  listHouseholds(): Household[] {
    return this.state.households;
  }
  listCrews(): Crew[] {
    return this.state.crews;
  }
  getMember(memberId: string): { member: Member; household: Household } | undefined {
    for (const household of this.state.households) {
      const member = household.members.find((m) => m.id === memberId);
      if (member) return { member, household };
    }
    return undefined;
  }
  getParty(code: string): WatchParty | undefined {
    return this.state.parties[code.trim().toUpperCase()]?.party;
  }
  getPartyById(id: string): WatchParty | undefined {
    return this.recById(id)?.party;
  }
  getGame(id: string): Game | undefined {
    return lookupGame(id);
  }
  /** Members of the party's households, household order then member order. */
  partyMembers(code: string): engine.StandingMember[] {
    return this.membersOf(this.rec(code));
  }

  private membersOf(r: PartyRecord): engine.StandingMember[] {
    const out: engine.StandingMember[] = [];
    for (const hid of r.party.householdIds) {
      const h = this.getHousehold(hid);
      if (!h) continue;
      for (const m of h.members) {
        out.push({ memberId: m.id, name: m.name, avatar: m.avatar, household: h.name, householdId: h.id });
      }
    }
    return out;
  }

  private memberNames(r: PartyRecord): Record<string, string> {
    return Object.fromEntries(this.membersOf(r).map((m) => [m.memberId, m.name]));
  }

  private requireMember(r: PartyRecord, memberId: string): engine.StandingMember {
    const m = this.membersOf(r).find((x) => x.memberId === memberId);
    if (!m) throw new GameError('NOT_IN_PARTY', "That person isn't part of this watch party.");
    return m;
  }

  getCurrentPartyCode(crewId: string): string | undefined {
    const mine = Object.values(this.state.parties).filter((r) => r.party.crewId === crewId);
    const newest = (list: PartyRecord[]) =>
      list.reduce<PartyRecord | undefined>((best, r) => (!best || r.party.createdAt >= best.party.createdAt ? r : best), undefined);
    return (newest(mine.filter((r) => r.party.status !== 'final')) ?? newest(mine))?.party.code;
  }

  // ---------- mutations ----------

  createParty(args: { crewId: string; gameId?: string }): WatchParty {
    const crew = this.getCrew(args.crewId);
    if (!crew) throw new GameError('NOT_FOUND', "I couldn't find that crew.");
    const gameId = args.gameId ?? DEFAULT_GAME;
    if (!lookupGame(gameId)) throw new GameError('NOT_FOUND', "I couldn't find that game.");
    let code = '';
    do {
      code = Array.from({ length: 4 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('');
    } while (this.state.parties[code]);
    const r: PartyRecord = {
      party: {
        id: `party-${code.toLowerCase()}`,
        code,
        crewId: crew.id,
        gameId,
        householdIds: [...crew.householdIds],
        createdAt: this.now(),
        status: 'drafting',
        version: 1,
      },
      drafts: [],
      picks: [],
      props: fallbackProps(gameId),
      resolvedPropIds: [],
      lastRanks: {},
      prevRanks: {},
      fingerprint: '',
      seasonApplied: false,
      ticker: [],
    };
    this.state.parties[code] = r;
    r.fingerprint = this.fingerprintOf(r);
    this.persist();
    this.emit({ type: 'party_created', partyId: r.party.id });
    return r.party;
  }

  joinParty(code: string, householdId: string): WatchParty {
    const r = this.rec(code);
    const h = this.getHousehold(householdId);
    if (!h) throw new GameError('NOT_FOUND', "I couldn't find that household.");
    if (!r.party.householdIds.includes(h.id)) {
      r.party.householdIds.push(h.id);
      this.addTicker(r, `${h.name} joined the party`);
      this.touch(r);
    }
    return r.party;
  }

  draft(code: string, memberId: string, playerId: string): DraftPick {
    const r = this.rec(code);
    const member = this.requireMember(r, memberId);
    const game = this.gameOf(r);
    const d = engine.draftPlayer({
      game,
      drafts: r.drafts,
      partyId: r.party.id,
      memberId,
      playerId,
      now: this.now(),
      status: r.party.status,
      memberNames: this.memberNames(r),
    });
    r.drafts.push(d);
    const player = engine.findPlayer(game, playerId)!;
    this.addTicker(r, `${member.name} drafted ${engine.playerLabel(player)}`);
    this.touch(r);
    return d;
  }

  start(code: string): WatchParty {
    const r = this.rec(code);
    if (r.party.status !== 'drafting' && r.party.status !== 'scheduled') {
      throw new GameError('BAD_STATUS', 'The game is already underway.');
    }
    const game = this.gameOf(r);
    const members = this.membersOf(r);
    const now = this.now();
    const added = engine.autoFill(
      game,
      r.drafts,
      r.party.id,
      members.map((m) => m.memberId),
      now,
    );
    for (const d of added) {
      r.drafts.push(d);
      const player = engine.findPlayer(game, d.playerId)!;
      const m = members.find((x) => x.memberId === d.memberId)!;
      this.addTicker(r, `The bench filled in ${engine.playerLabel(player)} for ${m.name}`);
    }
    r.party.startedAt = now;
    r.party.status = 'live';
    this.touch(r);
    this.emit({ type: 'party_started', partyId: r.party.id });
    return r.party;
  }

  pick(code: string, memberId: string, optionId: string, propId?: string, source: 'voice' | 'screen' = 'voice'): Pick {
    const r = this.rec(code);
    if (r.party.status === 'final') throw new GameError('BAD_STATUS', 'The game is over, so picks are closed.');
    const member = this.requireMember(r, memberId);
    const gt = this.gameT(r);
    const isOpen = (p: Prop) => engine.propStatus(p, gt) === 'open';

    let target: Prop | undefined;
    if (propId !== undefined) {
      target = r.props.find((p) => p.id === propId);
      if (!target) throw new GameError('NOT_FOUND', "I couldn't find that question.");
    } else {
      target = r.props.filter(isOpen).sort((a, b) => a.locksAt - b.locksAt)[0];
    }
    if (!target || !isOpen(target)) {
      const upcoming = r.props.filter((p) => engine.propStatus(p, gt) === 'upcoming').sort((a, b) => a.opensAt - b.opensAt)[0];
      if (upcoming) {
        const n = Math.max(1, Math.ceil((upcoming.opensAt - gt) / this.speed));
        throw new GameError('PICKS_LOCKED', `Picks are locked. The next question opens in about ${n} seconds.`);
      }
      throw new GameError('PICKS_LOCKED', 'Picks are locked. That was the last question of the night.');
    }
    const existing = r.picks.find((p) => p.memberId === memberId && p.propId === target.id);
    if (existing && existing.optionId === optionId) return existing; // same option: keep original at/gameT
    const pick: Pick = { partyId: r.party.id, memberId, propId: target.id, optionId, at: this.now(), gameT: gt, source };
    r.picks = engine.upsertPick(r.picks, pick, target, gt);
    const label = target.options.find((o) => o.id === optionId)?.label ?? optionId;
    this.addTicker(r, `${member.name} picked ${label}`);
    this.touch(r);
    return pick;
  }

  reset(code: string): WatchParty {
    const key = code.trim().toUpperCase();
    const r = this.rec(key);
    if (key === 'DEMO') {
      const fresh = seedState(this.now());
      const next = fresh.parties.DEMO;
      next.party.version = r.party.version + 1;
      this.state.parties.DEMO = next;
      this.state.season = fresh.season;
      this.state.bestDraftPoints = fresh.bestDraftPoints;
      next.fingerprint = this.fingerprintOf(next);
      this.persist();
      return next.party;
    }
    r.party.status = 'drafting';
    delete r.party.startedAt;
    r.drafts = [];
    r.picks = [];
    delete r.recap;
    r.lastRanks = {};
    r.prevRanks = {};
    r.resolvedPropIds = [];
    r.ticker = [];
    r.props = fallbackProps(r.party.gameId);
    r.seasonApplied = false;
    this.touch(r);
    return r.party;
  }

  // ---------- clock ----------

  tick(): void {
    let dirty = false;
    const events: PartyLifecycleEvent[] = [];
    for (const r of Object.values(this.state.parties)) {
      if (this.advance(r, events)) dirty = true;
    }
    if (dirty) this.persist();
    for (const e of events) this.emit(e);
  }

  /** Advance one live party to the current clock. Returns true when anything changed (version bumped). */
  private advance(r: PartyRecord, events: PartyLifecycleEvent[]): boolean {
    if (r.party.status !== 'live') return false;
    const game = this.gameOf(r);
    let changed = false;
    const gt = this.gameT(r);

    // Resolve props that just closed, oldest first.
    const toResolve = r.props
      .filter((p) => engine.propStatus(p, gt) === 'resolved' && !r.resolvedPropIds.includes(p.id))
      .sort((a, b) => a.resolvesAt - b.resolvesAt || a.opensAt - b.opensAt);
    for (const p of toResolve) {
      const outcome = engine.resolveProp(p, game.events);
      if (outcome !== undefined) p.correctOptionId = outcome;
      r.resolvedPropIds.push(p.id);
      events.push({ type: 'prop_resolved', partyId: r.party.id, propId: p.id });
      changed = true;
    }

    // Final whistle.
    if (gt >= game.durationSec) {
      r.party.status = 'final';
      events.push({ type: 'party_final', partyId: r.party.id });
      changed = true;
    }

    // Ranks (status is final by now if the game ended, so standings use the full game).
    const standings = this.standingsOf(r);
    if (r.party.status === 'final') this.applySeason(r, standings);
    const newRanks = Object.fromEntries(standings.map((s) => [s.memberId, s.rank]));
    const rolled = engine.rollRanks(r.lastRanks, r.prevRanks, newRanks);
    if (rolled.changed) {
      r.lastRanks = rolled.lastRanks;
      r.prevRanks = rolled.prevRanks;
      changed = true;
    }

    const fp = this.fingerprintOf(r);
    if (fp !== r.fingerprint) {
      r.fingerprint = fp;
      changed = true;
    }
    if (changed) r.party.version += 1;
    return changed;
  }

  private applySeason(r: PartyRecord, standings: StandingRow[]): void {
    if (r.seasonApplied) return;
    const game = this.gameOf(r);
    for (const row of standings) {
      const tally = engine.tallyPicks(row.memberId, r.props, r.picks, game.events, game.durationSec);
      const s = this.state.season[row.memberId] ?? zeroStats(row.memberId);
      s.points = engine.round1(s.points + row.pickPoints);
      s.fantasyPoints = engine.round1(s.fantasyPoints + row.draftPoints);
      s.correct += tally.correct;
      s.total += tally.total;
      s.partiesPlayed += 1;
      if (row.rank === 1) s.nightsWon += 1;
      s.bestStreak = Math.max(s.bestStreak, tally.bestStreak);
      if (tally.total > 0) s.currentStreak = tally.streak;
      const top = [...row.roster].sort((a, b) => b.points - a.points)[0];
      if (top && top.points > (this.state.bestDraftPoints[row.memberId] ?? 0)) {
        const player = engine.findPlayer(game, top.playerId);
        if (player) {
          s.bestDraftPick = `${engine.playerLabel(player)} (${top.points} pts)`;
          this.state.bestDraftPoints[row.memberId] = top.points;
        }
      }
      this.state.season[row.memberId] = s;
    }
    r.seasonApplied = true;
  }

  // ---------- projections ----------

  private standingsOf(r: PartyRecord): StandingRow[] {
    const game = this.gameOf(r);
    return engine.computeStandings({
      members: this.membersOf(r),
      drafts: r.drafts,
      props: r.props,
      picks: r.picks,
      events: game.events,
      gameT: this.gameT(r),
      prevRanks: r.prevRanks,
    });
  }

  private draftBoardOf(r: PartyRecord): DraftBoardEntry[] {
    const game = this.gameOf(r);
    const fantasy = engine.fantasyByPlayer(game.events, this.gameT(r));
    const names = this.memberNames(r);
    const members = this.membersOf(r);
    const notes = this.state.scoutingNotes[game.id] ?? {};
    const side = (team: Game['home'], s: 'home' | 'away') =>
      team.roster.map((player): DraftBoardEntry => {
        const d = r.drafts.find((x) => x.playerId === player.id);
        const f = fantasy.get(player.id);
        const entry: DraftBoardEntry = {
          player,
          side: s,
          teamShort: team.short,
          points: f?.points ?? 0,
          statLine: engine.statLine(f?.stats, game.sport),
        };
        if (d) {
          entry.ownerMemberId = d.memberId;
          entry.ownerName = names[d.memberId];
          entry.householdId = members.find((m) => m.memberId === d.memberId)?.householdId;
          entry.round = d.round;
          if (d.auto) entry.auto = true;
        }
        if (notes[player.id]) entry.scoutingNote = notes[player.id];
        return entry;
      });
    return [...side(game.home, 'home'), ...side(game.away, 'away')];
  }

  private propView(p: Prop, gt: number, picks: Pick[]): PropView {
    const status = engine.propStatus(p, gt);
    const pickCounts: Record<string, number> = Object.fromEntries(p.options.map((o) => [o.id, 0]));
    for (const pk of picks) if (pk.propId === p.id) pickCounts[pk.optionId] = (pickCounts[pk.optionId] ?? 0) + 1;
    const view: PropView = { ...structuredClone(p), status, pickCounts };
    // Do not leak the answer before resolution.
    if (status !== 'resolved') {
      delete view.explanation;
      delete view.correctOptionId;
    }
    if (status === 'open') {
      view.secondsToLock = p.locksAt - gt;
      view.realSecondsToLock = view.secondsToLock / this.speed;
    } else if (status === 'upcoming') {
      view.secondsToOpen = p.opensAt - gt;
    }
    return view;
  }

  getState(code: string, householdId?: string): PartyStateResponse {
    const r = this.rec(code);
    if (householdId !== undefined && !this.getHousehold(householdId)) {
      throw new GameError('NOT_FOUND', "I couldn't find that household.");
    }
    const lifecycle: PartyLifecycleEvent[] = [];
    if (this.advance(r, lifecycle)) this.persist();
    for (const e of lifecycle) this.emit(e);

    const game = this.gameOf(r);
    const gt = this.gameT(r);
    const status = r.party.status;
    const { period, clock } = engine.gameClock(game, gt, status);
    const score = engine.scoreAt(game.events, gt);
    const teamScore = (t: Game['home'], s: number): TeamScore => ({ id: t.id, name: t.name, short: t.short, color: t.color, score: s });

    const names = this.memberNames(r);
    const owners = new Map(r.drafts.map((d) => [d.playerId, d.memberId]));
    const recentEvents: EventView[] = game.events
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => e.t <= gt)
      .sort((a, b) => a.e.t - b.e.t || a.i - b.i)
      .reverse()
      .slice(0, 12)
      .map(({ e, i }) => {
        const fantasy: FantasyPop[] = [];
        for (const f of engine.eventFantasy(e)) {
          const owner = owners.get(f.playerId);
          const player = engine.findPlayer(game, f.playerId);
          if (!owner || !player) continue;
          fantasy.push({
            memberId: owner,
            memberName: names[owner] ?? owner,
            playerId: f.playerId,
            playerName: engine.playerLabel(player),
            points: f.points,
          });
        }
        return { ...e, id: `${game.id}-${i}`, fantasy };
      });

    const sorted = [...r.props].sort((a, b) => a.opensAt - b.opensAt);
    const views = sorted.map((p) => this.propView(p, gt, r.picks));
    const active = views.filter((v) => v.status === 'open').sort((a, b) => a.locksAt - b.locksAt)[0];
    const lastResolved = views.filter((v) => v.status === 'resolved').sort((a, b) => b.resolvesAt - a.resolvesAt)[0];

    const locked = views.filter((v) => v.status === 'locked').map((v) => v.id);
    const shown = new Set([active?.id, lastResolved?.id, ...locked].filter((x): x is string => !!x));
    const picks = r.picks
      .filter((p) => shown.has(p.propId))
      .map((p) => {
        const prop = r.props.find((x) => x.id === p.propId)!;
        const out: PartyStateResponse['picks'][number] = {
          ...p,
          memberName: names[p.memberId] ?? p.memberId,
          optionLabel: prop.options.find((o) => o.id === p.optionId)?.label ?? p.optionId,
        };
        if (lastResolved?.id === p.propId && prop.correctOptionId !== undefined) out.correct = p.optionId === prop.correctOptionId;
        if (lastResolved?.id === p.propId) {
          const sc = engine.tallyPicks(p.memberId, r.props, r.picks, game.events, gt).scores.find((x) => x.propId === p.propId);
          if (sc) out.score = sc;
        }
        return out;
      });

    const draftBoard = this.draftBoardOf(r);

    const res: PartyStateResponse = {
      serverNow: this.now(),
      version: r.party.version,
      speed: this.speed,
      party: {
        id: r.party.id,
        code: r.party.code,
        status,
        crewName: this.getCrew(r.party.crewId)?.name ?? '',
        createdAt: r.party.createdAt,
        ...(r.party.startedAt !== undefined ? { startedAt: r.party.startedAt } : {}),
      },
      game: {
        id: game.id,
        title: game.title,
        ...(game.sport !== undefined ? { sport: game.sport } : {}),
        durationSec: game.durationSec,
        gameT: gt,
        period,
        clock,
        home: teamScore(game.home, score.home),
        away: teamScore(game.away, score.away),
      },
      households: r.party.householdIds.map((id) => this.getHousehold(id)).filter((h): h is Household => !!h),
      recentEvents,
      props: views,
      picks,
      standings: this.standingsOf(r),
      draftBoard,
      ticker: [...r.ticker],
    };
    if (active) res.activeProp = active;
    if (lastResolved) res.lastResolvedProp = lastResolved;
    if (r.recap !== undefined) res.recap = r.recap;
    if (status === 'final') {
      const drafted = draftBoard.filter((e) => e.ownerMemberId);
      const worst = [...drafted].sort((a, b) => a.points - b.points || (a.player.id < b.player.id ? -1 : 1))[0];
      if (worst) {
        res.benchwarmerOfTheNight = {
          playerId: worst.player.id,
          playerName: engine.playerLabel(worst.player),
          ownerName: worst.ownerName ?? '',
          points: worst.points,
        };
      }
    }
    return res;
  }

  getSeason(crewId: string): SeasonResponse {
    const crew = this.getCrew(crewId);
    if (!crew) throw new GameError('NOT_FOUND', "I couldn't find that crew.");
    const households = crew.householdIds.map((id) => this.getHousehold(id)).filter((h): h is Household => !!h);
    const rows: SeasonRow[] = households.flatMap((h) =>
      h.members.map((m) => ({
        ...(this.state.season[m.id] ?? zeroStats(m.id)),
        name: m.name,
        household: h.name,
        householdId: h.id,
        avatar: m.avatar,
        rank: 0,
      })),
    );
    rows.sort(
      (a, b) =>
        b.points + b.fantasyPoints - (a.points + a.fantasyPoints) ||
        b.nightsWon - a.nightsWon ||
        (a.memberId < b.memberId ? -1 : a.memberId > b.memberId ? 1 : 0),
    );
    rows.forEach((row, i) => (row.rank = i + 1));
    return { crew, households, rows };
  }

  // ---------- AiSink ----------

  getPartyContext(partyId: string): { game: Game; party: WatchParty; props: Prop[]; gameT: number; score: { home: number; away: number } } | undefined {
    const r = this.recById(partyId);
    if (!r) return undefined;
    const game = this.gameOf(r);
    const gameT = this.gameT(r);
    return { game, party: r.party, props: r.props, gameT, score: engine.scoreAt(game.events, gameT) };
  }

  getRecapContext(partyId: string): RecapContext | undefined {
    const r = this.recById(partyId);
    if (!r) return undefined;
    return {
      game: this.gameOf(r),
      standings: this.standingsOf(r),
      draftBoard: this.draftBoardOf(r),
      season: this.getSeason(r.party.crewId).rows,
    };
  }

  addProps(partyId: string, props: Prop[]): void {
    const r = this.recById(partyId);
    if (!r) return;
    const have = new Set(r.props.map((p) => p.id));
    const fresh = props.filter((p) => !have.has(p.id));
    if (fresh.length === 0) return;
    r.props.push(...fresh.map((p) => structuredClone(p)));
    this.touch(r);
  }

  setPropExplanation(partyId: string, propId: string, text: string): void {
    const r = this.recById(partyId);
    const prop = r?.props.find((p) => p.id === propId);
    if (!r || !prop) return;
    prop.explanation = text;
    this.touch(r);
  }

  setRecap(partyId: string, text: string): void {
    const r = this.recById(partyId);
    if (!r) return;
    r.recap = text;
    this.touch(r);
  }

  setScoutingNotes(gameId: string, notes: Record<string, string>): void {
    this.state.scoutingNotes[gameId] = { ...notes };
    for (const r of Object.values(this.state.parties)) if (r.party.gameId === gameId) r.party.version += 1;
    this.persist();
  }
}
