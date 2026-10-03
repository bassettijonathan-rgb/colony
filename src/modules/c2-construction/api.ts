/**
 * What other modules, the worker and the UI may use from the construction
 * module: layer and component names, signals, commands and the stock service.
 */
import { defineService, type EntityId } from '../../core';
import type { BuildingDef } from '../../content/buildings';
import type { TileArea } from '../c1-work/api';

export const CONSTRUCTION_MODULE_ID = 'c2-construction';

/** Tile layers this module owns (all Uint16). */
export const CONSTRUCTION_LAYER = {
  /** Index + 1 into ITEMS for the stack lying on the tile, 0 for none. One stack per tile. */
  item: 'item',
  /** How many are in that stack. */
  itemCount: 'item-count',
  /** Index + 1 into BUILDINGS for a blueprint waiting to be built. */
  blueprint: 'blueprint',
  /** Index + 1 into BUILDINGS for a finished structure. */
  building: 'building',
} as const;

export const ITEM_COMPONENT = 'c2-construction.item';
export const BLUEPRINT_COMPONENT = 'c2-construction.blueprint';

/** A stack of items on the ground. */
export interface ItemStack {
  def: string;
  count: number;
  x: number;
  y: number;
  /** How many of them colonists are on their way to fetch. */
  reserved: number;
}

export interface Blueprint {
  def: string;
  x: number;
  y: number;
  /** Item id to how many have been brought. */
  delivered: Record<string, number>;
  /** The building job once every material is there, else null. */
  job: number | null;
  /** The work is done; the building goes up as soon as nobody stands on the tile. */
  built: boolean;
  /** Who did the building work, once it is done. */
  builder: EntityId | null;
}

declare module '../../core/signals' {
  interface SignalMap {
    'building-finished': { x: number; y: number; building: string; builder: EntityId };
  }
}

declare module '../../core/commands' {
  interface CommandMap {
    /** Lay blueprints for a building over an area, as an outline or filled per the building's `drag`. */
    'place-blueprints': TileArea & { building: string };
  }
}

export interface StockService {
  /** Item id to how many lie on the ground or are being carried, in item order. */
  totals(): Record<string, number>;
}

export interface StructuresService {
  /** The finished building on a tile, if any. */
  buildingAt(x: number, y: number): BuildingDef | null;
}

/** Without the construction module nothing is built. */
export const structures = defineService<StructuresService>('c2-construction.structures', { buildingAt: () => null });

/** Without the construction module there are no items. */
export const stock = defineService<StockService>('c2-construction.stock', { totals: () => ({}) });
