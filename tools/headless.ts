/**
 * Runs the simulation in Node without a browser and prints a summary.
 *
 *   npm run sim -- --seed 42 --days 3
 *   npm run sim -- --seed 42 --ticks 500 --off c3-climate
 */
import { parseArgs } from 'node:util';
import { performance } from 'node:perf_hooks';
import { SECONDS_PER_TICK, Simulation } from '../src/core';
import { ALL_MODULES } from '../src/modules';

/** A Verity day is 26 hours. */
const TICKS_PER_DAY = (26 * 3600) / SECONDS_PER_TICK;

const { values } = parseArgs({
  options: {
    seed: { type: 'string', default: '1' },
    days: { type: 'string' },
    ticks: { type: 'string' },
    off: { type: 'string', multiple: true, default: [] },
  },
});

const seed = Number(values.seed);
const ticks = values.ticks !== undefined ? Number(values.ticks) : Math.round(Number(values.days ?? '1') * TICKS_PER_DAY);
if (!Number.isInteger(seed) || !Number.isInteger(ticks) || ticks < 0) {
  console.error('Usage: npm run sim -- [--seed N] [--days N | --ticks N] [--off module-id ...]');
  process.exit(1);
}

const sim = Simulation.create({ seed, modules: ALL_MODULES, disabled: values.off });
const t0 = performance.now();
sim.step(ticks);
const elapsed = performance.now() - t0;

console.log(`seed        ${seed}`);
console.log(`modules     ${sim.modules.map((m) => m.id).join(', ') || '(none)'}`);
console.log(`switched off ${sim.disabled.join(', ') || '(none)'}`);
console.log(`ticks       ${ticks} (${(ticks / TICKS_PER_DAY).toFixed(2)} days)`);
console.log(`time        ${elapsed.toFixed(0)} ms (${ticks > 0 ? (elapsed / ticks).toFixed(4) : '0'} ms/tick)`);
console.log(`world hash  ${sim.hash()}`);
