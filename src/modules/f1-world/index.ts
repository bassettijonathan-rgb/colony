import { defineModule, inBounds, touchLayer, type World } from '../../core';
import { BIOMES, HILLINESS, type BiomeDef, type Hilliness } from '../../content/biomes';
import { ORES } from '../../content/ores';
import { ROCKS } from '../../content/rocks';
import { TERRAIN, type TerrainDef } from '../../content/terrain';
import { LAYER, ROOF, TILE_RULES, WORLD_MODULE_ID, worldMap, type TileRule, type WorldSettings, type WorldState } from './api';
import { validateWorldContent } from './content';
import { generateMap } from './generate';

export * from './api';

function readSettings(world: World): WorldSettings {
  const raw = world.settings[WORLD_MODULE_ID];
  return raw && typeof raw === 'object' ? (raw as WorldSettings) : {};
}

function findBiome(id: string): BiomeDef {
  const biome = BIOMES.find((b) => b.id === id);
  if (!biome) throw new Error(`Unknown biome "${id}". Choose from: ${BIOMES.map((b) => b.id).join(', ')}`);
  return biome;
}

/**
 * F1 World and map: generates the site map from the seed and the chosen
 * biome, and answers questions about tiles (what ground, what rock, can you
 * walk or build here).
 */
export const worldModule = defineModule<WorldState>({
  id: WORLD_MODULE_ID,
  name: 'World and map',
  layer: 'foundation',

  init: (ctx) => {
    validateWorldContent();
    const settings = readSettings(ctx.world);
    const biome = findBiome(settings.biome ?? 'temperate-forest');
    const hilliness: Hilliness = settings.hilliness ?? 'large-hills';
    if (!(hilliness in HILLINESS)) {
      throw new Error(`Unknown hilliness "${hilliness}". Choose from: ${Object.keys(HILLINESS).join(', ')}`);
    }
    const river = settings.river ?? ctx.rng.chance(biome.riverChance);

    // Each map uses two or three of the biome's rock types.
    const pool = [...biome.rocks];
    const count = Math.min(pool.length, ctx.rng.range(2, 3));
    const rocks: string[] = [];
    for (let k = 0; k < count; k++) rocks.push(pool.splice(ctx.rng.int(pool.length), 1)[0] as string);

    generateMap(ctx.world, ctx.rng, { biome, hilliness, river, rocks });
    return { biome: biome.id, hilliness, river, rocks };
  },

  setup: (ctx) => {
    validateWorldContent();
    const world = ctx.world;
    const state = ctx.state;
    const biome = findBiome(state.biome);
    const layer = (name: string): Uint8Array => world.layers[name] as Uint8Array;
    const at = (x: number, y: number): number => y * world.width + x;
    const terrainAt = (x: number, y: number): TerrainDef => TERRAIN[layer(LAYER.terrain)[at(x, y)] ?? 0] as TerrainDef;
    const hasRock = (x: number, y: number): boolean => layer(LAYER.rock)[at(x, y)] !== 0;
    // Rules other modules add (walls, doors). Re-read only when the registry grows.
    const registry = ctx.registries.define(TILE_RULES);
    let rules: TileRule[] = [];
    const currentRules = (): TileRule[] => {
      if (rules.length !== registry.size) rules = registry.all().map(([, rule]) => rule);
      return rules;
    };
    const moveCost = (x: number, y: number): number => {
      if (!inBounds(world, x, y) || hasRock(x, y)) return 0;
      let cost = terrainAt(x, y).moveCost;
      for (const rule of currentRules()) {
        if (cost === 0) break;
        const extra = rule.moveCost?.(x, y);
        if (extra !== undefined) cost *= extra;
      }
      return cost;
    };

    ctx.services.provide(worldMap, {
      biome: () => biome,
      hilliness: () => state.hilliness,
      terrainAt,
      rockAt: (x, y) => ROCKS[(layer(LAYER.rock)[at(x, y)] ?? 0) - 1] ?? null,
      oreAt: (x, y) => ORES[(layer(LAYER.ore)[at(x, y)] ?? 0) - 1] ?? null,
      roofAt: (x, y) => layer(LAYER.roof)[at(x, y)] ?? 0,
      fertilityAt: (x, y) => (layer(LAYER.fertility)[at(x, y)] ?? 0) / 100,
      moveCost,
      isWalkable: (x, y) => moveCost(x, y) > 0,
      isBuildable: (x, y) =>
        inBounds(world, x, y) && !hasRock(x, y) && terrainAt(x, y).buildable && currentRules().every((r) => r.buildable?.(x, y) !== false),
      mineRock: (x, y) => {
        if (!inBounds(world, x, y)) return null;
        const i = at(x, y);
        const rock = ROCKS[(layer(LAYER.rock)[i] ?? 0) - 1];
        if (!rock) return null;
        const ore = ORES[(layer(LAYER.ore)[i] ?? 0) - 1] ?? null;
        layer(LAYER.rock)[i] = 0;
        layer(LAYER.ore)[i] = 0;
        touchLayer(world, LAYER.rock);
        if (ore) touchLayer(world, LAYER.ore);
        return { rock, ore };
      },
      buildRoof: (x, y) => {
        if (!inBounds(world, x, y) || hasRock(x, y)) return false;
        const roofs = layer(LAYER.roof);
        const i = at(x, y);
        if (roofs[i] !== ROOF.none) return false;
        roofs[i] = ROOF.constructed;
        touchLayer(world, LAYER.roof);
        return true;
      },
    });
  },
});
