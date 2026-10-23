import { useCallback, useEffect, useRef, useState } from 'react';
import type { RoomView } from '@shared/room';
import { errorMessage, RoomRequestError, roomCredentials, roomRequest, saveCredentials, type RoomCredentials } from './api';

export function useRoom(code: string, spectator = false, enabled = true) {
  const [credentialState, setCredentialState] = useState(() => ({ code, value: roomCredentials(code) }));
  const credentials = credentialState.code === code ? credentialState.value : roomCredentials(code);
  const setCredentials = (value: RoomCredentials) => setCredentialState({ code, value });
  const [snapshot, setSnapshot] = useState<{ code: string; view: RoomView }>();
  const view = snapshot?.code === code ? snapshot.view : undefined;
  const [error, setError] = useState('');
  const [stale, setStale] = useState(false);
  const [busy, setBusy] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<number>();
  const revision = useRef(0);
  const mounted = useRef(true);
  const mutations = useRef(new Set<AbortController>());
  const busyRef = useRef(false);
  const pollError = useRef(false);
  const base = `/api/rooms/${encodeURIComponent(code)}`;
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; for (const controller of mutations.current) controller.abort(); busyRef.current = false; revision.current++; };
  }, [code]);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let active = true;
    async function poll() {
      const version = revision.current;
      try {
        const fresh = await roomRequest<RoomView>(base, { token: spectator ? undefined : credentials.participantToken, signal: controller.signal });
        if (active && version === revision.current && !busyRef.current) {
          setSnapshot({ code, view: fresh }); setStale(false); setUpdatedAt(Date.now());
          if (pollError.current) { setError(''); pollError.current = false; }
        }
      } catch (problem) {
        if (active) {
          setStale(true); pollError.current = true;
          if (problem instanceof RoomRequestError && problem.status === 401 && credentials.participantToken && !spectator) {
            const next = { hostToken: credentials.hostToken };
            saveCredentials(code, next); setCredentials(next);
            setError('Your saved seat could not be restored. Join again with a new name or use your original device.');
          } else setError(errorMessage(problem));
        }
      } finally { if (active) timer = setTimeout(poll, 1000); }
    }
    void poll();
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [base, code, credentials.participantToken, credentials.hostToken, spectator, retryKey, enabled]);

  const mutate = useCallback(async (action: string, body: unknown, assistant = false) => {
    if (busyRef.current) return undefined;
    busyRef.current = true; setBusy(true); setError(''); revision.current++;
    const controller = new AbortController(); mutations.current.add(controller);
    try {
      const result = await roomRequest<RoomView | { view: RoomView; reply: string }>(`${base}/${action}`, { body, signal: controller.signal });
      if (!mounted.current || controller.signal.aborted) return undefined;
      let fresh = assistant ? (result as { view: RoomView }).view : result as RoomView;
      // Host actions return a public snapshot; restore the private lineup before
      // replacing the page so host controls never unmount the player's editor.
      if (credentials.participantToken && !fresh.me) {
        fresh = await roomRequest<RoomView>(base, { token: credentials.participantToken, signal: controller.signal });
        if (!mounted.current || controller.signal.aborted) return undefined;
      }
      setSnapshot({ code, view: fresh }); setStale(false); setUpdatedAt(Date.now());
      return { view: fresh, reply: assistant ? (result as { reply: string }).reply : undefined };
    } catch (problem) { if (mounted.current && !controller.signal.aborted) setError(errorMessage(problem)); return undefined; }
    finally { mutations.current.delete(controller); busyRef.current = false; revision.current++; if (mounted.current) setBusy(false); }
  }, [base, code, credentials.participantToken]);
  /** Like mutate, but throws so callers can tell a server rejection from a lost response. */
  const send = useCallback(async (action: string, body: unknown): Promise<RoomView> => {
    revision.current++;
    const controller = new AbortController(); mutations.current.add(controller);
    try {
      const fresh = await roomRequest<RoomView>(`${base}/${action}`, { body, signal: controller.signal });
      if (mounted.current && !controller.signal.aborted) { setSnapshot({ code, view: fresh }); setStale(false); setUpdatedAt(Date.now()); }
      return fresh;
    } finally { mutations.current.delete(controller); revision.current++; }
  }, [base, code]);
  /** Fetch the private snapshot now (used to confirm a pick whose response was lost). */
  const refresh = useCallback(async (): Promise<RoomView> => {
    const fresh = await roomRequest<RoomView>(base, { token: credentials.participantToken });
    if (mounted.current) { revision.current++; setSnapshot({ code, view: fresh }); setStale(false); setUpdatedAt(Date.now()); }
    return fresh;
  }, [base, code, credentials.participantToken]);
  const acceptJoin = (fresh: RoomView, next: RoomCredentials) => { revision.current++; setSnapshot({ code, view: fresh }); setCredentials(next); setError(''); setStale(false); };
  return { view, credentials, error, stale, busy, mutate, send, refresh, acceptJoin, retry: () => setRetryKey((key) => key + 1), updatedAt };
}
