// Shared contract for Benchwarmers. Owned by the lead: phases read it, never edit it.
// Changes go through the lead so server, MCP, AI worker and web stay in sync.

// ---------- Domain (from plan.md §5) ----------

export type Position = 'PG' | 'SG' | 'SF' | 'PF' | 'C';

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

export type StatType = 'pts2' | 'pts3' | 'ft' | 'reb' | 'ast' | 'stl' | 'blk' | 'tov';

export type GameEvent = {
  /** Game time in seconds from tip-off. */
  t: number;
  type: 'score' | 'play' | 'foul' | 'timeout' | 'period';
  team?: 'home' | 'away';
  points?: number;
  text: string;
  tags: string[];
  playerId?: string;
  stat?: StatType;
  assistPlayerId?: string;
};

export type Game = {
  id: string;
  title: string;
  home: Team;
  away: Team;
  durationSec: number;
  /** Number of periods the duration is split into (4 for the demo game). */
  periods: number;
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
  | { kind: 'totalPointsOver'; atT: number; line: number };

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
  at: number;
  source: 'voice' | 'screen';
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
};

// ---------- Scoring config (plan.md §5, one config object) ----------

export const FANTASY_SCORING: Record<StatType, number> = {
  pts2: 2,
  pts3: 3,
  ft: 1,
  reb: 1.2,
  ast: 1.5,
  stl: 3,
  blk: 3,
  tov: -1,
};

export const PICK_BASE_POINTS = 10;
/** Streak multiplier by current streak length before this pick: 0 -> 1x, 1 -> 1.5x, 2+ -> 2x. */
export const STREAK_MULTIPLIERS = [1, 1.5, 2] as const;
export const ROSTER_SIZE = 3;

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
    durationSec: number;
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
  picks: (Pick & { memberName: string; optionLabel: string; correct?: boolean })[];
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

export type AiMode = 'fallback' | 'bedrock';

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

/** Source of generated text. Implementations: fallback (committed JSON/templates) and Bedrock. */
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
  mode: 'bedrock' | 'offline';
};
