/**
 * Seeded 2D value noise for map generation. Pure functions of (seed, x, y),
 * so generation does not depend on the order tiles are visited in.
 */

function hash2(seed: number, x: number, y: number): number {
  let h = (seed ^ Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 0x1_0000_0000;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Smooth noise in [0, 1) with features about one unit apart. */
export function valueNoise(seed: number, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smooth(x - x0);
  const ty = smooth(y - y0);
  const a = hash2(seed, x0, y0);
  const b = hash2(seed, x0 + 1, y0);
  const c = hash2(seed, x0, y0 + 1);
  const d = hash2(seed, x0 + 1, y0 + 1);
  const top = a + (b - a) * tx;
  const bottom = c + (d - c) * tx;
  return top + (bottom - top) * ty;
}

/**
 * Fractal noise: several octaves of value noise, each twice as detailed and
 * half as strong. `scale` is the size of the largest features in tiles.
 * Returns roughly [0, 1).
 */
export function fractalNoise(seed: number, x: number, y: number, scale: number, octaves = 5): number {
  let sum = 0;
  let weight = 1;
  let total = 0;
  let freq = 1 / scale;
  for (let o = 0; o < octaves; o++) {
    sum += valueNoise((seed + Math.imul(o, 0x9e3779b9)) >>> 0, x * freq, y * freq) * weight;
    total += weight;
    weight *= 0.5;
    freq *= 2;
  }
  return sum / total;
}
