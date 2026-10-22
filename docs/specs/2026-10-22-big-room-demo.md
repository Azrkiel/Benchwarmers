# Football room demo

Approved direction: replace the primary small-household draft flow with a large single room, shared five-player salary-cap lineups, mixed football predictions, position weights, and saved seasons. User clarification: use the existing Watch Party Fantasy fictional script, names, and realistic scripted stats; real participants join from separate devices. No live provider is required.

## Architecture and scope

Extend Benchwarmers with a first-class room mode. The existing household parties and their stored data remain readable. Room state uses a separate versioned JSON file; it runs inside the same server, REST API, and authenticated MCP endpoint. The landing page emphasizes football rooms, with personal and TV routes. Preserve the Lounge brand. No bot participants are added automatically. Default speed is 1; host can use 1–4x.

```text
Home -> create room -> host credential -> start/pause/resume/speed
     -> join code + name -> private player credential -> lineup/pick
                                | invalid credential/cap/lock -> clear error
                                v
Watch Party Fantasy script -> room engine -> persisted room/season
                                |           |
                         public snapshot   private personal snapshot
                                |           |
                            shared TV     phones + speech + MCP
```

Replay source: copy data.js, script.js, timeline.js, scoring.js into server/src/room/replay, retaining their fictional player names, play texts, salaries, stat deltas, and 27–24 final. All 25 players already have nonzero stats. Lineman credits are team-rushing proxies; clean snaps are scripted, not measured real-world analytics. Store a rule snapshot per room. Preserve original salary cap/captain/flex rules. Position multipliers are explicit tunable demo weights, applied before the captain bonus, not a claim of real-world statistical balance.

Prediction types alternate a four-outcome drive question and yes/no scoring or TD questions. One featured question per drive prevents double rewards on the same event. Include score-total questions if exposed as another rotation. Open before the first play; hide outcome until resolved; pause freezes deadlines; speed changes preserve elapsed progress; wrong picks reset streak, missed picks break it, repeated unchanged picks retain time, changed picks lose early timing. Base: TD10/FG12/PUNT6/TURNOVER15, yes/no10. Benchwarmers streak/speed/minority/cap constants are reused. Historical yes/no probabilities use existing contextual drive table. Four-way historical probabilities may use explicitly attributed pooled result counts from tools/odds/README.md (67,555 observed outcomes), normalized to the four supported outcomes; label this conditional historical reference clearly. Never infer probabilities from the demo's future plays. Combined factor cap5, round to half points.

Room participants have persistent UUIDs and private random rejoin tokens. Same display name alone cannot claim another player's seat. A token permits rejoining a later room in the same season. Late joiners get a legal automatic lineup and earn fantasy stats only after joining; rejoining cannot reset the accrual boundary. Hosts hold separate private tokens. Neither participant nor host tokens appear in public state. Starting auto-fills missing lineups. Completed results enter season totals exactly once. Existing household store is not rewritten. Restart must retain replay phase/time and participant credentials. No future plays/whole replay are exposed in public responses.

## Frozen room service contract

Types exported from server/src/room/types.ts and re-exported from server/src/shared/room.ts for @shared/room browser imports. Browser never imports replay/server runtime.

RoomView:
- room: {code,name,seasonId,phase:'lobby'|'live'|'paused'|'final',speed,participantCount,createdAt}
- game: {title,home:{id,short,name,color,score},away:same,quarter,clock,situation,ballOn,fieldX,possession:string|null,driveNumber,driveCount,recentPlays:{id,text,kind,quarter,clock}[],isScripted:true}
- rules: {salaryCap,flexSlots,captainMultiplier,positionMultipliers:Record<string,number>,pickFactorCap}
- players: {id,name,teamId,teamShort,position,role,salary,multiplier,stats:Record<string,number>,rawPoints,points,statLine}[]
- standings: {participantId,name,rank,total,fantasyPoints,predictionPoints,streak,roster:{playerId,captain,points}[],lastPickScore?:{points,base,factor,bonuses:string[],correct}}[]
- question?,lastQuestion?: {id,kind:string,text,opensAt,locksAt,remainingMs,options:{id,label,basePoints,probability?:number}[],pickCounts:Record<string,number>,status:'open'|'locked'|'resolved',result?:{optionId,explanation}}
- me?: {participantId,name,lineup?:{captainId,flexIds:string[],salaryUsed},currentPick?:{questionId,optionId}}
- season: {id,name,standings:{participantId,name,points,fantasyPoints,predictionPoints,nightsPlayed,nightsWon}[]}

RoomStore (server/src/room/store.ts): constructor({dataFile?,persist?,now?,speed?}); create({name?,seasonId?,speed?}={}):{view,hostToken}; list():RoomSummary[]; join(code,{name,participantToken?}):{view,participantId,participantToken}; view(code,participantToken?):RoomView; setLineup(code,{participantToken,captainId,flexIds}):RoomView; autoLineup(code,{participantToken,style?:'balanced'|'stars'|'value'}):RoomView; pick(code,{participantToken,questionId,optionId}):RoomView; host(code,{hostToken,action:'start'|'pause'|'resume'|'set_speed',speed?}):RoomView; tick():void. RoomError has status:number, code:string, message:string. RoomSummary includes code,name,phase,participantCount,createdAt,seasonId.

REST: POST /api/rooms -> create result; GET /api/rooms -> {rooms}; GET /api/rooms/:code (optional Bearer participant token) -> RoomView; POST /api/rooms/:code/join -> join result; POST /:code/lineup, /auto-lineup, /picks, /host -> RoomView using service argument bodies above. POST /:code/assistant {text,participantToken?,hostToken?} -> {reply,view}. Server is authoritative. Refresh 1s, visibly stale on failures, cancel polling on unmount. Persist browser credentials by room; retain participant token by season for cross-night rejoin. Route /room/:code and /room/:code/tv. Home has create and join; retain old entry points secondarily. Host create navigates to personal room then offers TV. Joining from TV via displayed URL/code.

MCP: additional room-prefixed tools on /mcp, registered only when a RoomStore is provided. Existing eleven tools remain compatible. A room rules resource and tool instructions explain the new primary model. Typed and spoken room commands use the same mutation/validation functions; no synchronous cloud generation. No host or player secrets in tool read responses.

## Acceptance

30+ human credentials can join one room and own identical athletes independently. All original player roles score and visible stats match the scripted deltas. Original match ends27–24. Invalid/duplicate/over-cap lineups fail; captain cost and score multiply1.5. Public views hide secrets and future outcomes. Pick timing, change/duplicate behavior, each bonus, late joins, persistence, and exactly-once seasons have tests. REST/MCP and browser phone/TV flows have fresh verification. Existing tests remain green.
