import { defineModule, touchLayer, type EntityId, type ModuleContext, type Services, type SimContext, type World } from '../../core';
import { SKILLS } from '../../content/skills';
import { check, checkUniqueIds } from '../../content/validate';
import { WORK_TYPES, type WorkTypeDef } from '../../content/work';
import { worldMap } from '../f1-world/api';
import { TICKS_PER_HOUR } from '../f2-time/api';
import { people } from '../f3-people/api';
import {
  DEFAULT_PRIORITY,
  DESIGNATION,
  DESIGNATION_LAYER,
  MAX_PRIORITY,
  PRIORITIES_COMPONENT,
  WORK_MODULE_ID,
  workBoard,
  type Job,
  type JobPost,
  type TileArea,
} from './api';

export * from './api';

export interface WorkState {
  nextJob: number;
  /** Job id to job, oldest first. */
  jobs: Map<number, Job>;
  /** Job id to the tick after which someone may try to reach it again. */
  unreachable: Map<number, number>;
}

/** Free colonists look for work once every this many ticks (2.5 in-game minutes), spread out by id. */
export const CLAIM_EVERY = 30;
/** How many of the nearest open jobs a colonist tries to find a path to before giving up for now. */
const PATH_TRIES = 3;
/** A job nobody could reach is left alone for this long. */
const UNREACHABLE_TICKS = 2 * TICKS_PER_HOUR;
/** Mining a tile of granite takes a skill-10 miner one hour. Ore-bearing rock takes a quarter longer. */
export const MINE_WORK = TICKS_PER_HOUR;
const ORE_WORK = 1.25;
/** Largest area a single designate command covers, per side. */
const MAX_AREA_SIDE = 256;

/** Work per tick: skill 0 works at 0.4, skill 10 at 1, skill 20 at 1.6. */
export function workSpeed(skill: number): number {
  return 0.4 + 0.06 * skill;
}

function validateWorkContent(): void {
  checkUniqueIds('work', WORK_TYPES);
  for (const w of WORK_TYPES) {
    check(SKILLS.some((s) => s.id === w.skill), `work: "${w.id}" uses unknown skill "${w.skill}"`);
    check(Number.isFinite(w.order), `work: "${w.id}" needs a numeric order`);
  }
}

const workType = (id: string): WorkTypeDef | undefined => WORK_TYPES.find((w) => w.id === id);

interface Env {
  readonly world: World;
  readonly state: WorkState;
  readonly services: Services;
}
type Ctx = ModuleContext<WorkState>;

function priorities(world: World): Map<EntityId, Record<string, number>> {
  world.components[PRIORITIES_COMPONENT] ??= new Map();
  return world.components[PRIORITIES_COMPONENT] as Map<EntityId, Record<string, number>>;
}

function priorityOf(world: World, colonist: EntityId, type: string): number {
  return priorities(world).get(colonist)?.[type] ?? DEFAULT_PRIORITY;
}

function designations(world: World): Uint8Array {
  return world.layers[DESIGNATION_LAYER] as Uint8Array;
}

/** Clamps an area to the map and puts its corners in order. */
function clampArea(world: World, a: TileArea): { x0: number; y0: number; x1: number; y1: number } | null {
  if (![a.x0, a.y0, a.x1, a.y1].every(Number.isInteger)) return null;
  const x0 = Math.max(0, Math.min(a.x0, a.x1));
  const y0 = Math.max(0, Math.min(a.y0, a.y1));
  const x1 = Math.min(world.width - 1, Math.max(a.x0, a.x1), x0 + MAX_AREA_SIDE - 1);
  const y1 = Math.min(world.height - 1, Math.max(a.y0, a.y1), y0 + MAX_AREA_SIDE - 1);
  return x0 <= x1 && y0 <= y1 ? { x0, y0, x1, y1 } : null;
}

function postJob(env: Env, post: JobPost): number {
  const id = env.state.nextJob++;
  env.state.jobs.set(id, { ...post, id, done: 0, worker: null, stand: null });
  return id;
}

function removeJob(env: Env, job: Job): void {
  if (job.worker !== null) env.services.get(people).release(job.worker);
  env.state.jobs.delete(job.id);
  env.state.unreachable.delete(job.id);
  if (job.owner === WORK_MODULE_ID && job.kind === 'mine') {
    designations(env.world)[job.y * env.world.width + job.x] = DESIGNATION.none;
    touchLayer(env.world, DESIGNATION_LAYER);
  }
}

