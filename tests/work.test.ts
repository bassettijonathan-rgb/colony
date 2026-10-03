import { describe, expect, it } from 'vitest';
import { Simulation, type EntityId, type SignalMap } from '../src/core';
import { ALL_MODULES } from '../src/modules';
import { DESIGNATION, DESIGNATION_LAYER, MINE_WORK, workBoard, workSpeed } from '../src/modules/c1-work';
import { worldMap } from '../src/modules/f1-world';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../src/modules/f2-time';
import { COMPONENT, people, type Needs } from '../src/modules/f3-people';

type Mined = SignalMap['rock-mined'];

/** A colony on a hilly map, with a module that records every rock mined. */
function newColony(seed: number, colonists = 6): { sim: Simulation; mined: Mined[] } {
  const mined: Mined[] = [];
  const recorder = {
    id: 'test-recorder',
    name: 'Recorder',
    layer: 'living' as const,
    listen: { 'rock-mined': (_: unknown, p: Mined) => void mined.push(p) },
  };
  const sim = Simulation.create({
    seed,
    modules: [...ALL_MODULES, recorder],
    width: 90,
    height: 90,
    settings: {
      'f1-world': { hilliness: 'mountainous', river: false },
      'f2-time': { startSeason: 'summer', startHour: 7 },
      'f3-people': { colonists },
    },
  });
  return { sim, mined };
}

/** The rock tiles nearest home that can be dug from open ground, nearest first. */
function rockFaces(sim: Simulation, count: number): { x: number; y: number }[] {
  const map = sim.services.get(worldMap);
  const home = sim.services.get(people).home();
  const faces: { x: number; y: number; d: number }[] = [];
  for (let y = 0; y < sim.world.height; y++) {
    for (let x = 0; x < sim.world.width; x++) {
      if (!map.rockAt(x, y)) continue;
      const open = [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ].some(([dx, dy]) => map.isWalkable(x + (dx as number), y + (dy as number)));
      if (open) faces.push({ x, y, d: (x - home.x) ** 2 + (y - home.y) ** 2 });
    }
  }
  return faces.sort((a, b) => a.d - b.d || a.y - b.y || a.x - b.x).slice(0, count);
}

const mine = (sim: Simulation, t: { x: number; y: number }) =>
  sim.enqueue({ type: 'designate-mine', payload: { x0: t.x, y0: t.y, x1: t.x, y1: t.y } });

describe('mining', () => {
  it('digs out marked rock, leaving walkable floor, and says what came out', () => {
    const { sim, mined } = newColony(1);
    const map = sim.services.get(worldMap);
    const targets = rockFaces(sim, 3);
    for (const t of targets) mine(sim, t);
    sim.step(1);
    expect(sim.services.get(workBoard).jobs().length).toBe(3);
    const marks = sim.world.layers[DESIGNATION_LAYER] as Uint8Array;
    expect(marks[(targets[0] as { x: number; y: number }).y * sim.world.width + (targets[0] as { x: number }).x]).toBe(DESIGNATION.mine);

    sim.step(TICKS_PER_HOUR * 6);
    for (const t of targets) {
      expect(map.rockAt(t.x, t.y)).toBeNull();
      expect(map.isWalkable(t.x, t.y)).toBe(true);
      expect(marks[t.y * sim.world.width + t.x]).toBe(DESIGNATION.none);
    }
    expect(mined.map((m) => `${m.x},${m.y}`).sort()).toEqual(targets.map((t) => `${t.x},${t.y}`).sort());
    expect(sim.services.get(workBoard).jobs()).toEqual([]);
  });

  it('only marks rock, and cancelling removes the marks and frees the miner', () => {
    const { sim } = newColony(2);
    const home = sim.services.get(people).home();
    sim.enqueue({ type: 'designate-mine', payload: { x0: home.x - 1, y0: home.y - 1, x1: home.x + 1, y1: home.y + 1 } });
    sim.step(1);
    expect(sim.services.get(workBoard).jobs()).toEqual([]);

    const t = rockFaces(sim, 1)[0] as { x: number; y: number };
    mine(sim, t);
    sim.step(TICKS_PER_HOUR / 4);
    const job = sim.services.get(workBoard).jobs()[0];
    expect(job?.worker).not.toBeNull();
    const worker = job?.worker as EntityId;
    sim.enqueue({ type: 'cancel-designations', payload: { x0: t.x, y0: t.y, x1: t.x, y1: t.y } });
    sim.step(1);
    expect(sim.services.get(workBoard).jobs()).toEqual([]);
    expect(sim.services.get(people).get(worker)?.activity).not.toBe('work');
    expect(sim.services.get(worldMap).rockAt(t.x, t.y)).not.toBeNull();
  });

  it('takes longer for harder rock and less for skilled miners', () => {
    expect(workSpeed(10)).toBe(1);
    expect(workSpeed(0)).toBeLessThan(workSpeed(20));
    const { sim } = newColony(3);
    const t = rockFaces(sim, 1)[0] as { x: number; y: number };
    mine(sim, t);
    sim.step(1);
    const rock = sim.services.get(worldMap).rockAt(t.x, t.y);
    expect(sim.services.get(workBoard).jobs()[0]?.amount).toBeGreaterThanOrEqual(MINE_WORK * (rock?.hardness ?? 0));
  });
});

