/**
 * Runs the simulation in Node without a browser and prints a summary.
 *
 *   npm run sim -- --seed 42 --days 3
 *   npm run sim -- --seed 42 --ticks 500 --off c3-climate
 *   npm run sim -- --seed 7 --biome tundra --hills mountainous --map
 */
import { parseArgs } from 'node:util';
import { performance } from 'node:perf_hooks';
import { SECONDS_PER_TICK, Simulation } from '../src/core';
import { ALL_MODULES } from '../src/modules';
import { worldMap, type WorldSettings } from '../src/modules/f1-world';

/** A Verity day is 26 hours. */
const TICKS_PER_DAY = (26 * 3600) / SECONDS_PER_TICK;

const { values } = parseArgs({
  options: {
    seed: { type: 'string', default: '1' },
    days: { type: 'string' },
    ticks: { type: 'string' },
    off: { type: 'string', multiple: true, default: [] },
    biome: { type: 'string' },
    hills: { type: 'string' },
    river: { type: 'string' },
    map: { type: 'boolean', default: false },
  },
});

const seed = Number(values.seed);
const ticks = values.ticks !== undefined ? Number(values.ticks) : Math.round(Number(values.days ?? '1') * TICKS_PER_DAY);
if (!Number.isInteger(seed) || !Number.isInteger(ticks) || ticks < 0) {
  console.error('Usage: npm run sim -- [--seed N] [--days N | --ticks N] [--off module-id ...]');
  process.exit(1);
}

const world: WorldSettings = {};
if (values.biome) world.biome = values.biome;
if (values.hills) world.hilliness = values.hills as NonNullable<WorldSettings['hilliness']>;
if (values.river) world.river = values.river === 'yes';

const tStart = performance.now();
const sim = Simulation.create({ seed, modules: ALL_MODULES, disabled: values.off, settings: { 'f1-world': world } });
const startMs = performance.now() - tStart;
const t0 = performance.now();
sim.step(ticks);
const elapsed = performance.now() - t0;

console.log(`seed        ${seed}`);
console.log(`modules     ${sim.modules.map((m) => m.id).join(', ') || '(none)'}`);
console.log(`switched off ${sim.disabled.join(', ') || '(none)'}`);
console.log(`new game  ${startMs.toFixed(0)} ms`);
console.log(`ticks       ${ticks} (${(ticks / TICKS_PER_DAY).toFixed(2)} days)`);
console.log(`time        ${elapsed.toFixed(0)} ms (${ticks > 0 ? (elapsed / ticks).toFixed(4) : '0'} ms/tick)`);
console.log(`world hash  ${sim.hash()}`);

if (sim.modules.some((m) => m.id === 'f1-world')) {
  const map = sim.services.get(worldMap);
  console.log(`biome       ${map.biome().name}, ${map.hilliness()}`);
  const counts = new Map<string, number>();
  const { width, height } = sim.world;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const rock = map.rockAt(x, y);
      const ore = map.oreAt(x, y);
      const name = ore ? ore.name : rock ? rock.name : map.terrainAt(x, y).name;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  const total = width * height;
  const parts = [...counts].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${((v / total) * 100).toFixed(1)}%`);
  console.log(`map         ${parts.join(', ')}`);

  if (values.map) {
    // One character per 4x4 block, sampled at the block's top-left tile.
    const glyph: Record<string, string> = {
      soil: '.', 'rich-soil': ',', gravel: ':', sand: '_', marsh: '"',
      'shallow-water': '~', 'deep-water': '=', 'rough-stone': '+', ice: '*',
    };
    for (let y = 0; y < height; y += 4) {
      let line = '';
      for (let x = 0; x < width; x += 4) {
        line += map.oreAt(x, y) ? '$' : map.rockAt(x, y) ? (map.roofAt(x, y) === 3 ? '#' : '%') : (glyph[map.terrainAt(x, y).id] ?? '?');
      }
      console.log(line);
    }
  }
}
