import { h, render } from 'preact';
import { MapView } from './render/mapView';
import type { FromWorker, Speed, ToWorker } from './protocol';
import { App, type AppProps } from './ui/App';

const mapEl = document.getElementById('map') as HTMLElement;
const uiEl = document.getElementById('ui') as HTMLElement;

const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
const send = (msg: ToWorker): void => worker.postMessage(msg);

const seedParam = Number(new URLSearchParams(location.search).get('seed'));
const seed = Number.isInteger(seedParam) && seedParam > 0 ? seedParam : 1;

const state: Omit<AppProps, 'onSpeed'> = { seed, tick: 0, tickMs: 0, speed: 1, modules: [], error: null };

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

worker.onmessage = (event: MessageEvent<FromWorker>) => {
  const msg = event.data;
  switch (msg.type) {
    case 'started':
      state.modules = msg.modules;
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
  send({ type: 'start', seed });
});