/** The walkable tile beside a target that is closest to the colonist, or null when it is walled in. */
function standFor(env: Env, job: Job, from: { x: number; y: number }): { x: number; y: number } | null {
  const map = env.services.get(worldMap);
  let best: { x: number; y: number } | null = null;
  let bestDistance = Infinity;
  for (const [dx, dy] of [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ] as const) {
    const x = job.x + dx;
    const y = job.y + dy;
    if (!map.isWalkable(x, y)) continue;
    const d = (x - from.x) ** 2 + (y - from.y) ** 2;
    if (d < bestDistance) {
      best = { x, y };
      bestDistance = d;
    }
  }
  return best;
}

/** Work types this colonist does, grouped by priority, most urgent first. */
function workGroups(world: World, colonist: EntityId): WorkTypeDef[][] {
  const groups: WorkTypeDef[][] = [];
  for (let p = 1; p <= MAX_PRIORITY; p++) {
    const group = WORK_TYPES.filter((w) => priorityOf(world, colonist, w.id) === p);
    if (group.length > 0) groups.push([...group].sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : 1)));
  }
  return groups;
}

/** Gives a free colonist the nearest open job they are willing to do and can reach. */
function claimJob(ctx: Ctx, colonist: EntityId): void {
  const crew = ctx.services.get(people);
  const from = crew.tileOf(colonist);
  if (!from) return;
  const now = ctx.world.tick;
  for (const group of workGroups(ctx.world, colonist)) {
    // Work types earlier in the group win ties; otherwise the nearest job wins.
    const rank = new Map(group.map((w, k) => [w.id, k]));
    const open: { job: Job; rank: number; distance: number }[] = [];
    for (const job of ctx.state.jobs.values()) {
      const r = rank.get(job.workType);
      if (r === undefined || job.worker !== null || (ctx.state.unreachable.get(job.id) ?? 0) > now) continue;
      open.push({ job, rank: r, distance: (job.x - from.x) ** 2 + (job.y - from.y) ** 2 });
    }
    open.sort((a, b) => a.rank - b.rank || a.distance - b.distance || a.job.id - b.job.id);
    let tries = 0;
    for (const { job } of open) {
      if (tries >= PATH_TRIES) break;
      const stand = standFor(ctx, job, from);
      if (!stand) continue;
      tries++;
      if (!crew.assign(colonist, stand.x, stand.y, job.label)) {
        ctx.state.unreachable.set(job.id, now + UNREACHABLE_TICKS);
        continue;
      }
      job.worker = colonist;
      job.stand = stand;
      ctx.emit('job-started', { job: job.id, kind: job.kind, worker: colonist, x: job.x, y: job.y });
      return;
    }
  }
}

function assignJobs(ctx: Ctx): void {
  if (ctx.state.jobs.size === 0) return;
  const crew = ctx.services.get(people);
  for (const colonist of crew.ids()) {
    if ((ctx.world.tick + colonist) % CLAIM_EVERY !== 0 || !crew.isFree(colonist)) continue;
    // A colonist pulled away by hunger or sleep gives up the job they had.
    for (const job of ctx.state.jobs.values()) {
      if (job.worker === colonist) {
        job.worker = null;
        job.stand = null;
      }
    }
    claimJob(ctx, colonist);
  }
}

/** Mining jobs belong to this module: dig out the rock. */
function finishOwnJob(ctx: Ctx, job: Job, worker: EntityId): void {
  if (job.kind !== 'mine') return;
  const dug = ctx.services.get(worldMap).mineRock(job.x, job.y);
  if (dug) ctx.emit('rock-mined', { x: job.x, y: job.y, rock: dug.rock.id, ore: dug.ore?.id ?? null, worker });
}

