import { afterEach, expect, it, vi } from 'vitest';
import { fireEvent, waitFor } from '@testing-library/react';
import html from '../../../extension/popup.html?raw';

afterEach(()=>{document.body.innerHTML='';vi.unstubAllGlobals();vi.resetModules();});
it('uses a Latest party choice instead of asking users to type syntax',async()=>{
  document.body.innerHTML=html;
  const set=vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('chrome',{storage:{local:{get:vi.fn().mockResolvedValue({bwEnabled:false,bwPartyCode:'latest'}),set}},tabs:{query:vi.fn().mockResolvedValue([{url:'https://www.youtube.com/watch?v=123'}])},runtime:{sendMessage:vi.fn().mockResolvedValue({ok:false})}});
  await import('../../../extension/popup');
  expect(document.querySelector<HTMLSelectElement>('#party-mode')?.value).toBe('latest');
  fireEvent.submit(document.getElementById('settings')!);
  await waitFor(()=>expect(set).toHaveBeenCalledWith({bwPartyCode:'latest',bwEnabled:true}));
});
