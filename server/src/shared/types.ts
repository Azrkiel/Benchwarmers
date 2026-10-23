// Shared contract for Benchwarmers. Owned by the lead: phases read it, never edit it.
// Changes go through the lead so server, MCP, AI worker and web stay in sync.

// ---------- Domain ----------

export type Sport = 'basketball' | 'football';

export type BasketballPosition = 'PG' | 'SG' | 'SF' | 'PF' | 'C';
/** Football fantasy positions (phase 8): quarterback, running back, receiver, tight end, kicker. */
export type FootballPosition = 'QB' | 'RB' | 'WR' | 'TE' | 'K';
export type Position = BasketballPosition | FootballPosition;

/** Fictional player. */
export type Player = {
  id: string;
  teamId: string;
  name: string;
  number: number;
  position: Position;
  nickname?: string;
};

export type Team = { id: string; name: string; short: string; color: string; roster: Player[] };

export type BasketballStatType = 'pts2' | 'pts3' | 'ft' | 'reb' | 'ast' | 'stl' | 'blk' | 'tov';
/**
 * Football stats (phase 8). `*_yds` stats are scored per yard: points = FANTASY_SCORING[stat] * event.yards.
 * Everything else scores once per event.
 */
export type FootballStatType =
  | 'pass_td'
  | 'rush_td'
  | 'rec_td'
  | 'fg'
  | 'xp'
  | 'pass_yds'
  | 'rush_yds'
  | 'rec_yds'
  | 'int'
  | 'fumble';
export type StatType = BasketballStatType | FootballStatType;

/** How a football drive ended (nflverse `fixed_drive_result`, simplified). */
export type DriveResult = 'td' | 'fg' | 'missed_fg' | 'punt' | 'turnover' | 'downs' | 'end_of_half' | 'safety';

/** Drive context on football events: where the drive started and the football half clock at that point. */
export type DriveState = {
  /** Unique within the game, e.g. "d07". */
  id: string;
  /** Team with the ball. */
  team: 'home' | 'away';
  /** Yards from the opponent's end zone where the drive started (1-99), as in nflverse `yardline_100`. */
  yardline100: number;
  /** Seconds left in the half (football clock, 0-1800) when the drive started. */
  halfSecondsRemaining: number;
};

export type GameEvent = {
  /** Game time in seconds from tip-off. */
  t: number;
  /** 'drive' events mark a football drive start (no result) or end (`driveResult` set). */
  type: 'score' | 'play' | 'foul' | 'timeout' | 'period' | 'drive';
  team?: 'home' | 'away';
  points?: number;
  text: string;
  tags: string[];
  playerId?: string;
  stat?: StatType;
  assistPlayerId?: string;
  /** Football: yards for `*_yds` stats. */
  yards?: number;
  /** Football: the drive this event belongs to. */
  drive?: DriveState;
  /** Football: set on the event that ends a drive. */
  driveResult?: DriveResult;
};

export type Game = {
  id: string;
  title: string;
  /** Absent = 'basketball' (the original demo game). */
  sport?: Sport;
  home: Team;
  away: Team;
  durationSec: number;
  /** Number of periods the duration is split into (4 for the demo game). */
  periods: number;
  /**
   * Football replays with overtime (runtime-imported real games): game seconds of regulation (4 equal quarters). From there
   * `periods - 4` overtime periods follow, each an equal slice of the rest of the duration, with no clock ("OT", "2OT").
   * Absent = `periods` equal periods over the whole duration.
   */
  regulationSec?: number;
  scheduledFor?: string;
  events: GameEvent[];
};

export type DraftPick = {
  partyId: string;
  memberId: string;
  playerId: string;
  round: 1 | 2 | 3;
  at: number;
  /** true when the bench filled the slot at tip-off. */
  auto?: boolean;
};

export type FantasyRow = { memberId: string; playerId: string; points: number; statLine: string };

/** Info-only probability. Never odds for money. */
export type PropOption = { id: string; label: string; probability?: number };

