import { expect, it } from 'vitest';
import { panelBounds } from './placement';

it.each([[1920,1080],[1280,720],[854,480]])('protects the bottom caption/score area at %i x %i', (width,height) => {
  const bounds=panelBounds(width,height,'right')!;
  expect(bounds.y+bounds.height).toBeLessThanOrEqual(height*.65);
  expect(bounds.x+bounds.width).toBeLessThanOrEqual(width*.95);
  expect(bounds.y).toBeGreaterThanOrEqual(height*.18);
});
it('supports a left anchor and hides when a readable panel cannot fit', () => {
  expect(panelBounds(1280,720,'left')!.x).toBe(64);
  expect(panelBounds(400,200,'right')).toBeUndefined();
});
it('keeps a readable side panel in a 760px player', () => {
  expect(panelBounds(760, 428, 'right')!.width).toBeGreaterThanOrEqual(260);
});
