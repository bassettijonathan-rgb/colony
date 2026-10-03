import type { Simulation } from '../src/core';
import { CONSTRUCTION_LAYER } from '../src/modules/c2-construction';
import { worldMap } from '../src/modules/f1-world';
import { people } from '../src/modules/f3-people';

const itemAt = (sim: Simulation, x: number, y: number) =>
  (sim.world.layers[CONSTRUCTION_LAYER.item] as Uint16Array | undefined)?.[y * sim.world.width + x] ?? 0;

/** The top-left corner of a clear, buildable w x h area near home, without items on it. */
export function clearArea(sim: Simulation, w: number, h: number, dx = 4, dy = -8): { x: number; y: number } {
  const map = sim.services.get(worldMap);
  const home = sim.services.get(people).home();
  for (let r = 0; r < 30; r++) {
    for (let y = home.y + dy - r; y <= home.y + dy + r; y++) {
      for (let x = home.x + dx - r; x <= home.x + dx + r; x++) {
        let ok = true;
        for (let yy = y - 1; yy <= y + h && ok; yy++) {
          for (let xx = x - 1; xx <= x + w && ok; xx++) {
            ok = map.isBuildable(xx, yy) && itemAt(sim, xx, yy) === 0;
          }
        }
        if (ok) return { x, y };
      }
    }
  }
  throw new Error('no clear area');
}

/** The rock tiles nearest home that can be dug from open ground. */
export function rockFaces(sim: Simulation, count: number): { x: number; y: number }[] {
  const map = sim.services.get(worldMap);
  const home = sim.services.get(people).home();
  const faces: { x: number; y: number; d: number }[] = [];
  for (let y = 1; y < sim.world.height - 1; y++) {
    for (let x = 1; x < sim.world.width - 1; x++) {
      if (!map.rockAt(x, y)) continue;
      if (map.isWalkable(x + 1, y) || map.isWalkable(x - 1, y) || map.isWalkable(x, y + 1) || map.isWalkable(x, y - 1)) {
        faces.push({ x, y, d: (x - home.x) ** 2 + (y - home.y) ** 2 });
      }
    }
  }
  return faces.sort((a, b) => a.d - b.d || a.y - b.y || a.x - b.x).slice(0, count);
}

