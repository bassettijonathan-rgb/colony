import { ORES } from '../content/ores';
import { ROCKS } from '../content/rocks';
import { TERRAIN } from '../content/terrain';
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
    if (ground && ground.moveCost === 0) parts.push('impassable');
    else if (ground && ground.moveCost > 1) parts.push(`slow going (x${ground.moveCost})`);
  }
  const snowMm = map.layers.snow?.[i] ?? 0;
  if (snowMm > 0) parts.push(`snow ${Math.max(1, Math.round(snowMm / 10))} cm`);
  return `${x}, ${y}: ${parts.join(', ')}`;
}
