import { seedRng, type RngState } from './rng';

export type LayerArray = Uint8Array | Uint16Array | Int16Array | Int32Array | Float32Array;
export type LayerKind = 'u8' | 'u16' | 'i16' | 'i32' | 'f32';

export type EntityId = number;

/**
 * The entire simulation state. Everything here must be plain data that can
 * be saved, hashed and sent to the main thread: no functions, no classes.
 */
export interface World {
  seed: number;
  tick: number;
  rng: RngState;
  width: number;
  height: number;
  /** New-game settings, keyed by module id (e.g. the world module's biome). Never changed after start. */
  settings: Record<string, unknown>;
  /** Tile layers, one value per tile, indexed by `y * width + x`. */
  layers: Record<string, LayerArray>;
  /** Bumped by `touchLayer` whenever a layer changes after the game starts, so the page knows to redraw it. */
  layerVersions: Record<string, number>;
  /** Next entity id to hand out. Ids are never reused. */
  nextEntityId: EntityId;
  /** Entity ids that currently exist. */
  entities: Map<EntityId, true>;
  /** Component tables: component name to (entity id to data). */
  components: Record<string, Map<EntityId, unknown>>;
  /** Per-module state, keyed by module id. Only the owning module writes it. */
  modules: Record<string, unknown>;
}

export const DEFAULT_MAP_SIZE = 250;

export function createWorld(
  seed: number,
  width = DEFAULT_MAP_SIZE,
  height = DEFAULT_MAP_SIZE,
  settings: Record<string, unknown> = {},
): World {
  return {
    seed,
    tick: 0,
    rng: seedRng(seed),
    width,
    height,
    settings,
    layers: {},
    layerVersions: {},
    nextEntityId: 1,
    entities: new Map(),
    components: {},
    modules: {},
  };
}

export function makeLayer(kind: LayerKind, size: number): LayerArray {
  switch (kind) {
    case 'u8':
      return new Uint8Array(size);
    case 'u16':
      return new Uint16Array(size);
    case 'i16':
      return new Int16Array(size);
    case 'i32':
      return new Int32Array(size);
    case 'f32':
      return new Float32Array(size);
  }
}

export function layerKind(layer: LayerArray): LayerKind {
  if (layer instanceof Uint8Array) return 'u8';
  if (layer instanceof Uint16Array) return 'u16';
  if (layer instanceof Int16Array) return 'i16';
  if (layer instanceof Int32Array) return 'i32';
  return 'f32';
}

export function tileIndex(world: World, x: number, y: number): number {
  return y * world.width + x;
}

export function inBounds(world: World, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < world.width && y < world.height;
}

export function spawnEntity(world: World): EntityId {
  const id = world.nextEntityId++;
  world.entities.set(id, true);
  return id;
}

export function despawnEntity(world: World, id: EntityId): void {
  world.entities.delete(id);
  for (const name of Object.keys(world.components).sort()) world.components[name]?.delete(id);
}

/** Marks a tile layer as changed so the page redraws it. */
export function touchLayer(world: World, name: string): void {
  world.layerVersions[name] = (world.layerVersions[name] ?? 0) + 1;
}