export type ResolverSpec =
  | { kind: 'nextScoreType'; afterT: number }
  | { kind: 'teamScoresFirst'; afterT: number; untilT: number }
  | { kind: 'totalPointsOver'; atT: number; line: number }
  /** Football drive prop, options `yes` | `no`. 'score' = TD or FG; 'td' = touchdown only. */
  | { kind: 'driveResult'; driveId: string; outcome: 'score' | 'td' };

/**
 * Precomputed historical odds for a prop (phase 8, football drive props). Built offline from drive_odds.json and
 * stored in the replay data; never computed in a request path.
 */
export type PropOdds = {
  source: 'drive_odds';
  /** drive_odds.json bucket key, e.g. "40-49|normal". */
  bucket: string;
  /** Drives in that bucket. */
  n: number;
  /** Probability per option id (sums to 1). */
  p: Record<string, number>;
};

export type Prop = {
  id: string;
  gameId: string;
  question: string;
  options: PropOption[];
  opensAt: number;
  locksAt: number;
  resolvesAt: number;
  resolver: ResolverSpec;
  correctOptionId?: string;
  explanation?: string;
  source: 'ai' | 'fallback';
  /** Phase 8: present on football drive props; drives the odds multiplier. */
  odds?: PropOdds;
};

export type PropStatus = 'upcoming' | 'open' | 'locked' | 'resolved';

export type Member = { id: string; name: string; avatar: string };

export type Household = { id: string; name: string; city: string; color: string; members: Member[] };

export type Crew = { id: string; name: string; householdIds: string[] };

export type PartyStatus = 'scheduled' | 'drafting' | 'live' | 'final';

export type WatchParty = {
  id: string;
  code: string;
  crewId: string;
  gameId: string;
  /** Households taking part (starts as the crew's households; join_watch_party can add more). */
  householdIds: string[];
  createdAt: number;
  startedAt?: number;
  status: PartyStatus;
  version: number;
};

export type Pick = {
  partyId: string;
  memberId: string;
  propId: string;
  optionId: string;
  /** Wall-clock ms of the last change. */
  at: number;
  /** Game seconds at the last change (phase 8 speed bucket). Absent on picks stored before phase 8 -> no speed bonus. */
  gameT?: number;
  source: 'voice' | 'screen';
};

/** Bonus labels for a scored pick (phase 8). Copy lives in BONUS_COPY. */
export type PickBonus = 'early_call' | 'quick_call' | 'lone_call' | 'against_the_room' | 'bold_call';

/** How one resolved pick was scored. Factors are 1 when they don't apply; points 0 when wrong. */
export type PickScore = {
  propId: string;
  memberId: string;
  optionId: string;
  correct: boolean;
  base: number;
  streak: number;
  odds: number;
  speed: number;
  contrarian: number;
  /** streak x odds x speed x contrarian, capped at PICK_FACTOR_CAP. */
  factor: number;
  points: number;
  /** Bonuses earned on a correct pick, biggest factor first. */
  bonuses: PickBonus[];
};

export type SeasonStats = {
  memberId: string;
  points: number;
  bestStreak: number;
  currentStreak: number;
  correct: number;
  total: number;
  partiesPlayed: number;
  fantasyPoints: number;
  nightsWon: number;
  bestDraftPick?: string;
};

export type StandingRow = {
  memberId: string;
  name: string;
  household: string;
  householdId: string;
  avatar: string;
  rank: number;
  prevRank: number;
  total: number;
  draftPoints: number;
  pickPoints: number;
  streak: number;
  roster: FantasyRow[];
  /** Phase 8: how this member's most recently resolved pick was scored. */
  lastPickScore?: PickScore;
};

// ---------- Scoring config (one config object) ----------

export const FANTASY_SCORING: Record<StatType, number> = {
  pts2: 2,
  pts3: 3,
  ft: 1,
  reb: 1.2,
  ast: 1.5,
  stl: 3,
  blk: 3,
  tov: -1,
  // Football (phase 8). Yardage stats are per yard.
  pass_td: 4,
  rush_td: 6,
  rec_td: 6,
  fg: 3,
  xp: 1,
  pass_yds: 0.04,
  rush_yds: 0.1,
  rec_yds: 0.1,
  int: -2,
  fumble: -2,
};

