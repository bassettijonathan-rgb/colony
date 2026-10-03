import { defineModule, findPath, spawnEntity, type EntityId, type ModuleContext, type Rng, type Services, type World } from '../../core';
import { FIRST_NAMES, LAST_NAMES } from '../../content/names';
import { SKILLS } from '../../content/skills';
import { check, checkUniqueIds } from '../../content/validate';
import { worldMap } from '../f1-world/api';
import { clock, TICKS_PER_DAY, TICKS_PER_HOUR } from '../f2-time/api';
import {
  COMPONENT,
  people,
  PEOPLE_MODULE_ID,
  type ColonistView,
  type Needs,
  type PeopleSettings,
  type Pawn,
  type Person,
} from './api';
import { findLandingSite, spawnTiles } from './landing';

export * from './api';

export interface PeopleState {
  home: { x: number; y: number };
  /** Colonists already warned about starving, so the signal is sent once per hungry spell. */
  starving: EntityId[];
}

/** Tiles walked per tick on normal ground: a tile every 10 in-game seconds, like RimWorld's pace. */
export const WALK_TILES_PER_TICK = 0.5;
/** Food runs from full to empty in 0.9 days. */
export const FOOD_PER_TICK = 1 / (TICKS_PER_DAY * 0.9);
/** Rest runs from full to empty in 0.75 days awake. */
export const REST_PER_TICK = 1 / (TICKS_PER_DAY * 0.75);
/** A full night's sleep (from empty) takes 8 hours. */
export const SLEEP_REST_PER_TICK = 1 / (8 * TICKS_PER_HOUR);
export const HUNGRY = 0.3;
export const TIRED = 0.25;
/** Eating a ration takes 20 minutes and fills 85% of the food need. */
export const EAT_TICKS = Math.round(TICKS_PER_HOUR / 3);
export const RATION_FOOD = 0.85;
export const STARTING_RATIONS = 8;
/** After wandering somewhere, colonists stand around for 5 to 30 minutes. */
const IDLE_PAUSE: [number, number] = [TICKS_PER_HOUR / 12, TICKS_PER_HOUR / 2];
/** How far from home colonists wander when they have nothing to do. */
const WANDER_RADIUS = 12;
const HOME_RANGE = 25;
/** Paths longer than this many searched tiles are given up on. */
const MAX_PATH_NODES = 30_000;

function validatePeopleContent(): void {
  checkUniqueIds('skills', SKILLS);
  check(FIRST_NAMES.length >= 10 && LAST_NAMES.length >= 10, 'names: need at least 10 first and 10 last names');
  check(new Set(FIRST_NAMES).size === FIRST_NAMES.length, 'names: a first name appears twice');
  check(new Set(LAST_NAMES).size === LAST_NAMES.length, 'names: a last name appears twice');
}

/** The parts of the module context the helpers need. Services get one too. */
interface Env {
  readonly world: World;
  readonly state: PeopleState;
  readonly services: Services;
}
type Ctx = ModuleContext<PeopleState>;

const table = <T,>(world: World, name: string): Map<EntityId, T> => {
  world.components[name] ??= new Map();
  return world.components[name] as Map<EntityId, T>;
};

function makePerson(rng: Rng, taken: Set<string>): Person {
  let name = '';
  for (let tries = 0; tries < 50; tries++) {
    name = `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`;
    if (!taken.has(name)) break;
  }
  taken.add(name);
  // Most skills are weak; two or three are a real speciality.
  const skills: Record<string, number> = {};
  for (const s of SKILLS) skills[s.id] = rng.range(0, 6);
  const specialities = rng.range(2, 3);
  for (let k = 0; k < specialities; k++) skills[rng.pick(SKILLS).id] = rng.range(8, 16);
  return { name, age: rng.range(21, 58), skills };
}

function walkCost(env: Env): (x: number, y: number) => number {
  const map = env.services.get(worldMap);
  return (x, y) => map.moveCost(x, y);
}

/** Starts a pawn walking to a tile. False when there is no way there. */
function startWalk(env: Env, pawn: Pawn, x: number, y: number, kind: 'walk' | 'wander'): boolean {
  const { width, height } = env.world;
  const path = findPath(width, height, walkCost(env), pawn, { x, y }, MAX_PATH_NODES);
  if (!path) return false;
  pawn.path = path;
  pawn.progress = 0;
  pawn.activity = kind;
  return true;
}

function becomeIdle(pawn: Pawn, until: number): void {
  pawn.activity = 'idle';
  pawn.path = [];
  pawn.progress = 0;
  pawn.ordered = false;
  pawn.until = until;
}