/** Colonists standing at their job do a tick's work on it. */
function doWork(ctx: Ctx): void {
  const crew = ctx.services.get(people);
  const map = ctx.services.get(worldMap);
  for (const job of [...ctx.state.jobs.values()]) {
    if (job.owner === WORK_MODULE_ID && job.kind === 'mine' && !map.rockAt(job.x, job.y)) {
      removeJob(ctx, job);
      continue;
    }
    const worker = job.worker;
    if (worker === null || !job.stand) continue;
    const colonist = crew.get(worker);
    if (!colonist || colonist.activity !== 'work' || colonist.task !== job.label) {
      // Interrupted (hungry, tired, ordered elsewhere): the job waits for the next taker.
      job.worker = null;
      job.stand = null;
      continue;
    }
    const at = crew.tileOf(worker);
    if (!at || at.x !== job.stand.x || at.y !== job.stand.y || colonist.x !== at.x || colonist.y !== at.y) continue;
    const type = workType(job.workType);
    job.done += workSpeed(type ? (colonist.person.skills[type.skill] ?? 0) : 0);
    if (job.done < job.amount) continue;
    removeJob(ctx, job);
    if (job.owner === WORK_MODULE_ID) finishOwnJob(ctx, job, worker);
    ctx.emit('job-done', { job: job.id, kind: job.kind, owner: job.owner, worker, x: job.x, y: job.y });
  }
}

function designateMine(ctx: Ctx, area: TileArea): void {
  const a = clampArea(ctx.world, area);
  if (!a) return;
  const map = ctx.services.get(worldMap);
  const marks = designations(ctx.world);
  let changed = false;
  for (let y = a.y0; y <= a.y1; y++) {
    for (let x = a.x0; x <= a.x1; x++) {
      const i = y * ctx.world.width + x;
      const rock = map.rockAt(x, y);
      if (!rock || marks[i] !== DESIGNATION.none) continue;
      const ore = map.oreAt(x, y);
      marks[i] = DESIGNATION.mine;
      changed = true;
      postJob(ctx, {
        workType: 'mining',
        kind: 'mine',
        owner: WORK_MODULE_ID,
        x,
        y,
        amount: MINE_WORK * rock.hardness * (ore ? ORE_WORK : 1),
        label: `Mining ${(ore ? `${ore.name} ore` : rock.name).toLowerCase()}`,
      });
    }
  }
  if (changed) touchLayer(ctx.world, DESIGNATION_LAYER);
}

function cancelDesignations(ctx: Ctx, area: TileArea): void {
  const a = clampArea(ctx.world, area);
  if (!a) return;
  for (const job of [...ctx.state.jobs.values()]) {
    const inside = job.x >= a.x0 && job.x <= a.x1 && job.y >= a.y0 && job.y <= a.y1;
    if (inside && job.owner === WORK_MODULE_ID) removeJob(ctx, job);
  }
}

/**
 * C1 Work: a job board that any module can post work to, per-colonist work
 * priorities, and the first kind of work: mining rock the player marks.
 * Free colonists take the nearest job of their most urgent work type, walk
 * next to it and work at a speed set by their skill. Hunger and sleep come
 * first; an interrupted job keeps its progress for the next taker.
 */
export const workModule = defineModule<WorkState>({
  id: WORK_MODULE_ID,
  name: 'Work',
  layer: 'core',

  init: (ctx: SimContext) => {
    validateWorkContent();
    ctx.world.layers[DESIGNATION_LAYER] = new Uint8Array(ctx.world.width * ctx.world.height);
    return { nextJob: 1, jobs: new Map(), unreachable: new Map() };
  },

  setup: (ctx) => {
    validateWorkContent();
    const env: Env = ctx;
    ctx.services.provide(workBoard, {
      post: (job) => postJob(env, job),
      cancel: (id) => {
        const job = env.state.jobs.get(id);
        if (job) removeJob(env, job);
      },
      get: (id) => env.state.jobs.get(id) ?? null,
      jobs: () => [...env.state.jobs.values()],
      priorityOf: (colonist, type) => priorityOf(env.world, colonist, type),
    });
  },

  systems: [
    { id: 'assign', phase: 'jobs', run: assignJobs },
    { id: 'work', phase: 'work', run: doWork },
  ],

  commands: {
    'designate-mine': designateMine,
    'cancel-designations': cancelDesignations,
    'set-work-priority': (ctx, { id, workType: type, priority }) => {
      if (!ctx.services.get(people).get(id) || !workType(type)) return;
      if (!Number.isInteger(priority) || priority < 0 || priority > MAX_PRIORITY) return;
      const table = priorities(ctx.world);
      table.set(id, { ...table.get(id), [type]: priority });
    },
  },
});
