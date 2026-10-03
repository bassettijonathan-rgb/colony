import { h, render } from 'preact';
import { MapView } from './render/mapView';
import type { FromWorker, MapSnapshot, Speed, ToWorker } from './protocol';
import { App, type AppProps } from './ui/App';
import { toolForKey, type Tool } from './ui/Work';
import { describeTile } from './ui/tileInfo';

const mapEl = document.getElementById('map') as HTMLElement;
const uiEl = document.getElementById('ui') as HTMLElement;

const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
const send = (msg: ToWorker): void => worker.postMessage(msg);

const params = new URLSearchParams(location.search);
const crew: Record<string, unknown> = {};
if (params.get('colonists')) crew.colonists = Number(params.get('colonists'));
const seedParam = Number(params.get('seed'));
const seed = Number.isInteger(seedParam) && seedParam > 0 ? seedParam : 1;

// World options from the address bar, e.g. ?seed=7&biome=tundra&hills=mountainous&river=yes
const world: Record<string, unknown> = {};
if (params.get('biome')) world.biome = params.get('biome');
if (params.get('hills')) world.hilliness = params.get('hills');
if (params.get('river')) world.river = params.get('river') === 'yes';
const time: Record<string, unknown> = {};
if (params.get('season')) time.startSeason = params.get('season');

const state: Omit<AppProps, 'onSpeed' | 'onSelect' | 'onTool' | 'onToggleWork' | 'onToggleRooms' | 'onPriority'> = {
  seed,
  tick: 0,
  tickMs: 0,
  speed: 1,
  modules: [],
  summary: '',
  sky: null,
  colonists: [],
  selected: null,
  hover: '',
  error: null,
  work: null,
  stock: {},
  tool: null,
  showWork: false,
  showRooms: false,
};
/** Box colour for each area tool. */
const toolColour = (tool: Tool): number => (tool === 'mine' ? 0xffc040 : tool === 'cancel' ? 0xe07a6a : 0x7fb0e0);
let map: MapSnapshot | null = null;

function select(id: number | null): void {
  state.selected = id;
  view.showPawns(pawnsToDraw(), id);
  redraw();
}

function pawnsToDraw() {
  return state.colonists.map((c) => ({ id: c.id, name: c.person.name, x: c.x, y: c.y, activity: c.activity }));
}

function redraw(): void {
  render(
    h(App, {
      ...state,
      onSpeed: (speed: Speed) => {
        state.speed = speed;
        send({ type: 'speed', speed });
        redraw();
      },
      onSelect: select,
      onTool: setTool,
      onToggleRooms: toggleRooms,
      onToggleWork: () => {
        state.showWork = !state.showWork;
        redraw();
      },
      onPriority: (id: number, workType: string, priority: number) => {
        send({ type: 'command', command: { type: 'set-work-priority', payload: { id, workType, priority } } });
        // Show the change now; the worker confirms it on the next tick (or when unpaused).
        const row = state.work?.priorities[id];
        if (row) row[workType] = priority;
        redraw();
      },
    }),
    uiEl,
  );
}

function toggleRooms(): void {
  state.showRooms = !state.showRooms;
  view.showRooms(state.showRooms);
  redraw();
}

function setTool(tool: Tool | null): void {
  state.tool = tool;
  view.areaTool = tool ? toolColour(tool) : null;
  mapEl.style.cursor = tool ? 'crosshair' : '';
  redraw();
}

const view = new MapView();
// Click a colonist to select them; click empty ground to clear. Right-click sends the selected colonist there.
view.onClick = (tile) => {
  let best: number | null = null;
  let bestDistance = 1.5;
  for (const c of state.colonists) {
    const d = Math.hypot(c.x - tile.x, c.y - tile.y);
    if (d <= bestDistance) {
      best = c.id;
      bestDistance = d;
    }
  }
  select(best);
};
view.onRightClick = (tile) => {
  // Right-click puts an area tool away; otherwise it sends the selected colonist.
  if (state.tool) {
    setTool(null);
    return;
  }
  if (state.selected === null) return;
  send({ type: 'command', command: { type: 'move-colonist', payload: { id: state.selected, x: tile.x, y: tile.y } } });
};
view.onArea = (area) => {
  if (!state.tool) return;
  const tool = state.tool;
  if (tool.startsWith('build:')) {
    send({ type: 'command', command: { type: 'place-blueprints', payload: { ...area, building: tool.slice('build:'.length) } } });
    return;
  }
  const type = tool === 'mine' ? 'designate-mine' : 'cancel-designations';
  send({ type: 'command', command: { type, payload: area } });
};
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const key = e.key.toLowerCase();
  if (key === 'escape') {
    if (state.tool) setTool(null);
    else if (state.showWork) {
      state.showWork = false;
      redraw();
    } else select(null);
  } else if (!state.work) return;
  else if (toolForKey(key)) {
    const tool = toolForKey(key);
    setTool(state.tool === tool ? null : tool);
  }
  else if (key === 'r') toggleRooms();
  else if (key === 'p') {
    state.showWork = !state.showWork;
    redraw();
  }
});
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
      state.colonists = msg.colonists;
      state.work = msg.work;
      map = msg.map;
      view.showMap(msg.map);
      // Start close in on the landing site, or on the whole map when nobody landed.
      if (msg.colonists.length > 0) view.focus(msg.home.x, msg.home.y, 2.5);
      view.showPawns(pawnsToDraw(), state.selected);
      break;
    case 'tick':
      state.tick = msg.tick;
      state.tickMs = msg.tickMs;
      state.sky = msg.sky;
      state.colonists = msg.colonists;
      state.work = msg.work;
      state.stock = msg.stock;
      view.setLight(msg.sky.light);
      view.showPawns(pawnsToDraw(), state.selected);
      if (msg.layers && map) {
        Object.assign(map.layers, msg.layers);
        view.updateLayers(map, msg.layers);
      }
      break;
    case 'error':
      state.error = msg.message;
      break;
  }
  redraw();
};

void view.mount(mapEl).then(() => {
  redraw();
  send({ type: 'start', seed, settings: { 'f1-world': world, 'f2-time': time, 'f3-people': crew } });
});
