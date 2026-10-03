import { BUILDINGS } from '../content/buildings';
import { ITEMS } from '../content/items';
import { ORES } from '../content/ores';
import { ROCKS } from '../content/rocks';
import { TERRAIN } from '../content/terrain';
import { DESIGNATION, DESIGNATION_LAYER } from '../modules/c1-work/api';
import { CONSTRUCTION_LAYER } from '../modules/c2-construction/api';
import { ROOM_LAYER } from '../modules/c2-rooms/api';
import { LAYER, ROOF } from '../modules/f1-world/api';
import type { MapSnapshot } from '../protocol';

/** One line describing a tile, for the hover readout. */
export function describeTile(map: MapSnapshot, x: number, y: number): string {
  const i = y * map.width + x;
  const terrain = map.layers[LAYER.terrain];
  if (!terrain) return `${x}, ${y}`;
  const rock = ROCKS[(map.layers[LAYER.rock]?.[i] ?? 0) - 1];
  const ore = ORES[(map.layers[LAYER.ore]?.[i] ?? 0) - 1];
  const roof = map.layers[LAYER.roof]?.[i] ?? 0;
  const parts: string[] = [];
  if (rock) {
    parts.push(ore ? `${ore.name} in ${rock.name.toLowerCase()}` : rock.name);
    parts.push(roof === ROOF.overhead ? 'deep inside the mountain' : 'thin rock roof');
  } else {
    const ground = TERRAIN[terrain[i] ?? 0];
    parts.push(ground?.name ?? '?');
    const fertility = map.layers[LAYER.fertility]?.[i] ?? 0;
    if (fertility > 0) parts.push(`fertility ${fertility}%`);
    if (roof === ROOF.rock || roof === ROOF.overhead) parts.push('under a rock roof');
    if (ground && ground.moveCost === 0) parts.push('impassable');
    else if (ground && ground.moveCost > 1) parts.push(`slow going (x${ground.moveCost})`);
  }
  if (map.layers[DESIGNATION_LAYER]?.[i] === DESIGNATION.mine) parts.push('marked for mining');
  const built = BUILDINGS[(map.layers[CONSTRUCTION_LAYER.building]?.[i] ?? 0) - 1];
  if (built) parts.unshift(built.name);
  const plan = BUILDINGS[(map.layers[CONSTRUCTION_LAYER.blueprint]?.[i] ?? 0) - 1];
  if (plan) parts.push(`${plan.name.toLowerCase()} planned`);
  const item = ITEMS[(map.layers[CONSTRUCTION_LAYER.item]?.[i] ?? 0) - 1];
  if (item) parts.push(`${item.name} x${map.layers[CONSTRUCTION_LAYER.itemCount]?.[i] ?? 0}`);
  const room = map.layers[ROOM_LAYER]?.[i] ?? 0;
  if (room >= 2) parts.push(describeRoom(map, room));
  const snowMm = map.layers.snow?.[i] ?? 0;
  if (snowMm > 0) parts.push(`snow ${Math.max(1, Math.round(snowMm / 10))} cm`);
  return `${x}, ${y}: ${parts.join(', ')}`;
}

/** "in a room of 9 tiles, roofed" */
function describeRoom(map: MapSnapshot, id: number): string {
  const ids = map.layers[ROOM_LAYER] as ArrayLike<number>;
  const roofs = map.layers[LAYER.roof];
  let size = 0;
  let roofed = 0;
  for (let i = 0; i < ids.length; i++) {
    if (ids[i] !== id) continue;
    size++;
    if ((roofs?.[i] ?? 0) !== ROOF.none) roofed++;
  }
  const cover = roofed === size ? 'roofed' : roofed === 0 ? 'open to the sky' : `${Math.round((roofed / size) * 100)}% roofed`;
  return `in a room of ${size} tile${size === 1 ? '' : 's'}, ${cover}`;
}
