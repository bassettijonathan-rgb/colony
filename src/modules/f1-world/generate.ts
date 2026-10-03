/**
 * Builds a new map from the seed and the chosen biome and hilliness.
 *
 * Most features are placed by rank rather than by raw noise value: "the
 * highest 18% of the land is rock" rather than "noise above 0.7 is rock".
 * That keeps each biome's shares of rock, water and soil the same from seed
 * to seed, while the shapes change.
 */
import { fractalNoise, type Rng, type World } from '../../core';
import { HILLINESS, type BiomeDef, type Hilliness } from '../../content/biomes';
import { ORES } from '../../content/ores';
import { ROCKS } from '../../content/rocks';
import { TERRAIN } from '../../content/terrain';
import { LAYER, ROOF } from './api';

/** Rock this many tiles from open ground or more is deep inside a mountain. */
export const OVERHEAD_DEPTH = 5;
/** Open ground this close to rock is gravel and scree. */
const SCREE_DISTANCE = 1;

function terrainIndex(id: string): number {
  const i = TERRAIN.findIndex((t) => t.id === id);
  if (i < 0) throw new Error(`Unknown terrain "${id}"`);
  return i;
}

const T = {
  soil: terrainIndex('soil'),
  richSoil: terrainIndex('rich-soil'),
  gravel: terrainIndex('gravel'),
  sand: terrainIndex('sand'),
  marsh: terrainIndex('marsh'),
  shallow: terrainIndex('shallow-water'),
  deep: terrainIndex('deep-water'),
  roughStone: terrainIndex('rough-stone'),
  ice: terrainIndex('ice'),
};

export interface GenerateOptions {
  biome: BiomeDef;
  hilliness: Hilliness;
  river: boolean;
  /** Rock types used on this map, picked from the biome's list. */
  rocks: readonly string[];
}

/** Ranks of `values[i]` among the listed tiles, scaled to [0, 1]. Ties break by tile index. */
function rankOf(values: Float32Array, tiles: Int32Array): Float32Array {
  const order = Int32Array.from(tiles).sort((a, b) => (values[a] as number) - (values[b] as number) || a - b);
  const rank = new Float32Array(values.length);
  const last = Math.max(1, order.length - 1);
  for (let r = 0; r < order.length; r++) rank[order[r] as number] = r / last;
  return rank;
}

/** Distance in steps (4 neighbours) from the nearest tile where `isSource` is true. */
function distanceFrom(width: number, height: number, isSource: (i: number) => boolean): Int32Array {
  const n = width * height;
  const dist = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < n; i++) {
    if (isSource(i)) {
      dist[i] = 0;
      queue[tail++] = i;
    }
  }
  while (head < tail) {
    const i = queue[head++] as number;
    const x = i % width;
    const y = (i - x) / width;
    const d = (dist[i] as number) + 1;
    const visit = (j: number): void => {
      if (dist[j] !== -1) return;
      dist[j] = d;
      queue[tail++] = j;
    };
    if (x > 0) visit(i - 1);
    if (x < width - 1) visit(i + 1);
    if (y > 0) visit(i - width);
    if (y < height - 1) visit(i + width);
  }
  return dist;
}

/** Marks a winding river from one edge of the map to the opposite edge. */
function carveRiver(world: World, rng: Rng, river: Uint8Array): void {
  const { width, height } = world;
  const vertical = rng.chance(0.5);
  const length = vertical ? height : width;
  const across = vertical ? width : height;
  const seed = rng.nextU32();
  const halfWidth = across >= 100 ? rng.range(2, 3) : 1;
  let c = across * (0.3 + rng.float() * 0.4);
  for (let t = 0; t < length; t++) {
    // Meander: the river's heading drifts with smooth noise along its length.
    const heading = (fractalNoise(seed, t, 0, 40, 3) - 0.5) * 2.4;
    c = Math.min(across - 3, Math.max(2, c + Math.sin(heading)));
    const centre = Math.round(c);
    for (let o = -halfWidth; o <= halfWidth; o++) {
      const a = centre + o;
      if (a < 0 || a >= across) continue;
      const i = vertical ? t * width + a : a * width + t;
      river[i] = 1;
    }
  }
}

/** Grows one ore vein from a random rock tile. */
function growVein(world: World, rng: Rng, rockTiles: Int32Array, oreValue: number, size: number): void {
  const { width, height } = world;
  const rock = world.layers[LAYER.rock] as Uint8Array;
  const ore = world.layers[LAYER.ore] as Uint8Array;
  const start = rockTiles[rng.int(rockTiles.length)] as number;
  if (ore[start] !== 0) return;
  const vein = [start];
  ore[start] = oreValue;
  for (let attempts = size * 8; vein.length < size && attempts > 0; attempts--) {
    const from = vein[rng.int(vein.length)] as number;
    const x = from % width;
    const y = (from - x) / width;
    const dir = rng.int(4);
    const nx = x + (dir === 0 ? 1 : dir === 1 ? -1 : 0);
    const ny = y + (dir === 2 ? 1 : dir === 3 ? -1 : 0);
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
    const next = ny * width + nx;
    if (rock[next] === 0 || ore[next] !== 0) continue;
    ore[next] = oreValue;
    vein.push(next);
  }
}

