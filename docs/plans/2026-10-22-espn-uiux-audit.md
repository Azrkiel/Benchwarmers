# Benchwarmers UI/UX audit and ESPN-inspired change plan

Date: 2026-10-22. Scope: UI, UX, interaction feedback, accessibility, and displayed copy only. Status: recommendations only; no application changes made.

Repository reviewed: [Azrkiel/Benchwarmers](https://github.com/Azrkiel/Benchwarmers), `main` at [`b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c`](https://github.com/Azrkiel/Benchwarmers/tree/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c). File/component references below refer to that snapshot. The source index at the end supplies pinned links and line numbers.

## 1. Assessment

Benchwarmers currently reads as a relaxed social lounge. ESPN's public brand guidance supports a more athletic, high-contrast treatment: bold display typography, readable text typography, disciplined color, and motion directed toward the story. The largest gap is the combination of DM Serif Display, peach/tan surfaces, soft purple backgrounds, oversized rounded containers, and repeated lifestyle copy. Changing one accent color would leave most of that gap intact.

The strongest redesign would keep Benchwarmers' identity and social game, then make the game, active pick, and standings easier to scan. On a phone, the user's next action should lead. On a shared TV, the match and room standings should lead. Over video, the video should lead.

Useful existing work to preserve: explicit selected states in several controls; text labels alongside team colors; last-known-state behavior during reconnects; locally served fonts; the football field and possession context; large input targets in several views; the Lounge's roster focus restoration; and the extension's decision to yield to host menus. These should survive the visual change.

### Evidence and limits

- Read the current router and the active UI modules for all 11 routes, plus the embedded widget and extension surfaces. Audited their rendered copy, CSS, state branches, and navigation handlers.
- Visually inspected 13 committed screenshots: the scorebook game and long-content screens; its offline screen; Lounge Tonight, roster, results, and long-content screens; Watch fullscreen and rosters; the windowed extension; and widget Draft, Tonight, and Season at 800px. These are historical screenshots. Some show green/yellow styling that differs from current source. No finding treats those old colors as current.
- Retrieved the public HTML, styles, JavaScript, and **public reduced content** loaded by [espn.design](https://espn.design/). Its public homepage contains the relevant brand summaries. Detailed Tone of Voice, Art Direction, and other pages are sign-in destinations; their private guidance was not inspected.
- No connected browser was available. No current route was interactively traversed or freshly screenshotted. Runtime layout, real microphone behavior, screen-reader output, fullscreen behavior, and physical-TV readability remain unverified. Source-backed problems below are distinguished from proposed design choices and checks requiring a browser.
- Dependency installation in this separate audit checkout succeeded. No product code, scoring rules, server behavior, data, or configuration was edited. No build or automated test result is offered as proof of visual quality.

This is a comprehensive source-based design inventory, supported by available screenshots. It is not a claim that every possible runtime combination has been visually tested.

## 2. ESPN reference and how it applies

The following are paraphrases of public material, not quotations:

| Ref | Public ESPN guidance | Benchwarmers application, proposed here |
|---|---|---|
| E1 | Ignite separates impactful display styles from readable text styles; condensed display is preferred for large headlines. | Replace decorative serif headings with Barlow Condensed Semibold and use Barlow for controls and body copy. These fonts are already in the repo. |
| E2 | Red anchors the palette; neutral text and grayscale support legibility. | Use neutral surfaces, white text on dark views, and a controlled red accent. Keep team colors as identity cues. |
| E3 | Gradients belong mainly on large surfaces, not text or small color accents. | Flatten small control effects; reserve any gradient for a purposeful hero or scrim. |
| E4 | The logo has protected space and consistent usage. | Give Benchwarmers one stable wordmark and clear space across routes. |
| E5 | The 7-degree angle and speedline forms suggest movement and focus. | Consider one restrained angular graphic in a hero or major event banner. Keep tables and controls aligned and readable. |
| E6 | Motion uses timing, easing, focal points, and horizontal movement to connect viewers to the story. | Animate meaningful state changes; reduce simultaneous celebrations and preserve reading time. |

Source: [ESPN public brand overview](https://espn.design/), sections The Logo, The 7° Angle, The Speedline, ESPN Color, ESPN Ignite, and Motion Theory. Its public content is also served as [reduced.json](https://a.espncdn.com/prod/styles/pagetype/otl/2025/brand/content/reduced.json). The site's current CSS uses `#f51825` for its red. That observation is separate from a claim about every ESPN product's palette.

All UX choices, copy rewrites, sizes, timings, and priorities below are my recommendations for this product. The public site is a brand reference, not a complete ESPN web-app component specification. In particular, I am not attributing a published microcopy rulebook, universal corner radius, or exact scoreboard layout to ESPN.

Keep the bench mark and Benchwarmers name. Use the already bundled open-font alternatives to pursue a related typographic character. ESPN logos, monograms, or proprietary fonts are not needed for this plan.

## 3. Coverage map

| Surface | Source entry | States and subviews included in the audit |
|---|---|---|
| `/` | `web/src/home/HomePage.tsx` | Create room; join by code; replay search, busy, success and failure; main cards; More views |
| `/room/:code` | `web/src/room/RoomPage.tsx` | Connecting, unavailable, unjoined, joined, host, lobby, live, paused, final; lineup; question; standings; assistant; rules; season |
| `/room/:code/tv` | `web/src/room/RoomTvPage.tsx` | Connecting/error, lobby, live, paused, final; join address; field; question; play feed; room/season standings; rules/host popovers; remote handler |
| `/welcome` | `Welcome` in `web/src/App.tsx` | Hero, sample scorebook, draft/live/final preview cards, footer |
| `/tv/:code` | `web/src/tv/TvPage.tsx` | Draft, live basketball/football, rosters, final, season, reconnecting; auto rotation; fixture/forced mode/kiosk presentation |
| `/tv2/:code` | `web/src/tv-broadcast/TvPage.tsx` | Game overview, Picks, Standings, Rosters, Draft, Results; connecting/error; clean/transparent overlay; keyboard navigation |
| `/lounge/:code` | `web/src/lounge/LoungePage.tsx` | Tonight, Picks, crew, draft, results, roster dialog, empty/reconnecting; remote navigation |
| `/watch/:code` | `web/src/watch/WatchPage.tsx` | Video setup, invalid URL, playback guidance, overlay modes, hide/show, fullscreen error, fixture disclosure |
| `/control/:code` | `web/src/control/ControlPage.tsx` | Connecting/error; new party; drafting; live/locked picks; final; preview canvas; member selection |
| `/device/:household` | `web/src/device/DevicePage.tsx` | Both household examples; conversation; listening/pending/errors; identity; fallback board; embedded widget; settings; trace |
| `/voice-lab` | `web/src/voiceid/VoiceLabPage.tsx` | Household choice; model/loading/fallback; enrollment; recording; accepted/uncertain result; similarity; calibration |
| Embedded widget | `server/src/mcp/widget/src/render.ts` | Draft board, Tonight, Season; member selection; pending/failed actions; empty/final; light/dark host themes |
| Extension popup | `extension/popup.html`, `popup.ts`, `popup.css` | Enabled/disabled, party-code validation, save failure, show/hide, control link |
| Extension/video crew panel | `web/src/overlay/CrewOverlay.tsx` | Launcher, standings, picks, roster, move side, close/hide, reconnect/retry, constrained size, host-menu suppression |

`latest` aliases and fixture query strings are variants of these surfaces, not additional pages. `design-archives/` is not routed; do not restyle it. GitHub documentation and host-provided inspector chrome are outside the product UI audit.

## 4. Priority and evidence key

- **P1:** Affects the main task, meaning of a state, readability, or interaction access. Address before treating the redesign as ready.
- **P2:** Material visual or language inconsistency. Address in the redesign pass.
- **P3:** Finishing detail or optional enhancement.
- Findings describe current source unless explicitly labeled historical or verification. Proposed geometry and styles are starting values, not measured ESPN specifications.

## 5. Foundation changes across the app

Apply these consistently before tuning individual pages. Page-specific items below add detail rather than imply separate visual systems.

| ID | Priority | Exact location / current problem | Proposed change | Why |
|---|---|---|---|---|
| G01 | P1 | `brand/brand.css :root`; `styles.css html.theme-scorebook`; local tokens in `tv-broadcast/tv.css`, `lounge/lounge.css`, widget CSS, overlay styles, popup CSS | Establish the semantic palette in section 6, then map each surface to it. Replace hardcoded peach/purple/tan UI colors across these locations. | A global token change alone misses local overrides. A consistent neutral/red foundation supports E2. |
| G02 | P1 | `--lg-serif`, `.bw-brand-word`, headings in `home.css`, `room.css`, both TV stylesheets, `lounge.css`, `voiceid.css`, `control.css`, `watch.css`, `fx.css` | Use Barlow Condensed Semibold for short display headings; Barlow Semibold for labels, names and subheads; Barlow Regular for explanations. Remove serif overrides, not just the root font. | Current editorial-serif treatment is the largest mismatch with E1. |
| G03 | P2 | `brand/Brand.tsx BrandLockup`; Lounge's handwritten `.lg-brand` lockup | Standardize one horizontal Benchwarmers wordmark; retain a small bench mark; reserve stacked form for genuinely narrow branding areas. Remove the decorative terminal period if adopting the proposed block wordmark. | Current stacked serif identity feels like a hospitality brand. E4 supports consistent recognition. |
| G04 | P2 | `.hm-card`, `.device-bezel`, `.lg-match`, `.lg-next`, `.lg-seat`, `.rm-question`, `.rm-lineup`, widget `.card` | Reduce large 14–28px corner treatments to a proposed 6–8px for ordinary containers, 4px for controls. Keep circles for avatars. Use dividers rather than another rounded wrapper inside each card. | Repeated soft containers compete with the sports content. This is a design recommendation, not a prohibition on ESPN using round forms. |
| G05 | P2 | `tv/tv.css .tv-stage`; `device.css .ds-mic`; `lounge.css .lg-match::before`; `fx.css` | Remove ambient peach glows and the small radial microphone gradient. Keep a functional scrim only where text crosses artwork. | Small decorative shading weakens hierarchy and conflicts with the application of E3. |
| G06 | P1 | Scores, room totals, lineup budget, countdowns, season totals across all renderers | Use tabular numerals, stable numeric columns, consistent decimal formatting, and explicit column units. Keep match score integer; fantasy totals use one decimal where the scoring supports it. | Users compare numbers continuously. Do not make them decode different presentations of the same metric. |
| G07 | P1 | `HomePage MAIN/MORE`; `App.tsx Welcome`; cross-links among TV, tv2, Lounge, device, control | Use `/room/:code/tv` as the football room's `TV view` and `/tv/:code` as the legacy party's `TV view`. Put tv2/Lounge/design variants in a labeled demo tools disclosure. Keep all routes accessible during review. | Users should choose a task, not interpret implementation/design history. Room and party codes remain distinct. |
| G08 | P1 | `RoomPage`, `RoomLanding`, legacy party views | Use `Room` for the five-player football experience and `Party` for the existing three-player experience until they are truly unified. Explain this once when choosing the experience. Within each flow, use its term consistently. | Copy must not imply that a room code or five-player lineup works in a legacy party. No data-model change is proposed. |
| G09 | P2 | `Call`, `Pick`, `Question`, `Prediction`, `Tonight`, `Game`, `The crew`, `Around the room` across navigation and headings | Use `Picks` for the destination, `Make a pick` for the action, `Standings` for ranking, `Roster` for the legacy drafted team, and `Lineup` for the salary-cap room. Preserve sports-specific question text. | Stable labels reduce the effort of moving between phone and TV. |
| G10 | P1 | Original `Scoreboard` hardcodes Live; broadcast/Lounge map party status to Live; room `PhasePill` omits scripted context | Distinguish source mode from play phase: a persistent `Replay` or `Demo` badge, plus `Pregame`, `Playing`, `Paused`, `Final`. Use `Live` only when the source actually is live. | A running replay and a live sporting event mean different things. ESPN-like clarity starts with accurate status. |
| G11 | P1 | Reconnect/error branches in TV pages, room pages, device, control, overlay, widget | Standardize initial loading, no result, unavailable, stale data and action failure. Preserve current data when available, name the failed task, and offer a relevant retry or code-edit action. | Generic connection language and raw errors leave users without a next step. |
| G12 | P1 | Toasts, pressed states, timers and data-refresh behavior across shared components | Define the same state vocabulary: focused, selected, submitting, saved, locked, resolved, failed. Use text/checkmarks/borders alongside color. Reserve a region for feedback. | A red restyle must not blur selection and focus or lose action confirmation. |
| G13 | P2 | Emoji crowns, chairs, fire, stopwatch, gear glyphs, roster symbols | Replace decorative status emoji with a small consistent SVG set, with text labels when meaningful. Keep user-selected avatars; offer initials as a neutral fallback. | Status icons should not vary by OS or compete with the numeric story. |
| G14 | P1 | `Stage` in both TV trees; Lounge's 1920×1080 fit transform | Preserve a shared-screen composition, but define a minimum readable viewport and route phone visitors to the matching companion experience. Add a responsive desktop layout if small browser windows are supported. | A 28px canvas label becomes 9.3px at a 640px-wide 16:9 window. Uniform shrink-to-fit does not preserve usability. |
| G15 | P1 | TV safe bounds, shared FX layers, all scroll containers | Keep essential content and focused outlines inside proposed 5% TV safe insets. Reserve room for focus rings and updates rather than clipping them. Validate on target hardware later. | The app already uses safe-area ideas; every new container and overlay must honor them. |
| G16 | P1 | `fx.css`, `tv/Moments.tsx`, room moments, ticker, podium confetti | Use one focal event at a time. Keep score changes local; a major event gets one short banner; rank changes get one small toast. Stop decorative looping confetti. | E6 supports directed movement, not multiple simultaneous announcements. |
| G17 | P2 | Large eyebrow + title + subtitle + helper + CTA stacks throughout | Keep a short section title, essential state, and action. Delete repeated genre labels and instructions once the control makes the action clear. | Many screens spend more words explaining the panel than showing the sport. |
| G18 | P1 | `App.tsx <Suspense fallback={null}>`; no wildcard route; `web/index.html` static title | Add a branded loading state, a useful not-found screen with Home and code entry, and page-specific titles such as `Picks · Benchwarmers`. | Route loading/invalid URLs currently have no explicit product recovery UI. |
| G19 | P2 | Home, device, original TV lack a consistent home/back affordance | Make the brand link Home where interaction is expected. For kiosk/shared screens, place Exit/Back in the remote-accessible tools area. | Movement between routes should not depend entirely on browser chrome. |
| G20 | P1 | Light widget theme vs dark app; arbitrary team/household colors; low-opacity disabled text | Specify foreground/background pairs per theme and state; test computed contrast over actual surfaces and artwork. Avoid lowering an entire informational card's opacity. | A new accent can introduce contrast failures even when the old warm colors were readable. |
| G21 | P2 | Repeated rank 1 treatment and final winner declarations | Use actual rank semantics, including tied positions when supplied; avoid declaring one person the sole winner solely because they are first in an array. | The UI must explain what the available standings mean. This is display behavior, not a request to change scoring. |
| G22 | P3 | Decorative angular graphics | Use a restrained directional cut or rule on a hero/event treatment, if it improves the composition. Do not skew text, input fields or table geometry. | E5 is an optional expressive tool; adding a slash to every panel would create more clutter. |

## 6. Proposed visual specification

These are project defaults to review, not ESPN design-system tokens.

| Role | Proposed starting value | Use |
|---|---|---|
| Dark canvas | `#101113` | TV, watching, device and dark app shell |
| Surface / raised | `#1A1A1A` / `#26272A` | Panels and controlled overlay backings |
| Divider | `#4B4D52` | Layout boundaries; increase where an essential state needs stronger contrast |
| Primary text | `#FFFFFF` on dark; `#000000` on light | Scores, names, actions, core information |
| Secondary text | `#BFC2C8` on dark; `#52565D` on light | Supporting metadata, never the only status cue |
| Brand red | `#F51825` | Major accent, short rules, selected markers, major-event surfaces |
| Filled action red | `#C8102E`, white label | Candidate for small-text primary buttons; verify all states before use |
| Success / warning | `#54D38A` / `#F5B942` on dark | Correctness / urgency with text labels; not general decoration |
| Error | `#FF7B86` on dark | Error text and icons, separate from brand red |
| Focus | White outline with dark outer separation | Independent of selected tab marker and variable team colors |
| Display | Barlow Condensed, 600 | Short headlines and large numeric totals |
| UI/body | Barlow, 400/600 | Controls, metadata, explanations, tables |
| Spacing | 4, 8, 12, 16, 24, 32, 48px | Repeated grouping rhythm, not an obligation to apply equal padding everywhere |
| Control / panel radius | 4px / 6–8px | Keep focus clearance; circular avatars remain circular |

Proposed type starts: phone body 16/24px, metadata 14/20px, section title 24/28px, page title 32/36px. At the **1920×1080 CSS canvas** used by the TV routes: essential labels/body start at 28/36px, section headings 40/44px, event/question display 48–64px, main scores 88–112px. These are CSS pixels on this project's canvas, not Android dp/sp and not a hardware certification. The fluid room-TV route needs equivalent apparent sizes rather than blind reuse of canvas numbers. Small overlay controls need independent responsive sizing.

Proposed motion starts: 120–160ms interaction feedback, 180–240ms panel transitions, 600–900ms local score emphasis, roughly 1.5–2 seconds for a major play banner. Keep enough static dwell time to read the actual content; reduce motion to static state changes. E6 does not prescribe these timings.

## 7. Home and entry flows: `/`

Sources: `home/HomePage.tsx`, `home/home.css`, `home/PullUpGame.tsx`, `room/RoomLanding.tsx`.

| ID | Priority | Where / current issue | Change | Why |
|---|---|---|---|---|
| H01 | P1 | `HomePage .hm-main`: football room creator, replay importer and four demo tools share one initial screen | Lead with `Create room` and `Join room`. Group replay as a separate `Replay a game` section. Move device demos and legacy surfaces under `Demo tools`. | The current page mixes starting a game with selecting test surfaces. |
| H02 | P2 | `.hm-side`, 260px column, 56px gap, 64px top padding | Replace the permanent desktop brand sidebar with a compact header; use the recovered width for the primary task. On mobile, keep brand and entry actions near the top. | Large empty branding areas slow access to a small number of tasks. |
| H03 | P2 | `.hm-header` hardcoded `Sunday Crew`; `.hm-party` always `DEMO` | Put demo identity inside the demo section; let the main heading describe the task without implying the current user belongs to that crew. | The initial screen otherwise looks like someone else's active account. |
| H04 | P1 | `RoomLanding` heading `Your Sunday rivalry.` and no replay disclosure | Use `Football room` plus `Build a lineup and make picks during a fictional replay.` Keep `Create room` as the primary label. | `Live room` describes connected participants but can imply a live sports feed. |
| H05 | P2 | Room name defaults to `Sunday watch party`; creation and joining stacked together | Use a short optional room-name field, keep the existing default if needed, and clearly separate `Create` from `Join with a code`. | Reduces the number of competing headings and clarifies intent. |
| H06 | P1 | Join-code form uses `Have a code?` and `Find room` | Label `Room code`; action `Join room`; preserve entered value through navigation/errors. Show a no-room state with Edit code. | The action should describe where the user goes. |
| H07 | P1 | `PullUpGame`: `Replay any finished game with the crew.` | Replace with `Find a completed game to replay.` Mention actual supported sports/date limits only when verified by the UI. | `Any` promises broader coverage than this screen can establish. |
| H08 | P2 | `PullUpGame` placeholder is `UVA vs FSU 2025`, with no visible format hint | Add a short persistent hint such as `Enter teams and year.` Keep an example as supporting text; avoid relying on a disappearing placeholder. | Users need to understand the input after they start typing. |
| H09 | P2 | Replay action `Pull it up`; busy action `Working…` | Use `Find game`; show stage-specific progress, `Finding game…` then `Preparing replay…`. Keep the form stable. | Concrete verbs and progress reduce uncertainty. |
| H10 | P1 | Replay success automatically opens original TV while a secondary link says Open the Lounge | Open the chosen canonical TV view. If automatic navigation is blocked, provide `Open TV view` for the same party. | The fallback action should lead to the same intended result. |
| H11 | P1 | Replay catch exposes arbitrary error message in a polite status region | Use a persistent inline error tied to the field, with `Try again`; preserve query and any successfully created destination. | Failed work needs actionable feedback, not another generic status line. |
| H12 | P2 | MAIN `Austin device` / `Seattle device` cards | In demo tools, label `The Garcias` / `Sam's Place`, with `Device simulator` as secondary and city/member details once. | Device geography is not the main user task. |
| H13 | P2 | `Big screen` is a large tan feature card; same action absent from room-entry flow | Use one clear TV action connected to the selected room/party. Reduce card height, icon disc, and title size in demo tools. | Current visual weight privileges a seeded demo over creating/joining. |
| H14 | P2 | MORE includes `Scorebook TV`, `Scorebook welcome`, `For the extension`, and duplicate `Party DEMO` metadata | Rename within demo tools as `TV layout preview`, `Welcome preview`, `Overlay controls`, with a clear experimental label. Remove repeated code subtitles where group context gives the code. | Product navigation should not expose design iteration names as equal destinations. |

## 8. Phone/desktop football room: `/room/:code`

Sources: `room/RoomPage.tsx`, `RoomLanding.tsx JoinRoom`, `Lineup.tsx`, `RoomAssistant.tsx`, `components.tsx`, `room.css`, `broadcast.css`.

| ID | Priority | Where / current issue | Change | Why |
|---|---|---|---|---|
| R01 | P1 | `RoomPage`: score, field, host controls, then personal score and active question | During play, place a compact score strip above the personal total and active pick. Move expanded field/play history below the action or into `Game`. | The phone user must find a timed pick without scrolling past spectator information. |
| R02 | P2 | `.rm-room-heading`: large room name, Football eyebrow, code and count | Compress into room title + small source/phase indicator; put copy/share code beside it. Preserve room identity without a large hero. | Reclaims space for the game task. |
| R03 | P1 | `JoinRoom`: `Take your seat.` / `Pick five players and call every drive.` | Heading `Join room`; one short explanation for lobby, and different text for live/final rooms. Describe whether the arriving player's lineup will already be locked or automatically supplied, based on actual behavior. | The current invitation promises a pregame task regardless of phase. |
| R04 | P1 | `JoinRoom` name input and generic join failure | Keep a visible name label, contextual invalid-name feedback, and a pending state that preserves the value. Keep the old-season-identity warning, but shorten it without hiding the history consequence. | Users should know why joining failed and whether retrying changes their identity. |
| R05 | P1 | Personal score: total, `Lineup`, `Calls`, `Streak`; small metadata on mobile | Label `Total pts`, `Lineup pts`, `Pick pts`, and `Streak`. Use a compact aligned row; keep total strongest and add `You` where helpful. | The same name/number pattern should carry between the player card and standings. |
| R06 | P1 | `lastPickScore` text combines earned points and raw bonus labels | Show `Correct · +{points} pts` or `Incorrect · +0 pts`; put readable bonus names in optional detail. | Feedback should answer what happened before explaining a multiplier. |
| R07 | P1 | `Lineup`: full player pool is the initial pregame view; selected players are only borders | Add a visible five-slot summary, with Captain and four Flex slots, and a budget summary above the pool. Keep roster edits available from the summary. | Users need to see what remains to complete, not infer it from scattered cards. |
| R08 | P1 | Captain and Flex actions move a player between roles | Make the selected role explicit and preview the resulting salary in the action context; show a short confirmation when switching a selected player's role. | A captain changes both cost and scoring. An unexplained role switch can look like a disappearing selection. |
| R09 | P1 | Budget currently says spent/cap and remaining; over-budget action only produces a rejection | Keep remaining budget sticky with lineup actions; show how much a candidate would cost as Captain/Flex before selection. Retain the existing cap rule. | Prevents trial-and-error selection. |
| R10 | P2 | `Auto balanced`, `Auto stars`, `Auto value` presented as three equal buttons | Use `Auto-pick lineup` with a concise style choice: Balanced, Stars, Value. Explain what each style means in one short helper or disclosure using actual selection behavior. | Reduces jargon and button clutter. |
| R11 | P1 | Search/filter can produce an empty `.rm-players` container | Show `No players match` with `Clear filters`; preserve the budget and selected-slot summary. | Empty space provides no recovery path. |
| R12 | P2 | Player cards show position, team, role, salary, points, stat line, two actions in every phase | Pregame: name, position/team, salary, selection role; move long role copy to details. During play: selected lineup, current stat line, points. | Phase-specific density makes comparison easier. |
| R13 | P1 | `.rm-save` follows the entire player pool | Keep Save lineup and completeness/budget feedback in a sticky bottom action area on phone. Ensure it clears the software keyboard and safe area. | Users should not scroll through the pool to find the action needed to finish. |
| R14 | P1 | Save is disabled without an explanation; `Not saved yet` always appears for an untouched lineup | Distinguish incomplete, changed, saving, saved and locked. Examples: `Choose a captain and 2 more flex players`; `Unsaved changes`; `Lineup saved`. | The disabled control should explain the missing step without sounding like an error. |
| R15 | P1 | Host Start is above lineup and pick task; warning says empty seats get auto lineups | Put host controls in an explicit Host area. Next to Start, show how many joined players have incomplete lineups and explain that starting locks/auto-fills them. | The host needs a clear consequence at the action, not a detached sentence. |
| R16 | P2 | Speed buttons use `1x`–`4x` and compete with main tasks | Keep them secondary within Host controls; label the group Replay speed and display `1×` etc. | Speed is a setup action, not a player decision. |
| R17 | P1 | `Question` has a tiny `{secs}s` label and moving timer; starts showing urgency at five seconds | Use `Closes in 0:12` beside the question and a stable timer track; keep digits tabular. Avoid repeated blinking; announce meaningful thresholds rather than every tick. | Users need readable remaining time without visual or auditory noise. |
| R18 | P1 | Answer cards mix base points, crowd counts and historical percentages in the same small footer | Give option label and selected state highest priority; keep `10 pts` as a secondary numeric label. Label crowd share and historical rate separately. | These are three different measures; the current grouping encourages misreading. |
| R19 | P1 | Selection is `aria-pressed` plus `Your call` in small text, while all buttons share busy state | Show a visible check and `Your pick`; during submission show Saving on the selected option. On failure preserve the attempted choice and offer Retry. | Distinguishes a click from a confirmed selection. |
| R20 | P1 | Paused phase disables options, but the question can still carry open-style treatment | Show `Game paused · Picks paused` as appropriate to actual rules; keep the selected choice visible. Clearly separate paused from locked and waiting for a result. | A disabled card alone does not explain why an action stopped. |
| R21 | P2 | `.rm-result` appears below a new question using only `Last call` | Use a separate `Previous pick` block with the previous question or drive identity, answer, and personal result. Collapse the explanation by default on phone. | The old answer must not be mistaken for the current question's answer. |
| R22 | P1 | `RoomScore` and `FootballField` repeat possession/context while mobile hides full team names | Use one compact sport-context strip; retain recognizable abbreviations, accessible full names, clock, down/distance and possession. Expand to a full field only when useful. | Reduces duplication while preserving information needed to make a pick. |
| R23 | P2 | Room leaderboard rows carry fantasy/call breakdown and fire streak on every row | Lead with rank, name, total; show user's row and leader clearly; move detailed split to row expansion or a concise optional secondary line. Use numeric streak text instead of fire. | Ranking should scan before the score explanation. |
| R24 | P1 | `Leaderboard` season rendering uses array index for displayed position | Display actual available rank/tie meaning consistently; if the data provides order only, label the display as order rather than implying an unsupported tiebreak. | Prevents an editorial display choice from inventing a sporting result. |
| R25 | P1 | Final phone phase still uses general question/lineup/feed layout; winner podium is TV-only | Lead final phone view with winner(s), personal finish, total, then Tonight/Season standings. Keep lineup and pick history as review sections. | The primary task changes when the game ends. |
| R26 | P2 | `RoomAssistant` is far below lineups and standings; label `Send command` | Use a compact, discoverable `Ask assistant` entry with text and mic choices; example one supported command. Keep full reply near the submitted request. | Voice is useful but should not require searching a long page or learning command jargon. |
| R27 | P1 | Browser mic unavailable, denied, listening, sending and reply are separate text areas | Define one input-state area with a proper microphone SVG and state label. Keep typing immediately usable; provide a concise retry path for microphone failure. | Input status should remain clear during transitions. |
| R28 | P2 | `RoomRules` includes long rules, weight grid, historical provenance, and fictional-data disclosure | Keep the disclosure; present a short scoring summary first, then Lineups, Picks, Bonuses, and Data details as expandable sections. | Essential instructions remain available without dominating the play screen. |

## 9. Shared football TV: `/room/:code/tv`

Sources: `RoomTvPage.tsx`, `components.tsx RoomScore/Question/PlayFeed/Leaderboard/FinalPodium`, `room.css` desktop overrides, `broadcast.css` TV overrides.

| ID | Priority | Where / current issue | Change | Why |
|---|---|---|---|---|
| RT01 | P1 | Header repeats brand, room name, player count, code and a potentially long origin URL | Keep compact brand/room identity, large code, short join URL, source mode and phase. Add a QR join affordance as an optional convenience, preserving the code/URL path. | A couch viewer needs an actionable entry route, not a long development address. |
| RT02 | P1 | Lobby repeats code in header and `.rm-lobby`, but no explicit readiness summary | Use one main lobby invitation, joined-player list/count and readiness count when available. Keep a smaller code after play starts. | Pregame should explain who is ready and how to join. |
| RT03 | P1 | TV text can drop to 11–20px in question metadata, situation, standings splits, footer and popovers | Increase task-critical text to the TV scale in section 6; reduce optional metadata to make room. | Fitting everything into one viewport must not depend on unreadable labels. Physical-TV check pending. |
| RT04 | P1 | `Question tv` renders noninteractive options as disabled buttons | Render informational option rows rather than disabled controls; retain clear pick counts, answer state and readable contrast. Show `Make picks on your phone`. | A passive display should not look like broken remote buttons. |
| RT05 | P1 | `navigateRemote` treats all four arrows as previous/next in DOM order | Map Left/Right spatially within a row, Up/Down between join/tools/content regions. Keep focus only on useful actions and scroll regions. | Directional input should match the screen, not a linear document list. |
| RT06 | P1 | Candidate selector filters closed details but not generally hidden/offscreen elements; Back closes a popover then navigates phone | Explicitly define eligible visible targets, scroll-region entry/exit, popover focus containment and return target. Back should close tools, return to the shared view, then leave deliberately. | Avoids surprising jumps, focus behind panels, or accidental exit during play. Runtime verification required. |
| RT07 | P1 | Long question/result and large standings live in independent scroll regions | Keep active question/options visible without scrolling at target TV sizes; scroll history or expanded standings only. Make scroll affordance and focus obvious. | A new pick cannot depend on discovering an internal scroll panel. |
| RT08 | P2 | Full field, latest play, older plays, room standings and question all compete | Compose a compact score/context band, prominent current question, standings rail and one latest-play line. Expand history only on request. | Gives attention a predictable path. |
| RT09 | P1 | `FinalPodium` uses array positions as first/second/third; season sits beside same room rankings | Use one clear winner/result panel and distinguish `Tonight` from `Season`. Respect actual tie/rank semantics. Keep remaining finishers accessible. | Results need a clear scope and truthful order. |
| RT10 | P2 | Crown/continuous confetti and shared full-screen FX at final | Use one brief result transition and a static winner marker. Keep code, final score, and standings unobscured. | Supports E6 without keeping the room in a perpetual celebration. |
| RT11 | P2 | Footer `My lineup` takes a shared TV user to a personal route | Rename `Open phone view` or use the join link. Keep Host controls clearly identified and separate from spectator actions. | A shared screen cannot know whose personal lineup the remote holder means. |
| RT12 | P1 | Room unavailable screen has only raw error and Home | Offer Retry and Edit room code; when stale state exists, show last-update status in a stable reserved area. | Recovery must be possible from the couch. |

## 10. Original TV: `/tv/:code`

Sources: `tv/TvPage.tsx`, `Stage.tsx`, `modes.ts`, `DraftBoard.tsx`, `LiveView.tsx`, `Scoreboard.tsx`, `Court.tsx`, `FootballField.tsx`, `PickBar.tsx`, `PickBonuses.tsx`, `Leader.tsx`, `Standings.tsx`, `RostersView.tsx`, `FinalView.tsx`, `Ticker.tsx`, `Moments.tsx`, `tv.css`.

| ID | Priority | Where / current issue | Change | Why |
|---|---|---|---|---|
| T01 | P1 | `TvPage` has no in-screen destination controls; `modes.ts` rotates Live/Rosters after 20 seconds without activity | Make this an explicitly labeled automatic display, or add the common remote navigation if it remains the default interactive TV. Make rotation optional and keep the scoreboard/current pick stable. | A user reading a roster should not lose the screen unexpectedly. |
| T02 | P1 | `Scoreboard` hardcodes `Live` even when a forced live layout shows drafting/final data | Derive phase accurately and show Replay/Demo source mode separately. In a fixture, show Sample or Demo consistently. | The visual treatment must not misstate the sporting state. |
| T03 | P2 | `.tv-sb-score`, court/field and final team colors are desaturated by the last Lounge skin override | Remove global desaturation. Keep scores neutral white, team identity in a consistent colored edge/swatch, and controlled field colors. | Preserve recognizable team meaning without using arbitrary colors for essential digits. |
| T04 | P2 | `LiveView`: large court/field, three-event feed, pick section, leader roster, standings, ticker | Give score/context and active pick clear priority; reduce court decoration and remove duplicate leader data from the main standings view. | More panels do not mean more useful information in a glance. |
| T05 | P1 | Draft `On the clock` lists every member below three players | Rename it `Still drafting` unless actual turn information exists. If a real turn is supplied, show only that member. | The label currently implies a turn/timer not represented by the displayed list. |
| T06 | P1 | Draft uses front/back 3D flip; the drafted face drops scouting detail and changes to household-colored background | Use a stable player row/card with persistent name/position/team and a clear `Drafted by {name}` status. Briefly highlight the owner change. | Ownership should become visible without forcing the viewer to reread a transformed card. |
| T07 | P2 | Draft card prioritizes nickname, repeats full name, number, position and note | Lead with name or established nickname consistently; keep one metadata line and one short scouting description. Do not repeat identical names when nickname is absent. | Sports information should outweigh character-writing filler. |
| T08 | P1 | `PickBar` presents open/locked/resolved under permanent `LIVE PICK`; time is displayed before `Locks in` | Use state heading `Open pick`, `Picks locked`, or `Result`; read `Closes in 0:12` left to right. Preserve question and chosen options through resolution. | The heading and timer should explain the current state immediately. |
| T09 | P1 | `PropOptions`: historical rate, percentage bar, pick count and avatar group can be confused | Label percentage `Historical rate` where sourced that way; label crowd measure `{count}/{total} picks`. Use separate visual treatments. Show `Not available` for missing history, not an empty 0% bar implying a real zero. | A probability and a crowd vote are different facts. |
| T10 | P2 | `PickBonuses` adds several bright bonus chips below active content and in standings | Show earned total first, one compact bonus summary, with full multiplier explanation in details/rules. | The reward matters more than repeatedly listing the calculation. |
| T11 | P2 | `Leader` repeats first-place identity/total, full roster, city, and crown above standings | Integrate a compact leader highlight into standings, or make the full roster a deliberate details view. Replace `Top of the bench` with `Leader`. | Removes a second focal point saying much the same thing. |
| T12 | P1 | `Standings` split bars explain their exact numeric values only through `title`; rank arrow has no readable description | Add available text for Draft/Picks split and rank movement; keep numeric total aligned. Make detailed split an intentional view rather than relying on hover. | TV remotes and assistive technology cannot depend on mouse tooltips. |
| T13 | P2 | `Ticker` runs a 22-second looping marquee and duplicates all items for the loop | Prefer a static latest social update or user-opened history. If motion is retained, allow stopping it and keep accessible content singular. | A continuous crawler competes with a timed pick. |
| T14 | P1 | `PlayByPlay` uses time tags, embedded fantasy chips and floating duplicates over the court | Keep a structured event row with time, event and personal/crew score delta. Reserve floating effects for rare major events; retain a durable record of the change. | Users need to associate the fantasy change with the play rather than catch moving text. |
| T15 | P1 | `FootballField` honestly shows a drive-start position, while other room field tracks current situation | Keep `Drive start` visible on this view and use a distinct marker/legend from the room's current-ball view. Do not animate it as live tracking. | Different source detail should not be disguised by a shared visual metaphor. |
| T16 | P1 | Rosters use exactly four columns; player metadata/household/city compete with rank and total | Use a list/member selector or paged columns when the participant count exceeds the supported layout. Keep current viewed member and position stable across updates. | The seeded four-player composition should not define the only readable state. |
| T17 | P2 | Rosters mark a lowest performer with a chair `Benchwarmer`; final repeats it as an award | Keep the product's playful feature as a small optional postgame note. Avoid emphasizing underperformance throughout live play. | Repeated negative emphasis distracts from the main comparison and can feel needlessly pointed. |
| T18 | P1 | `FinalView`: podium, recap, lowest performer, seven-column season table and looping confetti | Lead with final match score and winner/your finish; use tabs or a secondary view for detailed season statistics. Remove looping celebration and bound recap length. | The final screen has more competing content than a couch viewer can comfortably read. |
| T19 | P1 | Season fetch failure silently leaves `Season standings loading…` | Separate loading from unavailable and no-season states; offer Retry while keeping tonight's results. | Endless loading copy promises progress that may not happen. |
| T20 | P1 | Initial connection state lacks status role/retry/edit-code; reconnect banner is separate from the score | Use the shared connection pattern; identify stale data and age when available, with the same recovery controls as other TV views. | Connection problems should not look like a stalled animation. |

## 11. Scorebook TV: `/tv2/:code`

Sources: `tv-broadcast/TvPage.tsx`, `ViewNav.tsx`, `GameOverview.tsx`, `LiveView.tsx`, `Scoreboard.tsx`, `PickBar.tsx`, `DraftBoard.tsx`, `RostersView.tsx`, `FinalView.tsx`, `PlayByPlay.tsx`, `Standings.tsx`, `Leader.tsx`, `tv.css`.

Apply T05, T07–T12, T15–T17 wherever the copied renderer has the same display pattern; do not assume that fixing the original TV changes this separate tree.

| ID | Priority | Where / current issue | Change | Why |
|---|---|---|---|---|
| B01 | P1 | Game is the default regardless of drafting/final phase; `GameOverview` compensates with generic slogans and links | Keep a stable shell, but make its primary content phase-aware: draft readiness before play, question/context during play, winner/results after final. | Phase context should appear as content, not an extra instruction to open another panel. |
| B02 | P1 | `GameOverview` shows the active question but hides options when `onNavigate` exists | Show compact options and remaining time in overview, with `Make a pick on your device` or a clear details action. | A short question window should not require another navigation step to understand the choice. |
| B03 | P2 | `.tv-sb-heading` repeats Tonight's matchup and full game title above both team names | Remove the redundant matchup line; keep competition/source metadata only if it adds information. | Team names and score already communicate the matchup. |
| B04 | P2 | `The friendly rivalry` + `Around the room` + friend/home counts + per-row Leading/Points + formula footer | Use heading `Standings`, one compact participant count if useful, rank/name/total rows, and a single Points column label. Move score explanation to rules. | Reduces a six-part editorial wrapper around a simple leaderboard. |
| B05 | P1 | `ViewNav` directional handler prevents arrow defaults globally, including when no supported content action is focused | Scope remote navigation to the active screen and handle scrollable expanded content explicitly. Preserve selected destination separately from focused control. | Prevents controls or reading regions from losing expected keyboard behavior. Runtime verification required. |
| B06 | P1 | Manual selection is reset when party status changes | Preserve an intentionally opened roster/standings page through phase updates unless that destination becomes invalid. Offer a visible result announcement. | The app should not interrupt someone reading because a background phase changed. |
| B07 | P2 | Six destination labels plus party code and brand share one wide fixed header | Use concise labels with consistent spacing; move less-used Draft after it becomes history into More if needed. Verify long codes and focus-ring clearance. | Header density should not force smaller remote targets. |
| B08 | P1 | `PickBar` represents missing probability with a dash but still draws a zero-width bar; percentage lacks a source label | Omit the quantitative bar when no measurement exists; distinguish historical rate from crowd share explicitly. | A blank/dash should not acquire the visual meaning of zero. |
| B09 | P1 | `DraftBoard` repeats nickname/full name even when same; `.tv-grid` assumes four rows per team | Remove duplicate identity; define an overflow/paging state for larger pools. Keep owner, position and availability readable. | Imported player pools and longer names should not be squeezed into a demo-sized template. |
| B10 | P1 | `PlayByPlay compact` hides the durable event list while leaving floating fantasy changes | Provide one stable latest-play/score-change record whenever transient changes are shown. Do not rely on floating text alone. | A missed animation should not mean missed information. |
| B11 | P1 | `FinalView` season error asks users to close/reopen Results | Add an in-panel Retry action; keep tonight's result in place and retain focus through refresh. | A recoverable data failure should not require navigating away. |
| B12 | P1 | `controls=0` also sets transparent overlay behavior; clean display mode can have almost no main content when panels are closed | Define separate full-screen display and overlay compositions. In overlay mode show a compact score/crew summary, with an intentional open state. | Hiding chrome should not silently change the meaning and content density of the screen. |
| B13 | P2 | Raw connection error plus long automatic-retry explanation on first load | Use a concise failure title, code context, Retry and Edit code. Put technical details in an optional diagnostic disclosure. | A recovery screen should be a usable screen, not a log excerpt. |

## 12. Lounge: `/lounge/:code`

Sources: `lounge/LoungePage.tsx`, `LoungeViews.tsx`, `LoungeElements.tsx`, `useLoungeRemote.ts`, `lounge.css`.

The committed Lounge screenshots closely illustrate the warm/serif direction still present in source. They are useful visual evidence of composition, not proof of today's rendered state.

| ID | Priority | Where / current issue | Change | Why |
|---|---|---|---|---|
| L01 | P2 | `.lg-sidebar` uses a large stacked serif wordmark and wide vertical navigation | Use the common compact brand and a narrower task rail or shared TV tabs. Preserve obvious focus and row memory. | Sidebar branding consumes space that could carry sport information. |
| L02 | P2 | `.lg-version-link`, `.lg-version-label`, footer: Scorebook version, Lounge · design B, homes tagline | Move variant switching to demo tools; remove internal design names and repeated social slogan. Keep the code and necessary remote help. | Design-iteration metadata is not part of watching a game. |
| L03 | P1 | `Tonight .lg-match`: oversized still-life ball artwork with stacked names and relatively smaller score | Lead with score, teams, clock and source/phase. Reduce artwork to a secondary crop or a minimal sport illustration. Use a meaningful original game illustration when there is no footage. | The art currently gets more space than the changing game. |
| L04 | P2 | `.lg-next`: large tan question card, decorative question-mark badge and large unused vertical space | Use a neutral pick panel with red state marker, bold question and visible answer summary. Remove the question-mark ornament. | The next action should be strong because of its content and hierarchy. |
| L05 | P1 | `Tonight` pregame/final card asks rhetorical questions before its action | Replace with state content: draft progress / active question / winner. Use `View draft`, `View picks`, `View results` only when navigation is needed. | A panel should give information rather than ask the viewer what another page will answer. |
| L06 | P2 | `Seats`: heading Your seats, city list, household, per-card arrow, Leading the room/#n in the room and points | Use `Standings` with rank, name and total; preserve the clickable roster affordance with one clear `View roster` behavior. Keep city/household in expanded crew view. | Most of the words repeat rank or identity rather than explain the game. |
| L07 | P1 | `Seats` truncates longer names to the first word in Tonight | Allow two lines or a consistent explicit truncation; make the full identity available on focus/details. Do not silently reduce different people to the same first name. | Identification matters in a shared room. |
| L08 | P1 | `.lg-seat-grid` assumes four cards; crew layout and fixed stage can overfill with larger groups | Add a defined paging/scroll state and visible count; preserve focused participant identity during reorder. | The four-person demo must not be the only stable arrangement. |
| L09 | P1 | `Option` labels `probability` as `model estimate` for every source | Use the available source: `Historical rate` for drive history, another accurate source label if supplied, otherwise omit the label. | A generic model claim misrepresents historical percentages. |
| L10 | P2 | Pick options are articles while instruction says pick by voice or device | Keep them informational; make `Picks on your device` explicit once near the question and provide the device/join route when available. | Avoids making a noninteractive answer card look like an overlooked action. |
| L11 | P2 | `Draft` has eyebrow + The draft + count; duplicates full name when nickname absent | Use `Draft` + progress. Show name, position/team and ownership in aligned rows; remove duplicate name text. | Faster player comparison. |
| L12 | P1 | `Results` spends a large tan block on winner, then a four-sentence recap and separate lowest-performer card | Use an athletic result header with winner and points; keep full standings and a short factual recap adjacent. Put the optional benchwarmer note below the result. | The score/result should not be buried in long editorial treatment. |
| L13 | P1 | Roster dialog `.lg-roster-dialog` max-height without an explicit readable overflow strategy; focus handler forces only Close | Keep header/Close fixed, make long player content a labeled scroll region reachable by remote, and restore the originating participant on close. | Current three-player stills do not prove long rosters remain readable. Existing restoration behavior should be preserved. |
| L14 | P1 | Lounge connection screen's primary recovery is switching to Scorebook, which uses the same party source | Offer Retry/Edit code as primary recovery; move layout switching to demo tools. | Switching skins is not a credible remedy for a shared data-source outage. |
| L15 | P2 | Short and long team names use two manual font sizes | Establish a two-line team-name rule and limit artwork intrusion, with a minimum font size. Avoid repeatedly shrinking labels to fit fixed art. | Realistic names should preserve consistent game hierarchy. |

## 13. Welcome page: `/welcome`

Sources: `App.tsx Welcome`, `styles.css .home-*`.

| ID | Priority | Where / current issue | Change | Why |
|---|---|---|---|---|
| W01 | P1 | Welcome is a separate marketing entry with actions leading into tv2/latest, while `/` exposes another product structure | Use one canonical entry story; keep this as an explicitly labeled welcome/demo preview during review. Link the primary action to the current create/join path. | Two entry experiences promise different flows. |
| W02 | P2 | Header tagline, eyebrow, hero, body and footer all repeat crew/game/rivalry messaging | Keep one direct proposition: `Draft players. Make picks. Track your score.` Remove redundant slogans. | More statements do not explain more of the product. |
| W03 | P2 | 64–100px serif hero with emphasized peach second line | Use a short condensed bold headline sized to leave create/join actions visible; use red sparingly. | E1/E2 application with less marketing furniture. |
| W04 | P1 | `Open game night` can open latest without explaining whether one exists | Use `Create or join a room` for the product entry; keep `Try demo` as secondary. Give missing-session recovery on a direct TV link. | A new visitor needs a usable first action. |
| W05 | P2 | Sample card labels both Inside the demo and Sample game; repeats team score and crew leader | Use one Demo badge, a compact score strip, and one standings excerpt. | A sample needs clear provenance, not multiple labels saying it is a sample. |
| W06 | P2 | Three feature cards use numbered stages, eyebrows, metaphorical title, descriptive paragraph and CTA | Reduce to Draft / Picks / Results, one sentence and a preview action each. | Stages remain clear without five text layers. |
| W07 | P2 | Arrow-up-right icons appear on same-app navigation | Use ordinary directional chevrons for internal links; reserve external-link marks for actual external navigation. | Icon semantics should match destination behavior. |
| W08 | P3 | Footer repeats Made for the game. Better with your crew. and the product name | Use a quiet footer with only useful navigation/help and required disclosures. | Repetition lengthens the page without helping the first session. |

## 14. Device simulator: `/device/:household`

Sources: `device/DevicePage.tsx`, `Transcript.tsx`, `SpeakerBar.tsx`, `SettingsDrawer.tsx`, `TracePanel.tsx`, `FallbackCard.tsx`, `device.css`, `speaker.css`, `fallback.css`, `widget.css`.

| ID | Priority | Where / current issue | Change | Why |
|---|---|---|---|---|
| D01 | P2 | `.device-bezel` 28px rounding, large shadow and nested framed board | Flatten the shell; use a compact shared header and one clear conversation/board division. Keep a device frame only in an explicit simulator showcase. | The simulated hardware container should not dominate the sports application. |
| D02 | P1 | Header displays assistant implementation `mode` such as offline/Gemini | Move provider/mode to Diagnostics inside settings. Show only game connection/source status in the player header. | Infrastructure choices do not help the player draft or pick. |
| D03 | P1 | Party chip can show `…` with no clear empty/no-party explanation | Show `No party selected` with an explicit start/join example or action. Once selected, show a labeled party code and TV link. | An ellipsis can look like permanent loading. |
| D04 | P1 | `.ds-empty` says tap mic or type but gives no discoverable sports actions | Offer supported suggestions such as `Who's available?`, `Show standings`, and `Show my roster` where the assistant supports them. State how to create/join a party separately. | Recognition is easier than recalling arbitrary command syntax. |
| D05 | P2 | `.ds-mic` uses a dot, glow/ring and static `Tap to talk` | Use a microphone SVG; state text `Talk`, `Listening…`, `Stop listening`, or `Sending…`; keep current keyboard/text fallback. | A dot is ambiguous and the static hint is wrong while recording. |
| D06 | P1 | Transcript occupies primary area; board starts as fallback and can swap to iframe | Keep the current question/draft board stable as the task area, with conversation secondary or collapsible on small screens. Preserve dimensions across fallback/widget transition. | Sports actions should not move because the assistant chose a different presentation path. |
| D07 | P1 | Transcript auto-scrolls on every update/interim regardless of reading position | Auto-follow only while the user is at the end; otherwise show `New reply`. Keep their scroll position when reviewing history. | Incoming speech must not pull away text the user is reading. |
| D08 | P1 | Pending state says `thinking…`; the text field clears immediately on submission | Show `Sending…` or task-specific status. Preserve/recover failed text with Retry; distinguish queued input from completed response. | Failure should not require retyping the message. |
| D09 | P1 | `SpeakerBar`: manual identity and recognized identity can coexist, with percent and `guess` | Show one effective identity, explain a low-confidence match as `Choose who's speaking`, and make override visible. Put numeric similarity in Diagnostics. | Identity matters for ownership; a guessed percentage is not a helpful decision interface. |
| D10 | P2 | `Who's talking?` appears after the input on a dense line with avatar chips | Place active identity next to the input, with `Change player`. Keep full member names available and avoid duplicate recognition badges. | The user should know who receives the action before sending it. |
| D11 | P1 | `SettingsDrawer` lacks explicit modal semantics/focus management beyond Escape | Provide modal semantics, initial focus, focus containment, inert background, visible Close, and return focus to Settings. | A drawer should be usable with keyboard and screen reader. |
| D12 | P2 | Settings opens with Model ready/backend, Load voice model and enrollment jargon | Use `Recognize voices` with clear setup status and progress; put backend/model errors in Details. Keep download size before loading. | The setup task is recognition, not model management. |
| D13 | P2 | `Show agent trace` and trace toggle occupy permanent footer | Move trace into Diagnostics. Keep raw tool names/arguments there, with no product-level prominence. | Removes implementation detail from the normal player flow. |
| D14 | P1 | Fallback Draft/Tonight/Season present different names, density and totals than the widget | Align headings, metric labels, decimals and state vocabulary. Clearly mark fallback as read-only when it cannot accept draft/pick actions, and offer the supported input path. | A fallback should preserve task understanding, not look like a second product. |
| D15 | P1 | Narrow layout stacks transcript above board, with multiple independently scrolling areas | On phone, lead with active task and a compact input; make conversation a deliberate expansion. Ensure keyboard does not cover Send or the current pick. | Stacking desktop columns is insufficient for a timed mobile task. Runtime check required. |

## 15. Voice setup/lab: `/voice-lab`

Sources: `voiceid/VoiceLabPage.tsx`, `EnrollPanel.tsx`, `voiceid.css`; related setup UI in `SettingsDrawer.tsx`.

| ID | Priority | Where / current issue | Change | Why |
|---|---|---|---|---|
| V01 | P1 | Home links to a Voice ID lab that foregrounds Engine/Backend/Model/Calibration | Keep the lab available in demo tools. Make ordinary voice setup a guided flow: choose household/player, prepare recognition, record three samples, test, finish. | Diagnostics are useful to a developer but overload onboarding. |
| V02 | P1 | `useVoiceId` auto-loads by default; the main lab shows progress/error but no explicit retry action in its Engine section | Explain automatic preparation with definite progress, and expose `Retry voice setup` after a loading failure. If changed to an explicit preparation flow, show the download estimate before starting. | A disabled Record button needs an obvious prerequisite and a recovery action. This is not a claim that initial auto-loading is absent. |
| V03 | P1 | Privacy statement says Everything stays on this device | Scope it to the feature: `Voice ID audio and voiceprints stay on this device.` Do not imply this describes browser speech recognition or every product feature. | Privacy copy must match the specific processing path. |
| V04 | P2 | Enrollment displays every sample sentence for every member simultaneously, with disabled controls | Guide one selected member through `Sample 1 of 3`; show the current sentence prominently and completed steps compactly. Retain household switching. | Reduces reading and scrolling before the first sample. |
| V05 | P1 | Re-enroll clears samples and immediately begins a new recording; Clear has no recovery UI | Separate `Record again` from `Delete voice samples`. Explain the effect before destructive replacement and provide confirmation or undo appropriate to available storage behavior. | Users should not lose a working voice profile from an ambiguous button. |
| V06 | P2 | Listening state shows meter and generic Stop; samples rely on strikethrough for completion | Use a timer, level meter and `Stop recording`; mark completion with a check + sample count. Keep errors beside the affected sample. | A completed sentence is not deleted content, and recording progress should be concrete. |
| V07 | P1 | Accepted result presents rounded cosine-like confidence as `{n}% confidence`; all scores also shown to three decimals | Normal setup: `Recognized {name}` plus an override/test-again path. In lab details label the measure `Similarity`, not calibrated confidence unless calibration supports that claim. | A similarity score should not imply a statistical probability of correct identity. |
| V08 | P2 | Not-sure reasons below-threshold/small-margin use model terminology | Use actionable copy: `We couldn't tell who was speaking. Try again in a quieter room or choose your name.` Retain technical reason in lab details. | Helps the user recover without learning matching thresholds. |
| V09 | P2 | Calibration sliders appear as ordinary setup cards | Put threshold/margin and backend fallback reasons in an Advanced section, with reset clearly scoped. | These are tuning controls, not prerequisites for watching a game. |
| V10 | P1 | Final enrollment/test flow has no clear completion/return action | Add `Done` / `Back to device` once the chosen person is ready; preserve household/player context. | Setup needs a clear endpoint leading back to the game. |

## 16. Watch/video preview: `/watch/:code`

Sources: `watch/WatchPage.tsx`, `watch.css`, and its child `tv-broadcast` overlay.

| ID | Priority | Where / current issue | Change | Why |
|---|---|---|---|---|
| P01 | P1 | Seven-button `.watch-dock` stays over the video, plus a persistent sample label | Use a compact overlay launcher and one small source/sync badge; reveal panel controls on intentional interaction. Keep keyboard/remote access and a persistent route back to controls. | The video should remain the dominant surface. |
| P02 | P1 | `.watch-overlay` fills most of the player; Rosters/Draft/Standings use large opaque child panels | Use a bounded side panel for secondary sports data, with a readable close action and protected host/caption regions. Keep a larger full-panel view only as an explicit takeover. | A sports companion should not obscure the main play by default. |
| P03 | P1 | The same `error` string is rendered below video setup for invalid URL and fullscreen failure | Separate field errors from player/fullscreen errors; show each next to the triggering action. Keep a fallback `Watch in window` action after fullscreen fails. | A message below the fold is not useful while the user is operating the player. |
| P04 | P1 | Child iframe has `tabIndex=-1` and `pointer-events:none`; parent controls switch panels | Keep the child purely informational and expose all required actions through reachable parent controls. Do not add interactive-looking child buttons that cannot receive input. | The visual and interaction model must agree. |
| P05 | P1 | Arrow handling operates only within the button dock; Escape always selects Game | Define Escape/Back hierarchy: close secondary panel, then show base overlay, then exit fullscreen when appropriate. Show where focus returns. | A single hidden reset rule is hard to predict. |
| P06 | P2 | Duplicate unsynced explanations in top badge and setup paragraphs | Keep one persistent `Replay data · Not synced to video` label and put the fuller explanation under Video setup. | Disclosure matters; repeating it in multiple places consumes watching space. |
| P07 | P2 | Hero `The game, with your crew on top.` and instruction `Open a panel from the bar above.` | Replace with `Watch with your crew` and task-based controls. Remove the instruction when controls are visible. | Shorter copy describes the page without narrating its layout. |
| P08 | P1 | At ≤900px dock buttons shrink to 13px; wrapped dock and sample label can cover action | Use a responsive menu outside the video on small screens, with reachable touch targets; keep only the essential badge over video. | Shrinking seven buttons is not a small-screen interaction design. |
| P09 | P1 | Source loading has only generic guidance if playback is unavailable | Define loading/unavailable/blocked embed states with `Open on YouTube` and `Change video`. Preserve current party context. | The viewer needs a clear fallback when the third-party player cannot play. Browser verification pending. |

## 17. Overlay controller: `/control/:code`

Sources: `control/ControlPage.tsx`, `control.css`.

| ID | Priority | Where / current issue | Change | Why |
|---|---|---|---|---|
| C01 | P2 | Header says Live backend control; session says Backend state, Version; footer contains install path | Rename page `Overlay controls`. Keep game state and party code; move version, installation and API troubleshooting to Diagnostics/Setup. | Technical details overwhelm the player controls. |
| C02 | P1 | Member selector `Act as` is only in the picks column, while draft column also uses it | Put a shared `Player` selector above both columns, with `Actions apply to {name}`. Preserve selection clearly while updating data. | Prevents accidental drafting/picking for the wrong person. |
| C03 | P1 | Draft, picks, start and standings all appear simultaneously | Prioritize Draft + Start before play; Picks + Standings during play; Results + New party after final. Keep other material in secondary sections. | Phase-based controls reduce scanning and disabled clutter. |
| C04 | P1 | Start game replay auto-fills rosters; explanation is a separate help paragraph | Put the auto-fill consequence and incomplete-roster count beside Start. Keep a compact duration/source disclosure. | Consequences should be visible where the action happens. |
| C05 | P1 | Pick window uses `about {seconds} seconds left` from a state snapshot | Use a local countdown anchored to the received deadline; show locked/paused states explicitly; retain confirmed choice. | A stale approximate number is poor guidance for a timed action. |
| C06 | P2 | Success says Watch the YouTube panel update; preview says confirm API data/test canvas | Use task feedback `Pick saved for {name}` and a section `Overlay preview`. Put testing instructions in developer mode. | Success should confirm the user's action, not require verifying another screen. |
| C07 | P1 | No-state error tells the user to start the backend with a shell command | Normal UI: `Can't connect to the game` with Retry and Home/Edit code. Put the exact development command in Diagnostics. | A product recovery path should not assume command-line knowledge. |
| C08 | P2 | `.ctrl-canvas` remains 540px tall as width narrows | Use a responsive 16:9 preview and an explicit message when the overlay's supported minimum size is not met. | Distorted preview dimensions can misrepresent the overlay and hide its launcher. |

## 18. Extension popup and crew overlay

Sources: `extension/popup.html`, `popup.ts`, `popup.css`, `content.tsx`; `overlay/CrewOverlay.tsx`, `styles.ts`, `placement.ts`.

| ID | Priority | Where / current issue | Change | Why |
|---|---|---|---|---|
| X01 | P2 | Popup heading/tagline, raw `latest` code, two large Show/Hide actions and backend-control link | Use compact brand, explicit Enabled state, `Follow latest party` choice or Party code, one primary Apply/Show action, and a secondary Hide action only when relevant. | Reflects current state rather than making users interpret two opposing actions. |
| X02 | P1 | Popup explains `Use latest...` as typed syntax | Make Latest party an explicit selection; use the code field only for a specific party. Keep code validation adjacent to the field. | Removes hidden command syntax from setup. |
| X03 | P1 | Popup can say Enabled while no compatible video, no party or no connection exists | Distinguish `Overlay enabled`, `Open a YouTube video`, `Connecting`, `Connected to {code}`, and `Game unavailable`. | Enabling a setting is not the same as seeing a working overlay. |
| X04 | P2 | Popup footer repeats Live backend/Fictional game and independence warning | Use one concise source/sync note and `Open controls` link; keep full technical setup in Help. | Keeps essential disclosure without internal implementation vocabulary. |
| X05 | P1 | `panelBounds`: panel/launcher disappears when width×0.34 <260 or height insufficient | Keep a compact launcher at small supported player sizes; open a responsive panel or give `Open controls` fallback. Example: 760px-wide player yields 258.4px, so the current implementation returns nothing. | Disappearing UI looks like a failed extension. This threshold follows source arithmetic, not a fresh browser observation. |
| X06 | P2 | Launcher label `Crew` gives no match/party context; colored dot communicates connection indirectly | Use `Crew standings` accessible name and a compact status text when disconnected. Keep a small readable Benchwarmers identity inside the open panel. | Users need to know what the injected control does and which app it belongs to. |
| X07 | P1 | Open panel: tabs, header, connection/version footer and move/hide controls leave little scrolling space | Put connection in one compact status row; remove version from normal UI; simplify header/footer and reserve content area for at least a useful set of standings rows. | Historical windowed screenshot visibly clips rows behind the small viewport. Current geometry still warrants checking. |
| X08 | P1 | Picks view says Submit from the control page, but provides no direct action | Add a reachable `Open picks`/`Open controls` link carrying the resolved party; keep panel answers clearly informational. | Instruction without navigation creates a dead end. |
| X09 | P2 | Roster defaults to the first standing row, without naming the selection clearly | Show `{name}'s roster` plus a compact selector; preserve the chosen member through standings changes. | The leader is not necessarily the current user. |
| X10 | P1 | `CrewOverlay` uses previous/next DOM order for all arrows and does not mark the YouTube background inactive | Treat it as a nonmodal panel with predictable tab order and spatial arrow behavior; explicitly return focus to launcher on close. If made modal, implement full confinement rather than partial behavior. | A floating companion should not unexpectedly hijack host video navigation. |
| X11 | P1 | Host menu suppression closes the panel, while show/hide/move operate on injected UI | Preserve the existing yield-to-host behavior. Test captions, native scorebugs, settings, context menu, fullscreen transitions, and return focus; ensure reopening is deliberate. | Overlay usability depends on coexistence with the host player. This is verification work, not a request to rewrite host integration. |
| X12 | P1 | Panel displays raw source errors and Backend unavailable/connected; tiny v{version} | Use `Updates paused`/`Reconnecting` plus stale-data context and Retry; move error/version details into an expandable diagnostic line. | Keeps recovery useful without broadcasting implementation state. |
| X13 | P2 | Move left/right and Hide overlay have small 13px controls | Use comfortable target geometry with short labels or labeled icons, preserving visible keyboard focus. | Small utility controls are still primary ways to recover the video view. |
| X14 | P2 | Overlay uses hardcoded Segoe UI and its own peach theme, independent of web fonts/tokens | Use a packaged/system sans fallback with the same weight/spacing roles and semantic palette; do not rely on a web-page font file loading inside YouTube. | Consistent character must survive the extension context. |

## 19. Embedded widget: Draft / Tonight / Season

Sources: `server/src/mcp/widget/benchwarmers.html`, `src/render.ts`, `src/main.ts`, `src/styles.css`. This is UI work despite the files living under `server/`.

The tool inspector borders, tool names, raw input/output sections and host controls visible outside the iframe in committed screenshots are host UI. They are not Benchwarmers restyling targets.

| ID | Priority | Where / current issue | Change | Why |
|---|---|---|---|---|
| M01 | P1 | `renderHeader`: party code is 2.2rem and competes with game title/score; no common product mark | Use a compact brand/title header, current score, readable phase/source badge, with the code secondary after entry. | The user is already inside a party and needs game state more than an oversized code. |
| M02 | P2 | Draft board/Tonight/Season are three equally large rounded filled tabs | Use compact tabs with a persistent selected indicator, obvious focus and correctly associated panels. Keep sufficient touch targets. | Less chrome leaves more room for players and current picks. |
| M03 | P1 | `renderMemberChips`: Who's tapping? appears separately from roster-count badges; selection is optional until action | Use `Player` or `Playing as`, one persistent identity selection, and group each member's roster progress with that identity. | Avoids duplicating names while making ownership clear before a pick. |
| M04 | P1 | Actions remain enabled with no member; click then produces Tap your name first | Keep a clear Choose player prompt before actions or associate the action with an explicit member selection. Avoid a late toast as the only explanation. | Prevents a predictable failed interaction. |
| M05 | P2 | `playerCard` has nickname, full identity, scouting paragraph and full-width Draft button on every row | Use compact rows/cards: name, position/team, short role note, ownership/action. Show fuller note in details. | Historical Draft screenshot shows very few players per viewport because each card is a paragraph. |
| M06 | P1 | Draft has no visible personal roster completeness constraint at action; taken cards get whole-card opacity .6 | Show selected player's slots/progress near the pool; reflect unavailable/full-roster state explicitly. Keep taken player names readable with `Drafted by`. | Card opacity alone does not explain why it cannot be selected. |
| M07 | P1 | `pickCard` shows vote count as an unlabeled number and lacks selected-option styling | Show option label, `{count} picks`, and the selected player's saved choice with check/`Your pick`. Keep it visible after refresh. | Users must distinguish crowd information from their own confirmed answer. |
| M08 | P1 | `renderTonight` says next pick opens soon whenever `activeProp` is missing, including final | Branch by phase: Pregame, Picks locked/result pending, Between picks, Final. On final lead with result/standings and Season action. | The committed Tonight screenshot already shows Final above a promise of another pick. Source retains that branch. |
| M09 | P1 | `Locked picks` combines historical picks from multiple questions without question labels | Group history by question/drive, with answer, correctness and points; show recent history first and collapse older items. | A list of names/options without question context is not understandable. |
| M10 | P1 | `renderStandings`/`renderSeason` put household badges, total and long split/summary prose in wrapping flex rows | Use aligned columns for rank, player, total, wins; keep breakdown secondary or expandable. Use one clear metric definition shared with other views. | Sports standings need comparison across rows, not re-reading wrapped prose. |
| M11 | P1 | Season total here adds points+fantasy, while other UI places display `r.points` under Points | Audit the intended display metric and label it accurately everywhere, or distinguish separate metrics explicitly. Do not alter scoring, stored totals or ranking formulas as part of this UI plan. | Two screens labeled Points should not silently display different definitions. Domain meaning must be confirmed before a copy-only fix. |
| M12 | P1 | `main.ts call` provides no per-action pending state; full `innerHTML` replacement can discard focus | Add immediate Submitting/Loading feedback, prevent accidental repeated activation while pending, preserve focus by stable action identity and restore it after render. | The interface should acknowledge the input before a host tool response arrives. Runtime verification required. |
| M13 | P1 | `renderTabs` uses tab roles but click-only handler and no associated tabpanel/arrow-key behavior | Implement complete tab interaction or use ordinary navigation buttons. Add explicit focus styling to all widget controls. | ARIA labels alone do not produce a usable widget. |
| M14 | P1 | Toast errors are transient for four seconds; initial connection has no recovery UI; light theme remains beige | Use persistent inline action failure with Retry; keep toast as secondary confirmation. Provide loading/error/empty patterns and a neutral light theme. | Host embedding should not hide failures or revert to a different visual system. |
| M15 | P2 | Fire repeats up to three emoji plus number for streak; colored household pills dominate rows | Use a small streak icon + count and quiet household text with optional swatch. Keep color redundant with identity text. | The result and rank should carry the emphasis. |
| M16 | P2 | Footer Free to play. No real money. repeats on every view | Retain a short clear free-play disclosure in an appropriate persistent footer or rules entry, with lower emphasis and consistent wording across product. | Necessary context should not compete with active picks. |

## 20. Shared interaction, accessibility and presentation details

These are UI acceptance requirements and checks, not a security/backend audit or a claim of conformance. No contrast failure is asserted solely from a screenshot.

| ID | Priority | Where | Change / verification | Why |
|---|---|---|---|---|
| A01 | P1 | All controls, input errors, selected options and charts | Check computed contrast for normal/hover/focused/selected/disabled states and composited video backings. Use 4.5:1 ordinary text, 3:1 qualifying large text and meaningful nontext UI as baseline targets. | Palette changes must preserve readability. |
| A02 | P1 | All navigable TV views | Document initial focus, every directional neighbor, edge behavior, held-key behavior, Back behavior, scroll entry/exit and return target. Confirm actual remote key support in the chosen platform. | Keyboard-like source handlers do not establish real-TV usability. |
| A03 | P1 | Countdown/polling, live totals, transcript, rank movement and FX | Announce saved picks, lock, result and connection changes once; avoid announcing the entire board or timer every poll. Keep focus stable during reorder. | Assistive output must remain usable during frequent updates. |
| A04 | P1 | Phone forms and TV/overlay utility controls | Keep proposed 44px touch target minimum on touch layouts; use larger remote targets and clear spacing on TV. Test actual target bounds rather than label font size. | A small visual label can still have a large hit area; verify the real geometry. |
| A05 | P1 | Player names, team names, codes, option labels, recaps | Define wrapping/truncation by role. Keep critical question constraints and full identity available; never reduce font until it becomes unreadable. | Long realistic data is a required state, not an exception. |
| A06 | P1 | Original TV/Lounge fixed grids, room standings, modal, overlay, widget | Check 0/1/many participants, ties, missing avatars, empty rosters, missing probabilities and large player pools. Show a useful empty state for each. | Demo-sized content masks many layout problems. |
| A07 | P1 | Reconnect banners, modal/popover layers, fixed Save area, keyboard, host controls, toasts | Verify no overlap with current question, confirmation, focus ring, video captions or essential navigation. Define stacking order and reserved feedback slots. | A visually correct isolated component can still cover the main action. |
| A08 | P2 | Whole app | Test 200% browser zoom on non-TV routes, 320/360/390px phone widths, desktop resize and reduced motion. Test actual browser focus/screen reader on supported environments. | These remain unverified by source inspection. |
| A09 | P1 | All TV presentations | Test 1280×720, 1920×1080 and actual target output on a physical TV at approximately 3m, including off-axis and bright-room viewing. | Screenshot readability is not couch readability. |
| A10 | P2 | Status and data visualization | Add labels and shapes for possession, selected answer, correct answer, errors, rank movement and team identity; do not rely on red/green or color saturation. | The design needs to work without color discrimination. |

## 21. Copy inventory and exact replacements

The rows below specify proposed text, not app changes. Braces denote existing runtime values. A single source phrase can appear in several renderers; update all listed locations together. Keep one useful friendly phrase where it has a job. The issue is the accumulation of generic slogans, rhetorical questions, and repeated instructions, not proof of who wrote the copy.

### Entry, navigation and marketing

| Location | Current text | Proposed text / action | Reason |
|---|---|---|---|
| `HomePage .hm-tagline` | Your crew's game night. | Remove, or use once on the welcome page | Repeats the page title rather than helping entry. |
| `RoomLanding .rm-eyebrow` | Football · Live room | Football replay | Accurate source context. |
| `RoomLanding h2` | Your Sunday rivalry. | Football room | Concrete destination. |
| `RoomLanding p` | Build a lineup, call every drive, and see who runs the room. | Build a lineup and make picks during a fictional replay. | Describes the task and source. |
| `RoomLanding` create | Create football room | Create room | Football is already visible. |
| `RoomLanding` join label/action | Have a code? / Find room | Room code / Join room | Explicit field and destination. |
| `PullUpGame h2` | Pull up a game | Replay a game | Direct action. |
| `PullUpGame p` | Replay any finished game with the crew. | Find a completed game to replay. | Removes unsupported universal promise. |
| `PullUpGame` button | Pull it up / Working… | Find game / Finding game… | Specific action/status. |
| `PullUpGame` progress | Building rosters… / Starting your party… | Preparing replay… | User-facing progress without implementation steps. |
| `HomePage MAIN` | Austin device / Seattle device | The Garcias / Sam's Place, under Device demos | Names the actual demo identity. |
| `HomePage MAIN` | Big screen | TV view | Matches destination vocabulary. |
| `HomePage MORE` | Scorebook TV / Scorebook welcome | TV layout preview / Welcome preview | Clearly a demo variation. |
| `Welcome` header | Your crew. Your game night. | Remove | Repeated slogan. |
| `Welcome` eyebrow | Good company. Friendly competition. | Remove | Hero already establishes context. |
| `Welcome h1` | Same game. Your rivalry. | Game night, together. | One restrained social proposition. |
| `Welcome p` | Draft your players. Call the next play. Win the night. | Draft players. Make picks. Track your score. | Names actual activities without promising a win. |
| `Welcome` actions | Open game night / Explore the demo | Create or join a room / Try demo | Clear first step and alternative. |
| `Welcome` sample card | Inside the demo / Sample game | Demo | One disclosure. |
| `Welcome` sample clock | Draft + picks = bragging rights | Remove; use Points label where needed | Metaphor adds no scoring information. |
| `Welcome` previews heading | From first pick to final whistle. | How to play | Clear section purpose. |
| `Welcome` preview titles | Build your bench. / Get in the game. / Claim the night. | Draft / Picks / Results | Predictable stage labels. |
| `Welcome` preview eyebrow/subheader | Before tip-off / Every play counts / After the buzzer / Take a look around the demo | Remove redundant labels; keep Draft/Picks/Results and one sentence each | Too many framing layers. |
| `Welcome` preview descriptions | Find your favorites and see who your friends draft. / Follow the score, the next call, and your crew's friendly rivalry. / Celebrate the winner, relive the highlights, and check the season. | Choose players for your roster. / Make picks as the replay unfolds. / See tonight's results and season standings. | Specific task per stage. |
| `Welcome` footer | Made for the game. Better with your crew. | Remove | Repeats the proposition. |

### Gameplay, shared screens and states

| Location | Current text | Proposed text / action | Reason |
|---|---|---|---|
| `JoinRoom h2` | Take your seat. | Join room | Concrete action. |
| `JoinRoom p` | Pick five players and call every drive. | Pregame: Choose five players, then make picks during the replay. | Phase-specific; do not show the pregame promise after lineup lock. |
| `JoinRoom` old-seat error | We couldn't find your old seat. Join as a new player. Your previous season history will not link to this one. | We couldn't restore your player profile. Joining as a new player won't link your previous season history. | Retains the material consequence without the seat metaphor. |
| `Lineup` incomplete state | Not saved yet | Choose {remaining} more players, or Unsaved changes once complete | Explains what to do. |
| `Lineup` saved | Saved. You're set for kickoff. | Lineup saved | Removes a second success sentence. |
| `Lineup` locked | Locked in. Your players score on every snap. | Lineup locked | Avoids implying everyone earns points every snap. |
| `HostControls` pregame helper | Starting locks lineups. Empty seats get an auto lineup. | Starting locks lineups and fills incomplete lineups automatically. | Names the actual affected item; confirm exact auto-fill behavior before adopting. |
| `Question` eyebrow | Call the drive | Current pick | Stable destination/action language. |
| `Question` timer | 12s | Closes in 0:12 | Explains the time. |
| `Question` selected | Your call | Your pick | Stable terminology. |
| `Question` empty pregame | First call opens at kickoff. | First pick opens at kickoff. | Same vocabulary. |
| `Question` empty live | Next call coming up. | Waiting for the next pick | Plain state. |
| `Question` empty final | That's the final whistle. | Final | Direct phase, paired with results. |
| `Question .rm-result` | Last call | Previous pick | Distinguishes old answer from new question. |
| `RoomPage` missed result | Last call missed | Incorrect · +0 pts | Clear personal outcome. |
| `RoomPage` successful result | Last call +{points} | Correct · +{points} pts | Outcome and reward together. |
| `PlayFeed` empty lobby/live | Kickoff when the host is ready. / Waiting on the next snap. | Waiting for host / Waiting for next play | Short, state-based text. |
| `RoomAssistant` label/button | Ask the room assistant / Send command | Ask assistant / Send | Removes unnecessary room/command wording. |
| `RoomAssistant` unsupported | Voice isn't available in this browser. Typing works. | Voice unavailable in this browser. Type your message instead. | Clear fallback action. |
| `RoomTvPage` lobby | Grab your phone and join. | Join on your phone | Same action as code header. |
| `RoomTvPage` footer | My lineup | Open phone view | Shared-screen semantics. |
| Both `DraftBoard` clock banner | On the clock | Still drafting, unless actual turn data is available | Avoids an unsupported turn implication. |
| Both TV `PickBar` | LIVE PICK | Open pick / Picks locked / Result, based on state | Accurate state. |
| Both TV `PickBar` locked | LOCKED — waiting for the result | Picks locked · Result pending | Less shouting, same meaning. |
| Both TV `PickBar` empty | Next pick coming up… | Waiting for the next pick | Avoids vague promotional rhythm. |
| Original `Leader` | Top of the bench | Leader | Clear rank. |
| `GameOverview` fallback drafting | Your team. Your bragging rights. | Draft in progress | State replaces slogan. |
| `GameOverview` fallback elsewhere | Good company. Great game. | Waiting for next pick, or Final with results action | Phase-specific content. |
| `GameOverview` helper | Open Picks for the question, timing, and results. | Remove when those are visible; otherwise View picks | Interface should show what it repeatedly tells users to open. |
| `GameOverview` heading | The friendly rivalry / Around the room | Standings | One meaningful title. |
| `GameOverview` footer | Draft + picks = total points | Move to scoring help | Useful once; redundant under every table. |
| `LoungePage` connection | Pulling up a seat. | Connecting to party {code}… | Actual operation. |
| `LoungePage` nav | The crew / The draft / Tonight | Standings / Draft / Game, with consistent mapping | Reduces synonyms and articles. |
| `Tonight` eyebrows | Before the first whistle / On the court / On the field / That's the game | Pregame / Basketball or Football only when needed / Final | State and sport are clearer than scene-setting. |
| `Tonight` next card | Who's on your bench? / Who owned the night? / What happens next? | Draft in progress / Results / Waiting for next pick | Replaces rhetorical framing with information. |
| `Tonight` next description | Find your favorites. See who your friends have their eye on. | Choose players for your roster. | Concrete task. |
| `Tonight` final description | The winner, the highlights, and the benchwarmer of the night. | See tonight's results. | Avoids listing panels as a sentence. |
| Lounge `Seats` | Your seats / #2 in the room / Leading the room | Standings / rank 2 in rank column / Leader | Removes seat metaphor and repeated rank language. |
| Lounge `Option` | {pct}% model estimate | Historical rate {pct}% when sourced from drive history | Accurate provenance. |
| Lounge Picks empty | The next call is coming. / No call open. The next one lands here. | No open pick | One state, not three promises. |
| Lounge `Results` | The room has a winner / {name} takes the night. / How it finished. | Winner / {name} / Game recap | Reduces stacked narrative labels. Respect ties. |
| Lounge empty roster | A bench waiting to be built. / Your drafted players will appear here. | No players drafted | Clear state; add draft action if appropriate. |
| Lounge empty crew | A seat for everyone. / Your friends will appear here when they join this party. | No players yet · Share the party code to invite your crew. | State plus recovery. |
| Lounge footer | {n} homes, one game night. | Remove | Decorative repetition. |
| Shared stale-data copy | Connection interrupted. Keeping the last update while we reconnect. | Reconnecting · Showing last update | Concise and truthful where last-state retention exists. |
| TV season failure | Season standings unavailable. Reopen Results to try again. | Season standings unavailable. / Retry | Recovery at the point of failure. |

### Device, voice, video, extension and widget

| Location | Current text | Proposed text / action | Reason |
|---|---|---|---|
| `Transcript` empty | Tap the mic or type a message to start. | Ask about the game, or choose a supported suggestion | Gives useful input intent. |
| `Transcript` pending | thinking… | Sending… or task-specific pending status | Describes progress without theatrical cognition. |
| `SpeakerBar` | Hi {name} · {confidence}% · guess | Playing as {name}, or Choose who's speaking if uncertain | Clear ownership, no misleading certainty. |
| `DevicePage` trace | Show agent trace | Diagnostics → Tool activity | Technical information belongs in a deliberate area. |
| `SettingsDrawer` | Load voice model / Model not loaded / Model ready ({backend}) | Prepare voice recognition / Not set up / Ready | User task, with engine detail in Diagnostics. |
| `VoiceLabPage` privacy | Everything stays on this device. No audio or voiceprints are sent to the server. | Voice ID audio and voiceprints stay on this device. | Correctly scoped promise. |
| `EnrollPanel` gated hint | Recording unlocks when the speaker model is ready. | Prepare voice recognition to record samples. | Explains prerequisite. |
| `EnrollPanel` | Enrolled / Record sentence 1 / Re-enroll / Clear | Ready / Record sample 1 of 3 / Record again / Delete voice samples | Clear progress and effects. |
| `VoiceLabPage` result | {n}% confidence | Recognized {name}; Similarity in lab details | Does not imply a calibrated probability. |
| Voice uncertain result | The best match is below the threshold. / Too close to the runner-up to tell apart. | We couldn't tell who was speaking. Try again or choose your name. | User recovery; keep reason in Advanced. |
| `WatchPage` header | Streaming overlay / preview | Watch preview | Short destination label. |
| `WatchPage` hero | The game, with your crew on top. | Watch with your crew | Clear without metaphor. |
| `WatchPage` instruction | Open a panel from the bar above. | Remove | Controls already carry labels. |
| `WatchPage` badge | Party feed · Video timing is independent | Replay data · Not synced to video, for replay sources | Concise, accurate source context. |
| `ControlPage` | Live backend control / Your game-night controls. | Overlay controls | One title. |
| `ControlPage` session | Backend state / Version / Game engine running | Game status / Version in Diagnostics / Replay playing | Product state instead of internals. |
| `ControlPage` identity | Act as | Player | Clear field label. |
| `ControlPage` success | {name} chose {option}. Watch the YouTube panel update. | Pick saved for {name}: {option} | Confirms the action directly. |
| `ControlPage` preview | Same feed as the extension / Open Crew below to confirm the API data. This is a test canvas, not video. | Overlay preview / Preview of the crew panel | Keep technical test instruction in developer help. |
| Popup link | Open backend controls | Open controls | User destination. |
| `CrewOverlay` loading | Connecting to backend… | Connecting to game… | Product-level progress. |
| `CrewOverlay` footer | Backend connected · Fictional game · {code} · v{version} | Replay · Party {code}; connection detail only when needed | Removes clutter, retains context. |
| `CrewOverlay` empty picks | No question open yet. Start the party from the control page. | No open pick / Open controls, when starting is applicable | State plus real action. |
| Widget identity | Who's tapping? | Playing as | Applies to voice and touch ownership. |
| Widget action error | Tap your name first. | Choose a player to continue | Input-independent and actionable. |
| Widget Tonight empty | Hang tight. The next one opens soon. | Waiting for next pick / Final, based on phase | Avoids a false promise after game end. |
| Widget history | Locked picks | Pick history | Includes resolved picks, not only locked ones. |
| Widget absent state | No game yet. Ask for a watch party to start. | No party selected. Create or join a party. | Clear state; connect to a supported host action. |
| Fallback Draft empty | Nobody left on the board. | No available players | Plain availability state. |
| Fallback empty | Ask “who's available?” to bring up the draft board. | Ask “Who's available?” or choose Draft, if a Draft action is added | Preserve the useful example and add a visible path when supported. |

### Scouting notes: remove filler at the source of displayed content

Location: `server/src/ai/fallback/scouting.json`, shown by draft cards/widget, plus `web/src/lib/fixtures/drafting.ts` preview notes. This is a **content recommendation only**. No AI provider, prompt, generation logic, game simulation or backend service change is requested here.

Replace the entire note value for each key as listed. The replacements compress roles already described in the fictional source; they are not claims about real players, projections, guaranteed outcomes, or newly measured statistics. Keep a small `Fictional scouting note` context in help/demo disclosure. If existing player/game data does not substantiate even the fictional role description, omit the note rather than invent evidence.

| Player key | Current wording problem | Proposed complete note | Why |
|---|---|---|---|
| `har-pg-1` | Breeze/confused-defender joke and Great pick framing | Fast guard who attacks in transition. | Keeps fast-break role, drops sales pitch. |
| `har-sg-7` | Binoculars gag; Hot nights are very hot | Long-range shooter with streaky scoring. | Keeps shooting/risk idea in useful language. |
| `har-sf-11` | Rowing-to-rim metaphor and forced three adjectives | Physical wing who attacks the rim and rebounds. | Player role becomes the subject. |
| `har-pf-21` | Crowd answers / love language | Rebounds and putbacks around the rim. | Removes unrelated relationship metaphor. |
| `har-c-34` | Gentle giant/politely asks joke | Paint presence who blocks shots. | Preserves concrete skill. |
| `har-pg-5` | Sees passes nobody knows exist / main course | Pass-first guard focused on assists. | Turns exaggeration into a readable role. |
| `har-sf-23` | Defense never adjusts / Sneaky good | Left-handed wing. | Drops unsupported evaluative filler. |
| `har-c-44` | Screens rearrange furniture | Screen-setting center with limited shooting. | Keeps the source's screen/low-shot distinction. |
| `sum-pg-2` | Whistle echo / side hustle | Quick guard who creates steals. | Concrete role. |
| `sum-sg-10` | Owns the building / stylish/showy | Guard who attacks the lane. | Removes personality padding. |
| `sum-sf-14` | Cool hands/clutch buckets/zero panic | Late-game scorer. | Keeps source's late-game role without repeated cool imagery. |
| `sum-pf-32` | Sharp/poking/with a point nickname wordplay | Forward who competes for loose balls. | Readable basketball description. |
| `sum-c-50` | Blocks sky/scoreboard / quiet smile | Rebounding center. | Relevant role without fanciful scale. |
| `sum-sg-4` | Gets a basket whenever needed / three adjectives | Scoring guard. | Avoids a guarantee. |
| `sum-pf-15` | Loose balls in another gym / Energy for days | High-energy forward who pursues loose balls. | Keeps the useful idea. |
| `sum-sf-8` | Chilly/on fire / Slow burn, big finish | Slow-starting wing who builds into the game. | Compresses the existing fictional characterization. |
| `riv-qb-12` | Catapult/big grin/adventurous throw | Strong-armed quarterback who takes passing risks. | Ability and tradeoff remain. |
| `riv-rb-28` | Train with a tight schedule | Downhill runner who is hard to bring down. | Direct description from the source. |
| `riv-rb-34` | Spark/noisy crowd | Back with quick cuts and short bursts. | Removes nickname echo and spectator filler. |
| `riv-wr-81` | Catches everything / rarely a drop | Receiver known for secure catches and steady gains. | Avoids absolute language. |
| `riv-wr-85` | Gone before defender blinks | Deep-route receiver. | Concrete route role. |
| `riv-wr-17` | You never know where headed | Receiver used on sweeps, screens and trick plays. | The specific uses are useful. |
| `riv-te-88` | Catches like a golden retriever | Big goal-line target who also blocks. | Removes an unrelated animal comparison. |
| `riv-k-3` | Small but vital points | Kicker with a mid-range role. | Avoids inflated significance. |
| `irn-qb-9` | Confident/loud/fun trio | Quarterback who throws into tight windows. | Keeps a football trait. |
| `irn-rb-22` | Clears a path by himself / comfort zone | Short-yardage runner. | Compressed role. |
| `irn-rb-30` | Video-game simile / Small moves, big gains | Elusive runner in traffic. | Clear play style. |
| `irn-wr-80` | Above rim of helmets | Receiver used on jump balls and deep routes. | Removes mixed-sport metaphor. |
| `irn-wr-84` | Catches stick / favorite down | Contested-catch receiver used on third down. | Preserves specific role. |
| `irn-wr-11` | Sprints/spins/pounces / wild and fun | Receiver with an unpredictable running style. | Removes forced nickname wordplay. |
| `irn-te-87` | Heavy/steady/hard-to-move trio | Tight end used as a red-zone target. | Keeps actionable role. |
| `irn-k-6` | Laser-like straightness and repeated cool language | Kicker described as composed in late-game situations. | States the existing characterization without implying guaranteed accuracy. |

Fixture note replacements in `web/src/lib/fixtures/drafting.ts`: `har-c-34` → `Paint presence and rebounder.`; `sum-pg-2` → `Quick guard who creates steals.`; `sum-sf-14` → `Inconsistent outside scorer.`; `har-pg-1` → `Playmaking guard who creates assists.`; `sum-sg-10` → `Streaky scorer.`; `har-c-44` → `Shot-blocking center.` Keep preview and fallback wording aligned when they describe the same skill; do not introduce new statistics to make them sound authoritative.

### Recaps and explanations

At `tv/FinalView.tsx`, `tv-broadcast/FinalView.tsx` and `lounge/LoungeViews.tsx Results`, display a short factual summary before any expanded story. Keep AI-produced text out of quotation marks/blockquote unless it is an actual attributed quote. Suggested display budget: one headline and two short sentences, with `Read recap` for longer content. Never truncate a condition that changes a pick's meaning.

Exact proposed replacement for the **existing final fixture's displayed recap**, using only its supplied facts:

> Maya wins with 194.3 points. Sam finishes second and Priya third. Harbor Hawks beat Summit Foxes 88-84.

The current fixture's phrases `carried her roster`, `hit a pick streak late`, and `cold night with Ice` can move to optional detail if useful; they should not displace the result. Live explanations should name the question, winning option and deciding play, then the player's points. Keep historical-rate provenance separate from the explanation of what happened in this replay. This proposes a presentation contract, not new generation logic.

## 22. Proposed screen compositions and user flows

These are layout/interaction proposals. They do not claim the app has already been changed or that a new behavior has been verified.

### Main football-room flow

```text
[Home: Create room | Join room]
        | create                    | code
        v                           v
[Name room, create]             [Resolve code]
        |                           | invalid / unavailable
        |                           +--> [Edit code | Retry | Home]
        +---------------------------+
                                    v
                            [Choose player name]
                                    | join failure
                                    +--> [Keep name, show error, Retry]
                                    | old identity unavailable
                                    +--> [Explain season-history effect]
                                    |          | explicit join as new
                                    +----------+
                                    v
                         [Lobby: five-slot lineup]
                              | invalid / over budget
                              +--> [Explain missing step, retain choices]
                              | save failure
                              +--> [Unsaved choices remain, Retry]
                              v
                         [Lineup saved / ready]
                              | host starts, locks lineups
                              v
                       [Play: current pick + my total]
                         |       |            |
                         |       | paused     | disconnected
                         |       v            v
                         | [Paused state] [Stale-data notice, Retry]
                         |       |            | reconnect
                         +-------+------------+
                         | submit pick
                         v
                    [Submitting] --failure--> [Retain choice, Retry]
                         | saved
                         v
                    [Your pick] --> [Locked] --> [Result + points]
                         |                         |
                         +------ next question ----+
                                                   | final
                                                   v
                                    [My finish | Tonight | Season]
```

The actual auto-fill consequence at kickoff and identity-restoration details must be reflected truthfully by the interface. This flow does not alter those rules.

### Shared-TV composition

```text
+------------------------------------------------------------------+
| BENCHWARMERS   Room / party name       Replay | phase   Join code  |
+------------------------------------------------------------------+
| Away team    24        Q3  08:42        21    Home team            |
| Possession / down / distance / ball position, where available      |
+-----------------------------------------+------------------------+
| CURRENT PICK                            | STANDINGS              |
| Question and visible closing time       | Rank   Name       Pts  |
| Option A       crowd / history labels   | 1      Maya      142.5 |
| Option B       crowd / history labels   | 2      Sam       119.6 |
| Make picks on your phone                | 3      Priya     110.3 |
+-----------------------------------------+------------------------+
| Latest play / concise result            | More standings / roster|
+------------------------------------------------------------------+
| Rules | Host controls if available | Back       Connection status  |
+------------------------------------------------------------------+
```

Use sport-appropriate fields and the actual available data. In the legacy party, roster size remains three. In the football room, it remains captain plus four flex players. Pregame replaces Current pick with joining/readiness; final replaces it with results. On TV the informative answer options are not disabled action buttons.

### Video companion flow

```text
[Video playing, compact Crew launcher]
        | open
        v
[Bounded crew panel: Standings | Picks | Roster]
        | close / Back --------------------> [Launcher, focus restored]
        | make a pick ---------------------> [Linked controls, same party]
        | host menu opens -----------------> [Yield to host UI]
        | source fails, previous data ------> [Stale status + Retry]
        | source fails, no data ------------> [Unavailable + Retry/Controls]
        | player too small -----------------> [Compact launcher/fallback]
```

Do not add a second full match scorebug on top of the real video's scorebug unless the user deliberately asks for the replay score and the difference is clearly labeled. The extension currently avoids duplicating the broadcast score; preserve that useful choice.

## 23. Implementation sequence for a later session

No implementation is authorized by this document. All boxes remain unchecked. The sequence is ordered to make the future changes reviewable and keep common fixes from diverging across surfaces.

### Pass 1: foundation and navigation

- [ ] Apply G01–G06, G13 and G20 across `brand/brand.css`, `Brand.tsx`, `fonts.css`, `styles.css`, each route stylesheet, widget CSS, overlay styles and popup CSS. Produce one token/type/component reference using the proposed starting values, then verify computed state contrast.
- [ ] Apply G07–G10 and H01–H06/H12–H14 in `HomePage`, `RoomLanding`, Welcome, and cross-route links. Football room entry stays separate from the legacy party demo. tv2 and Lounge remain reachable as demos.
- [ ] Apply G18–G19 and G11 in the route shell: branded lazy-loading, not-found, page titles, and consistent connection/recovery presentation. Keep existing backend/API contracts.
- [ ] Review a populated phone home, a room, a shared TV and the widget side by side before propagating finishing details. Acceptance: they share type/color/state language while keeping different task density.

### Pass 2: core football room and TV

- [ ] Apply R01–R16 in `RoomPage`, `JoinRoom`, `Lineup`, `HostControls` and room styles. Deliver lobby, incomplete/over-budget, saved, unsaved, host-start and locked visual states.
- [ ] Apply R17–R28 in `Question`, personal result, `Leaderboard`, `RoomAssistant`, rules and final phone composition. Deliver open, submitting, saved, paused, locked, resolved, failed and final states.
- [ ] Apply RT01–RT12 in `RoomTvPage`, TV variants of shared room components and styles. Provide an explicit directional focus/Back map and readable scroll strategy.
- [ ] Validate actual room transitions using fictional local demo data, including late arrival, incomplete lineup, action failure, stale state and final. UI validation only; keep scoring logic unchanged.

### Pass 3: legacy parties and alternate layouts

- [ ] Apply T01–T20 to the original TV without changing its game engine. Keep accurate field-source labels and replace unsupported `On the clock` wording.
- [ ] Apply B01–B13 to the separate broadcast tree. Verify that shared concepts are fixed in both trees, including Draft, Picks and Season.
- [ ] Apply L01–L15 to Lounge and W01–W08 to Welcome. Preserve useful existing focus restoration; remove internal design labels from normal navigation.
- [ ] Recheck all fixture modes against current renderers, including long names and missing data; do not use the archived screenshot palette as the acceptance target.

### Pass 4: device, voice, widget and video surfaces

- [ ] Apply D01–D15 to device conversation, board/fallback, identity, settings and Diagnostics. Validate widget/fallback transitions without moving the active task.
- [ ] Apply V01–V10 to voice setup/lab, including explicit preparation, progress, retry and completion. Test the supported manual-identity fallback without requiring microphone access for ordinary play.
- [ ] Apply M01–M16 to embedded widget rendering/styles/interaction feedback. Validate in a real supported host as a separate check from the device fallback. Confirm the Season metric meaning before relabeling it.
- [ ] Apply P01–P09 and C01–C08 to Watch and controller layouts. Keep source/sync disclosure and phase-based controls; remove developer instructions from normal UI.
- [ ] Apply X01–X14 to popup and injected crew panel. Verify actual YouTube host interactions and constrained-player behavior rather than only the controller preview canvas.

### Pass 5: copy and finishing checks

- [ ] Apply section 21's UI-copy replacements in the exact renderers listed. Replace the 32 scouting note values and six preview note values only as editorial content; do not change generation services or scoring.
- [ ] Present recaps as factual summaries, with optional expanded text. Keep names, game facts, historical provenance and pick conditions intact.
- [ ] Apply G12, G15–G17, G21–G22 and A01–A10. Verify focus/selection separation, reduced motion, contrast, responsive layouts, alternate content sizes and error-state recovery.
- [ ] Capture fresh before/after screenshots for every route and meaningful state; perform real keyboard/remote and physical-TV checks. Replace only current design documentation screenshots if desired; leave `design-archives` intact.

### File responsibility map

| File group | Responsibility in a later UI-only pass |
|---|---|
| `web/src/brand/*`, `fonts.css`, `styles.css` | Color/type roles, logo presentation, shared base and welcome styling |
| `web/src/App.tsx`, `web/index.html` | Route-loading/error shell, page title defaults, Welcome content and navigation |
| `web/src/home/*` | Entry hierarchy, replay search feedback, demo tools |
| `web/src/room/*Page.tsx`, `RoomLanding.tsx`, `Lineup.tsx`, `RoomAssistant.tsx`, `components.tsx`, room styles | Football-room composition, lineup/pick feedback, shared-TV presentation and focus |
| `web/src/tv/*.tsx`, `modes.ts`, `tv.css` | Original TV display behavior, phase presentations, data readability, rotation UX |
| `web/src/tv-broadcast/*.tsx`, `tv.css` | Alternate shared-TV views, navigation and transparent overlay presentation |
| `web/src/lounge/*` | Alternate Lounge composition, member details, focus map and language |
| `web/src/device/*` | Conversation/input/identity, modal settings, board/fallback presentation and Diagnostics |
| `web/src/voiceid/VoiceLabPage.tsx`, `EnrollPanel.tsx`, `voiceid.css` | Voice setup/lab presentation; leave embedding/matching algorithms untouched |
| `web/src/watch/*`, `control/*` | Watching composition, setup/error feedback and companion controls |
| `web/src/overlay/*`, `extension/popup.*`, presentation portions of `extension/content.tsx` | Companion panel geometry, host coexistence, focus and settings presentation |
| `server/src/mcp/widget/benchwarmers.html`, `src/render.ts`, `src/styles.css`, UI-event portions of `src/main.ts` | Embedded widget markup, styles, state feedback and interaction access |
| `server/src/ai/fallback/scouting.json`, `web/src/lib/fixtures/drafting.ts`, `final.ts` | Displayed editorial copy only; preserve IDs, scoring values and factual data |
| Game engine, server routes, data storage, AI providers, voice embedding/matching implementation | No changes proposed; these are outside this session's scope |

## 24. Future visual/interaction acceptance checklist

These checks are **not run in this audit**. They make the remaining verification concrete.

| Area | Cases | Passing condition |
|---|---|---|
| Home/entry | Phone/desktop; create; join invalid code; replay search empty/error/success | Primary task obvious, field values retained, correct destination, developer variants secondary |
| Football lobby | Joined/unjoined/host; empty/partial/full lineup; captain switch; over-cap; search no results; save error | Current identity, selected slots, budget, missing step and save state always understandable |
| Football play | Open/submitting/saved/paused/locked/resolved; correct/incorrect; reconnect | No ambiguous pick ownership, stale state or countdown; current pick reachable without long scrolling |
| Room final | No players; one player; many; tied results when supported; season empty/error | Clear final scope and rank meaning; old pick and season history do not look active |
| Room TV | Lobby/play/pause/final; join address; 32 participants; long question; rules/host open; remote repeat/Back | Question readable, focus visible/reachable, internal scrolling intentional, no overlay collision |
| Original TV | Basketball and football; draft/live/rosters/final; automatic rotation; missing drive context; imported long names | Accurate phase/source/field meaning, no forced unreadable grids, intentional rotation |
| Broadcast TV | Game/Picks/Standings/Rosters/Draft/Results; clean/overlay; keyboard focus and source error | Same state vocabulary, selected vs focused distinction, durable play information |
| Lounge | Every view; long/duplicate first names; 0/4/many members; modal with long roster | Stable identity, scrollable details, restored focus, no hardwired four-person-only composition |
| Welcome | 360px/desktop; primary entry; all three preview links | One clear proposition, correct route purpose, no misleading same-app external-link icons |
| Device | Both households; typed/voice; identity override; pending/error; fallback/widget swap; settings/trace | Effective player clear before sending; input recoverable; modal focus correct; task does not jump |
| Voice setup/lab | Idle/loading/ready/error/fallback; no mic/blocked mic/short sample; complete/reset; uncertain match | Obvious prerequisite, accurate feature-scoped privacy copy, clear progress, safe profile replacement, completion route |
| Widget | 360/800/1280px; light/dark host; all tabs; no member; action error; final and season | Readable aligned data, correct empty phase, selected choice visible, keyboard/focus preserved after host tool response |
| Watch | Valid/invalid URL; embed unavailable; every panel; hidden; fullscreen denied; keyboard | Video remains primary, source disclosure clear, errors at action point, reachable close/fallback |
| Controller | Draft/live/final; member switch; start auto-fill; pick error; narrow preview | Shared player scope clear; phase actions prioritized; no command-line help in normal flow |
| Extension | Disabled/enabled; latest/specific code; unsupported page; 640×360 and 760px-wide player; theater/fullscreen; captions/menus | Visible launcher or explained fallback; host controls remain usable; bounded panel has useful content area |
| Accessibility | Contrast states; keyboard; screen reader; 200% non-TV zoom; reduced motion | No color-only meaning; sensible announcements; no lost focus or obscured action |
| Physical TV | 720p/1080p/target output; 3m; off-axis; bright/dark room; real remote | Essential text readable, safe bounds respected, one focus owner, predictable Select/Back |

## 25. Highest-impact order

1. Replace the warm serif design foundation consistently, including local overrides and embedded surfaces.
2. Simplify entry around Create/Join, keeping room and legacy-party experiences explicitly distinct.
3. Put the active pick and confirmed personal state first on phone; keep game/context and standings first on TV.
4. Correct replay/live, historical/model, pending/locked/final and identity wording before polishing copy elsewhere.
5. Make TV reading and remote navigation reliable; avoid shrinking a desktop/TV canvas into unreadable small windows.
6. Reduce video obstruction, preserve a small-player fallback, and connect informational overlays to usable controls.
7. Replace redundant slogans, scouting metaphors, raw implementation labels and long recap treatment.
8. Verify every route and state with fresh renders and actual input before claiming the redesign works visually.

## 26. Source index

The linked line identifies the primary component, renderer or selector; use the component/selector named in each finding for the specific edit location. Links are pinned to the reviewed commit so line references stay stable.

<!-- SOURCE_INDEX -->

| Source | Entry point / selector and line |
|---|---|
| [web/src/App.tsx](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/App.tsx#L19) | `Welcome` at line 19 |
| [web/index.html](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/index.html#L1) | `<!doctype html>` at line 1 |
| [web/src/styles.css](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/styles.css#L1) | `@import './fonts.css';` at line 1 |
| [web/src/fonts.css](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/fonts.css#L2) | `the TV display has no third-party font dependency at runtime. */` at line 2 |
| [web/src/brand/Brand.tsx](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/brand/Brand.tsx#L4) | `BenchMark` at line 4 |
| [web/src/brand/brand.css](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/brand/brand.css#L2) | `@font-face ` at line 2 |
| [web/src/home/HomePage.tsx](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/home/HomePage.tsx#L15) | `Icon` at line 15 |
| [web/src/home/PullUpGame.tsx](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/home/PullUpGame.tsx#L17) | `PullUpGame` at line 17 |
| [web/src/home/home.css](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/home/home.css#L2) | `.hm ` at line 2 |
| [web/src/room/RoomLanding.tsx](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/room/RoomLanding.tsx#L7) | `JoinRoom` at line 7 |
| [web/src/room/RoomPage.tsx](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/room/RoomPage.tsx#L14) | `RoomPage` at line 14 |
| [web/src/room/RoomTvPage.tsx](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/room/RoomTvPage.tsx#L11) | `RoomTvPage` at line 11 |
| [web/src/room/Lineup.tsx](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/room/Lineup.tsx#L6) | `Lineup` at line 6 |
| [web/src/room/RoomAssistant.tsx](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/room/RoomAssistant.tsx#L4) | `RoomAssistant` at line 4 |
| [web/src/room/components.tsx](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/room/components.tsx#L7) | `statLine` at line 7 |
| [web/src/room/room.css](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/room/room.css#L2) | `.rm, .rm-landing ` at line 2 |
| [web/src/room/broadcast.css](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/room/broadcast.css#L2) | `.rm-face ` at line 2 |
| [web/src/fx/fx.tsx](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/fx/fx.tsx#L13) | `useTimedList` at line 13 |
| [web/src/fx/fx.css](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/fx/fx.css#L2) | `.fx-banner, .fx-burst-layer, .fx-toast-layer ` at line 2 |
| [web/src/lib/usePartyState.ts](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/lib/usePartyState.ts#L8) | `parseFixtureMode` at line 8 |
| [web/src/tv/TvPage.tsx](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/tv/TvPage.tsx#L19) | `TvPage` at line 19 |
| [web/src/tv/Stage.tsx](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/tv/Stage.tsx#L3) | `STAGE_W` at line 3 |
| [web/src/tv/modes.ts](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/tv/modes.ts#L6) | `ROTATE_MS` at line 6 |
| [web/src/tv/DraftBoard.tsx](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/tv/DraftBoard.tsx#L4) | `memberAvatar` at line 4 |
| [web/src/tv/LiveView.tsx](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/tv/LiveView.tsx#L12) | `LiveView` at line 12 |
| [web/src/tv/Scoreboard.tsx](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/tv/Scoreboard.tsx#L4) | `Scoreboard` at line 4 |
| [web/src/tv/Court.tsx](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/tv/Court.tsx#L5) | `Court` at line 5 |
| [web/src/tv/FootballField.tsx](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/tv/FootballField.tsx#L8) | `yardLabel` at line 8 |
| [web/src/tv/PickBar.tsx](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/tv/PickBar.tsx#L8) | `PickBar` at line 8 |
| [web/src/tv/PickBonuses.tsx](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/tv/PickBonuses.tsx#L4) | `PickBonus` at line 4 |
| [web/src/tv/Leader.tsx](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/tv/Leader.tsx#L5) | `Leader` at line 5 |
| [web/src/tv/Standings.tsx](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/tv/Standings.tsx#L11) | `Standings` at line 11 |
| [web/src/tv/RostersView.tsx](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/tv/RostersView.tsx#L6) | `RostersView` at line 6 |
| [web/src/tv/FinalView.tsx](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/tv/FinalView.tsx#L8) | `PodiumBlock` at line 8 |
| [web/src/tv/Ticker.tsx](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/tv/Ticker.tsx#L1) | `Ticker` at line 1 |
| [web/src/tv/Moments.tsx](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/tv/Moments.tsx#L17) | `useMoments` at line 17 |
| [web/src/tv/tv.css](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/tv/tv.css#L4) | `.tv-viewport ` at line 4 |
| [web/src/tv-broadcast/TvPage.tsx](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/tv-broadcast/TvPage.tsx#L20) | `TvPage` at line 20 |
| [web/src/tv-broadcast/Stage.tsx](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/tv-broadcast/Stage.tsx#L3) | `STAGE_W` at line 3 |
| [web/src/tv-broadcast/ViewNav.tsx](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/tv-broadcast/ViewNav.tsx#L10) | `ViewNav` at line 10 |
| [web/src/tv-broadcast/GameOverview.tsx](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/tv-broadcast/GameOverview.tsx#L6) | `GameOverview` at line 6 |
| [web/src/tv-broadcast/LiveView.tsx](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/tv-broadcast/LiveView.tsx#L11) | `LiveView` at line 11 |
| [web/src/tv-broadcast/Scoreboard.tsx](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/tv-broadcast/Scoreboard.tsx#L3) | `Scoreboard` at line 3 |
| [web/src/tv-broadcast/PickBar.tsx](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/tv-broadcast/PickBar.tsx#L7) | `PickBar` at line 7 |
| [web/src/tv-broadcast/DraftBoard.tsx](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/tv-broadcast/DraftBoard.tsx#L4) | `Card` at line 4 |
| [web/src/tv-broadcast/PlayByPlay.tsx](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/tv-broadcast/PlayByPlay.tsx#L9) | `gameTag` at line 9 |
| [web/src/tv-broadcast/Leader.tsx](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/tv-broadcast/Leader.tsx#L4) | `Leader` at line 4 |
| [web/src/tv-broadcast/Standings.tsx](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/tv-broadcast/Standings.tsx#L8) | `Standings` at line 8 |
| [web/src/tv-broadcast/RostersView.tsx](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/tv-broadcast/RostersView.tsx#L6) | `RostersView` at line 6 |
| [web/src/tv-broadcast/FinalView.tsx](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/tv-broadcast/FinalView.tsx#L6) | `PodiumBlock` at line 6 |
| [web/src/tv-broadcast/tv.css](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/tv-broadcast/tv.css#L3) | `96px / 54px safe insets (5%). Project defaults, not Android dp. */` at line 3 |
| [web/src/lounge/LoungePage.tsx](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/lounge/LoungePage.tsx#L13) | `LoungePage` at line 13 |
| [web/src/lounge/LoungeViews.tsx](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/lounge/LoungeViews.tsx#L6) | `currentQuestion` at line 6 |
| [web/src/lounge/LoungeElements.tsx](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/lounge/LoungeElements.tsx#L15) | `LoungeIcon` at line 15 |
| [web/src/lounge/useLoungeRemote.ts](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/lounge/useLoungeRemote.ts#L6) | `useLoungeRemote` at line 6 |
| [web/src/lounge/lounge.css](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/lounge/lounge.css#L3) | `.lg-viewport ` at line 3 |
| [web/src/device/DevicePage.tsx](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/device/DevicePage.tsx#L37) | `DevicePage` at line 37 |
| [web/src/device/Transcript.tsx](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/device/Transcript.tsx#L4) | `Transcript` at line 4 |
| [web/src/device/SpeakerBar.tsx](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/device/SpeakerBar.tsx#L4) | `SpeakerBar` at line 4 |
| [web/src/device/SettingsDrawer.tsx](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/device/SettingsDrawer.tsx#L6) | `SettingsDrawer` at line 6 |
| [web/src/device/TracePanel.tsx](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/device/TracePanel.tsx#L3) | `TracePanel` at line 3 |
| [web/src/device/FallbackCard.tsx](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/device/FallbackCard.tsx#L8) | `colorOf` at line 8 |
| [web/src/device/device.css](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/device/device.css#L2) | `:root ` at line 2 |
| [web/src/device/speaker.css](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/device/speaker.css#L1) | `.sp-bar ` at line 1 |
| [web/src/device/fallback.css](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/device/fallback.css#L1) | `.fb-card ` at line 1 |
| [web/src/device/widget.css](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/device/widget.css#L1) | `.widget-frame ` at line 1 |
| [web/src/voiceid/VoiceLabPage.tsx](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/voiceid/VoiceLabPage.tsx#L39) | `verdictFor` at line 39 |
| [web/src/voiceid/EnrollPanel.tsx](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/voiceid/EnrollPanel.tsx#L7) | `ENROLL_SENTENCES` at line 7 |
| [web/src/voiceid/voiceid.css](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/voiceid/voiceid.css#L3) | `.vid-root ` at line 3 |
| [web/src/voiceid/useVoiceId.ts](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/voiceid/useVoiceId.ts#L54) | `messageOf` at line 54 |
| [web/src/watch/WatchPage.tsx](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/watch/WatchPage.tsx#L9) | `youtubeId` at line 9 |
| [web/src/watch/watch.css](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/watch/watch.css#L1) | `.watch-page ` at line 1 |
| [web/src/control/ControlPage.tsx](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/control/ControlPage.tsx#L10) | `ControlPage` at line 10 |
| [web/src/control/control.css](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/control/control.css#L1) | `.ctrl-page ` at line 1 |
| [web/src/overlay/CrewOverlay.tsx](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/overlay/CrewOverlay.tsx#L7) | `CrewOverlay` at line 7 |
| [web/src/overlay/styles.ts](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/overlay/styles.ts#L1) | `overlayStyles` at line 1 |
| [web/src/overlay/placement.ts](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/overlay/placement.ts#L2) | `panelBounds` at line 2 |
| [extension/popup.html](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/extension/popup.html#L1) | `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Benchwarm` at line 1 |
| [extension/popup.ts](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/extension/popup.ts#L1) | `import ` at line 1 |
| [extension/popup.css](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/extension/popup.css#L1) | `body` at line 1 |
| [extension/content.tsx](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/extension/content.tsx#L11) | `unmount` at line 11 |
| [server/src/mcp/widget/benchwarmers.html](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/server/src/mcp/widget/benchwarmers.html#L1) | `<!doctype html>` at line 1 |
| [server/src/mcp/widget/src/render.ts](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/server/src/mcp/widget/src/render.ts#L19) | `escapeHtml` at line 19 |
| [server/src/mcp/widget/src/main.ts](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/server/src/mcp/widget/src/main.ts#L18) | `toast` at line 18 |
| [server/src/mcp/widget/src/styles.css](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/server/src/mcp/widget/src/styles.css#L1) | `:root ` at line 1 |
| [server/src/ai/fallback/scouting.json](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/server/src/ai/fallback/scouting.json#L1) | `Content values` at line 1 |
| [web/src/lib/fixtures/drafting.ts](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/lib/fixtures/drafting.ts#L27) | `draftingFixture` at line 27 |
| [web/src/lib/fixtures/final.ts](https://github.com/Azrkiel/Benchwarmers/blob/b5a79c0a0b4e0ae2d1ae5853fe17a53f9933439c/web/src/lib/fixtures/final.ts#L74) | `pick` at line 74 |
