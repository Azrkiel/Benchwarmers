# Room security boundary

`server/src/room/security/index.ts` supplies an opt-in, single-process session boundary. Existing bearer credentials remain the compatibility default. This does not establish production readiness, durable accounts, verified participant identity, multi-instance sessions, or provider entitlements.

## Session flow

```text
private saved credential -> POST /api/rooms/:code/session
  -> allowed HTTPS Origin + bounded JSON + exchange rate limit
  -> injected RoomStore credential validation
  -> Secure HttpOnly SameSite=Strict __Host-bw-room cookie
  -> response includes CSRF token, role, actor ID, expiry (no credential)

cookie request -> room scope + role + expiry + authority revalidation
  -> mutation requires allowed Origin and x-room-csrf
  -> actor/room rate limit -> private res.locals.roomActor
  -> trusted legacy command boundary -> existing durable receipt/settlement path

bad origin / CSRF / scope / expired or revoked authority -> reject
full session or rate-key registry -> reject; never evict active protection keys
```

The cookie is host-wide and holds one active room/role selection per browser. Exchanging another session changes that selection. Browser clients must send the response's CSRF token on every cookie-authorized mutation, including logout. They should keep it in memory and re-exchange after refresh if needed. TLS is required; the module never relaxes cookie security for HTTP development. Invite codes remain public and do not grant mutation authority. Never put credentials in URLs, analytics, logs, or correlation IDs.

`DELETE /api/rooms/:code/session` revokes the selected session and clears the cookie. Sessions expire after one hour by default and are invalid after a process restart. `sessions.revokeActor(roomCode, actorId)` invalidates all sessions for a seat. The underlying credential is revalidated on every cookie request, so removing a participant or revoking the saved bearer invalidates existing sessions. CSRF tokens use cryptographic randomness and constant-time comparison. Duplicate session cookies fail closed.

## Integration API

```ts
const security = createRoomSecurity({
  enabled: true,
  allowedOrigins: ['https://rooms.example'],
  validateCredential: ({roomCode, role, credential, participantId}) => {
    // Return a stable, trusted identity only after validating this room + role.
    // host: store.isHost(roomCode, credential)
    // participant: resolve the actual seat from its credential
    // spectator: explicitly permit public reading; never return a host identity
    // integration: require a distinct integration credential and scope
    return valid ? {actorId: trustedId} : undefined;
  },
});
app.use('/api/rooms', security.router);
```

The validation callback may return a promise. `participantId` is an optional untrusted hint at exchange, then the trusted actor ID during revalidation; the credential must establish the real identity. Host and integration roles must not impersonate participant seats. A room host does not automatically gain access to a participant's private balances or receipts.

After bounded JSON parsing and once `:code` is populated, apply `security.requestLimits` for all room traffic, including bearer requests. Apply `security.authorize('participant')` or `security.authorize('host')` before route-specific commands. `authorize()` permits any validated session role for public reads. A missing cookie delegates to the existing bearer validation. An invalid cookie never falls back to a supplied bearer.

The parent router must use `res.locals.roomActor.credential` privately to adapt cookie authorization to existing command arguments, and reject conflicting client-supplied host or participant credentials. Do not serialize `roomActor`. Middleware performs authorization; it does not bypass store-level command validation, request-ID uniqueness, or durable transactions. It cannot turn an unsigned voice identification hint into an authenticated seat.

`requestLimits` hashes legacy credential identities for bounded private rate keys and counts a shared room total. Rotating bogus credentials cannot bypass the shared room cap. Do not trust arbitrary `X-Forwarded-For`; configure Express proxy trust for the deployment's known proxy addresses. The session exchange has its own remote-address and room limits. Middleware shares a request-local marker to avoid double charging `requestLimits` plus `authorize`. Parent routing now installs these boundaries. `allowLegacyCredentials:false` requires sessions for private reads and mutations; public join/create bootstrap stays available.

`correlation` emits a server-generated UUID in `x-correlation-id`; incoming correlation IDs are ignored. The session router applies it automatically. Other routes can mount it explicitly.

## Abuse limits contract

`ROOM_ABUSE_DEFAULTS` exports the defaults below. The parent store/router must enforce storage and discovery limits at the authoritative mutation/read boundary; declaring these values alone does not enforce them.

| Limit | Default | Enforcement owner |
| --- | ---: | --- |
| Stored rooms | 100 | RoomStore create boundary; no automatic deletion of accepted history |
| Participants per room | 64 | RoomStore join boundary; preserves the legacy 35-seat contract; returning seats do not consume another seat |
| Discovery results | 20 | RoomStore list boundary |
| JSON payload | 16,384 bytes | Express parser, including session exchange |
| Room history retention | Operator archival decision | Durable accepted data is retained; no scheduled purge is installed. The exported seven-day proposal is not permission to delete ledger/receipt history. |
| Sessions | 2,048 | Session registry, reject at capacity |
| Session lifetime | 1 hour | Session registry |
| Actor requests | 120/minute | Request limiter |
| Room requests | 1,000/minute | Request limiter |
| Active rate keys | 4,096 | Request limiter, reject new keys at capacity |

Request limits bound call traffic as well. Existing domain commitment/call limits still apply; the room request limit is not a substitute for point holds, one commitment per target, or settlement checks. Friendly rooms assume trusted participants: name changes, multiple browsers, and repeated joins do not establish unique humans. Valuable or prize-bearing use requires verified identity and invitation controls before enabling crowd bonuses.

## Aggregate observability

`SecurityTelemetry` accepts only finite metric names: `accepted`, `rejected`, `rate_limited`, `save_error`, `settlement`, `correction`, `session_created`, `session_revoked`. Its gauges are `source_lag_ms`, `active_rooms`, `stream_connections`, `queue_depth`, `session_count`, `rate_keys`. Counters saturate at the maximum safe integer and gauges reject negative/nonfinite values. No user-supplied labels or payload fields are retained.

Session middleware's `accepted` records successful authorization, not successful persistence or settlement. Record authoritative save failures and domain settlement/correction events at those boundaries. Operators can scrape a redacted aggregate snapshot through a separately authenticated operations boundary; no public metrics endpoint is installed by this module. Never emit private balances, tokens, audio, provider keys, request bodies, or raw feed payloads.

## Deployment limits and verification

Sessions, rate buckets, and metrics are process-local and reset on restart. Run one writer and one service process until session/rate storage and the room store's persistence capability support the selected deployment. A transactional room database alone does not make these sessions distributed. Do not describe fixture tests or local bounds as a load test, backup/restore proof, or production authentication audit.

Focused verification: `npx vitest run test/room/security-session.test.ts` from `server/`. Tests cover scope separation, capacity, expiry, revocation, duplicate cookies, secure cookie attributes, cross-origin/CSRF rejection, private exchange responses, bearer compatibility, bounded actor/room traffic, rate registry expiry, and aggregate telemetry.
