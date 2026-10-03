import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/core';
import { BIOMES, HILLINESS, type Hilliness } from '../src/content/biomes';
import { TERRAIN } from '../src/content/terrain';
import { ALL_MODULES } from '../src/modules';
import { LAYER, ROOF, worldMap, type WorldSettings } from '../src/modules/f1-world';
import { validateWorldContent } from '../src/modules/f1-world/content';
import { OVERHEAD_DEPTH } from '../src/modules/f1-world/generate';

const SIZE = 120;

function newMap(seed: number, world: WorldSettings = {}, size = SIZE): Simulation {
  return Simulation.create({ seed, modules: ALL_MODULES, width: size, height: size, settings: { 'f1-world': world } });
}

const terrainId = (sim: Simulation, i: number): string => TERRAIN[sim.world.layers[LAYER.terrain]?.[i] ?? 0]?.id ?? '?';

function share(sim: Simulation, test: (i: number) => boolean): number {
  const n = sim.world.width * sim.world.height;
  let count = 0;
  for (let i = 0; i < n; i++) if (test(i)) count++;
  return count / n;
}

const rockAt = (sim: Simulation, i: number): number => sim.world.layers[LAYER.rock]?.[i] ?? 0;

/** Size of the largest group of walkable tiles you can walk between. */
function largestWalkableRegion(sim: Simulation): { largest: number; walkable: number } {
  const { width, height } = sim.world;
  const map = sim.services.get(worldMap);
  const seen = new Uint8Array(width * height);
  let largest = 0;
  let walkable = 0;
  for (let start = 0; start < width * height; start++) {
    if (seen[start] || !map.isWalkable(start % width, Math.floor(start / width))) continue;
    let size = 0;
    const stack = [start];
    seen[start] = 1;
    while (stack.length > 0) {
      const i = stack.pop() as number;
      size++;
      const x = i % width;
      const y = Math.floor(i / width);
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as const) {
        const j = ny * width + nx;
        if (map.isWalkable(nx, ny) && !seen[j]) {
          seen[j] = 1;
          stack.push(j);
        }
      }
    }
    walkable += size;
    largest = Math.max(largest, size);
  }
  return { largest, walkable };
}

describe('world content', () => {
  it('is valid', () => {
    expect(() => validateWorldContent()).not.toThrow();
  });

  it('rejects unknown biomes and hilliness with a helpful message', () => {
    expect(() => newMap(1, { biome: 'jungle' })).toThrow(/Unknown biome "jungle". Choose from: temperate-forest/);
    expect(() => newMap(1, { hilliness: 'alps' as Hilliness })).toThrow(/Unknown hilliness "alps"/);
  });
});

