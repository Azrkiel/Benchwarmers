import express from 'express';
import { GameError } from '../game/engine.js';
import type { GameErrorCode } from '../game/engine.js';
import type { Store } from '../game/store.js';
import type { ApiError } from '../shared/types.js';

const STATUS: Record<GameErrorCode, number> = {
  NOT_FOUND: 404,
  NOT_IN_PARTY: 403,
  BAD_REQUEST: 400,
  BAD_OPTION: 400,
  PICKS_LOCKED: 409,
  PLAYER_TAKEN: 409,
  ROSTER_FULL: 409,
  BAD_STATUS: 409,
};

function bad(message: string): GameError {
  return new GameError('BAD_REQUEST', message);
}

/** Required non-empty string field from a JSON body. */
function reqString(body: unknown, field: string, hint: string): string {
  const v = (body as Record<string, unknown> | undefined)?.[field];
  if (typeof v !== 'string' || v.trim() === '') throw bad(`Please include ${hint}.`);
  return v.trim();
}

/** Optional string field; wrong type is a 400. */
function optString(body: unknown, field: string): string | undefined {
  const v = (body as Record<string, unknown> | undefined)?.[field];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'string') throw bad(`"${field}" must be text.`);
  return v;
}

function queryString(v: unknown): string | undefined {
  return typeof v === 'string' && v !== '' ? v : undefined;
}

export function createApiRouter(store: Store): express.Router {
  const router = express.Router();
  router.use(express.json());

  router.get('/parties/:code/state', (req, res) => {
    const state = store.getState(req.params.code, queryString(req.query.householdId));
    // since === version -> 204 No Content; any other value or none -> 200 full state.
    const since = queryString(req.query.since);
    if (since !== undefined && Number(since) === state.version) {
      res.status(204).end();
      return;
    }
    res.json(state);
  });

  router.post('/parties', (req, res) => {
    const crewId = reqString(req.body, 'crewId', 'a crewId');
    const gameId = optString(req.body, 'gameId');
    const party = store.createParty({ crewId, gameId });
    res.status(201).json({ party, code: party.code });
  });

  router.post('/parties/:code/join', (req, res) => {
    const householdId = reqString(req.body, 'householdId', 'a householdId');
    res.json({ party: store.joinParty(req.params.code, householdId) });
  });

  router.post('/parties/:code/draft', (req, res) => {
    const memberId = reqString(req.body, 'memberId', 'a memberId');
    const playerId = reqString(req.body, 'playerId', 'a playerId');
    res.status(201).json({ draftPick: store.draft(req.params.code, memberId, playerId) });
  });

  router.post('/parties/:code/picks', (req, res) => {
    const memberId = reqString(req.body, 'memberId', 'a memberId');
    const optionId = reqString(req.body, 'optionId', 'an optionId');
    const propId = optString(req.body, 'propId');
    const src = optString(req.body, 'source') ?? 'screen';
    if (src !== 'voice' && src !== 'screen') throw bad('"source" must be "voice" or "screen".');
    res.status(201).json({ pick: store.pick(req.params.code, memberId, optionId, propId, src) });
  });

  router.post('/parties/:code/start', (req, res) => {
    res.json({ party: store.start(req.params.code) });
  });

  router.post('/parties/:code/reset', (req, res) => {
    res.json({ party: store.reset(req.params.code) });
  });

  router.get('/crews/:id/season', (req, res) => {
    res.json(store.getSeason(req.params.id));
  });

  router.get('/crews/:id/current', (req, res) => {
    const code = store.getCurrentPartyCode(req.params.id);
    if (!code) throw new GameError('NOT_FOUND', 'No watch party yet for this crew.');
    res.json({ code });
  });

  router.use((_req, res) => {
    const body: ApiError = { error: 'That endpoint does not exist.', code: 'NOT_FOUND' };
    res.status(404).json(body);
  });

  router.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof GameError) {
      const body: ApiError = { error: err.message, code: err.code };
      res.status(STATUS[err.code] ?? 400).json(body);
      return;
    }
    const e = err as { type?: string } | null;
    if (e?.type === 'entity.parse.failed') {
      const body: ApiError = { error: 'That request body was not valid JSON.', code: 'BAD_REQUEST' };
      res.status(400).json(body);
      return;
    }
    if (e?.type === 'entity.too.large') {
      const body: ApiError = { error: 'That request body is too large.', code: 'BAD_REQUEST' };
      res.status(400).json(body);
      return;
    }
    console.error('[api] unexpected error', err);
    const body: ApiError = { error: 'Something went wrong.', code: 'INTERNAL' };
    res.status(500).json(body);
  });

  return router;
}
