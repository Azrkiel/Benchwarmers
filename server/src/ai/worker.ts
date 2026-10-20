import type { AiContentProvider, AiSink, PartyLifecycleEvent } from '../shared/types.js';

export type AiWorkerOptions = {
  sink: AiSink;
  provider: AiContentProvider;
  log?: (msg: string) => void;
};

export type AiWorker = { stop(): void; idle(): Promise<void> };

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Background AI worker. Listens to store lifecycle events, enqueues jobs on a serial
 * promise chain and writes results back through the sink. Never throws into the store.
 */
export function startAiWorker(opts: AiWorkerOptions): AiWorker {
  const { sink, provider } = opts;
  const log = opts.log ?? (() => {});
  let stopped = false;
  let pending = 0;
  let chain: Promise<void> = Promise.resolve();
  const scouted = new Set<string>();

  async function genProps(partyId: string): Promise<void> {
    const ctx = sink.getPartyContext(partyId);
    if (!ctx) return;
    const props = await provider.generateProps({ game: ctx.game, gameT: ctx.gameT, score: ctx.score, existing: ctx.props });
    if (props.length > 0 && !stopped) sink.addProps(partyId, props);
  }

  async function run(e: PartyLifecycleEvent): Promise<void> {
    switch (e.type) {
      case 'party_created': {
        const ctx = sink.getPartyContext(e.partyId);
        if (!ctx) return;
        const gameId = ctx.game.id;
        if (!scouted.has(gameId)) {
          try {
            const notes = await provider.scoutingNotes(ctx.game);
            if (!stopped) sink.setScoutingNotes(gameId, notes);
            scouted.add(gameId);
          } catch (err) {
            log(`scouting notes failed for ${gameId}: ${errMsg(err)}`);
          }
        }
        if (provider.mode === 'bedrock') await genProps(e.partyId);
        return;
      }
      case 'party_started':
        if (provider.mode === 'bedrock') await genProps(e.partyId);
        return;
      case 'prop_resolved': {
        const ctx = sink.getPartyContext(e.partyId);
        const prop = ctx?.props.find((p) => p.id === e.propId);
        if (!ctx || !prop || prop.explanation) return;
        const events = ctx.game.events.filter((ev) => ev.t <= prop.resolvesAt);
        const text = await provider.explainResult({ game: ctx.game, prop, events });
        if (!stopped) sink.setPropExplanation(e.partyId, e.propId, text);
        return;
      }
      case 'party_final': {
        const rc = sink.getRecapContext(e.partyId);
        if (!rc) return;
        const text = await provider.recap(rc);
        if (!stopped) sink.setRecap(e.partyId, text);
        return;
      }
    }
  }

  const unsubscribe = sink.onLifecycle((e) => {
    if (stopped) return;
    pending++;
    chain = chain.then(async () => {
      try {
        if (!stopped) await run(e);
      } catch (err) {
        try {
          log(`ai job ${e.type} (${e.partyId}) failed: ${errMsg(err)}`);
        } catch {
          /* logger must not break the chain */
        }
      } finally {
        pending--;
      }
    });
  });

  return {
    stop() {
      stopped = true;
      unsubscribe();
    },
    async idle() {
      while (pending > 0) await chain;
    },
  };
}
