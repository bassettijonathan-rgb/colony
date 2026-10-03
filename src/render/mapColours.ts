import { ORES } from '../content/ores';
import { ROCKS } from '../content/rocks';
import { TERRAIN } from '../content/terrain';
import type { Graphics } from 'pixi.js';
import { BUILDINGS } from '../content/buildings';
import { ITEMS } from '../content/items';
import { DESIGNATION } from '../modules/c1-work/api';
import { CONSTRUCTION_LAYER } from '../modules/c2-construction/api';
import { LAYER, ROOF } from '../modules/f1-world/api';
import type { MapSnapshot } from '../protocol';

type Rgb = [number, number, number];

function parse(hex: string): Rgb {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

const terrainRgb = TERRAIN.map((t) => parse(t.colour));
const rockRgb = ROCKS.map((r) => parse(r.colour));
const oreRgb = ORES.map((o) => parse(o.colour));

/** A little per-tile variation so large areas don't look flat. Not part of the simulation. */
function speckle(i: number): number {
  let h = Math.imul(i ^ 0x5bd1e995, 0x27d4eb2d);
  h ^= h >>> 15;
  return ((h & 255) / 255 - 0.5) * 0.08;
}

function shade([r, g, b]: Rgb, k: number): Rgb {
  const f = 1 + k;
  return [Math.min(255, r * f), Math.min(255, g * f), Math.min(255, b * f)];
}

/** Colour of every tile as RGBA bytes, ready for a canvas ImageData. */
export function colourMap(map: MapSnapshot): Uint8ClampedArray {
  const n = map.width * map.height;
  const out = new Uint8ClampedArray(n * 4);
  const terrain = map.layers[LAYER.terrain];
  const rock = map.layers[LAYER.rock];
  const ore = map.layers[LAYER.ore];
  const roof = map.layers[LAYER.roof];
  const elevation = map.layers[LAYER.elevation];

  for (let i = 0; i < n; i++) {
    let rgb: Rgb;
    if (!terrain) {
      // No world module: bare ground with a faint grid.
      const x = i % map.width;
      const y = Math.floor(i / map.width);
      rgb = x % 10 === 0 || y % 10 === 0 ? [52, 48, 40] : [44, 40, 33];
    } else {
      const r = rock?.[i] ?? 0;
      const o = ore?.[i] ?? 0;
      if (r > 0) {
        // Rock is greyed so it never reads as soil, with a dark cliff line where it meets open ground.
        const base = rockRgb[r - 1] ?? [110, 110, 110];
        rgb = [(base[0] + 120) / 2, (base[1] + 120) / 2, (base[2] + 120) / 2];
        const x = i % map.width;
        const w = map.width;
        const open = (j: number): boolean => (rock?.[j] ?? 1) === 0;
        const isEdge =
          (x > 0 && open(i - 1)) || (x < w - 1 && open(i + 1)) || (i >= w && open(i - w)) || (i + w < n && open(i + w));
        if (isEdge) rgb = shade(rgb, -0.5);
        else if (roof?.[i] === ROOF.overhead) rgb = shade(rgb, -0.2);
        if (o > 0) {
          const oc = oreRgb[o - 1] ?? rgb;
          rgb = [(rgb[0] + oc[0] * 2) / 3, (rgb[1] + oc[1] * 2) / 3, (rgb[2] + oc[2] * 2) / 3];
        }
      } else {
        rgb = terrainRgb[terrain[i] ?? 0] ?? [255, 0, 255];
        // Higher ground slightly lighter.
        rgb = shade(rgb, ((elevation?.[i] ?? 128) / 255 - 0.5) * 0.15);
        // Dug-out ground still under a rock roof is darker, so caves read as caves.
        if ((roof?.[i] ?? 0) === ROOF.rock || roof?.[i] === ROOF.overhead) rgb = shade(rgb, -0.3);
      }
      rgb = shade(rgb, speckle(i));
    }
    out[i * 4] = rgb[0];
    out[i * 4 + 1] = rgb[1];
    out[i * 4 + 2] = rgb[2];
    out[i * 4 + 3] = 255;
  }
  return out;
}

/** White over snowy tiles: a light dusting shows faintly, 20 cm or more covers the ground. */
export function snowOverlay(map: MapSnapshot, snowMm: ArrayLike<number>): Uint8ClampedArray {
  const n = map.width * map.height;
  const out = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    const mm = snowMm[i] ?? 0;
    if (mm === 0) continue;
    out[i * 4] = 236;
    out[i * 4 + 1] = 240;
    out[i * 4 + 2] = 245;
    out[i * 4 + 3] = Math.round(255 * Math.min(0.92, 0.25 + mm / 270));
  }
  return out;
}

/** Tiles the player has marked for work, as a translucent overlay. Transparent where unmarked. */
export function designationOverlay(map: MapSnapshot, marks: ArrayLike<number>): Uint8ClampedArray {
  const out = new Uint8ClampedArray(map.width * map.height * 4);
  for (let i = 0; i < marks.length; i++) {
    if (marks[i] === DESIGNATION.mine) {
      // A checker of two ambers, so marked rock reads as "to dig" and still shows the rock underneath.
      const x = i % map.width;
      const y = (i - x) / map.width;
      const light = (x + y) % 2 === 0;
      out.set(light ? [255, 196, 64, 150] : [230, 160, 40, 110], i * 4);
    }
  }
  return out;
}

const buildingRgb = BUILDINGS.map((b) => parse(b.colour));
const itemColour = ITEMS.map((i) => parseInt(i.colour.slice(1), 16));

/** Finished walls and doors, drawn solid over the ground. */
export function buildingOverlay(map: MapSnapshot, built: ArrayLike<number>): Uint8ClampedArray {
  const out = new Uint8ClampedArray(map.width * map.height * 4);
  for (let i = 0; i < built.length; i++) {
    const b = built[i] ?? 0;
    if (b === 0) continue;
    const rgb = shade(buildingRgb[b - 1] ?? [255, 0, 255], speckle(i) * 0.5);
    out.set([rgb[0], rgb[1], rgb[2], 255], i * 4);
  }
  return out;
}

/** Blueprints: a pale blue ghost of the building. */
export function blueprintOverlay(map: MapSnapshot, plans: ArrayLike<number>): Uint8ClampedArray {
  const out = new Uint8ClampedArray(map.width * map.height * 4);
  for (let i = 0; i < plans.length; i++) {
    const b = plans[i] ?? 0;
    if (b === 0) continue;
    const [r, g, bl] = buildingRgb[b - 1] ?? [255, 0, 255];
    out.set([(r + 110) / 2, (g + 170) / 2, (bl + 230) / 2, 140], i * 4);
  }
  return out;
}

/** Stacks of items as small squares, a bigger square for a bigger stack. */
export function drawItems(g: Graphics, map: MapSnapshot, tilePx: number): void {
  const kinds = map.layers[CONSTRUCTION_LAYER.item];
  const counts = map.layers[CONSTRUCTION_LAYER.itemCount];
  if (!kinds) return;
  for (let i = 0; i < kinds.length; i++) {
    const k = kinds[i] ?? 0;
    if (k === 0) continue;
    const x = i % map.width;
    const y = (i - x) / map.width;
    const full = Math.min(1, (counts?.[i] ?? 1) / (ITEMS[k - 1]?.stack ?? 1));
    const size = tilePx * (0.45 + 0.25 * full);
    const pad = (tilePx - size) / 2;
    g.rect(x * tilePx + pad, y * tilePx + pad, size, size).fill(itemColour[k - 1] ?? 0xff00ff).stroke({ color: 0x1a1a1a, width: 0.75 });
  }
}
