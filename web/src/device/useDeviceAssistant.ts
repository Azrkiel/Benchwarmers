import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AssistantRequest, AssistantResponse, SpeakerHint, UiResourcePayload } from '@shared/types';
import { api } from '../lib/api';
import { buildRequest, resolvePartyCode, structuredFrom, type DeviceTurn } from './assistantClient';

const DEFAULT_CREW = 'sunday-crew';
const UNREACHABLE = 'Could not reach the assistant.';

export type UseDeviceAssistantOptions = {
  crewId?: string;
  send?: (req: AssistantRequest) => Promise<AssistantResponse>;
};

export type DeviceAssistant = {
  turns: DeviceTurn[];
  partyCode: string | undefined;
  pending: boolean;
  error: string | undefined;
  lastResponse: AssistantResponse | undefined;
  uiResource: UiResourcePayload | undefined;
  structured: Record<string, unknown> | undefined;
  send: (text: string, speaker?: SpeakerHint) => Promise<AssistantResponse | undefined>;
};

export function useDeviceAssistant(household: string, opts: UseDeviceAssistantOptions = {}): DeviceAssistant {
  const crewId = opts.crewId ?? DEFAULT_CREW;
  const sendOpt = opts.send;

  const [turns, setTurns] = useState<DeviceTurn[]>([]);
  const [partyCode, setPartyCode] = useState<string | undefined>(undefined);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [lastResponse, setLastResponse] = useState<AssistantResponse | undefined>(undefined);
  const [uiResource, setUiResource] = useState<UiResourcePayload | undefined>(undefined);

  // Refs mirror state so send() sees the latest transcript and code without stale closures.
  const turnsRef = useRef<DeviceTurn[]>([]);
  const partyRef = useRef<string | undefined>(undefined);
  const adoptedRef = useRef(false);
  const idRef = useRef(0);
  const sendRef = useRef(sendOpt);

  useEffect(() => {
    sendRef.current = sendOpt;
  }, [sendOpt]);

  const commitTurns = useCallback((next: DeviceTurn[]) => {
    turnsRef.current = next;
    setTurns(next);
  }, []);

  const nextId = useCallback(() => {
    idRef.current += 1;
    return `t${idRef.current}`;
  }, []);

  const adoptCode = useCallback((code: string) => {
    adoptedRef.current = true;
    partyRef.current = code;
    setPartyCode(code);
  }, []);

  useEffect(() => {
    let active = true;
    void resolvePartyCode(crewId).then((code) => {
      if (active && !adoptedRef.current) {
        partyRef.current = code;
        setPartyCode(code);
      }
    });
    return () => {
      active = false;
    };
  }, [household, crewId]);

  const send = useCallback(
    async (text: string, speaker?: SpeakerHint): Promise<AssistantResponse | undefined> => {
      const trimmed = text.trim();
      if (!trimmed) return undefined;

      const before = turnsRef.current;
      const userTurn: DeviceTurn = {
        id: nextId(),
        role: 'user',
        text: trimmed,
        ...(speaker ? { speaker } : {}),
      };
      commitTurns([...before, userTurn]);
      setPending(true);

      try {
        const req = buildRequest({
          text: trimmed,
          household,
          partyCode: partyRef.current,
          turns: before,
          speaker,
        });
        const res = await (sendRef.current ?? api.assistant)(req);
        commitTurns([
          ...turnsRef.current,
          { id: nextId(), role: 'assistant', text: res.reply, toolCalls: res.toolCalls, mode: res.mode },
        ]);
        setLastResponse(res);
        if (res.partyCode) adoptCode(res.partyCode);
        if (res.uiResource) setUiResource(res.uiResource);
        setError(undefined);
        return res;
      } catch (err) {
        const message = err instanceof Error && err.message ? err.message : UNREACHABLE;
        setError(message);
        commitTurns([
          ...turnsRef.current,
          { id: nextId(), role: 'assistant', error: true, text: `Sorry, I couldn't reach the game. ${message}` },
        ]);
        return undefined;
      } finally {
        setPending(false);
      }
    },
    [household, commitTurns, nextId, adoptCode],
  );

  const structured = useMemo(
    () => (uiResource ? structuredFrom(uiResource.toolResult) : undefined),
    [uiResource],
  );

  return { turns, partyCode, pending, error, lastResponse, uiResource, structured, send };
}
