import { describe, expect, it } from 'vitest';
import { fitScale } from './Stage';

describe('fitScale', () => {
  it('is 1 at 1920x1080', () => {
    expect(fitScale(1920, 1080)).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
  });

  it('letterboxes vertically when narrow', () => {
    expect(fitScale(960, 1080)).toEqual({ scale: 0.5, offsetX: 0, offsetY: 270 });
  });
});
