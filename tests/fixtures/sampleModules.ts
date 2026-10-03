/**
 * Small throwaway modules that exercise every part of the module system:
 * state, systems, signals, services with stand-ins, registries, commands
 * and dependencies. Real game modules follow the same shape.
 */
import { defineModule, defineService, registryKey, type AnyModule } from '../../src/core';

declare module '../../src/core/signals' {
  interface SignalMap {
    'test-cold-snap': { tick: number; temperature: number };
  }
}

declare module '../../src/core/commands' {
  interface CommandMap {
    'test-cheer': { amount: number };
  }
}

export const temperatureService = defineService('test-weather.temperature', {
  temperatureAt: (_x: number, _y: number): number => 21,
});

export const moodSources = registryKey<{ label: string; value: number }>('test-mood.sources');

export const weather = defineModule<{ temperature: number }>({
  id: 'test-weather',
  name: 'Test weather',
  layer: 'foundation',
  init: (ctx) => {
    ctx.world.layers['test-heat'] = new Float32Array(ctx.world.width * ctx.world.height);
    return { temperature: 15 };
  },
  setup: (ctx) => {
    ctx.services.provide(temperatureService, { temperatureAt: () => ctx.state.temperature });
  },
  contribute: (ctx) => {
    ctx.registries.find(moodSources)?.register('weather', { label: 'Nice weather', value: 1 });
  },
  systems: [
    {
      id: 'drift',
      phase: 'environment',
      run: (ctx) => {
        ctx.state.temperature += ctx.rng.range(-2, 2);
        const heat = ctx.world.layers['test-heat'] as Float32Array;
        heat[ctx.rng.int(heat.length)] = ctx.state.temperature;
        if (ctx.state.temperature < 0) {
          ctx.emit('test-cold-snap', { tick: ctx.world.tick, temperature: ctx.state.temperature });
        }
      },
    },
  ],
});

export const heater = defineModule<{ fuel: number }>({
  id: 'test-heater',
  name: 'Test heater',
  layer: 'core',
  deps: ['test-weather'],
  init: () => ({ fuel: 100 }),
  listen: {
    'test-cold-snap': (ctx) => {
      ctx.state.fuel = Math.max(0, ctx.state.fuel - 1);
    },
  },
});

export const mood = defineModule<{ mood: number; log: string[] }>({
  id: 'test-mood',
  name: 'Test mood',
  layer: 'core',
  init: () => ({ mood: 50, log: [] }),
  setup: (ctx) => {
    ctx.registries.define(moodSources);
  },
  systems: [
    {
      id: 'feel',
      phase: 'mood',
      every: 3,
      run: (ctx) => {
        // Uses the weather service without depending on the weather module.
        const t = ctx.services.get(temperatureService).temperatureAt(0, 0);
        const bonus = ctx.registries.get(moodSources).all().reduce((sum, [, s]) => sum + s.value, 0);
        ctx.state.mood += (t > 10 ? 1 : -1) + bonus;
      },
    },
  ],
  listen: {
    'test-cold-snap': (ctx, payload) => {
      ctx.state.log.push(`cold at ${payload.tick}`);
    },
  },
  commands: {
    'test-cheer': (ctx, payload) => {
      ctx.state.mood += payload.amount;
    },
  },
});

export const SAMPLE_MODULES: readonly AnyModule[] = [mood, heater, weather];
