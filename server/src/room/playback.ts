import express from 'express';
import { z } from 'zod';

/**
 * Expiring playback-leader lease per room: one designated screen speaks and cheers.
 * Owned by Worker B (command area); Worker A registers the router in routes.ts:
 *
 *   router.use('/:code/playback', createPlaybackRouter(leases, (code, token) => store.isHost(code, token)));
 *
 * In-memory by design for the single-process demo: after a restart nobody holds the
 * lease until a screen claims again, which only means sound stays off until then.
 */
export const LEASE_MS = 30_000;
export type Lease = { deviceId: string; label: string; expiresAt: number };
export type ClaimResult = { granted: boolean; lease: Lease | null; reason?: 'HELD' };

export class PlaybackLeases {
  private leases = new Map<string, Lease>();
  constructor(private now: () => number = Date.now, private ttl = LEASE_MS) {}

  current(code: string): Lease | null {
    const lease = this.leases.get(code);
    if (!lease) return null;
    if (lease.expiresAt <= this.now()) { this.leases.delete(code); return null; }
    return lease;
  }

  /** Free or expired leases go to the caller; the holder renews; a host may take over explicitly. */
  claim(code: string, deviceId: string, label: string, { force = false, host = false } = {}): ClaimResult {
    const held = this.current(code);
    if (held && held.deviceId !== deviceId && !(force && host)) return { granted: false, lease: held, reason: 'HELD' };
    const lease = { deviceId, label, expiresAt: this.now() + this.ttl };
    this.leases.set(code, lease);
    return { granted: true, lease };
  }

  release(code: string, deviceId: string): void {
    if (this.current(code)?.deviceId === deviceId) this.leases.delete(code);
  }
}

const claimSchema = z.object({ deviceId: z.string().trim().min(8).max(80), label: z.string().trim().max(40).optional(), force: z.boolean().optional(), hostToken: z.string().max(200).optional() });
const releaseSchema = z.object({ deviceId: z.string().trim().min(8).max(80) });

/** GET / -> current lease; POST /claim; POST /release. Device ids are opaque, never credentials. */
export function createPlaybackRouter(leases: PlaybackLeases, isHost: (code: string, hostToken: string) => boolean): express.Router {
  const router = express.Router({ mergeParams: true });
  router.use(express.json({ limit: '2kb' }));
  const publicLease = (lease: Lease | null) => lease && { label: lease.label, expiresAt: lease.expiresAt };
  router.get('/', (req, res) => {
    const code = String((req.params as { code?: string }).code ?? '').toUpperCase();
    res.json({ lease: publicLease(leases.current(code)) });
  });
  router.post('/claim', (req, res) => {
    const parsed = claimSchema.safeParse(req.body ?? {});
    if (!parsed.success) { res.status(400).json({ error: 'Invalid playback claim.', code: 'BAD_REQUEST' }); return; }
    const code = String((req.params as { code?: string }).code ?? '').toUpperCase();
    const { deviceId, label = 'Shared screen', force = false, hostToken } = parsed.data;
    const result = leases.claim(code, deviceId, label, { force, host: !!hostToken && isHost(code, hostToken) });
    res.status(result.granted ? 200 : 409).json({ granted: result.granted, mine: result.granted, lease: publicLease(result.lease), ...(result.reason ? { code: 'PLAYBACK_HELD', error: `Sound is playing on ${result.lease?.label ?? 'another screen'}.` } : {}) });
  });
  router.post('/release', (req, res) => {
    const parsed = releaseSchema.safeParse(req.body ?? {});
    if (!parsed.success) { res.status(400).json({ error: 'Invalid playback release.', code: 'BAD_REQUEST' }); return; }
    leases.release(String((req.params as { code?: string }).code ?? '').toUpperCase(), parsed.data.deviceId);
    res.json({ released: true });
  });
  return router;
}