describe('who works on what', () => {
  it('gives each job to one colonist at a time, and each colonist one job', () => {
    const { sim } = newColony(4, 8);
    for (const t of rockFaces(sim, 12)) mine(sim, t);
    for (let k = 0; k < 120; k++) {
      sim.step(TICKS_PER_HOUR / 20);
      const workers = sim.services
        .get(workBoard)
        .jobs()
        .flatMap((j) => (j.worker === null ? [] : [j.worker]));
      expect(new Set(workers).size).toBe(workers.length);
    }
  });

  it('leaves work to colonists whose priority for it is not off', () => {
    const { sim, mined } = newColony(5, 4);
    const crew = sim.services.get(people);
    const [keen, ...rest] = crew.ids() as [EntityId, ...EntityId[]];
    for (const id of rest) sim.enqueue({ type: 'set-work-priority', payload: { id, workType: 'mining', priority: 0 } });
    for (const t of rockFaces(sim, 4)) mine(sim, t);
    sim.step(TICKS_PER_HOUR * 2);
    expect(sim.services.get(workBoard).priorityOf(rest[0] as EntityId, 'mining')).toBe(0);
    expect(new Set(mined.map((m) => m.worker))).toEqual(new Set([keen]));
    for (const job of sim.services.get(workBoard).jobs()) expect([null, keen]).toContain(job.worker);
  });

  it('ignores bad priority commands', () => {
    const { sim } = newColony(6, 1);
    const id = sim.services.get(people).ids()[0] as EntityId;
    sim.enqueue({ type: 'set-work-priority', payload: { id, workType: 'mining', priority: 9 } });
    sim.enqueue({ type: 'set-work-priority', payload: { id, workType: 'juggling', priority: 1 } });
    sim.step(1);
    expect(sim.services.get(workBoard).priorityOf(id, 'mining')).toBe(3);
  });

  it('drops work to eat, keeps the progress, and someone finishes it later', () => {
    const { sim, mined } = newColony(7, 1);
    const crew = sim.services.get(people);
    const id = crew.ids()[0] as EntityId;
    const t = rockFaces(sim, 1)[0] as { x: number; y: number };
    mine(sim, t);
    // Wait until they are digging.
    for (let k = 0; k < 200 && !((sim.services.get(workBoard).jobs()[0]?.done ?? 0) > 0); k++) sim.step(10);
    const job = sim.services.get(workBoard).jobs()[0];
    expect(job?.done).toBeGreaterThan(0);
    expect(crew.get(id)?.task).toMatch(/^Mining /);

    (sim.world.components[COMPONENT.needs]?.get(id) as Needs).food = 0.1;
    sim.step(2);
    expect(crew.get(id)?.activity).toBe('eat');
    expect(sim.services.get(workBoard).jobs()[0]?.worker).toBeNull();
    const kept = sim.services.get(workBoard).jobs()[0]?.done ?? 0;
    expect(kept).toBeGreaterThan(0);

    sim.step(TICKS_PER_HOUR * 3);
    expect(mined.length).toBe(1);
  });
});

describe('work module as a whole', () => {
  it('is deterministic and survives save and load in the middle of a job', () => {
    const { sim: a } = newColony(9);
    for (const t of rockFaces(a, 8)) mine(a, t);
    a.step(TICKS_PER_HOUR);
    expect(a.services.get(workBoard).jobs().some((j) => j.done > 0)).toBe(true);
    const b = Simulation.load(JSON.parse(JSON.stringify(a.save())), a.modules);
    a.step(TICKS_PER_HOUR * 2);
    b.step(TICKS_PER_HOUR * 2);
    expect(b.hash()).toBe(a.hash());
  });

  it('takes no jobs when switched off, and colonists still live their lives', () => {
    const sim = Simulation.create({ seed: 1, modules: ALL_MODULES, disabled: ['c1-work'], width: 40, height: 40 });
    expect(sim.services.get(workBoard).post({ workType: 'mining', kind: 'mine', owner: 'x', x: 0, y: 0, amount: 1, label: '' })).toBeNull();
    sim.step(TICKS_PER_DAY / 4);
    expect(sim.services.get(people).ids().length).toBe(12);
  });

  it('keeps 200 colonists digging well inside the budget', () => {
    const sim = Simulation.create({
      seed: 11,
      modules: ALL_MODULES,
      width: 250,
      height: 250,
      settings: { 'f1-world': { hilliness: 'mountainous' }, 'f3-people': { colonists: 200 } },
    });
    for (const t of rockFaces(sim, 400)) mine(sim, t);
    const t0 = performance.now();
    sim.step(TICKS_PER_HOUR);
    const msPerTick = (performance.now() - t0) / TICKS_PER_HOUR;
    expect(msPerTick).toBeLessThan(3);
  });
});
