import { expect } from 'vitest';
import { Simulation, type AnyModule } from '../src/core';

/**
 * The module-off check every module gets: the game still starts and runs
 * with this module switched off, and stays deterministic.
 */
export function expectRunsWithout(modules: readonly AnyModule[], moduleId: string, ticks = 200): Simulation {
  const run = (): Simulation => {
    const sim = Simulation.create({ seed: 7, modules, disabled: [moduleId], width: 32, height: 32 });
    sim.step(ticks);
    return sim;
  };
  const a = run();
  expect(a.modules.map((m) => m.id)).not.toContain(moduleId);
  expect(a.world.tick).toBe(ticks);
  expect(run().hash()).toBe(a.hash());
  return a;
}
