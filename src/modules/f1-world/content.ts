import { BIOMES, HILLINESS } from '../../content/biomes';
import { ORES } from '../../content/ores';
import { ROCKS } from '../../content/rocks';
import { TERRAIN } from '../../content/terrain';
import { check, checkColour, checkRange, checkUniqueIds } from '../../content/validate';

/** Checks the world content files. Throws a ContentError naming the problem. */
export function validateWorldContent(): void {
  checkUniqueIds('terrain', TERRAIN);
  check(TERRAIN.length <= 255, 'terrain: at most 255 types fit in a tile layer');
  for (const t of TERRAIN) {
    checkColour('terrain', t.id, t.colour);
    checkRange('terrain', t.id, 'moveCost', t.moveCost, 0, 10);
    checkRange('terrain', t.id, 'fertility', t.fertility, 0, 2);
  }
  for (const id of ['soil', 'rich-soil', 'gravel', 'sand', 'marsh', 'shallow-water', 'deep-water', 'rough-stone', 'ice']) {
    check(
      TERRAIN.some((t) => t.id === id),
      `terrain: map generation needs "${id}"`,
    );
  }

  checkUniqueIds('rocks', ROCKS);
  check(ROCKS.length < 255, 'rocks: at most 254 types fit in a tile layer');
  for (const r of ROCKS) {
    checkColour('rocks', r.id, r.colour);
    checkRange('rocks', r.id, 'hardness', r.hardness, 0.1, 10);
  }

  checkUniqueIds('ores', ORES);
  check(ORES.length < 255, 'ores: at most 254 types fit in a tile layer');
  for (const o of ORES) {
    checkColour('ores', o.id, o.colour);
    checkRange('ores', o.id, 'veinsPer1000', o.veinsPer1000, 0, 100);
    check(o.veinSize[0] >= 1 && o.veinSize[0] <= o.veinSize[1], `ores: "${o.id}" veinSize must be [min, max] with 1 <= min <= max`);
  }

  checkUniqueIds('biomes', BIOMES);
  for (const b of BIOMES) {
    for (const field of ['water', 'marsh', 'riverChance', 'richSoil', 'gravel', 'sand'] as const) {
      checkRange('biomes', b.id, field, b[field], 0, 1);
    }
    check(b.richSoil + b.gravel + b.sand <= 1, `biomes: "${b.id}" richSoil + gravel + sand is more than 1`);
    check(b.water + b.marsh + HILLINESS.mountainous.rock < 0.9, `biomes: "${b.id}" leaves too little open ground`);
    check(b.rocks.length >= 1, `biomes: "${b.id}" needs at least one rock type`);
    for (const r of b.rocks) check(ROCKS.some((x) => x.id === r), `biomes: "${b.id}" uses unknown rock "${r}"`);
  }
}
