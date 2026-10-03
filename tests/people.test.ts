import { describe, expect, it } from 'vitest';
import { Simulation, type EntityId } from '../src/core';
import { ALL_MODULES } from '../src/modules';
import { worldMap } from '../src/modules/f1-world';
import { clock, TICKS_PER_DAY, TICKS_PER_HOUR } from '../src/modules/f2-time';
import { COMPONENT, people, STARTING_RATIONS, type Needs, type Pawn } from '../src/modules/f3-people';

function newColony(seed: number, opts: { colonists?: number; size?: number; hour?: number } = {}): Simulation {
  const size = opts.size ?? 80;
  return Simulation.create({
    seed,
    modules: ALL_MODULES,
    width: size,
    height: size,
    settings: {
      'f1-world': { hilliness: 'small-hills', river: false },
      'f2-time': { startSeason: 'summer', startHour: opts.hour ?? 8 },
      'f3-people': { colonists: opts.colonists ?? 12 },
    },
  });
}

const needsOf = (sim: Simulation, id: EntityId) => sim.world.components[COMPONENT.needs]?.get(id) as Needs;
const pawnOf = (sim: Simulation, id: EntityId) => sim.world.components[COMPONENT.pawn]?.get(id) as Pawn;

describe('landing', () => {
  it('lands twelve colonists by default, with names, ages and skills, on walkable ground near home', () => {
    const sim = newColony(1);
    const crew = sim.services.get(people);
    const map = sim.services.get(worldMap);
    const home = crew.home();
    expect(map.isBuildable(home.x, home.y)).toBe(true);
    const ids = crew.ids();
    expect(ids.length).toBe(12);
    const names = new Set<string>();
    for (const id of ids) {
      const c = crew.get(id);
      if (!c) throw new Error('missing colonist');
      names.add(c.person.name);
      expect(c.person.age).toBeGreaterThanOrEqual(21);
      expect(Math.max(...Object.values(c.person.skills))).toBeGreaterThanOrEqual(8);
      expect(map.isWalkable(c.x, c.y)).toBe(true);
      expect(Math.max(Math.abs(c.x - home.x), Math.abs(c.y - home.y))).toBeLessThanOrEqual(3);
      expect(c.needs.rations).toBe(STARTING_RATIONS);
    }
    expect(names.size).toBe(12);
  });

  it('lands the number asked for', () => {
    expect(newColony(2, { colonists: 3 }).services.get(people).ids().length).toBe(3);
    expect(() => newColony(2, { colonists: -1 })).toThrow(/colonists must be/);
  });
});

describe('needs', () => {
  it('get hungry over the day and eat a ration, which fills them up', () => {
    const sim = newColony(3, { colonists: 1 });
    const id = sim.services.get(people).ids()[0] as EntityId;
    const needs = needsOf(sim, id);
    needs.food = 0.31;
    sim.step(TICKS_PER_HOUR); // drops below hungry, then eats for 20 minutes
    expect(needs.rations).toBe(STARTING_RATIONS - 1);
    expect(needs.food).toBeGreaterThan(0.85);
  });

  it('warn once when someone is hungry with no rations left', () => {
    const warnings: string[] = [];
    const listener = {
      id: 'listener',
      name: 'Listener',
      layer: 'core' as const,
      listen: { 'colonist-starving': (_: unknown, p: { name: string }) => void warnings.push(p.name) },
    };
    const sim = Simulation.create({
      seed: 4,
      modules: [...ALL_MODULES, listener],
      width: 60,
      height: 60,
      settings: { 'f3-people': { colonists: 1 }, 'f1-world': { hilliness: 'flat' } },
    });
    const id = sim.services.get(people).ids()[0] as EntityId;
    const needs = needsOf(sim, id);
    needs.rations = 0;
    needs.food = 0.2;
    sim.step(TICKS_PER_HOUR * 3);
    expect(warnings.length).toBe(1);
    expect(needs.food).toBeLessThan(0.2);
  });

  it('sleep at night and wake rested in the morning', () => {
    const sim = newColony(5, { colonists: 4, hour: 20 });
    const crew = sim.services.get(people);
    const sky = sim.services.get(clock);
    // Run to the middle of the night.
    while (sky.light() > 0.1) sim.step(TICKS_PER_HOUR / 4);
    sim.step(TICKS_PER_HOUR);
    for (const id of crew.ids()) expect(crew.get(id)?.activity).toBe('sleep');
    // And on to mid-morning.
    while (sky.now().hour !== 10) sim.step(TICKS_PER_HOUR / 4);
    for (const id of crew.ids()) {
      expect(crew.get(id)?.activity).not.toBe('sleep');
      expect(needsOf(sim, id).rest).toBeGreaterThan(0.6);
    }
  });

  it('keep a colony of twelve fed and rested for days while rations last', () => {
    const sim = newColony(6);
    sim.step(TICKS_PER_DAY * 4);
    for (const id of sim.services.get(people).ids()) {
      const needs = needsOf(sim, id);
      expect(needs.food).toBeGreaterThan(0.2);
      expect(needs.rest).toBeGreaterThan(0.2);
      expect(needs.rations).toBeLessThan(STARTING_RATIONS);
    }
  });
});

