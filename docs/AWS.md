# AWS usage (AWS Builder mini challenge)

Benchwarmers uses one AWS service: **Amazon Bedrock**, through the Converse API.
Everything also runs with zero AWS credentials in `AI_MODE=fallback`, which is the default.

## What we use

- Amazon Bedrock Runtime, called with `ConverseCommand` from `@aws-sdk/client-bedrock-runtime` (`server/src/ai/bedrock.ts`).
- A Claude Haiku-tier model, addressed through a cross-region inference profile id (set in `BEDROCK_MODEL_ID`). Haiku is fast and cheap enough for short party-game text.

## How and why

Bedrock writes four kinds of content:

| Content | What it does |
| --- | --- |
| Props | 1-2 new pick'em questions per game, written from the upcoming scripted plays |
| Explanations | 1-2 plain sentences after each question resolves, for people new to basketball |
| Recap | A short end-of-night summary from the final standings and draft results |
| Scouting notes | One fun fictional line per player for the draft board |

Design rules:

- **Background worker, never in the request path.** The store emits lifecycle events (`party_created`, `party_started`, `prop_resolved`, `party_final`). A serial worker (`server/src/ai/worker.ts`) handles them and writes results back. MCP tools and REST routes never wait on Bedrock, so they answer in under 500 ms.
- **Validated output.** Every call asks for JSON only. The reply is parsed and checked with zod. On a bad reply we retry once, then use the deterministic fallback content.
- **Engine stays the source of truth.** Generated props go through validation (time windows, option ids, resolver shape). Bedrock never decides who is right: the game engine resolves every question from the scripted events. The model only writes the wording and the explanation.
- **Failure is safe.** A Bedrock error, timeout or throttle logs a line and the fallback text is used. Nothing blocks the game.

## Cost guard

- Results are cached per game: scouting notes are generated once per game id, not per party.
- `AI_MODE=fallback` is the default. Bedrock is opt-in.
- Short prompts and small `maxTokens` limits per call.
- Every call is counted. `getAiUsage()` (in `bedrock.ts`) returns calls, input tokens, output tokens, total latency and errors; per-call usage is logged unless `AI_LOG=0`.
- A $5 AWS Budgets billing alarm is set on the account.

## Guardrails

- The system prompt asks for family-friendly text about a fictional league.
- No gambling or money language: no bet, wager, odds, cash or stakes. Probabilities on options are info only.
- Teams and players are fictional. No real leagues or teams.
- Every generated string passes `server/src/ai/guardrails.ts`; text that fails is replaced by the fallback line.

## Setup

1. Install the AWS CLI and run `aws configure` (access key, secret, default region such as `us-east-1`).
2. List the Claude inference profiles available to your account:

   ```
   aws bedrock list-inference-profiles --query "inferenceProfileSummaries[?contains(inferenceProfileId,'anthropic')].inferenceProfileId"
   ```

3. In the Bedrock console, open **Model access** and enable the Claude Haiku model you picked.
4. Set the environment and start the server:

   ```
   AI_MODE=bedrock
   BEDROCK_MODEL_ID=<inference profile id from step 2>
   AWS_REGION=us-east-1
   ```

## Environment

| Variable | Default | Meaning |
| --- | --- | --- |
| `AI_MODE` | `fallback` | `fallback` uses committed JSON and templates. `bedrock` calls Amazon Bedrock. |
| `BEDROCK_MODEL_ID` | none | Cross-region inference profile id for the Haiku-tier model. Required in bedrock mode. |
| `AWS_REGION` | `us-east-1` | Region for the Bedrock Runtime client. |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN` | none | Standard AWS credentials (or use a profile from `aws configure`). Not needed in fallback mode. |
| `AI_LOG` | on | Set to `0` to silence AI usage and warning logs. |

## No credentials needed

With `AI_MODE=fallback` (the default) the app never touches AWS. Props come from the committed game file, explanations and recaps come from templates, and scouting notes come from committed JSON. Judges can run and play the whole demo without an AWS account.
