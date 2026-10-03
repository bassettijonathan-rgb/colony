import { describe, expect, it } from 'vitest';
import { defineModule, resolveModules, Simulation } from '../src/core';
import { ALL_MODULES } from '../src/modules';
import { expectRunsWithout } from './helpers';
import { mood, SAMPLE_MODULES, temperatureService, weather } from './fixtures/sampleModules';

const small = { seed: 3, width: 16, height: 16 };

describe('module loader', () => {
  it('orders modules by dependencies, then layer, then id', () => {
    const { order } = resolveModules(SAMPLE_MODULES);
    expect(order.map((m) => m.id)).toEqual(['test-weather', 'test-heater', 'test-mood']);
  });

  it('switches off dependents along with their dependency', () => {
    const { order, disabled } = resolveModules(SAMPLE_MODULES, ['test-weather']);
    expect(order.map((m) => m.id)).toEqual(['test-mood']);
    expect(disabled).toEqual(['test-heater', 'test-weather']);
  });

  it('rejects unknown dependencies and dependency loops', () => {
    const lonely = defineModule({ id: 'a', name: 'A', layer: 'core', deps: ['missing'] });
    expect(() => resolveModules([lonely])).toThrow(/unknown module "missing"/);
    const a = defineModule({ id: 'a', name: 'A', layer: 'core', deps: ['b'] });
    const b = defineModule({ id: 'b', name: 'B', layer: 'core', deps: ['a'] });
    expect(() => resolveModules([a, b])).toThrow(/loop/);
  });

  it('rejects duplicate module ids', () => {
    expect(() => resolveModules([mood, mood])).toThrow(/share the id/);
  });
});

describe('modules at runtime', () => {
  it('uses the real service when its module is on and the stand-in when it is off', () => {
    const on = Simulation.create({ ...small, modules: SAMPLE_MODULES });
    expect(on.services.isProvided(temperatureService)).toBe(true);
    const off = Simulation.create({ ...small, modules: SAMPLE_MODULES, disabled: ['test-weather'] });
    expect(off.services.isProvided(temperatureService)).toBe(false);
    expect(off.services.get(temperatureService).temperatureAt(0, 0)).toBe(21);
  });

  it('lets modules add to registries owned by other modules, only when the owner is on', () => {
    const sim = Simulation.create({ ...small, modules: SAMPLE_MODULES });
    expect(sim.registries.get({ name: 'test-mood.sources' }).all().map(([id]) => id)).toEqual(['weather']);
    expect(() => Simulation.create({ ...small, modules: [weather] })).not.toThrow();
  });

  it('delivers signals to every listening module in module order', () => {
    const sim = Simulation.create({ ...small, seed: 1, modules: SAMPLE_MODULES });
    sim.step(400);
    const moodState = sim.world.modules['test-mood'] as { log: string[] };
    const heaterState = sim.world.modules['test-heater'] as { fuel: number };
    expect(moodState.log.length).toBeGreaterThan(0);
    expect(heaterState.fuel).toBe(100 - Math.min(100, moodState.log.length));
  });

  it('applies commands at the start of the next tick and logs them', () => {
    const sim = Simulation.create({ ...small, modules: [mood] });
    sim.step(2);
    sim.enqueue({ type: 'test-cheer', payload: { amount: 1000 } });
    sim.step();
    expect((sim.world.modules['test-mood'] as { mood: number }).mood).toBeGreaterThan(1000);
    expect(sim.commandLog).toEqual([{ tick: 2, type: 'test-cheer', payload: { amount: 1000 } }]);
  });

  it('drops commands for switched-off modules without logging them', () => {
    const sim = Simulation.create({ ...small, modules: [weather] });
    sim.enqueue({ type: 'test-cheer', payload: { amount: 1 } });
    sim.step();
    expect(sim.commandLog).toEqual([]);
  });

  it('runs systems only on their `every` ticks', () => {
    let runs = 0;
    const counter = defineModule({
      id: 'counter',
      name: 'Counter',
      layer: 'core',
      systems: [{ id: 'count', phase: 'events', every: 5, offset: 2, run: () => void runs++ }],
    });
    Simulation.create({ ...small, modules: [counter] }).step(20);
    expect(runs).toBe(4); // ticks 2, 7, 12, 17
  });
});

describe('every module runs with each other module switched off', () => {
  for (const m of SAMPLE_MODULES) {
    it(`sample modules without ${m.id}`, () => {
      expectRunsWithout(SAMPLE_MODULES, m.id);
    });
  }
  for (const m of ALL_MODULES) {
    it(`game without ${m.id}`, () => {
      expectRunsWithout(ALL_MODULES, m.id);
    });
  }
});