function view(env: Env, id: EntityId): ColonistView | null {
  const person = table<Person>(env.world, COMPONENT.person).get(id);
  const needs = table<Needs>(env.world, COMPONENT.needs).get(id);
  const pawn = table<Pawn>(env.world, COMPONENT.pawn).get(id);
  if (!person || !needs || !pawn) return null;
  let x = pawn.x;
  let y = pawn.y;
  const next = pawn.path[0];
  if (next !== undefined && pawn.progress > 0) {
    const nx = next % env.world.width;
    const ny = (next - nx) / env.world.width;
    x += (nx - x) * pawn.progress;
    y += (ny - y) * pawn.progress;
  }
  return { id, person, needs, x, y, activity: pawn.activity };
}

function pickWanderTarget(ctx: Ctx, pawn: Pawn): { x: number; y: number } | null {
  const map = ctx.services.get(worldMap);
  const home = ctx.state.home;
  const farFromHome = Math.max(Math.abs(pawn.x - home.x), Math.abs(pawn.y - home.y)) > HOME_RANGE;
  const centre = farFromHome ? home : pawn;
  for (let tries = 0; tries < 10; tries++) {
    const x = centre.x + ctx.rng.range(-WANDER_RADIUS, WANDER_RADIUS);
    const y = centre.y + ctx.rng.range(-WANDER_RADIUS, WANDER_RADIUS);
    if (map.isWalkable(x, y)) return { x, y };
  }
  return null;
}

/** Decides what idle (or wandering) colonists do next: eat, sleep or wander. */
function chooseActivities(ctx: Ctx): void {
  const now = ctx.world.tick;
  const pawns = table<Pawn>(ctx.world, COMPONENT.pawn);
  const needsTable = table<Needs>(ctx.world, COMPONENT.needs);
  const persons = table<Person>(ctx.world, COMPONENT.person);
  const dark = ctx.services.get(clock).light() < 0.2;
  for (const [id, pawn] of pawns) {
    if (pawn.ordered || pawn.activity === 'eat' || pawn.activity === 'sleep') continue;
    const needs = needsTable.get(id) as Needs;

    if (needs.food < HUNGRY) {
      if (needs.rations > 0) {
        becomeIdle(pawn, now);
        pawn.activity = 'eat';
        pawn.until = now + EAT_TICKS;
        continue;
      }
      if (!ctx.state.starving.includes(id)) {
        ctx.state.starving.push(id);
        ctx.emit('colonist-starving', { id, name: (persons.get(id) as Person).name });
      }
    }
    if (needs.rest < TIRED || (dark && needs.rest < 0.8)) {
      becomeIdle(pawn, now);
      pawn.activity = 'sleep';
      continue;
    }
    if (pawn.activity === 'idle' && now >= pawn.until) {
      const target = pickWanderTarget(ctx, pawn);
      if (!target || !startWalk(ctx, pawn, target.x, target.y, 'wander')) pawn.until = now + TICKS_PER_HOUR / 4;
    }
  }
}

/** Moves walkers along their paths and finishes eating and sleeping. */
function act(ctx: Ctx): void {
  const now = ctx.world.tick;
  const { width } = ctx.world;
  const map = ctx.services.get(worldMap);
  const sky = ctx.services.get(clock);
  const pawns = table<Pawn>(ctx.world, COMPONENT.pawn);
  const needsTable = table<Needs>(ctx.world, COMPONENT.needs);
  for (const [id, pawn] of pawns) {
    const needs = needsTable.get(id) as Needs;
    switch (pawn.activity) {
      case 'walk':
      case 'wander': {
        const next = pawn.path[0];
        if (next === undefined) {
          becomeIdle(pawn, now + ctx.rng.range(IDLE_PAUSE[0], IDLE_PAUSE[1]));
          break;
        }
        const nx = next % width;
        const ny = (next - nx) / width;
        const cost = map.moveCost(nx, ny);
        if (cost <= 0) {
          // Something now blocks the way (a new wall, say): stop and think again.
          becomeIdle(pawn, now);
          break;
        }
        const diagonal = nx !== pawn.x && ny !== pawn.y ? Math.SQRT2 : 1;
        const snow = 1 + sky.snowAt(pawn.x, pawn.y) / 40;
        pawn.progress += WALK_TILES_PER_TICK / (cost * diagonal * snow);
        if (pawn.progress >= 1) {
          pawn.progress = 0;
          pawn.x = nx;
          pawn.y = ny;
          pawn.path.shift();
          if (pawn.path.length === 0) becomeIdle(pawn, now + ctx.rng.range(IDLE_PAUSE[0], IDLE_PAUSE[1]));
        }
        break;
      }
      case 'eat':
        if (now >= pawn.until) {
          needs.food = Math.min(1, needs.food + RATION_FOOD);
          needs.rations--;
          ctx.state.starving = ctx.state.starving.filter((s) => s !== id);
          becomeIdle(pawn, now);
        }
        break;
      case 'sleep': {
        needs.rest = Math.min(1, needs.rest + SLEEP_REST_PER_TICK);
        const daylight = sky.light() > 0.5;
        if (needs.rest >= 1 || (daylight && needs.rest >= 0.9)) becomeIdle(pawn, now);
        break;
      }
      case 'idle':
        break;
    }
  }
}

