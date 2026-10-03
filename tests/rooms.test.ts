import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/core';
import { ALL_MODULES } from '../src/modules';
import { AUTO_ROOF_MAX, OUTDOORS, rooms } from '../src/modules/c2-rooms';
import { ROOF, worldMap } from '../src/modules/f1-world';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../src/modules/f2-time';
import { clearArea, rockFaces } from './mapHelpers';

function newColony(seed: number, hills: 'flat' | 'mountainous' = 'flat'): Simulation {
  return Simulation.create({
    seed,
    modules: ALL_MODULES,
    width: 80,
    height: 80,
    settings: {
      'f1-world': { hilliness: hills, river: false },
      'f2-time': { startSeason: 'summer', startHour: 7 },
      'f3-people': { colonists: 6 },
    },
  });
}

/** Lays a door in the middle of the bottom edge, then steel walls round a w x h box. */
function hut(sim: Simulation, a: { x: number; y: number }, w: number, h: number): { x: number; y: number } {
  const door = { x: a.x + Math.floor(w / 2), y: a.y + h - 1 };
  sim.enqueue({ type: 'place-blueprints', payload: { building: 'door', x0: door.x, y0: door.y, x1: door.x, y1: door.y } });
  sim.enqueue({ type: 'place-blueprints', payload: { building: 'steel-wall', x0: a.x, y0: a.y, x1: a.x + w - 1, y1: a.y + h - 1 } });
  return door;
}