describe('map generation', () => {
  it('is the same for the same seed and different for different seeds', () => {
    expect(newMap(5).hash()).toBe(newMap(5).hash());
    expect(newMap(5).hash()).not.toBe(newMap(6).hash());
  });

  it('defaults to temperate forest with large hills', () => {
    const map = newMap(1).services.get(worldMap);
    expect(map.biome().id).toBe('temperate-forest');
    expect(map.hilliness()).toBe('large-hills');
  });

  it('gives each hilliness about its share of rock', () => {
    for (const [hilliness, { rock }] of Object.entries(HILLINESS)) {
      const sim = newMap(2, { hilliness: hilliness as Hilliness, river: false });
      expect(share(sim, (i) => rockAt(sim, i) > 0)).toBeCloseTo(rock, 2);
    }
  });

  it('makes deep water only away from the shore', () => {
    for (const biome of BIOMES) {
      const sim = newMap(3, { biome: biome.id });
      const { width, height } = sim.world;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (terrainId(sim, y * width + x) !== 'deep-water') continue;
          for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as const) {
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            expect(['deep-water', 'shallow-water']).toContain(terrainId(sim, ny * width + nx));
          }
        }
      }
    }
  });

  it('freezes lakes in the tundra but not elsewhere', () => {
    const tundra = newMap(4, { biome: 'tundra', river: false });
    expect(share(tundra, (i) => terrainId(tundra, i) === 'ice')).toBeGreaterThan(0.01);
    expect(share(tundra, (i) => terrainId(tundra, i).endsWith('water'))).toBe(0);
    const forest = newMap(4, { biome: 'temperate-forest' });
    expect(share(forest, (i) => terrainId(forest, i) === 'ice')).toBe(0);
  });

  it('crosses the map edge to edge when there is a river', () => {
    const sim = newMap(9, { river: true, hilliness: 'mountainous' });
    const { width, height } = sim.world;
    const water = (x: number, y: number): boolean => terrainId(sim, y * width + x) === 'shallow-water';
    const edges = [
      [...Array(width).keys()].some((x) => water(x, 0)) && [...Array(width).keys()].some((x) => water(x, height - 1)),
      [...Array(height).keys()].some((y) => water(0, y)) && [...Array(height).keys()].some((y) => water(width - 1, y)),
    ];
    expect(edges.some(Boolean)).toBe(true);
  });

  it('roofs every rock tile, deeply only far from open ground, and leaves open ground unroofed', () => {
    const sim = newMap(6, { hilliness: 'mountainous' });
    const { width, height } = sim.world;
    const roof = sim.world.layers[LAYER.roof] as Uint8Array;
    for (let i = 0; i < width * height; i++) {
      if (rockAt(sim, i) === 0) {
        expect(roof[i]).toBe(ROOF.none);
        continue;
      }
      expect([ROOF.rock, ROOF.overhead]).toContain(roof[i]);
      if (roof[i] === ROOF.overhead) {
        // No open ground within OVERHEAD_DEPTH - 1 steps (checked along the four straight lines).
        const x = i % width;
        const y = Math.floor(i / width);
        for (let d = 1; d < OVERHEAD_DEPTH; d++) {
          for (const [nx, ny] of [[x + d, y], [x - d, y], [x, y + d], [x, y - d]] as const) {
            if (nx >= 0 && ny >= 0 && nx < width && ny < height) expect(rockAt(sim, ny * width + nx)).toBeGreaterThan(0);
          }
        }
      }
    }
    expect(share(sim, (i) => roof[i] === ROOF.overhead)).toBeGreaterThan(0);
  });

  it('puts ore only inside rock, and finds iron on a hilly map', () => {
    const sim = newMap(7, { hilliness: 'mountainous' }, 250);
    const ore = sim.world.layers[LAYER.ore] as Uint8Array;
    let iron = 0;
    for (let i = 0; i < ore.length; i++) {
      if (ore[i] === 0) continue;
      expect(rockAt(sim, i)).toBeGreaterThan(0);
      if (ore[i] === 1) iron++;
    }
    expect(iron).toBeGreaterThan(50);
  });

  it('uses two or three of the biome rock types', () => {
    for (const biome of BIOMES) {
      const sim = newMap(8, { biome: biome.id, hilliness: 'mountainous' });
      const state = sim.world.modules['f1-world'] as { rocks: string[] };
      expect(state.rocks.length).toBeGreaterThanOrEqual(2);
      expect(state.rocks.length).toBeLessThanOrEqual(3);
      for (const r of state.rocks) expect(biome.rocks).toContain(r);
    }
  });

  it('matches fertility to the ground', () => {
    const sim = newMap(10);
    const map = sim.services.get(worldMap);
    for (let y = 0; y < SIZE; y += 7) {
      for (let x = 0; x < SIZE; x += 7) {
        const expected = map.rockAt(x, y) ? 0 : map.terrainAt(x, y).fertility;
        expect(map.fertilityAt(x, y)).toBeCloseTo(expected, 2);
      }
    }
  });

  it('leaves most open ground connected, so colonists can reach it, in every biome', () => {
    for (const biome of BIOMES) {
      for (const hilliness of Object.keys(HILLINESS) as Hilliness[]) {
        for (const seed of [1, 2, 3]) {
          const sim = newMap(seed, { biome: biome.id, hilliness });
          const { largest, walkable } = largestWalkableRegion(sim);
          expect(walkable / (SIZE * SIZE), `${biome.id} ${hilliness} seed ${seed}`).toBeGreaterThan(0.45);
          expect(largest / walkable, `${biome.id} ${hilliness} seed ${seed}`).toBeGreaterThan(0.8);
        }
      }
    }
  });
});

describe('map service', () => {
  it('cannot walk or build on rock, deep water or off the map', () => {
    const sim = newMap(11, { hilliness: 'mountainous' });
    const map = sim.services.get(worldMap);
    const { width } = sim.world;
    const rockTile = [...Array(SIZE * SIZE).keys()].find((i) => rockAt(sim, i) > 0) as number;
    expect(map.isWalkable(rockTile % width, Math.floor(rockTile / width))).toBe(false);
    expect(map.isBuildable(rockTile % width, Math.floor(rockTile / width))).toBe(false);
    expect(map.moveCost(-1, 0)).toBe(0);
    expect(map.isWalkable(SIZE, 0)).toBe(false);
    const deep = [...Array(SIZE * SIZE).keys()].find((i) => terrainId(sim, i) === 'deep-water');
    if (deep !== undefined) expect(map.isWalkable(deep % width, Math.floor(deep / width))).toBe(false);
  });

  it('falls back to flat open soil when the world module is off', () => {
    const sim = Simulation.create({ seed: 1, modules: ALL_MODULES, disabled: ['f1-world'], width: 16, height: 16 });
    const map = sim.services.get(worldMap);
    expect(map.terrainAt(3, 3).id).toBe('soil');
    expect(map.isWalkable(3, 3)).toBe(true);
    expect(sim.world.layers[LAYER.terrain]).toBeUndefined();
  });

  it('answers the same after a save and load', () => {
    const sim = newMap(12);
    const loaded = Simulation.load(JSON.parse(JSON.stringify(sim.save())), ALL_MODULES);
    const a = sim.services.get(worldMap);
    const b = loaded.services.get(worldMap);
    expect(b.biome().id).toBe(a.biome().id);
    for (let y = 0; y < SIZE; y += 11) {
      for (let x = 0; x < SIZE; x += 11) {
        expect(b.terrainAt(x, y)).toBe(a.terrainAt(x, y));
        expect(b.rockAt(x, y)).toBe(a.rockAt(x, y));
      }
    }
    expect(loaded.hash()).toBe(sim.hash());
  });
});
