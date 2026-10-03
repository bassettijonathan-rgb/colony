/**
 * What other modules, the worker and the UI may use from the world module:
 * layer names, roof values, settings and the map service.
 */
import { defineService } from '../../core';
import { BIOMES, type BiomeDef, type Hilliness } from '../../content/biomes';
import type { OreDef } from '../../content/ores';
import type { RockDef } from '../../content/rocks';
import { TERRAIN, type TerrainDef } from '../../content/terrain';

export const WORLD_MODULE_ID = 'f1-world';

/** Tile layers this module creates and owns. */
export const LAYER = {
  /** Index into TERRAIN: the ground (under rock, the floor left after mining). */
  terrain: 'terrain',
  /** 0 to 255, low ground to high ground. */
  elevation: 'elevation',
  /** Plant growth, as a percentage of normal soil (0 to 140). */
  fertility: 'fertility',
  /** Index + 1 into ROCKS for natural rock, 0 for open ground. */
  rock: 'rock',
  /** Index + 1 into ORES for ore inside rock, 0 for none. */
  ore: 'ore',
  /** One of the ROOF values. */
  roof: 'roof',
} as const;

export const ROOF = {
  none: 0,
  /** Built by colonists. */
  constructed: 1,
  /** Thin natural rock; mining under it leaves it in place. */
  rock: 2,
  /** Deep inside a mountain. Can never be removed. */
  overhead: 3,
} as const;

/** New-game settings for the world module: `settings['f1-world']`. All optional. */
export interface WorldSettings {
  biome?: string;
  hilliness?: Hilliness;
  /** Force a river on or off. By default the biome's river chance decides. */
  river?: boolean;
}

/** The world module's saved state: the choices made when the map was generated. */
export interface WorldState {
  biome: string;
  hilliness: Hilliness;
  river: boolean;
  rocks: string[];
}

export interface WorldMapService {
  biome(): BiomeDef;
  hilliness(): Hilliness;
  terrainAt(x: number, y: number): TerrainDef;
  rockAt(x: number, y: number): RockDef | null;
  oreAt(x: number, y: number): OreDef | null;
  roofAt(x: number, y: number): number;
  /** 1 = normal soil. */
  fertilityAt(x: number, y: number): number;
  /** Walking time multiplier; 0 when the tile can't be walked (rock, deep water, off the map). */
  moveCost(x: number, y: number): number;
  isWalkable(x: number, y: number): boolean;
  isBuildable(x: number, y: number): boolean;
  /**
   * Digs out natural rock, leaving its floor (and any thin rock roof) behind.
   * Returns what was dug, or null when there was no rock.
   */
  mineRock(x: number, y: number): { rock: RockDef; ore: OreDef | null } | null;
}

const SOIL = TERRAIN[0] as TerrainDef;
const DEFAULT_BIOME = BIOMES[0] as BiomeDef;

/** Without the world module, the map is flat, open soil everywhere. */
export const worldMap = defineService<WorldMapService>('f1-world.map', {
  biome: () => DEFAULT_BIOME,
  hilliness: () => 'flat',
  terrainAt: () => SOIL,
  rockAt: () => null,
  oreAt: () => null,
  roofAt: () => ROOF.none,
  fertilityAt: () => 1,
  moveCost: () => 1,
  isWalkable: () => true,
  isBuildable: () => true,
  mineRock: () => null,
});
