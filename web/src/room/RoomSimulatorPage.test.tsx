import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { DeviceMcp } from '../device/mcpBrowser';
import { basketballFixture } from './fixtures/basketball';
import { RoomSimulatorPage } from './RoomSimulatorPage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

const view = basketballFixture('open', 3);
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

function setup(reply: Record<string, unknown> = { reply: "Harbor Hawks 42, Summit Foxes 39. Quarter 3, 4:18." }) {
  localStorage.setItem('bw.room.HOOP42', JSON.stringify({ participantToken: 'seat-secret', hostToken: 'host-secret' }));
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
    if (String(url).includes('/playback/')) return new Response('{}', { status: 404 });
    return json(auth ? { ...view, me: { participantId: 'fx-0', name: 'Maya' } } : view);
  }));
  const mcp: DeviceMcp = {
    listTools: vi.fn(async () => ['room_status', 'room_ask']),
    callTool: vi.fn(async () => ({ content: [{ type: 'text', text: String(reply.reply) }], structuredContent: reply })),
    readResource: vi.fn(),
    close: vi.fn(async () => undefined),
  };
  render(<MemoryRouter initialEntries={['/display/room/HOOP42?trace=1']}><Routes><Route path="/display/room/:code" element={<RoomSimulatorPage mcp={mcp} />} /></Routes></MemoryRouter>);
  return mcp;
}

it('labels itself a simulation and defaults to the compact 960x480 preset', async () => {
  setup();
  expect(screen.getByText('Simulated smart display · Room HOOP42')).toBeTruthy();
  expect(screen.getByTestId('sim-screen').style.width).toBe('960px');
  expect(screen.getByRole('button', { name: /Compact 960x480/ }).getAttribute('aria-pressed')).toBe('true');
  expect(await screen.findByText('2 tools, including room_ask')).toBeTruthy();
});

it('asks as a guest through room_ask and shows the call without credentials', async () => {
  const mcp = setup();
  fireEvent.click(await screen.findByRole('button', { name: "What's the score?" }));
  await waitFor(() => expect(mcp.callTool).toHaveBeenCalledWith('room_ask', { code: 'HOOP42', text: "What's the score?", hostToken: 'host-secret' }));
  const trace = screen.getByRole('complementary', { name: 'MCP calls' });
  expect(await within(trace).findByText('Harbor Hawks 42, Summit Foxes 39. Quarter 3, 4:18.')).toBeTruthy();
  expect(trace.textContent).not.toContain('secret');
});

it('acts for this browser\'s seat only after it is chosen', async () => {
  const mcp = setup({ reply: 'Three accepted.', accepted: true });
  await screen.findByRole('option', { name: 'Maya (this browser)' });
  fireEvent.change(screen.getByLabelText('Speaking as'), { target: { value: 'seat' } });
  fireEvent.change(screen.getByLabelText('Ask the display'), { target: { value: 'I choose three' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  await waitFor(() => expect(mcp.callTool).toHaveBeenCalledWith('room_ask', expect.objectContaining({ participantToken: 'seat-secret', text: 'I choose three' })));
  expect(screen.getByRole('complementary', { name: 'MCP calls' }).textContent).toContain('seat: Maya');
});

it('follows a navigate hint by switching the simulated screen view', async () => {
  setup({ reply: 'Maya leads with 82.5 points.', navigate: 'standings' });
  fireEvent.click(await screen.findByRole('button', { name: 'Show standings' }));
  await waitFor(() => expect(screen.getByRole('tab', { name: 'Standings' }).getAttribute('aria-selected')).toBe('true'));
});
