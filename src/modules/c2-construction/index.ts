import {
  defineModule,
  despawnEntity,
  inBounds,
  spawnEntity,
  touchLayer,
  type EntityId,
  type ModuleContext,
  type Services,
  type World,
} from '../../core';
import { BUILDINGS, type BuildingDef } from '../../content/buildings';
import { ITEMS, LANDING_SUPPLIES, ORE_PER_TILE, type ItemDef } from '../../content/items';
import { ORES } from '../../content/ores';
import { ROCKS } from '../../content/rocks';
import { check, checkColour, checkRange, checkUniqueIds } from '../../content/validate';
import { workBoard, type TileArea } from '../c1-work/api';
import { TILE_RULES, worldMap } from '../f1-world/api';
import { TICKS_PER_HOUR } from '../f2-time/api';
import { people } from '../f3-people/api';
import {
  BLUEPRINT_COMPONENT,
  CONSTRUCTION_LAYER as L,
  CONSTRUCTION_MODULE_ID,
  ITEM_COMPONENT,
  stock,
  structures,
  type Blueprint,
  type ItemStack,
} from './api';

export * from './api';

/** A trip to fetch materials for a blueprint: first walking to the item, then carrying it over. */
export interface Haul {
  id: number;
  /** The work-board job for the current step. */
  job: number;
  blueprint: EntityId;
  /** The stack being fetched; null once picked up. */
  item: EntityId | null;
  def: string;
  count: number;
  /** Who is carrying it, once picked up. */
  carrier: EntityId | null;
  phase: 'fetch' | 'deliver';
}

export interface ConstructionState {
  nextHaul: number;
  /** Haul id to haul, oldest first. */
  hauls: Map<number, Haul>;
}

/** Picking up or putting down a load takes two in-game minutes. */
const HANDLE_TICKS = 24;
/** Blueprints look for materials this often (5 in-game minutes). */
export const PLAN_EVERY = 60;
/** Most new trips planned at once, so a huge blueprint doesn't stall a tick. */
const MAX_HAULS_PER_PLAN = 40;
/** How far from where it should go an item may be put down when tiles are taken. */
const DROP_RADIUS = 12;
const MAX_AREA_SIDE = 128;

function validateConstructionContent(): void {
  checkUniqueIds('items', ITEMS);
  for (const item of ITEMS) {
    checkColour('items', item.id, item.colour);
    check(Number.isInteger(item.stack) && item.stack >= 1, `items: "${item.id}" stack must be a whole number of at least 1`);
  }
  for (const rock of ROCKS) check(itemDef(`${rock.id}-chunk`) !== undefined, `items: rock "${rock.id}" needs a "${rock.id}-chunk" item`);
  for (const ore of ORES) check(itemDef(`${ore.id}-ore`) !== undefined, `items: ore "${ore.id}" needs a "${ore.id}-ore" item`);
  for (const s of LANDING_SUPPLIES) check(itemDef(s.item) !== undefined, `items: landing supply "${s.item}" is not an item`);
  checkUniqueIds('buildings', BUILDINGS);
  for (const b of BUILDINGS) {
    checkColour('buildings', b.id, b.colour);
    checkRange('buildings', b.id, 'workHours', b.workHours, 0.01, 100);
    checkRange('buildings', b.id, 'moveCost', b.moveCost, 0, 10);
    for (const c of b.cost) {
      check(ITEMS.some((i) => i.tags.includes(c.tag)), `buildings: "${b.id}" costs "${c.tag}", which no item is`);
      check(Number.isInteger(c.count) && c.count >= 1, `buildings: "${b.id}" cost counts must be whole numbers`);
    }
  }
}

const itemDef = (id: string): ItemDef | undefined => ITEMS.find((i) => i.id === id);
const buildingDef = (id: string): BuildingDef | undefined => BUILDINGS.find((b) => b.id === id);

interface Env {
  readonly world: World;
  readonly state: ConstructionState;
  readonly services: Services;
}
type Ctx = ModuleContext<ConstructionState>;

