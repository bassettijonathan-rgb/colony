/// <reference lib="webworker" />
import { Simulation, type Command } from './core';
import { ALL_MODULES } from './modules';
import { worldMap } from './modules/f1-world/api';
import { TICKS_PER_SECOND, type FromWorker, type Speed, type ToWorker } from './protocol';

/**
 * Runs the simulation off the main thread. Real time here only decides how
 * often to step; the simulation itself never reads the clock.
 */

let sim: Simulation | null = null;
let speed: Speed = 1;
let timer: ReturnType<typeof setInterval> | null = null;
let owed = 0;

const FRAME_MS = 50;

function post(msg: FromWorker): void {
  self.postMessage(msg);
}

function frame(): void {
  if (!sim || speed === 0) return;
  owed += (TICKS_PER_SECOND[speed] * FRAME_MS) / 1000;
  const ticks = Math.floor(owed);
  if (ticks === 0) return;
  owed -= ticks;
  const t0 = performance.now();
  sim.step(ticks);
  post({ type: 'tick', tick: sim.world.tick, tickMs: (performance.now() - t0) / ticks });
}

self.onmessage = (event: MessageEvent<ToWorker>) => {
  const msg = event.data;
  try {
    switch (msg.type) {
      case 'start': {
        sim = Simulation.create({ seed: msg.seed, modules: ALL_MODULES, settings: msg.settings });
        const map = sim.services.get(worldMap);
        const layers: Record<string, ArrayLike<number>> = {};
        for (const [name, layer] of Object.entries(sim.world.layers)) layers[name] = layer.slice();
        post({
          type: 'started',
          seed: msg.seed,
          modules: sim.modules.map((m) => m.id),
          map: { width: sim.world.width, height: sim.world.height, layers },
          summary: map.biome().name + ', ' + map.hilliness().replace('-', ' '),
        });
        timer ??= setInterval(frame, FRAME_MS);
        break;
      }
      case 'speed':
        speed = msg.speed;
        owed = 0;
        break;
      case 'command':
        sim?.enqueue(msg.command as Command);
        break;
    }
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