export const BASKETBALL_STATS: readonly BasketballStatType[] = ['pts2', 'pts3', 'ft', 'reb', 'ast', 'stl', 'blk', 'tov'];
export const FOOTBALL_STATS: readonly FootballStatType[] = [
  'pass_td',
  'rush_td',
  'rec_td',
  'fg',
  'xp',
  'pass_yds',
  'rush_yds',
  'rec_yds',
  'int',
  'fumble',
];

export const PICK_BASE_POINTS = 10;
/** Streak multiplier by current streak length before this pick: 0 -> 1x, 1 -> 1.5x, 2+ -> 2x. */
export const STREAK_MULTIPLIERS = [1, 1.5, 2] as const;
export const ROSTER_SIZE = 3;

// Phase 8 pick bonuses. points = round to nearest 0.5 of
// PICK_BASE_POINTS x min(PICK_FACTOR_CAP, streak x odds x speed x contrarian); wrong picks score 0.

/** f = (pick.gameT - opensAt) / (locksAt - opensAt); first bucket with f <= maxF wins, else x1. */
export const SPEED_BUCKETS = [
  { maxF: 0.25, factor: 1.25, bonus: 'early_call' },
  { maxF: 0.6, factor: 1.1, bonus: 'quick_call' },
] as const;

/** Lone call: only picker of the option with >= loneMinPickers total. Minority: share < 0.5 with >= minorityMinPickers. */
export const CONTRARIAN = { lone: 1.5, minority: 1.2, loneMinPickers: 3, minorityMinPickers: 2 } as const;

/** Football drive props: odds = clamp(target / p_pick, min, max). */
export const ODDS_MULTIPLIER = { target: 0.5, min: 0.5, max: 2 } as const;

export const PICK_FACTOR_CAP = 5;

/** Voice/UI copy. Never "payout", "bet" or "odds boost". `bold_call` = odds multiplier > 1. */
export const BONUS_COPY: Record<PickBonus, string> = {
  early_call: 'Early call',
  quick_call: 'Quick call',
  lone_call: 'Lone call',
  against_the_room: 'Against the room',
  bold_call: 'Bold call',
};

// ---------- REST views (GET /api/parties/:code/state) ----------

export type PropView = Prop & {
  status: PropStatus;
  /** Seconds of game time until lock (open) or open (upcoming); absent otherwise. */
  secondsToLock?: number;
  secondsToOpen?: number;
  /** Real-time seconds until lock, derived from SPEED; what UIs count down. */
  realSecondsToLock?: number;
  pickCounts: Record<string, number>;
};

export type FantasyPop = { memberId: string; memberName: string; playerId: string; playerName: string; points: number };

/** An event plus the fantasy points it earned each owner (for "+3 Maya" pop-ups). */
export type EventView = GameEvent & { id: string; fantasy: FantasyPop[] };

export type DraftBoardEntry = {
  player: Player;
  side: 'home' | 'away';
  teamShort: string;
  ownerMemberId?: string;
  ownerName?: string;
  householdId?: string;
  round?: 1 | 2 | 3;
  auto?: boolean;
  /** Live fantasy points (0 before tip-off). */
  points: number;
  statLine: string;
  scoutingNote?: string;
};

export type TeamScore = { id: string; name: string; short: string; color: string; score: number };

