import { describe, expect, it } from 'vitest';
import { Simulation, type EntityId, type SignalMap } from '../src/core';
import { ALL_MODULES } from '../src/modules';
import { workBoard } from '../src/modules/c1-work';
import {
  BLUEPRINT_COMPONENT,
  CONSTRUCTION_LAYER,
  ITEM_COMPONENT,
  stock,
  type Blueprint,
  type ConstructionState,
  type ItemStack,
} from '../src/modules/c2-construction';
import { worldMap } from '../src/modules/f1-world';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../src/modules/f2-time';
import { people } from '../src/modules/f3-people';

type Finished = SignalMap['building-finished'];

function newColony(seed: number, opts: { colonists?: number; hills?: 'flat' | 'mountainous' } = {}) {
  const finished: Finished[] = [];
  const recorder = {
    id: 'test-recorder',
    name: 'Recorder',
    layer: 'living' as const,
    listen: { 'building-finished': (_: unknown, p: Finished) => void finished.push(p) },
  };
  const sim = Simulation.create({
    seed,
    modules: [...ALL_MODULES, recorder],
    width: 80,
    height: 80,
    settings: {
      'f1-world': { hilliness: opts.hills ?? 'flat', river: false },
      'f2-time': { startSeason: 'summer', startHour: 7 },
      'f3-people': { colonists: opts.colonists ?? 6 },
    },
  });
  return { sim, finished };
}

const itemsOf = (sim: Simulation) => [...((sim.world.components[ITEM_COMPONENT] ?? new Map()) as Map<EntityId, ItemStack>).values()];
const blueprintsOf = (sim: Simulation) => [...((sim.world.components[BLUEPRINT_COMPONENT] ?? new Map()) as Map<EntityId, Blueprint>).values()];
const steel = (sim: Simulation) => sim.services.get(stock).totals().steel ?? 0;
const at = (sim: Simulation, name: string, x: number, y: number) => (sim.world.layers[name] as Uint16Array)[y * sim.world.width + x] ?? 0;

/** The top-left corner of a clear, buildable w x h area near home, without items on it. */
function clearArea(sim: Simulation, w: number, h: number, dx = 4, dy = -8): { x: number; y: number } {
  const map = sim.services.get(worldMap);
  const home = sim.services.get(people).home();
  for (let r = 0; r < 30; r++) {
    for (let y = home.y + dy - r; y <= home.y + dy + r; y++) {
      for (let x = home.x + dx - r; x <= home.x + dx + r; x++) {
        let ok = true;
        for (let yy = y - 1; yy <= y + h && ok; yy++) {
          for (let xx = x - 1; xx <= x + w && ok; xx++) {
            ok = map.isBuildable(xx, yy) && at(sim, CONSTRUCTION_LAYER.item, xx, yy) === 0;
          }
        }
        if (ok) return { x, y };
      }
    }
  }
  throw new Error('no clear area');
}

