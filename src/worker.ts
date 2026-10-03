/// <reference lib="webworker" />
import { Simulation, type Command } from './core';
import { ALL_MODULES } from './modules';
import { worldMap } from './modules/f1-world/api';
import { clock } from './modules/f2-time/api';
import { WORK_TYPES } from './content/work';
import { WORK_MODULE_ID, workBoard } from './modules/c1-work/api';
import { stock } from './modules/c2-construction/api';
import { people, type ColonistView } from './modules/f3-people/api';
import { TICKS_PER_SECOND, type FromWorker, type SkyStatus, type Speed, type ToWorker, type WorkStatus } from './protocol';

/**
 * Runs the simulation off the main thread. Real time here only decides how
 * often to step; the simulation itself never reads the clock.
 */

let sim: Simulation | null = null;
let speed: Speed = 1;
let timer: ReturnType<typeof setInterval> | null = null;
let owed = 0;

const FRAME_MS = 50;
/** Changed layers are sent at most this often. */
const LAYER_SEND_MS = 500;
let sentVersions: Record<string, number> = {};
let lastLayerSend = 0;

function skyStatus(sim: Simulation): SkyStatus {
  const c = sim.services.get(clock);
  const d = c.now();
  const season = d.season.charAt(0).toUpperCase() + d.season.slice(1);
  const time = `${String(d.hour).padStart(2, '0')}:${String(d.minute).padStart(2, '0')}`;
  return {
    date: `Year ${d.year}, ${season} ${d.dayOfSeason}, ${time}`,
    temperature: c.outdoorTemperature(),
    weather: c.weatherName(),
    light: c.light(),
  };
}

function colonists(sim: Simulation): ColonistView[] {
  const crew = sim.services.get(people);
  return crew.ids().flatMap((id) => crew.get(id) ?? []);
}

function workStatus(sim: Simulation): WorkStatus | null {
  if (!sim.modules.some((m) => m.id === WORK_MODULE_ID)) return null;
  const board = sim.services.get(workBoard);
  const priorities: WorkStatus['priorities'] = {};
  for (const id of sim.services.get(people).ids()) {
    priorities[id] = Object.fromEntries(WORK_TYPES.map((w) => [w.id, board.priorityOf(id, w.id)]));
  }
  return { types: [...WORK_TYPES].sort((a, b) => a.order - b.order).map(({ id, name, skill }) => ({ id, name, skill })), priorities, jobs: board.jobs().length };
}

function changedLayers(sim: Simulation): Record<string, ArrayLike<number>> | undefined {
  const now = performance.now();
  if (now - lastLayerSend < LAYER_SEND_MS) return undefined;
  let out: Record<string, ArrayLike<number>> | undefined;
  for (const [name, version] of Object.entries(sim.world.layerVersions)) {
    if (sentVersions[name] === version) continue;
    const layer = sim.world.layers[name];
    if (!layer) continue;
    (out ??= {})[name] = layer.slice();
    sentVersions[name] = version;
  }
  if (out) lastLayerSend = now;
  return out;
}

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
  const tickMs = (performance.now() - t0) / ticks;
  const layers = changedLayers(sim);
  post({
    type: 'tick',
    tick: sim.world.tick,
    tickMs,
    sky: skyStatus(sim),
    colonists: colonists(sim),
    work: workStatus(sim),
    stock: sim.services.get(stock).totals(),
    ...(layers ? { layers } : {}),
  });
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
        sentVersions = { ...sim.world.layerVersions };
        post({
          type: 'started',
          seed: msg.seed,
          modules: sim.modules.map((m) => m.id),
          map: { width: sim.world.width, height: sim.world.height, layers },
          summary: map.biome().name + ', ' + map.hilliness().replace('-', ' '),
          colonists: colonists(sim),
          home: sim.services.get(people).home(),
          work: workStatus(sim),
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