const table = <T,>(world: World, name: string): Map<EntityId, T> => {
  world.components[name] ??= new Map();
  return world.components[name] as Map<EntityId, T>;
};
const items = (world: World) => table<ItemStack>(world, ITEM_COMPONENT);
const blueprints = (world: World) => table<Blueprint>(world, BLUEPRINT_COMPONENT);
const layer = (world: World, name: string) => world.layers[name] as Uint16Array;

/** Writes a tile's item layers from its stack (or clears them). */
function showItem(world: World, x: number, y: number, stack: ItemStack | null): void {
  const i = y * world.width + x;
  layer(world, L.item)[i] = stack ? ITEMS.findIndex((d) => d.id === stack.def) + 1 : 0;
  layer(world, L.itemCount)[i] = stack ? stack.count : 0;
  touchLayer(world, L.item);
  touchLayer(world, L.itemCount);
}

function itemAt(world: World, x: number, y: number): [EntityId, ItemStack] | null {
  if (layer(world, L.item)[y * world.width + x] === 0) return null;
  for (const entry of items(world)) if (entry[1].x === x && entry[1].y === y) return entry;
  return null;
}

/**
 * Puts items on the ground at or near a tile: onto a stack of the same item
 * with room, or onto the nearest clear walkable tile. Returns how many found
 * no room (they are lost).
 */
function dropItems(env: Env, def: string, count: number, x0: number, y0: number): number {
  const info = itemDef(def);
  if (!info) return count;
  const { world } = env;
  const map = env.services.get(worldMap);
  let left = count;
  for (let r = 0; r <= DROP_RADIUS && left > 0; r++) {
    for (let y = y0 - r; y <= y0 + r && left > 0; y++) {
      for (let x = x0 - r; x <= x0 + r && left > 0; x++) {
        if (Math.max(Math.abs(x - x0), Math.abs(y - y0)) !== r || !inBounds(world, x, y) || !map.isWalkable(x, y)) continue;
        const i = y * world.width + x;
        if (layer(world, L.blueprint)[i] !== 0 || layer(world, L.building)[i] !== 0) continue;
        const here = itemAt(world, x, y);
        if (here) {
          const stack = here[1];
          if (stack.def !== def || stack.count >= info.stack) continue;
          const add = Math.min(left, info.stack - stack.count);
          stack.count += add;
          left -= add;
          showItem(world, x, y, stack);
        } else {
          const stack: ItemStack = { def, count: Math.min(left, info.stack), x, y, reserved: 0 };
          items(world).set(spawnEntity(world), stack);
          left -= stack.count;
          showItem(world, x, y, stack);
        }
      }
    }
  }
  return left;
}

/** Takes up to `count` from a stack, removing it when empty. Returns how many were taken. */
function takeItems(env: Env, id: EntityId, count: number): number {
  const stack = items(env.world).get(id);
  if (!stack) return 0;
  const taken = Math.min(count, stack.count);
  stack.count -= taken;
  if (stack.count === 0) {
    despawnEntity(env.world, id);
    showItem(env.world, stack.x, stack.y, null);
  } else {
    showItem(env.world, stack.x, stack.y, stack);
  }
  return taken;
}

const tagged = (def: string, tag: string): boolean => itemDef(def)?.tags.includes(tag) ?? false;

function deliveredFor(bp: Blueprint, tag: string): number {
  let n = 0;
  for (const [def, count] of Object.entries(bp.delivered)) if (tagged(def, tag)) n += count;
  return n;
}

function hasEverything(bp: Blueprint): boolean {
  const def = buildingDef(bp.def);
  return !!def && def.cost.every((c) => deliveredFor(bp, c.tag) >= c.count);
}

function postBuild(env: Env, bp: Blueprint): void {
  const def = buildingDef(bp.def);
  if (!def || bp.job !== null || bp.built) return;
  bp.job = env.services.get(workBoard).post({
    workType: 'construction',
    kind: 'build',
    owner: CONSTRUCTION_MODULE_ID,
    x: bp.x,
    y: bp.y,
    amount: def.workHours * TICKS_PER_HOUR,
    label: `Building a ${def.name.toLowerCase()}`,
  });
}

