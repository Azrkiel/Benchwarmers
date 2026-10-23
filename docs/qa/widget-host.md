# Browser widget host verification (2026-10-23)

## Regression and fix

Production `/display/garcias`, prompted with `Who's winning?`, sent a browser bearer to `/mcp` and received 401. The failed iframe retained its own flex slot, so the separate fallback started 259 CSS pixels below the spoken reply at the laptop viewport, 1536x864.

The browser now uses `/api/mcp-widget`. The server adds its bearer and forwards in-process to the existing MCP middleware and handler. `/mcp` still requires a bearer. The fallback shares the widget's single layout slot.

## Automated checks

- `npm run typecheck`: server, widget and web pass.
- `npm run test -w web`: 494 tests pass (59 files).
- `npm test -w server -- --maxWorkers=6`: 744 tests pass (39 files).
- `npm run build`: passes; the existing large-chunk advisory remains.
- `git diff --check`: passes.

HTTP regression coverage: a non-development server token; all 22 tools; a real Tonight tool result and HTML resource read; no token in responses; an invalid room host credential still denied; foreign, opaque and cross-scheme Origins rejected; Fly's forwarded HTTPS accepted; malformed JSON and unsupported methods retain their protocol errors; unauthenticated `/mcp` stays 401.

One full-suite run hit the previously documented Avast/loopback `ECONNRESET` on the existing health check. The unchanged check passed on rerun. No test retries or relaxed assertions were added.

## Browser checks

Headless Chrome, 1536x864 CSS viewport, production web build served by Express with a non-development MCP token and offline/fallback modes. Each host received the typed prompt `Who's winning?`; its sandboxed MCP App loaded Tonight, switched to Season, then back to Tonight. Both display sizes and `/device/garcias` worked with no page exceptions. Browser MCP requests had no Authorization header. POST returned 200/202; the SDK's optional GET stream probe returned the expected 405.

With MCP requests deliberately failed, the fallback began 9 CSS pixels after the reply, in one widget slot. It remained readable with its standings intact.

![Fallback directly below the reply](screens/display-local-fallback.png)

Production recheck and screenshots are recorded after deployment below.

## Review

Code, security and cleanup passes found no remaining blocking issue. Forwarding reuses the request parser, size limit, host allowlist, bearer check, transport and cleanup rather than opening a second network hop. The endpoint is intentionally a public demo host, like the public REST API; Origin filtering is a browser safeguard, not user authentication. External clients can call the public demo host without a bearer, and room host/participant authorization remains enforced by the tools. No production secret is copied into web assets or responses.

Recording, real-microphone voice-ID proof, Alexa+ device/host proof and live Bedrock proof were not performed. The submission's UNVERIFIED statements remain.