export function generateMap(world: World, rng: Rng, options: GenerateOptions): void {
  const { width, height } = world;
  const n = width * height;
  const { biome } = options;
  const scale = Math.max(width, height);

  const terrain = new Uint8Array(n);
  const elevationLayer = new Uint8Array(n);
  const fertility = new Uint8Array(n);
  const rock = new Uint8Array(n);
  const ore = new Uint8Array(n);
  const roof = new Uint8Array(n);
  world.layers[LAYER.terrain] = terrain;
  world.layers[LAYER.elevation] = elevationLayer;
  world.layers[LAYER.fertility] = fertility;
  world.layers[LAYER.rock] = rock;
  world.layers[LAYER.ore] = ore;
  world.layers[LAYER.roof] = roof;

  const elevationSeed = rng.nextU32();
  const soilSeed = rng.nextU32();
  const rockSeed = rng.nextU32();

  // 1. Elevation, ranked so thresholds are shares of the map.
  const all = Int32Array.from({ length: n }, (_, i) => i);
  const height01 = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    height01[i] = fractalNoise(elevationSeed, i % width, Math.floor(i / width), scale / 3);
  }
  const elevation = rankOf(height01, all);
  for (let i = 0; i < n; i++) elevationLayer[i] = Math.round((elevation[i] as number) * 255);

  // 2. River, which cuts through hills rather than going round them.
  const river = new Uint8Array(n);
  if (options.river) carveRiver(world, rng, river);

  // 3. Rock on the high ground, lakes in the low ground, marsh around the lakes.
  const rockShare = HILLINESS[options.hilliness].rock;
  const deepLine = biome.water * 0.45;
  for (let i = 0; i < n; i++) {
    const e = elevation[i] as number;
    if (river[i]) terrain[i] = T.shallow;
    else if (e >= 1 - rockShare) {
      rock[i] = 1; // rock type picked in step 5
      terrain[i] = T.roughStone;
    } else if (e < deepLine) terrain[i] = T.deep;
    else if (e < biome.water) terrain[i] = T.shallow;
    else if (e < biome.water + biome.marsh) terrain[i] = T.marsh;
    else terrain[i] = T.soil;
  }

  // Deep water always has a rim of shallow water, so lakes can be waded at the edges.
  for (let i = 0; i < n; i++) {
    if (terrain[i] !== T.deep) continue;
    const x = i % width;
    const y = (i - x) / width;
    const touchesLand =
      (x > 0 && terrain[i - 1] !== T.deep && terrain[i - 1] !== T.shallow) ||
      (x < width - 1 && terrain[i + 1] !== T.deep && terrain[i + 1] !== T.shallow) ||
      (y > 0 && terrain[i - width] !== T.deep && terrain[i - width] !== T.shallow) ||
      (y < height - 1 && terrain[i + width] !== T.deep && terrain[i + width] !== T.shallow);
    if (touchesLand) terrain[i] = T.shallow;
  }

  // 4. Soil on open land: sand at the poor end, rich soil at the good end, gravel near rock.
  const nearRock = distanceFrom(width, height, (i) => rock[i] === 1);
  const soilTiles: number[] = [];
  for (let i = 0; i < n; i++) if (terrain[i] === T.soil) soilTiles.push(i);
  const soilNoise = new Float32Array(n);
  for (const i of soilTiles) soilNoise[i] = fractalNoise(soilSeed, i % width, Math.floor(i / width), scale / 8, 4);
  const soilRank = rankOf(soilNoise, Int32Array.from(soilTiles));
  for (const i of soilTiles) {
    const r = soilRank[i] as number;
    const d = nearRock[i] as number;
    if (d >= 0 && d <= SCREE_DISTANCE) terrain[i] = T.gravel;
    else if (r < biome.sand) terrain[i] = T.sand;
    else if (r < biome.sand + biome.gravel) terrain[i] = T.gravel;
    else if (r >= 1 - biome.richSoil) terrain[i] = T.richSoil;
  }

  if (biome.frozenLakes) {
    for (let i = 0; i < n; i++) {
      if ((terrain[i] === T.deep || terrain[i] === T.shallow) && !river[i]) terrain[i] = T.ice;
    }
  }

  // 5. Rock types in broad bands, split evenly between this map's rock types.
  const rockTileList: number[] = [];
  for (let i = 0; i < n; i++) if (rock[i] === 1) rockTileList.push(i);
  const rockTiles = Int32Array.from(rockTileList);
  const rockNoise = new Float32Array(n);
  for (const i of rockTileList) rockNoise[i] = fractalNoise(rockSeed, i % width, Math.floor(i / width), scale / 4, 3);
  const rockRank = rankOf(rockNoise, rockTiles);
  const rockValues = options.rocks.map((id) => ROCKS.findIndex((r) => r.id === id) + 1);
  for (const i of rockTileList) {
    const band = Math.min(rockValues.length - 1, Math.floor((rockRank[i] as number) * rockValues.length));
    rock[i] = rockValues[band] as number;
  }

  // 6. Roofs: thin rock roof near the surface of a mountain, overhead mountain deep inside.
  const depth = distanceFrom(width, height, (i) => rock[i] === 0);
  for (const i of rockTileList) {
    const d = depth[i] as number;
    roof[i] = d < 0 || d >= OVERHEAD_DEPTH ? ROOF.overhead : ROOF.rock;
  }

  // 7. Ore veins inside rock.
  if (rockTiles.length > 0) {
    ORES.forEach((o, index) => {
      const veins = Math.round((rockTiles.length / 1000) * o.veinsPer1000);
      for (let v = 0; v < veins; v++) growVein(world, rng, rockTiles, index + 1, rng.range(o.veinSize[0], o.veinSize[1]));
    });
  }

  // 8. Fertility from the ground type. Nothing grows under rock.
  for (let i = 0; i < n; i++) {
    fertility[i] = rock[i] ? 0 : Math.round((TERRAIN[terrain[i] as number]?.fertility ?? 0) * 100);
  }
}