function decayNeeds(ctx: Ctx): void {
  const pawns = table<Pawn>(ctx.world, COMPONENT.pawn);
  for (const [id, needs] of table<Needs>(ctx.world, COMPONENT.needs)) {
    needs.food = Math.max(0, needs.food - FOOD_PER_TICK);
    if (pawns.get(id)?.activity !== 'sleep') needs.rest = Math.max(0, needs.rest - REST_PER_TICK);
  }
}

/**
 * F3 People: colonists with names, ages and skills; hunger and rest; walking
 * and pathfinding. Until the work module lands, colonists eat their packed
 * rations, sleep where they stand at night, and wander near the landing site.
 */
export const peopleModule = defineModule<PeopleState>({
  id: PEOPLE_MODULE_ID,
  name: 'People',
  layer: 'foundation',

  init: (ctx) => {
    validatePeopleContent();
    const raw = ctx.world.settings[PEOPLE_MODULE_ID];
    const settings: PeopleSettings = raw && typeof raw === 'object' ? (raw as PeopleSettings) : {};
    const count = settings.colonists ?? 12;
    if (!Number.isInteger(count) || count < 0 || count > 500) throw new Error(`colonists must be 0 to 500, got ${count}`);

    const map = ctx.services.get(worldMap);
    const home = findLandingSite(ctx.world, map);
    const tiles = spawnTiles(ctx.world, map, ctx.rng, home, count);
    const taken = new Set<string>();
    const persons = table<Person>(ctx.world, COMPONENT.person);
    const needsTable = table<Needs>(ctx.world, COMPONENT.needs);
    const pawns = table<Pawn>(ctx.world, COMPONENT.pawn);
    for (const tile of tiles) {
      const id = spawnEntity(ctx.world);
      const person = makePerson(ctx.rng, taken);
      persons.set(id, person);
      // Fresh out of the pods: fed, but groggy.
      needsTable.set(id, { food: 0.8 + ctx.rng.float() * 0.2, rest: 0.5 + ctx.rng.float() * 0.3, rations: STARTING_RATIONS });
      pawns.set(id, { x: tile.x, y: tile.y, path: [], progress: 0, activity: 'idle', until: ctx.rng.range(0, 60), ordered: false });
      ctx.emit('colonist-arrived', { id, name: person.name });
    }
    return { home, starving: [] };
  },

  setup: (ctx) => {
    validatePeopleContent();
    const env: Env = ctx;
    ctx.services.provide(people, {
      ids: () => [...table<Pawn>(env.world, COMPONENT.pawn).keys()],
      get: (id) => view(env, id),
      home: () => ({ ...env.state.home }),
      isIdle: (id) => table<Pawn>(env.world, COMPONENT.pawn).get(id)?.activity === 'idle',
      walkTo: (id, x, y) => {
        const pawn = table<Pawn>(env.world, COMPONENT.pawn).get(id);
        return pawn ? startWalk(env, pawn, x, y, 'walk') : false;
      },
    });
  },

  systems: [
    { id: 'needs', phase: 'needs', run: decayNeeds },
    { id: 'choose', phase: 'jobs', run: chooseActivities },
    { id: 'act', phase: 'work', run: act },
  ],

  commands: {
    'move-colonist': (ctx, { id, x, y }) => {
      const pawn = table<Pawn>(ctx.world, COMPONENT.pawn).get(id);
      if (!pawn || !Number.isInteger(x) || !Number.isInteger(y)) return;
      // Walk from where they stand; anything else they were doing is dropped.
      const previous = { ...pawn, path: [...pawn.path] };
      becomeIdle(pawn, ctx.world.tick);
      if (startWalk(ctx, pawn, x, y, 'walk')) pawn.ordered = true;
      else Object.assign(pawn, previous);
    },
  },
});