/** Sends colonists for materials that blueprints still lack, nearest stacks first. */
function planHauls(ctx: Ctx): void {
  const bps = blueprints(ctx.world);
  if (bps.size === 0) return;
  const board = ctx.services.get(workBoard);
  const stacks = [...items(ctx.world)];
  let posted = 0;
  for (const [bid, bp] of bps) {
    if (bp.job !== null || bp.built) continue;
    const def = buildingDef(bp.def);
    if (!def) continue;
    if (hasEverything(bp)) {
      postBuild(ctx, bp);
      continue;
    }
    for (const cost of def.cost) {
      let coming = deliveredFor(bp, cost.tag);
      for (const haul of ctx.state.hauls.values()) if (haul.blueprint === bid && tagged(haul.def, cost.tag)) coming += haul.count;
      let need = cost.count - coming;
      while (need > 0 && posted < MAX_HAULS_PER_PLAN) {
        let best: [EntityId, ItemStack] | null = null;
        let bestDistance = Infinity;
        for (const entry of stacks) {
          const stack = entry[1];
          if (stack.count - stack.reserved <= 0 || !tagged(stack.def, cost.tag)) continue;
          const d = (stack.x - bp.x) ** 2 + (stack.y - bp.y) ** 2;
          if (d < bestDistance) {
            best = entry;
            bestDistance = d;
          }
        }
        if (!best) break;
        const [itemId, stack] = best;
        const info = itemDef(stack.def) as ItemDef;
        const count = Math.min(need, stack.count - stack.reserved, info.stack);
        const job = board.post({
          workType: 'hauling',
          kind: 'fetch',
          owner: CONSTRUCTION_MODULE_ID,
          x: stack.x,
          y: stack.y,
          amount: HANDLE_TICKS,
          label: `Fetching ${info.name.toLowerCase()}`,
          standOn: true,
        });
        if (job === null) return; // nobody takes jobs: the work module is off
        stack.reserved += count;
        need -= count;
        posted++;
        const id = ctx.state.nextHaul++;
        ctx.state.hauls.set(id, { id, job, blueprint: bid, item: itemId, def: stack.def, count, carrier: null, phase: 'fetch' });
      }
    }
  }
}

function haulForJob(state: ConstructionState, job: number): Haul | undefined {
  for (const haul of state.hauls.values()) if (haul.job === job) return haul;
  return undefined;
}

/** Ends a haul early: fetched items not yet picked up are freed, carried ones are put down where the carrier stands. */
function dropHaul(env: Env, haul: Haul): void {
  env.state.hauls.delete(haul.id);
  env.services.get(workBoard).cancel(haul.job);
  if (haul.phase === 'fetch') {
    const stack = haul.item === null ? undefined : items(env.world).get(haul.item);
    if (stack) stack.reserved = Math.max(0, stack.reserved - haul.count);
    return;
  }
  const at = haul.carrier === null ? null : env.services.get(people).tileOf(haul.carrier);
  const bp = blueprints(env.world).get(haul.blueprint);
  const where = at ?? bp ?? { x: 0, y: 0 };
  dropItems(env, haul.def, haul.count, where.x, where.y);
}

function removeBlueprint(env: Env, id: EntityId): void {
  const bp = blueprints(env.world).get(id);
  if (!bp) return;
  for (const haul of [...env.state.hauls.values()]) if (haul.blueprint === id) dropHaul(env, haul);
  if (bp.job !== null) env.services.get(workBoard).cancel(bp.job);
  despawnEntity(env.world, id);
  layer(env.world, L.blueprint)[bp.y * env.world.width + bp.x] = 0;
  touchLayer(env.world, L.blueprint);
}