describe('rooms', () => {
  it('start out with all open ground outdoors', () => {
    const sim = newColony(1);
    sim.step(1);
    const space = sim.services.get(rooms);
    expect(space.rooms()).toEqual([]);
    expect(space.roomAt(10, 10)).toEqual({ id: OUTDOORS, size: 0, enclosed: false, roofed: 0 });
  });

  it('form inside a finished hut, which gets a roof; the walls and door belong to no room', () => {
    const sim = newColony(2);
    const a = clearArea(sim, 5, 5);
    const door = hut(sim, a, 5, 5);
    sim.step(TICKS_PER_DAY);
    const space = sim.services.get(rooms);
    const map = sim.services.get(worldMap);
    expect(space.rooms().length).toBe(1);
    const inside = space.roomAt(a.x + 2, a.y + 2);
    expect(inside).toMatchObject({ size: 9, enclosed: true, roofed: 1 });
    expect(space.roomAt(a.x, a.y)).toBeNull();
    expect(space.roomAt(door.x, door.y)).toBeNull();
    expect(space.roomAt(a.x - 2, a.y)?.enclosed).toBe(false);
    expect(map.roofAt(a.x + 1, a.y + 1)).toBe(ROOF.constructed);
    expect(map.roofAt(a.x - 2, a.y)).toBe(ROOF.none);
  });

  it('stay open while a wall is missing', () => {
    const sim = newColony(3);
    const a = clearArea(sim, 5, 5);
    hut(sim, a, 5, 5);
    // Take one wall out of the plan before anyone builds it.
    sim.enqueue({ type: 'cancel-designations', payload: { x0: a.x, y0: a.y + 2, x1: a.x, y1: a.y + 2 } });
    sim.step(TICKS_PER_DAY);
    const space = sim.services.get(rooms);
    expect(space.rooms()).toEqual([]);
    expect(space.roomAt(a.x + 2, a.y + 2)?.enclosed).toBe(false);
    expect(sim.services.get(worldMap).roofAt(a.x + 2, a.y + 2)).toBe(ROOF.none);
  });

  it('include a cave dug into rock once it is closed off by a door', () => {
    const sim = newColony(4, 'mountainous');
    const map = sim.services.get(worldMap);
    const rock = (x: number, y: number) => map.rockAt(x, y) !== null;
    const dirs: [number, number][] = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    // A rock face with open ground in front, where the tile behind it (the chamber) has rock on its
    // other three sides and the mouth has rock on both flanks.
    let found: { mouth: { x: number; y: number }; chamber: { x: number; y: number } } | null = null;
    for (const t of rockFaces(sim, 60)) {
      for (const [dx, dy] of dirs) {
        if (!map.isWalkable(t.x - dx, t.y - dy)) continue;
        const c = { x: t.x + dx, y: t.y + dy };
        const sealed =
          rock(c.x, c.y) && rock(c.x + dx, c.y + dy) && rock(c.x + dy, c.y + dx) && rock(c.x - dy, c.y - dx) && rock(t.x + dy, t.y + dx) && rock(t.x - dy, t.y - dx);
        if (sealed) found ??= { mouth: t, chamber: c };
      }
    }
    if (!found) return; // no straight rock face on this map
    const { mouth, chamber } = found;
    for (const t of [mouth, chamber]) sim.enqueue({ type: 'designate-mine', payload: { x0: t.x, y0: t.y, x1: t.x, y1: t.y } });
    sim.step(TICKS_PER_HOUR * 8);
    expect(map.rockAt(chamber.x, chamber.y)).toBeNull();
    // Still open to the outside through the mouth.
    expect(sim.services.get(rooms).roomAt(chamber.x, chamber.y)?.enclosed).toBe(false);

    // The chunk dug from the mouth is moved aside when the door goes up.
    sim.enqueue({ type: 'place-blueprints', payload: { building: 'door', x0: mouth.x, y0: mouth.y, x1: mouth.x, y1: mouth.y } });
    sim.step(TICKS_PER_DAY);
    expect(sim.services.get(rooms).roomAt(chamber.x, chamber.y)).toMatchObject({ size: 1, enclosed: true, roofed: 1 });
  });

  it('roof small enclosures but leave big ones open to the sky', () => {
    const sim = newColony(5);
    const space = sim.services.get(rooms);
    const map = sim.services.get(worldMap);
    const built = sim.world.layers['building'] as Uint16Array;
    const wall = (x0: number, y0: number, side: number) => {
      for (let y = y0; y < y0 + side; y++) {
        for (let x = x0; x < x0 + side; x++) {
          if (x === x0 || y === y0 || x === x0 + side - 1 || y === y0 + side - 1) built[y * sim.world.width + x] = 2; // steel wall
        }
      }
    };
    const big = Math.ceil(Math.sqrt(AUTO_ROOF_MAX)) + 3;
    wall(2, 2, big);
    wall(big + 5, 2, 6);
    (sim.world.modules['c2-rooms'] as { dirty: boolean }).dirty = true;
    sim.step(12);
    expect(space.rooms().map((r) => r.size).sort((a, b) => a - b)).toEqual([16, (big - 2) ** 2]);
    expect(space.roomAt(big + 7, 4)).toMatchObject({ enclosed: true, roofed: 1 });
    expect(space.roomAt(4, 4)).toMatchObject({ enclosed: true, roofed: 0 });
    expect(map.roofAt(4, 4)).toBe(ROOF.none);
  });
});

describe('rooms module as a whole', () => {
  it('is deterministic and survives save and load', () => {
    const a = newColony(6);
    hut(a, clearArea(a, 4, 4), 4, 4);
    a.step(TICKS_PER_HOUR * 3);
    const b = Simulation.load(JSON.parse(JSON.stringify(a.save())), a.modules);
    a.step(TICKS_PER_DAY / 2);
    b.step(TICKS_PER_DAY / 2);
    expect(b.hash()).toBe(a.hash());
    expect(b.services.get(rooms).rooms()).toEqual(a.services.get(rooms).rooms());
  });

  it('works out a full map of rooms quickly', () => {
    const sim = Simulation.create({ seed: 9, modules: ALL_MODULES, settings: { 'f1-world': { hilliness: 'mountainous' } } });
    const state = sim.world.modules['c2-rooms'] as { dirty: boolean };
    sim.step(1);
    state.dirty = true;
    const t0 = performance.now();
    sim.step(12);
    expect(performance.now() - t0).toBeLessThan(200);
  });
});
