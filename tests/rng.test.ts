import { describe, expect, it } from 'vitest';
import { Rng, seedRng } from '../src/core';

describe('seeded random', () => {
  it('gives the same sequence for the same seed', () => {
    const a = new Rng(seedRng(123));
    const b = new Rng(seedRng(123));
    for (let i = 0; i < 1000; i++) expect(a.nextU32()).toBe(b.nextU32());
  });

  it('gives different sequences for different seeds', () => {
    const a = new Rng(seedRng(1));
    const b = new Rng(seedRng(2));
    const same = Array.from({ length: 20 }, () => a.nextU32() === b.nextU32()).filter(Boolean).length;
    expect(same).toBeLessThan(2);
  });

  it('continues exactly from a copied state', () => {
    const state = seedRng(9);
    const a = new Rng(state);
    for (let i = 0; i < 50; i++) a.nextU32();
    const b = new Rng([...state]);
    expect(b.nextU32()).toBe(a.nextU32());
  });

  it('keeps int() in range and roughly uniform', () => {
    const rng = new Rng(seedRng(5));
    const counts = new Array<number>(6).fill(0);
    for (let i = 0; i < 60_000; i++) {
      const v = rng.int(6);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(6);
      counts[v] = (counts[v] ?? 0) + 1;
    }
    for (const c of counts) expect(Math.abs(c - 10_000)).toBeLessThan(500);
  });

  it('keeps range() inclusive at both ends', () => {
    const rng = new Rng(seedRng(11));
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) seen.add(rng.range(-2, 2));
    expect([...seen].sort((a, b) => a - b)).toEqual([-2, -1, 0, 1, 2]);
  });
});