function onJobDone(ctx: Ctx, kind: string, job: number, worker: EntityId): void {
  if (kind === 'build') {
    for (const bp of blueprints(ctx.world).values()) {
      if (bp.job !== job) continue;
      bp.job = null;
      bp.built = true;
      bp.builder = worker;
    }
    finishBuildings(ctx);
    return;
  }
  const haul = haulForJob(ctx.state, job);
  if (!haul) return;
  const bp = blueprints(ctx.world).get(haul.blueprint);
  if (kind === 'fetch') {
    const want = haul.count;
    const stack = haul.item === null ? undefined : items(ctx.world).get(haul.item);
    if (stack) stack.reserved = Math.max(0, stack.reserved - want);
    const got = haul.item === null ? 0 : takeItems(ctx, haul.item, want);
    if (got === 0) {
      ctx.state.hauls.delete(haul.id);
      return;
    }
    haul.item = null;
    haul.count = got;
    haul.carrier = worker;
    haul.phase = 'deliver';
    const target = bp ?? { x: 0, y: 0 };
    const next = ctx.services.get(workBoard).post({
      workType: 'hauling',
      kind: 'deliver',
      owner: CONSTRUCTION_MODULE_ID,
      x: target.x,
      y: target.y,
      amount: HANDLE_TICKS,
      label: `Carrying ${got} ${(itemDef(haul.def)?.name ?? haul.def).toLowerCase()}`,
      only: worker,
    });
    if (next === null || !bp) {
      dropHaul(ctx, haul);
      return;
    }
    haul.job = next;
  } else if (kind === 'deliver') {
    ctx.state.hauls.delete(haul.id);
    if (!bp) return;
    bp.delivered[haul.def] = (bp.delivered[haul.def] ?? 0) + haul.count;
    if (hasEverything(bp)) postBuild(ctx, bp);
  }
}

/** Raises finished buildings, once nobody is standing in the way. */
function finishBuildings(ctx: Ctx): void {
  const crew = ctx.services.get(people);
  const standing = new Set<number>();
  for (const id of crew.ids()) {
    const at = crew.tileOf(id);
    if (at) standing.add(at.y * ctx.world.width + at.x);
  }
  for (const [id, bp] of [...blueprints(ctx.world)]) {
    if (!bp.built) continue;
    const i = bp.y * ctx.world.width + bp.x;
    if (standing.has(i)) continue;
    const def = buildingDef(bp.def);
    clearTile(ctx, bp.x, bp.y);
    despawnEntity(ctx.world, id);
    layer(ctx.world, L.blueprint)[i] = 0;
    layer(ctx.world, L.building)[i] = BUILDINGS.findIndex((b) => b.id === bp.def) + 1;
    touchLayer(ctx.world, L.blueprint);
    touchLayer(ctx.world, L.building);
    if (def) ctx.emit('building-finished', { x: bp.x, y: bp.y, building: def.id, builder: bp.builder ?? 0 });
  }
}

/** Moves anything lying on a tile to the nearest free spot, so a building can go up there. */
function clearTile(env: Env, x: number, y: number): void {
  const here = itemAt(env.world, x, y);
  if (!here) return;
  const [id, stack] = here;
  for (const haul of [...env.state.hauls.values()]) if (haul.item === id) dropHaul(env, haul);
  const { def, count } = stack;
  takeItems(env, id, count);
  dropItems(env, def, count, x, y);
}

function clampArea(world: World, a: TileArea): { x0: number; y0: number; x1: number; y1: number } | null {
  if (![a.x0, a.y0, a.x1, a.y1].every(Number.isInteger)) return null;
  const x0 = Math.max(0, Math.min(a.x0, a.x1));
  const y0 = Math.max(0, Math.min(a.y0, a.y1));
  const x1 = Math.min(world.width - 1, Math.max(a.x0, a.x1), x0 + MAX_AREA_SIDE - 1);
  const y1 = Math.min(world.height - 1, Math.max(a.y0, a.y1), y0 + MAX_AREA_SIDE - 1);
  return x0 <= x1 && y0 <= y1 ? { x0, y0, x1, y1 } : null;
}

function placeBlueprints(ctx: Ctx, payload: TileArea & { building: string }): void {
  const def = buildingDef(payload.building);
  const a = clampArea(ctx.world, payload);
  if (!def || !a) return;
  const map = ctx.services.get(worldMap);
  const plan = layer(ctx.world, L.blueprint);
  const index = BUILDINGS.indexOf(def) + 1;
  let changed = false;
  for (let y = a.y0; y <= a.y1; y++) {
    for (let x = a.x0; x <= a.x1; x++) {
      const edge = x === a.x0 || x === a.x1 || y === a.y0 || y === a.y1;
      if (def.drag === 'outline' && !edge) continue;
      const i = y * ctx.world.width + x;
      if (!map.isBuildable(x, y) || plan[i] !== 0) continue;
      blueprints(ctx.world).set(spawnEntity(ctx.world), { def: def.id, x, y, delivered: {}, job: null, built: false, builder: null });
      plan[i] = index;
      changed = true;
    }
  }
  if (changed) touchLayer(ctx.world, L.blueprint);
}

