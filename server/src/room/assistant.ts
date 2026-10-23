import { executeCommand, parseCommand, type CommandResult, type RoomActor } from './commands.js';
import type { RoomStore } from './store.js';

export type RoomUtterance = { text: string } & RoomActor;

/**
 * Offline room assistant: deterministic phrases become typed commands (commands.ts)
 * that run through the same RoomStore validation as screen and MCP actions. A
 * model-backed interpreter can produce the same RoomCommand without changing this path.
 */
export function answerRoom(store: RoomStore, code: string, request: RoomUtterance): CommandResult {
  const view = store.view(code, request.participantToken);
  return executeCommand(store, code, parseCommand(request.text, view), { participantToken: request.participantToken, hostToken: request.hostToken });
}
