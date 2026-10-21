# Test Benchwarmers with Gemini

Gemini can power both game content and the simulated assistant while retaining Bedrock for the final AWS integration. No UI or game-engine changes are required.

## Put your keys here

Create **`.env` in the repository root**, next to `.env.example`. The server loads it at startup, including when launched through npm workspaces. Shell environment variables take precedence. Restart the server after editing this file.

From PowerShell in the repository root, if `.env` does not already exist:

```powershell
Copy-Item .env.example .env
```

For multiple teammate-owned keys, edit `.env`:

```dotenv
AI_MODE=gemini
ASSISTANT_MODE=gemini
GEMINI_MODEL_ID=gemini-3.8-flash
GEMINI_API_KEYS=PASTE_FIRST_KEY,PASTE_SECOND_KEY,PASTE_THIRD_KEY
GEMINI_API_KEY=
```

For one key, leave `GEMINI_API_KEYS` blank and set `GEMINI_API_KEY=YOUR_KEY`. The pool takes precedence if both are set. Duplicate keys and empty entries are ignored. Keys are sent only from the server, in the Google API key header; they never appear in request URLs, browser bundles, assistant traces or model error logs. Root `.env` is ignored by Git. Do not use a `VITE_` prefix for secrets.

Get a key from [Google AI Studio](https://aistudio.google.com/apikey). `GEMINI_MODEL_ID` is configurable; choose a text model enabled for your Google projects that supports function calling. The default is Google's stable Gemini 3.8 Flash. Access, free-tier allowances and billing depend on the Google project and model; this integration does not provision billing or change quotas.

## Run and test

```powershell
npm ci
npm run dev
```

Server: `http://localhost:3001`. Web: `http://localhost:5173`. The existing TV is `/tv/DEMO`. The device page is developed separately; the assistant API can be tested directly:

```powershell
$body = @{
  text = "I'm Maya, draft Big Mo"
  household = "garcias"
  partyCode = "DEMO"
} | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3001/api/assistant" -Method Post -ContentType "application/json" -Body $body
```

The reply includes `mode` (`gemini` on success, `offline` if it fell back), `reply`, `toolCalls`, and any UI resource. The example changes DEMO by drafting a player; use a fresh party when replaying it.

`AI_MODE` and `ASSISTANT_MODE` are independent. To test only conversation, set `AI_MODE=fallback` with `ASSISTANT_MODE=gemini`. This avoids background generation while you test assistant turns. AI content runs on lifecycle events, with scouting notes also warmed at startup; create/start a party to exercise generated questions, resolve a question for an explanation, and finish the game for a recap.

## Automatic key switching

The assistant and background worker share one process-local pool.

1. Requests use the current healthy key and continue using it after success.
2. HTTP 401/403 or `API_KEY_INVALID` disables that key until restart and tries the next key.
3. HTTP 429, 5xx, and network errors move the key into cooldown and try the next eligible key. Google's `Retry-After` header or `RetryInfo.retryDelay` overrides a shorter configured cooldown. Repeated HTTP failures increase backoff.
4. Each key is attempted at most once per model request, within a total deadline. Cooling/disabled keys are skipped. If no key is available, content uses templates and the assistant uses its offline router.
5. Bad request/model errors such as HTTP 400/404 fail immediately rather than cycling through keys. A malformed generated JSON reply gets one correction attempt.

Defaults: `GEMINI_KEY_COOLDOWN_MS=60000`, `GEMINI_TIMEOUT_MS=60000`. Each attempt uses at most half the deadline when multiple keys are available, reserving time for failover. There is no infinite retry loop, automatic quota increase or background polling. Keys belonging to the same Google project can share quotas; adding them does not multiply that project's allowance. Cooldowns are local to this server process and reset on restart.

Key switching retries only generation with the same conversation. Already-executed MCP tools are not replayed as part of transport retries. If generation ultimately fails after a successful draft/pick/setup, the assistant returns completed tool results instead of re-planning the turn offline. Thought signatures remain attached to the original model content.

Gemini transport errors expose only local status summaries, never Google's raw response text. Assistant logs show provider, tool count, token counts and elapsed time; set `ASSISTANT_LOG=0` to silence them. `AI_LOG=0` silences background fallback warnings.

## Switch back to Bedrock

Edit root `.env`, configure AWS credentials/model access, then restart:

```dotenv
AI_MODE=bedrock
ASSISTANT_MODE=bedrock
AWS_REGION=us-east-1
BEDROCK_MODEL_ID=YOUR_SUPPORTED_INFERENCE_PROFILE_ID
```

Gemini keys may remain in the ignored file; Bedrock mode does not use them. A live Bedrock test is still required: Gemini tests do not verify AWS permissions, model-specific settings, or real model tool use. For a no-network demo, use `AI_MODE=fallback` and `ASSISTANT_MODE=offline`.

## Code map

- `server/src/ai/gemini.ts`: native REST client, shared key pool, cooldowns, deadlines, JSON validation/retry.
- `server/src/ai/providers.ts`: shared content prompts, schemas, guardrails, Gemini/Bedrock selection.
- `server/src/assistant/geminiLoop.ts`: native Gemini function-call loop over the existing MCP client.
- `server/src/assistant/routes.ts`: selects the assistant provider.
- `server/src/config.ts`: loads root `.env` while preserving shell overrides.

References: [Gemini API request format](https://ai.google.dev/api/generate-content), [thought signatures](https://ai.google.dev/gemini-api/docs/generate-content/thought-signatures), [available models](https://ai.google.dev/gemini-api/docs/models), [rate limits](https://ai.google.dev/gemini-api/docs/rate-limits).

## Verification

The integration is covered by mocked Google responses and a real HTTP/MCP/store checkpoint that performs and persists exactly one draft after key failover. Live Google model access and JSON generation were verified after the user supplied credentials locally.

On Windows, server startup adds the Windows certificate store to Node's default trust roots, retaining certificate verification. This supports locally installed HTTPS proxy/inspection certificates. Gemini 3.8 Flash uses `LOW` thinking; it rejects `MINIMAL`. A live connection test took about 22 seconds, so the default model-request deadline is 60 seconds rather than 15.

The full server suite passes with `npm run test -w server -- --maxWorkers=1` (519 tests after the live-provider fixes). The web suite passes (188 tests), web production build passes, and server/widget/web typechecks pass. One parallel server run hit the already-documented Windows loopback timeout across both existing and new HTTP suites; serial execution passed without weakening tests or changing timeouts.