export type PartyStateResponse = {
  serverNow: number;
  version: number;
  /** Real seconds per game second divisor (SPEED env). Clients use it for smooth countdowns. */
  speed: number;
  party: {
    id: string;
    code: string;
    status: PartyStatus;
    crewName: string;
    createdAt: number;
    startedAt?: number;
  };
  game: {
    id: string;
    title: string;
    /** Absent = 'basketball'. */
    sport?: Sport;
    durationSec: number;
    /** Football overtime games: see Game.regulationSec. */
    regulationSec?: number;
    gameT: number;
    period: number;
    /** e.g. "Q3 4:12" (clock counts down within the period). */
    clock: string;
    home: TeamScore;
    away: TeamScore;
  };
  households: Household[];
  /** Newest first, at most 12. */
  recentEvents: EventView[];
  activeProp?: PropView;
  lastResolvedProp?: PropView;
  /** Upcoming + resolved props, in opensAt order. */
  props: PropView[];
  /** Picks for activeProp, any locked prop, and lastResolvedProp. */
  picks: (Pick & { memberName: string; optionLabel: string; correct?: boolean; score?: PickScore })[];
  standings: StandingRow[];
  draftBoard: DraftBoardEntry[];
  /** Short friend-activity lines, newest first ("Sam picked Hawks"). */
  ticker: string[];
  recap?: string;
  /** Present when status is final. */
  benchwarmerOfTheNight?: { playerId: string; playerName: string; ownerName: string; points: number };
};

export type SeasonRow = SeasonStats & { name: string; household: string; householdId: string; avatar: string; rank: number };

export type SeasonResponse = { crew: Crew; households: Household[]; rows: SeasonRow[] };

export type ApiError = { error: string; code: string };

// ---------- AI content contract (phase 3 implements, store consumes) ----------

export type AiMode = 'fallback' | 'gemini';

export type PropGenContext = {
  game: Game;
  gameT: number;
  score: { home: number; away: number };
  existing: Prop[];
};

export type ExplainContext = { game: Game; prop: Prop; events: GameEvent[] };

export type RecapContext = {
  game: Game;
  standings: StandingRow[];
  draftBoard: DraftBoardEntry[];
  season: SeasonRow[];
};

/** Source of generated text: committed fallback JSON/templates or Gemini. */
export interface AiContentProvider {
  readonly mode: AiMode;
  generateProps(ctx: PropGenContext): Promise<Prop[]>;
  explainResult(ctx: ExplainContext): Promise<string>;
  recap(ctx: RecapContext): Promise<string>;
  scoutingNotes(game: Game): Promise<Record<string, string>>;
}

/** Store-side events the background AI worker listens to. */
export type PartyLifecycleEvent =
  | { type: 'party_created'; partyId: string }
  | { type: 'party_started'; partyId: string }
  | { type: 'prop_resolved'; partyId: string; propId: string }
  | { type: 'party_final'; partyId: string };

/** What the store exposes to the AI worker. The worker never runs in a request path. */
export interface AiSink {
  onLifecycle(listener: (e: PartyLifecycleEvent) => void): () => void;
  getPartyContext(partyId: string): { game: Game; party: WatchParty; props: Prop[]; gameT: number; score: { home: number; away: number } } | undefined;
  getRecapContext(partyId: string): RecapContext | undefined;
  addProps(partyId: string, props: Prop[]): void;
  setPropExplanation(partyId: string, propId: string, text: string): void;
  setRecap(partyId: string, text: string): void;
  setScoutingNotes(gameId: string, notes: Record<string, string>): void;
}

// ---------- Assistant (simulated device) ----------

export type ChatTurn = { role: 'user' | 'assistant'; text: string };

export type SpeakerHint = { memberName: string; confidence: number; source: 'voice-id' | 'screen' };

export type AssistantRequest = {
  text: string;
  /** Household id of the device, e.g. "garcias". */
  household: string;
  partyCode?: string;
  history?: ChatTurn[];
  /** Set when on-device voice ID recognised the speaker. */
  speaker?: SpeakerHint;
};

export type ToolCallTrace = {
  name: string;
  args: Record<string, unknown>;
  ok: boolean;
  summary: string;
  ms: number;
};

export type UiResourcePayload = {
  uri: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  /** Raw MCP CallToolResult of the tool that owns the UI. */
  toolResult: unknown;
};

export type AssistantResponse = {
  reply: string;
  toolCalls: ToolCallTrace[];
  uiResource?: UiResourcePayload;
  /** Party code the conversation is now about (e.g. after setup_watch_party). */
  partyCode?: string;
  mode: 'gemini' | 'offline';
};
