/**
 * Runs the simulation in Node without a browser and prints a summary.
 *
 *   npm run sim -- --seed 42 --days 3
 *   npm run sim -- --seed 42 --ticks 500 --off c3-climate
 *   npm run sim -- --seed 7 --biome tundra --hills mountainous --map
 *   npm run sim -- --seed 7 --days 60 --climate   # one line per day: temperatures, weather, snow
 *   npm run sim -- --seed 7 --days 2 --colonists 200   # speed check with a big colony
 */
import { parseArgs } from 'node:util';
import { performance } from 'node:perf_hooks';
import { Simulation } from '../src/core';
import { ALL_MODULES } from '../src/modules';
import { worldMap, type WorldSettings } from '../src/modules/f1-world';
import { clock, TICKS_PER_DAY, TICKS_PER_HOUR, type TimeSettings } from '../src/modules/f2-time';
import { stock } from '../src/modules/c2-construction';
import { people, type PeopleSettings } from '../src/modules/f3-people';

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
    season: { type: 'string' },
    climate: { type: 'boolean', default: false },
    colonists: { type: 'string' },
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

const time: TimeSettings = {};
if (values.season) time.startSeason = values.season as NonNullable<TimeSettings['startSeason']>;

const crew: PeopleSettings = {};
if (values.colonists) crew.colonists = Number(values.colonists);

const tStart = performance.now();
const sim = Simulation.create({
  seed,
  modules: ALL_MODULES,
  disabled: values.off,
  settings: { 'f1-world': world, 'f2-time': time, 'f3-people': crew },
});
const startMs = performance.now() - tStart;
const hasTime = sim.modules.some((m) => m.id === 'f2-time');
const t0 = performance.now();
if (values.climate && hasTime) {
  // Sample every hour and print one line per day.
  const c = sim.services.get(clock);
  console.log('day                    min°C  max°C  weather (hours)                         snow cm  spell');
  for (let done = 0; done < ticks; ) {
    let min = Infinity;
    let max = -Infinity;
    const hours = new Map<string, number>();
    const date = c.now();
    for (let h = 0; h < TICKS_PER_DAY / TICKS_PER_HOUR && done < ticks; h++) {
      const t = c.outdoorTemperature();
      min = Math.min(min, t);
      max = Math.max(max, t);
      hours.set(c.weatherName(), (hours.get(c.weatherName()) ?? 0) + 1);
      const step = Math.min(TICKS_PER_HOUR, ticks - done);
      sim.step(step);
      done += step;
    }
    const label = `Y${date.year} ${date.season} ${date.dayOfSeason}`.padEnd(22);
    const weather = [...hours].map(([k, v]) => `${k} ${v}`).join(', ').padEnd(40);
    // Deepest snow on the map, which is what lies on open ground.
    let snow = 0;
    for (let y = 0; y < sim.world.height; y += 5) for (let x = 0; x < sim.world.width; x += 5) snow = Math.max(snow, c.snowAt(x, y));
    console.log(`${label} ${min.toFixed(0).padStart(5)}  ${max.toFixed(0).padStart(5)}  ${weather} ${snow.toFixed(1).padStart(6)}  ${c.spell()}`);
  }
} else {
  sim.step(ticks);
}
const elapsed = performance.now() - t0;

console.log(`seed        ${seed}`);
console.log(`modules     ${sim.modules.map((m) => m.id).join(', ') || '(none)'}`);
console.log(`switched off ${sim.disabled.join(', ') || '(none)'}`);
console.log(`new game  ${startMs.toFixed(0)} ms`);
console.log(`ticks       ${ticks} (${(ticks / TICKS_PER_DAY).toFixed(2)} days)`);
console.log(`time        ${elapsed.toFixed(0)} ms (${ticks > 0 ? (elapsed / ticks).toFixed(4) : '0'} ms/tick)`);
console.log(`world hash  ${sim.hash()}`);
if (hasTime) {
  const c = sim.services.get(clock);
  const d = c.now();
  console.log(`now         Year ${d.year}, ${d.season} ${d.dayOfSeason}, ${String(d.hour).padStart(2, '0')}:${String(d.minute).padStart(2, '0')}, ${c.outdoorTemperature().toFixed(1)}°C, ${c.weatherName()}`);
}

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

if (sim.modules.some((m) => m.id === 'f3-people')) {
  const crewService = sim.services.get(people);
  const ids = crewService.ids();
  const home = crewService.home();
  console.log(`colonists   ${ids.length}, landed at ${home.x}, ${home.y}`);
  for (const id of ids.slice(0, 20)) {
    const c = crewService.get(id);
    if (!c) continue;
    const best = Object.entries(c.person.skills).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, v]) => `${k} ${v}`).join(', ');
    console.log(
      `  ${c.person.name.padEnd(22)} ${String(c.person.age).padStart(2)}  food ${(c.needs.food * 100).toFixed(0).padStart(3)}%  rest ${(c.needs.rest * 100).toFixed(0).padStart(3)}%  rations ${c.needs.rations}  ${c.activity.padEnd(6)}  ${best}`,
    );
  }
  if (ids.length > 20) console.log(`  ... and ${ids.length - 20} more`);
}

const totals = Object.entries(sim.services.get(stock).totals());
if (totals.length > 0) console.log(`stock       ${totals.map(([id, n]) => `${id} ${n}`).join(', ')}`);