describe('moving', () => {
  it('wander near home on walkable ground', () => {
    const sim = newColony(7);
    const crew = sim.services.get(people);
    const map = sim.services.get(worldMap);
    const home = crew.home();
    const seen = new Set<string>();
    for (let k = 0; k < 40; k++) {
      sim.step(TICKS_PER_HOUR / 4);
      for (const id of crew.ids()) {
        const p = pawnOf(sim, id);
        expect(map.isWalkable(p.x, p.y)).toBe(true);
        expect(Math.max(Math.abs(p.x - home.x), Math.abs(p.y - home.y))).toBeLessThanOrEqual(40);
        seen.add(`${p.x},${p.y}`);
      }
    }
    expect(seen.size).toBeGreaterThan(30);
  });

  it('follow a move order to the tile, and the order is in the command log', () => {
    const sim = newColony(8, { colonists: 1 });
    const crew = sim.services.get(people);
    const map = sim.services.get(worldMap);
    const id = crew.ids()[0] as EntityId;
    const home = crew.home();
    let target = { x: home.x + 15, y: home.y + 5 };
    for (let dx = 0; !map.isWalkable(target.x, target.y); dx++) target = { x: home.x + 15 - dx, y: home.y + 5 };
    sim.enqueue({ type: 'move-colonist', payload: { id, ...target } });
    sim.step(1);
    expect(crew.get(id)?.activity).toBe('walk');
    sim.step(200);
    expect(pawnOf(sim, id)).toMatchObject({ x: target.x, y: target.y });
    expect(sim.commandLog).toEqual([{ tick: 0, type: 'move-colonist', payload: { id, ...target } }]);
  });

  it('ignore a move order to somewhere they cannot reach', () => {
    const sim = newColony(9, { colonists: 1 });
    const crew = sim.services.get(people);
    const id = crew.ids()[0] as EntityId;
    sim.enqueue({ type: 'move-colonist', payload: { id, x: -5, y: -5 } });
    sim.step(1);
    expect(crew.get(id)?.activity).not.toBe('walk');
  });
});

describe('people module as a whole', () => {
  it('is deterministic and survives save and load', () => {
    const a = newColony(10);
    a.step(TICKS_PER_DAY);
    const b = Simulation.load(JSON.parse(JSON.stringify(a.save())), ALL_MODULES);
    a.step(TICKS_PER_DAY / 2);
    b.step(TICKS_PER_DAY / 2);
    expect(b.hash()).toBe(a.hash());
  });

  it('still works on flat open soil when the world module is off', () => {
    const sim = Simulation.create({ seed: 1, modules: ALL_MODULES, disabled: ['f1-world'], width: 40, height: 40 });
    sim.step(TICKS_PER_HOUR * 6);
    expect(sim.services.get(people).ids().length).toBe(12);
  });

  it('has nobody when switched off', () => {
    const sim = Simulation.create({ seed: 1, modules: ALL_MODULES, disabled: ['f3-people'], width: 16, height: 16 });
    expect(sim.services.get(people).ids()).toEqual([]);
  });

  it('runs 200 colonists well inside the 10 ms per tick budget', () => {
    const sim = newColony(11, { colonists: 200, size: 250 });
    const t0 = performance.now();
    sim.step(TICKS_PER_HOUR * 2);
    const msPerTick = (performance.now() - t0) / (TICKS_PER_HOUR * 2);
    expect(msPerTick).toBeLessThan(2);
  });
});