/**
 * C2 Construction: items on the ground (landing supplies, stone dug out of
 * rock), blueprints the player lays out, hauling materials to them, and
 * walls and doors. Walls block walking; doors slow it.
 */
export const constructionModule = defineModule<ConstructionState>({
  id: CONSTRUCTION_MODULE_ID,
  name: 'Construction',
  layer: 'core',

  init: (ctx) => {
    validateConstructionContent();
    const size = ctx.world.width * ctx.world.height;
    for (const name of Object.values(L)) ctx.world.layers[name] = new Uint16Array(size);
    const state: ConstructionState = { nextHaul: 1, hauls: new Map() };
    const env: Env = { world: ctx.world, state, services: ctx.services };
    const home = ctx.services.get(people).home();
    for (const s of LANDING_SUPPLIES) dropItems(env, s.item, s.count, home.x + 3, home.y + 3);
    return state;
  },

  setup: (ctx) => {
    validateConstructionContent();
    const { world } = ctx;
    ctx.services.provide(structures, {
      buildingAt: (x, y) => (inBounds(world, x, y) ? (BUILDINGS[(layer(world, L.building)[y * world.width + x] ?? 0) - 1] ?? null) : null),
    });
    ctx.services.provide(stock, {
      totals: () => {
        const counts = new Map<string, number>();
        for (const s of items(world).values()) counts.set(s.def, (counts.get(s.def) ?? 0) + s.count);
        for (const h of ctx.state.hauls.values()) if (h.phase === 'deliver') counts.set(h.def, (counts.get(h.def) ?? 0) + h.count);
        const out: Record<string, number> = {};
        for (const def of ITEMS) {
          const n = counts.get(def.id);
          if (n) out[def.id] = n;
        }
        return out;
      },
    });
  },

  contribute: (ctx) => {
    const { world } = ctx;
    const builtAt = (x: number, y: number): BuildingDef | undefined => {
      const b = layer(world, L.building)[y * world.width + x] ?? 0;
      return b === 0 ? undefined : BUILDINGS[b - 1];
    };
    ctx.registries.find(TILE_RULES)?.register(CONSTRUCTION_MODULE_ID, {
      moveCost: (x, y) => builtAt(x, y)?.moveCost,
      buildable: (x, y) => (builtAt(x, y) ? false : undefined),
    });
  },

  systems: [
    { id: 'plan', phase: 'jobs', every: PLAN_EVERY, offset: 7, run: planHauls },
    { id: 'finish', phase: 'work', every: 10, run: finishBuildings },
  ],

  listen: {
    'job-done': (ctx, p) => {
      if (p.owner === CONSTRUCTION_MODULE_ID) onJobDone(ctx, p.kind, p.job, p.worker);
    },
    'rock-mined': (ctx, p) => {
      if (p.ore) dropItems(ctx, `${p.ore}-ore`, ORE_PER_TILE, p.x, p.y);
      else dropItems(ctx, `${p.rock}-chunk`, 1, p.x, p.y);
    },
  },

  commands: {
    'place-blueprints': placeBlueprints,
    'cancel-designations': (ctx, area) => {
      const a = clampArea(ctx.world, area);
      if (!a) return;
      for (const [id, bp] of [...blueprints(ctx.world)]) {
        if (bp.x < a.x0 || bp.x > a.x1 || bp.y < a.y0 || bp.y > a.y1) continue;
        removeBlueprint(ctx, id);
        // Materials already brought are put back down.
        for (const [def, count] of Object.entries(bp.delivered)) dropItems(ctx, def, count, bp.x, bp.y);
      }
    },
  },
});
