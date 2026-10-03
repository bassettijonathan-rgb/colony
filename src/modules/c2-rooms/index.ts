import { defineModule, touchLayer, type ModuleContext, type Services, type World } from '../../core';
import { structures } from '../c2-construction/api';
import { ROOF, worldMap } from '../f1-world/api';
import { OUTDOORS, ROOM_LAYER, ROOMS_MODULE_ID, rooms, type RoomInfo } from './api';

export * from './api';

export interface RoomsState {
  /** Walls or rock changed since rooms were last worked out. */
  dirty: boolean;
  /** Enclosed room number to its size and roofed tiles. */
  rooms: Map<number, { size: number; roofed: number }>;
}

/** Enclosed rooms up to this many tiles get a roof put on automatically, as in RimWorld. Bigger spaces stay open to the sky. */
export const AUTO_ROOF_MAX = 400;

interface Env {
  readonly world: World;
  readonly state: RoomsState;
  readonly services: Services;
}
type Ctx = ModuleContext<RoomsState>;

/**
 * Flood-fills the map into rooms. Walls, doors and rock bound them; any
 * space that reaches the map edge is outdoors. Small enclosed rooms get a
 * roof. Rooms are numbered in reading order, so the result depends only on
 * the map.
 */
function detectRooms(env: Env): number {
  const { world } = env;
  const { width, height } = world;
  const map = env.services.get(worldMap);
  const built = env.services.get(structures);
  const n = width * height;
  const label = world.layers[ROOM_LAYER] as Uint16Array;
  const bound = new Uint8Array(n);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (map.rockAt(x, y) || built.buildingAt(x, y)?.roomEdge) bound[y * width + x] = 1;
    }
  }

  label.fill(0);
  const stack = new Int32Array(n);
  const region: number[] = [];
  let next = OUTDOORS + 1;
  env.state.rooms = new Map();
  for (let start = 0; start < n; start++) {
    if (bound[start] || label[start] !== 0) continue;
    // Fill one region, noting whether it touches the map edge.
    region.length = 0;
    let open = false;
    let top = 0;
    stack[top++] = start;
    label[start] = 0xffff;
    while (top > 0) {
      const i = stack[--top] as number;
      region.push(i);
      const x = i % width;
      const y = (i - x) / width;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) open = true;
      const push = (j: number): void => {
        if (!bound[j] && label[j] === 0) {
          label[j] = 0xffff;
          stack[top++] = j;
        }
      };
      if (x > 0) push(i - 1);
      if (x < width - 1) push(i + 1);
      if (y > 0) push(i - width);
      if (y < height - 1) push(i + width);
    }
    const id = open ? OUTDOORS : next++;
    let roofed = 0;
    for (const i of region) {
      label[i] = id;
      const x = i % width;
      const y = (i - x) / width;
      if (!open && map.roofAt(x, y) === ROOF.none && region.length <= AUTO_ROOF_MAX) map.buildRoof(x, y);
      if (map.roofAt(x, y) !== ROOF.none) roofed++;
    }
    if (!open) env.state.rooms.set(id, { size: region.length, roofed });
  }
  touchLayer(world, ROOM_LAYER);
  return env.state.rooms.size;
}

function info(state: RoomsState, id: number): RoomInfo | null {
  if (id === 0) return null;
  if (id === OUTDOORS) return { id, size: 0, enclosed: false, roofed: 0 };
  const room = state.rooms.get(id);
  return room ? { id, size: room.size, enclosed: true, roofed: room.roofed / room.size } : null;
}

const markDirty = (ctx: Ctx): void => {
  ctx.state.dirty = true;
};

/**
 * C2 Rooms: works out which spaces are closed off by walls, doors and rock,
 * and roofs small enclosed rooms. Caves dug into a hillside count as rooms
 * too. Climate, comfort and mood build on this.
 */
export const roomsModule = defineModule<RoomsState>({
  id: ROOMS_MODULE_ID,
  name: 'Rooms',
  layer: 'core',

  init: (ctx) => {
    ctx.world.layers[ROOM_LAYER] = new Uint16Array(ctx.world.width * ctx.world.height);
    return { dirty: true, rooms: new Map() };
  },

  setup: (ctx) => {
    const { world, state } = ctx;
    ctx.services.provide(rooms, {
      roomAt: (x, y) => {
        if (x < 0 || y < 0 || x >= world.width || y >= world.height) return info(state, OUTDOORS);
        return info(state, (world.layers[ROOM_LAYER] as Uint16Array)[y * world.width + x] ?? 0);
      },
      rooms: () => [...state.rooms.keys()].flatMap((id) => info(state, id) ?? []),
    });
  },

  systems: [
    {
      id: 'detect',
      phase: 'rooms',
      // At most once an in-game minute, however fast walls go up or rock comes down.
      every: 12,
      run: (ctx) => {
        if (!ctx.state.dirty) return;
        ctx.state.dirty = false;
        ctx.emit('rooms-changed', { rooms: detectRooms(ctx) });
      },
    },
  ],

  listen: {
    'building-finished': markDirty,
    'rock-mined': markDirty,
  },
});
