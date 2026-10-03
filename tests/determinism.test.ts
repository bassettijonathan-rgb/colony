import { describe, expect, it } from 'vitest';
import { Rng, seedRng, Simulation } from '../src/core';
import { SAMPLE_MODULES } from './fixtures/sampleModules';

const options = { seed: 42, modules: SAMPLE_MODULES, width: 64, height: 64 };

/** Plays a game with some player commands mixed in. */
function play(seed: number, ticks: number): Simulation {
  const sim = Simulation.create({ ...options, seed });
  const commands = new Rng(seedRng(seed + 1000));
  for (let t = 0; t < ticks; t++) {
    if (commands.chance(0.1)) sim.enqueue({ type: 'test-cheer', payload: { amount: commands.range(1, 5) } });
    sim.step();
  }
  return sim;
}

describe('determinism', () => {
  it('same seed and commands give the same world, tick for tick', () => {
    const a = play(42, 500);
    const b = play(42, 500);
    expect(a.hash()).toBe(b.hash());
    expect(a.commandLog.length).toBeGreaterThan(0);
  });

  it('different seeds give different worlds', () => {
    expect(play(42, 200).hash()).not.toBe(play(43, 200).hash());
  });

  it('a saved and loaded game carries on exactly like the original', () => {
    const original = play(42, 300);
    const loaded = Simulation.load(JSON.parse(JSON.stringify(original.save())), SAMPLE_MODULES);
    expect(loaded.hash()).toBe(original.hash());
    original.step(300);
    loaded.step(300);
    expect(loaded.hash()).toBe(original.hash());
  });

  it('replaying the seed and command log rebuilds the same world', () => {
    const original = play(42, 400);
    const replayed = Simulation.replay(options, original.commandLog, 400);
    expect(replayed.hash()).toBe(original.hash());
  });
});
