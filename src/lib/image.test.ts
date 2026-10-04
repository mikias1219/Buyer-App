import { describe, expect, it } from 'vitest';
import { fitWithin, sha256Hex } from './image';

describe('image helpers', () => {
  it('scales the long edge down to 1280px, never up', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1280, height: 960 });
    expect(fitWithin(1080, 1920)).toEqual({ width: 720, height: 1280 });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
  it('hashes content with SHA-256', async () => {
    expect(await sha256Hex(new Blob(['abc']))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
