import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ControlPage } from './ControlPage';
import { liveFixture } from '../lib/fixtures';

afterEach(()=>{cleanup();vi.unstubAllGlobals();});
function show(){render(<MemoryRouter initialEntries={['/control/DEMO']}><Routes><Route path="/control/:code" element={<ControlPage/>}/></Routes></MemoryRouter>);}
it('sends a real pick mutation with member and question ids', async()=>{
  const request=vi.fn(async(_url:unknown,options?:RequestInit)=>new Response(JSON.stringify(options?.method==='POST'?{pick:{}}:liveFixture)));
  vi.stubGlobal('fetch',request);show();
  await screen.findByText(liveFixture.activeProp!.question);
  fireEvent.click(screen.getByRole('button',{name:`Choose ${liveFixture.activeProp!.options[0].label}`}));
  await waitFor(()=>expect(request).toHaveBeenCalledWith('/api/parties/DEMO/picks',expect.objectContaining({method:'POST'})));
  const call=request.mock.calls.find(call=>String(call[0]).endsWith('/picks'))!;
  expect(JSON.parse(call[1]!.body as string)).toMatchObject({memberId:'maya',propId:liveFixture.activeProp!.id,optionId:liveFixture.activeProp!.options[0].id,source:'screen'});
});
it('starts the backend game and leaves fixture mode out of the operator',async()=>{
  const draft=structuredClone(liveFixture);draft.party.status='drafting';
  const request=vi.fn(async()=>new Response(JSON.stringify(draft)));
  vi.stubGlobal('fetch',request);show();
  fireEvent.click(await screen.findByRole('button',{name:'Start game replay'}));
  await waitFor(()=>expect(request).toHaveBeenCalledWith('/api/parties/DEMO/start',expect.objectContaining({method:'POST'})));
  expect(screen.getByText(/Fictional game replay/)).toBeTruthy();
});
