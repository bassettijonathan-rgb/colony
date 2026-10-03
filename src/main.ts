import { h, render } from 'preact';
import { MapView } from './render/mapView';
import type { FromWorker, MapSnapshot, Speed, ToWorker } from './protocol';
import { App, type AppProps } from './ui/App';
import { describeTile } from './ui/tileInfo';

const mapEl = document.getElementById('map') as HTMLElement;
const uiEl = document.getElementById('ui') as HTMLElement;

const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
const send = (msg: ToWorker): void => worker.postMessage(msg);

const params = new URLSearchParams(location.search);
const seedParam = Number(params.get('seed'));
const seed = Number.isInteger(seedParam) && seedParam > 0 ? seedParam : 1;

// World options from the address bar, e.g. ?seed=7&biome=tundra&hills=mountainous&river=yes
const world: Record<string, unknown> = {};
if (params.get('biome')) world.biome = params.get('biome');
if (params.get('hills')) world.hilliness = params.get('hills');
if (params.get('river')) world.river = params.get('river') === 'yes';

const state: Omit<AppProps, 'onSpeed'> = {
  seed,
  tick: 0,
  tickMs: 0,
  speed: 1,
  modules: [],
  summary: '',
  hover: '',
  error: null,
};
let map: MapSnapshot | null = null;

function redraw(): void {
  render(
    h(App, {
      ...state,
      onSpeed: (speed: Speed) => {
        state.speed = speed;
        send({ type: 'speed', speed });
        redraw();
      },
    }),
    uiEl,
  );
}

const view = new MapView();
view.onHover = (tile) => {
  state.hover = tile && map ? describeTile(map, tile.x, tile.y) : '';
  redraw();
};

worker.onmessage = (event: MessageEvent<FromWorker>) => {
  const msg = event.data;
  switch (msg.type) {
    case 'started':
      state.modules = msg.modules;
      state.summary = msg.summary;
      map = msg.map;
      view.showMap(msg.map);
      break;
    case 'tick':
      state.tick = msg.tick;
      state.tickMs = msg.tickMs;
      break;
    case 'error':
      state.error = msg.message;
      break;
  }
  redraw();
};

void view.mount(mapEl).then(() => {
  redraw();
  send({ type: 'start', seed, settings: { 'f1-world': world } });
});
