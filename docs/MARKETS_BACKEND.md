# Market reference backend checkpoint

Implemented local Phase 13 A boundary on October 23, 2026. Real-game integration is **unverified**: no verified real matchup, operator-reviewed mapping, or actual matched-market capture is configured. Harbor/Summit and other fictional games never receive external market percentages. This checkpoint does not complete Phase 13 acceptance.

## Runtime boundary

`server/src/markets/types.ts` defines the provider boundary, explicit game identity, reviewed market mapping and public cache view. `PolymarketAdapter` makes a public GET to the fixed Gamma origin for an explicit numeric market ID. It performs no discovery, trading, wallet or authenticated operation. It rejects redirects, non-JSON/non-success responses, missing fields, unsupported outcome shapes, invalid prices and oversized bodies. Default deadline is 3 seconds, default response bound 128 KiB; configurable limits are capped at 30 seconds/1 MiB. Deadline includes body consumption. Fixture transports are injected in tests; no captured production payloads are committed.

`MarketReferenceCache.refresh(game, mapping, adapter)` is an explicit asynchronous background/admin operation. `read(gameId, fictional)` is synchronous, returns a detached public snapshot and performs no network request. Default cache limits are 100 game entries, 60 seconds freshness, and a maximum bid/ask spread of 0.10. Oldest written entries are evicted. Later-started refreshes take precedence over earlier pending refreshes, including when the later refresh fails. Failures remove old percentages from the current view; natural expiry exposes a clearly labeled stale observation. Fictional reads and refreshes return no reference, and fictional refreshes make no request.

The trusted cache reader may be injected into room services. It must not be sourced from participant input. No default real mapping or scheduler is enabled by this module. Free pregame picks do not depend on this reference. Market-based commitment quoting remains disabled for every cache state.

## Mapping and price policy

A `VerifiedMarketMapping` is trusted operator configuration, reviewed against the actual provider description. It requires canonical game/team IDs, league, scheduled start, exact provider market ID and slug, exact question, exact description, canonical outcome labels, review time and compatible full-game winner settlement rules. Review must establish overtime inclusion and void behavior for postponed/abandoned games. Automated checks do not interpret arbitrary natural-language resolution rules: the reviewed description must match byte-for-byte on every refresh, and a changed description invalidates the mapping for renewed review.

Only two-team full-game winner markets with full canonical team labels are supported in this first adapter. Questions must include the league, both full team names, scheduled date and winner meaning. The source scheduled game start must match the configured game exactly. Wrong dates, fuzzy short aliases, missing/duplicate outcomes, series/spread/handicap/total/regulation questions, different source descriptions and incompatible configured rules fail closed. Yes/No proposition markets are deliberately unsupported until their proposition-to-team semantics have a reviewed mapping policy.

Each reference records `provider`, `marketId`, safe source link, server observation time, current age, declared `gamma_outcome_prices` price method and reported bid/ask. Both outcome prices come independently from Gamma's paired arrays. They are not normalized, complemented, converted into model probabilities or labeled objective win chances. `observedAt` is the time this service received the response; it is not proof of when an underlying trade occurred. The reported market-level spread is a basic quality gate, not evidence of depth or executable prices for both sides.

Pregame pick settlement must continue to use authoritative sports results, never market resolution.

## Verification

The initial market tests failed because the missing modules had not yet been implemented. After implementation, race and canonical-whitespace tests failed on their intended assertions, then passed after fixes.

```powershell
cd C:/Users/jiang/Benchwarmers-basketball-backend/server
npx vitest run test/markets --maxWorkers=1
```

Observed result: 3 test files, 26 tests passed. Coverage includes mapping rejection, wide spread, stale source, missing source, independent prices, fictional requests, refresh races, mutation isolation, bounded cache, HTTP timeout, redirects/status, missing body, response size, invalid JSON and invalid prices. Server TypeScript passed before parallel room/security work added its in-progress tests; the root integration run records the final combined result.

## Primary documentation checked

- [Polymarket market discovery](https://docs.polymarket.com/market-data/discover-markets): public Gamma API and market fetching.
- [Polymarket market details](https://docs.polymarket.com/market-data/market-details): Gamma JSON-encoded outcome/price arrays, market identity/status, `gameStartTime`, bid/ask and spread fields.

Remaining external acceptance: select an actual real matchup from the authoritative basketball source; review a matching market's identity and resolution rules; confirm applicable data attribution/terms; run one bounded real read and retain permitted evidence. Public market API availability does not establish real-game coverage or licensed basketball event-feed access.