/** The rock tiles nearest home that can be dug from open ground. */
function rockFaces(sim: Simulation, count: number): { x: number; y: number }[] {
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

describe('items', () => {
  it('land with 300 steel in full stacks, one stack per tile, on walkable ground near home', () => {
    const { sim } = newColony(1);
    const map = sim.services.get(worldMap);
    expect(sim.services.get(stock).totals()).toEqual({ steel: 300 });
    const stacks = itemsOf(sim);
    expect(stacks.map((s) => s.count)).toEqual([75, 75, 75, 75]);
    expect(new Set(stacks.map((s) => `${s.x},${s.y}`)).size).toBe(4);
    for (const s of stacks) {
      expect(map.isWalkable(s.x, s.y)).toBe(true);
      expect(at(sim, CONSTRUCTION_LAYER.itemCount, s.x, s.y)).toBe(75);
    }
  });

  it('come out of mined rock: a chunk of the rock, or a pile of ore', () => {
    const { sim } = newColony(2, { hills: 'mountainous' });
    const map = sim.services.get(worldMap);
    const targets = rockFaces(sim, 3);
    const expected = targets.map((t) => {
      const ore = map.oreAt(t.x, t.y);
      return ore ? `${ore.id}-ore` : `${map.rockAt(t.x, t.y)?.id}-chunk`;
    });
    for (const t of targets) sim.enqueue({ type: 'designate-mine', payload: { x0: t.x, y0: t.y, x1: t.x, y1: t.y } });
    sim.step(TICKS_PER_HOUR * 6);
    for (const t of targets) expect(map.rockAt(t.x, t.y)).toBeNull();
    const totals = sim.services.get(stock).totals();
    for (const def of expected) expect(totals[def]).toBeGreaterThan(0);
  });
});

describe('building', () => {
  it('turns a door and an outline of steel walls into a hut that blocks walking except at the door', () => {
    const { sim, finished } = newColony(3);
    const map = sim.services.get(worldMap);
    const a = clearArea(sim, 5, 5);
    const door = { x: a.x + 2, y: a.y + 4 };
    sim.enqueue({ type: 'place-blueprints', payload: { building: 'door', x0: door.x, y0: door.y, x1: door.x, y1: door.y } });
    sim.enqueue({ type: 'place-blueprints', payload: { building: 'steel-wall', x0: a.x, y0: a.y, x1: a.x + 4, y1: a.y + 4 } });
    sim.step(1);
    expect(blueprintsOf(sim).length).toBe(16); // 15 walls around the door, plus the door

    sim.step(TICKS_PER_DAY);
    expect(blueprintsOf(sim)).toEqual([]);
    expect(finished.length).toBe(16);
    expect(map.isWalkable(a.x, a.y)).toBe(false);
    expect(map.isBuildable(a.x, a.y)).toBe(false);
    expect(map.isWalkable(door.x, door.y)).toBe(true);
    expect(map.moveCost(door.x, door.y)).toBeGreaterThan(map.moveCost(a.x + 2, a.y + 2));
    expect(map.isWalkable(a.x + 2, a.y + 2)).toBe(true); // the inside stays open
    expect(steel(sim)).toBe(300 - 15 * 5 - 25);
    expect(sim.services.get(workBoard).jobs()).toEqual([]);
  });

  it('waits for stone before building stone walls, then builds them from dug-out chunks', () => {
    const { sim, finished } = newColony(4, { hills: 'mountainous' });
    const a = clearArea(sim, 3, 1);
    sim.enqueue({ type: 'place-blueprints', payload: { building: 'stone-wall', x0: a.x, y0: a.y, x1: a.x + 2, y1: a.y } });
    sim.step(TICKS_PER_HOUR * 2);
    expect(finished).toEqual([]);
    expect(sim.services.get(workBoard).jobs()).toEqual([]);

    const map = sim.services.get(worldMap);
    const rock = rockFaces(sim, 12).filter((t) => !map.oreAt(t.x, t.y)).slice(0, 3);
    for (const t of rock) sim.enqueue({ type: 'designate-mine', payload: { x0: t.x, y0: t.y, x1: t.x, y1: t.y } });
    sim.step(TICKS_PER_DAY);
    expect(finished.map((f) => f.building)).toEqual(['stone-wall', 'stone-wall', 'stone-wall']);
    expect(Object.keys(sim.services.get(stock).totals()).filter((k) => k.endsWith('-chunk'))).toEqual([]);
  });

  it('gives back materials already brought when a blueprint is cancelled', () => {
    const { sim } = newColony(5);
    const a = clearArea(sim, 6, 1);
    sim.enqueue({ type: 'place-blueprints', payload: { building: 'steel-wall', x0: a.x, y0: a.y, x1: a.x + 5, y1: a.y } });
    for (let k = 0; k < 400 && !blueprintsOf(sim).some((b) => Object.keys(b.delivered).length > 0); k++) sim.step(10);
    expect(blueprintsOf(sim).some((b) => Object.keys(b.delivered).length > 0)).toBe(true);
    sim.enqueue({ type: 'cancel-designations', payload: { x0: a.x, y0: a.y, x1: a.x + 5, y1: a.y } });
    sim.step(1);
    expect(blueprintsOf(sim)).toEqual([]);
    expect(steel(sim)).toBe(300);
    expect((sim.world.modules['c2-construction'] as ConstructionState).hauls.size).toBe(0);
    for (const s of itemsOf(sim)) expect(s.reserved).toBe(0);
    sim.step(TICKS_PER_HOUR);
    expect(sim.services.get(workBoard).jobs()).toEqual([]);
  });

  it('leaves materials where they are when nobody hauls', () => {
    const { sim, finished } = newColony(6, { colonists: 3 });
    for (const id of sim.services.get(people).ids()) {
      sim.enqueue({ type: 'set-work-priority', payload: { id, workType: 'hauling', priority: 0 } });
    }
    const a = clearArea(sim, 3, 1);
    sim.enqueue({ type: 'place-blueprints', payload: { building: 'steel-wall', x0: a.x, y0: a.y, x1: a.x + 2, y1: a.y } });
    sim.step(TICKS_PER_HOUR * 4);
    expect(finished).toEqual([]);
    expect(blueprintsOf(sim).every((b) => Object.keys(b.delivered).length === 0)).toBe(true);
  });

  it('only lays blueprints on clear buildable ground', () => {
    const { sim } = newColony(7, { hills: 'mountainous' });
    const rock = rockFaces(sim, 1)[0] as { x: number; y: number };
    const stack = itemsOf(sim)[0] as ItemStack;
    sim.enqueue({ type: 'place-blueprints', payload: { building: 'door', x0: rock.x, y0: rock.y, x1: rock.x, y1: rock.y } });
    sim.enqueue({ type: 'place-blueprints', payload: { building: 'door', x0: stack.x, y0: stack.y, x1: stack.x, y1: stack.y } });
    sim.enqueue({ type: 'place-blueprints', payload: { building: 'castle', x0: 0, y0: 0, x1: 3, y1: 3 } });
    sim.step(1);
    expect(blueprintsOf(sim)).toEqual([]);
  });
});

describe('construction module as a whole', () => {
  it('is deterministic and survives save and load in the middle of hauling', () => {
    const { sim: a } = newColony(8);
    const area = clearArea(a, 4, 4);
    a.enqueue({ type: 'place-blueprints', payload: { building: 'steel-wall', x0: area.x, y0: area.y, x1: area.x + 3, y1: area.y + 3 } });
    a.step(TICKS_PER_HOUR);
    expect((a.world.modules['c2-construction'] as ConstructionState).hauls.size).toBeGreaterThan(0);
    const b = Simulation.load(JSON.parse(JSON.stringify(a.save())), a.modules);
    a.step(TICKS_PER_HOUR * 3);
    b.step(TICKS_PER_HOUR * 3);
    expect(b.hash()).toBe(a.hash());
  });

  it('has no items when switched off, and mining still works', () => {
    const sim = Simulation.create({
      seed: 2,
      modules: ALL_MODULES,
      disabled: ['c2-construction'],
      width: 80,
      height: 80,
      settings: { 'f1-world': { hilliness: 'mountainous' } },
    });
    expect(sim.services.get(stock).totals()).toEqual({});
    const t = rockFaces(sim, 1)[0] as { x: number; y: number };
    sim.enqueue({ type: 'designate-mine', payload: { x0: t.x, y0: t.y, x1: t.x, y1: t.y } });
    sim.step(TICKS_PER_HOUR * 4);
    expect(sim.services.get(worldMap).rockAt(t.x, t.y)).toBeNull();
  });
});

describe('construction speed', () => {
  it('keeps 200 colonists building and hauling well inside the budget', () => {
    const sim = Simulation.create({
      seed: 11,
      modules: ALL_MODULES,
      width: 250,
      height: 250,
      settings: { 'f1-world': { hilliness: 'small-hills' }, 'f3-people': { colonists: 200 } },
    });
    const home = sim.services.get(people).home();
    for (let k = 0; k < 6; k++) {
      const x = home.x - 30 + k * 10;
      sim.enqueue({ type: 'place-blueprints', payload: { building: 'steel-wall', x0: x, y0: home.y - 20, x1: x + 7, y1: home.y - 13 } });
    }
    sim.step(1);
    const t0 = performance.now();
    sim.step(TICKS_PER_HOUR);
    const msPerTick = (performance.now() - t0) / TICKS_PER_HOUR;
    expect(msPerTick).toBeLessThan(3);
  });
});
