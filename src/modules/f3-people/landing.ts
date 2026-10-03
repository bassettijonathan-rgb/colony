import { inBounds, type Rng, type World } from '../../core';
import type { WorldMapService } from '../f1-world/api';

/** Side of the square that must be mostly open, buildable ground around the landing site. */
const SITE = 9;

/**
 * Finds a landing site: the open, buildable spot nearest the middle of the
 * map, searching outwards ring by ring.
 */
export function findLandingSite(world: World, map: WorldMapService): { x: number; y: number } {
  const cx = Math.floor(world.width / 2);
  const cy = Math.floor(world.height / 2);
  const half = Math.floor(SITE / 2);
  const need = Math.ceil(SITE * SITE * 0.9);
  const maxRadius = Math.max(world.width, world.height);
  for (let r = 0; r < maxRadius; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (!inBounds(world, x, y) || !map.isBuildable(x, y)) continue;
        let open = 0;
        for (let sy = -half; sy <= half; sy++) {
          for (let sx = -half; sx <= half; sx++) if (map.isBuildable(x + sx, y + sy)) open++;
        }
        if (open >= need) return { x, y };
      }
    }
  }
  // No good site anywhere: fall back to any walkable tile nearest the middle.
  for (let r = 0; r < maxRadius; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (map.isWalkable(cx + dx, cy + dy)) return { x: cx + dx, y: cy + dy };
      }
    }
  }
  return { x: cx, y: cy };
}

/** Walkable tiles around the site, nearest first with a little shuffle, for colonists to stand on. */
export function spawnTiles(world: World, map: WorldMapService, rng: Rng, site: { x: number; y: number }, count: number): { x: number; y: number }[] {
  const tiles: { x: number; y: number; d: number }[] = [];
  for (let r = 0; tiles.length < count && r < Math.max(world.width, world.height); r++) {
    const ring: { x: number; y: number; d: number }[] = [];
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (map.isWalkable(site.x + dx, site.y + dy)) ring.push({ x: site.x + dx, y: site.y + dy, d: r });
      }
    }
    while (ring.length > 0 && tiles.length < count) tiles.push(ring.splice(rng.int(ring.length), 1)[0] as (typeof ring)[number]);
  }
  return tiles;
}
