/**
 * Seeded random number generator (xoshiro128**).
 *
 * The whole simulation draws from one generator whose state lives in the
 * world, so saving the world saves the random stream too. Never use
 * Math.random in core/ or modules/.
 */

export type RngState = [number, number, number, number];

/** Expands a 32-bit seed into a full generator state (splitmix32). */
export function seedRng(seed: number): RngState {
  let s = seed >>> 0;
  const next = (): number => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
  const state: RngState = [next(), next(), next(), next()];
  // An all-zero state would get stuck at zero forever.
  if (state.every((v) => v === 0)) state[0] = 1;
  return state;
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

export class Rng {
  constructor(private readonly state: RngState) {}

  /** Next unsigned 32-bit integer. Advances the shared state in place. */
  nextU32(): number {
    const s = this.state;
    const result = Math.imul(rotl(Math.imul(s[1], 5) >>> 0, 7), 9) >>> 0;
    const t = (s[1] << 9) >>> 0;
    s[2] = (s[2] ^ s[0]) >>> 0;
    s[3] = (s[3] ^ s[1]) >>> 0;
    s[1] = (s[1] ^ s[2]) >>> 0;
    s[0] = (s[0] ^ s[3]) >>> 0;
    s[2] = (s[2] ^ t) >>> 0;
    s[3] = rotl(s[3], 11);
    return result;
  }

  /** Float in [0, 1). */
  float(): number {
    return this.nextU32() / 0x1_0000_0000;
  }

  /** Integer in [0, n). */
  int(n: number): number {
    if (!Number.isInteger(n) || n <= 0) throw new RangeError(`Rng.int needs a positive integer, got ${n}`);
    return Math.floor(this.float() * n);
  }

  /** Integer in [min, max], both inclusive. */
  range(min: number, max: number): number {
    return min + this.int(max - min + 1);
  }

  /** True with probability p. */
  chance(p: number): boolean {
    return this.float() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError('Rng.pick on an empty list');
    return items[this.int(items.length)] as T;
  }
}
