/**
 * What other modules, the worker and the UI may use from the people module:
 * component names, data shapes, signals, commands and the people service.
 */
import { defineService, type EntityId } from '../../core';

export const PEOPLE_MODULE_ID = 'f3-people';

/** Component tables this module owns. */
export const COMPONENT = {
  person: 'f3-people.person',
  needs: 'f3-people.needs',
  pawn: 'f3-people.pawn',
} as const;

export interface Person {
  name: string;
  age: number;
  /** Skill id to level, 0 to 20. */
  skills: Record<string, number>;
}

/** Each need runs from 0 (desperate) to 1 (fully satisfied). */
export interface Needs {
  food: number;
  rest: number;
  /** Packaged rations from the landing pods, eaten when hungry. */
  rations: number;
}

export type ActivityKind = 'idle' | 'wander' | 'walk' | 'eat' | 'sleep';

export interface Pawn {
  x: number;
  y: number;
  /** Tiles still to walk through, as `y * width + x`. */
  path: number[];
  /** How far towards the next tile on the path, 0 to 1. */
  progress: number;
  activity: ActivityKind;
  /** Tick the current eat or sleep finishes, or the idle pause ends. */
  until: number;
  /** Set when the player ordered this move, so needs don't interrupt it. */
  ordered: boolean;
}

declare module '../../core/signals' {
  interface SignalMap {
    'colonist-arrived': { id: EntityId; name: string };
    /** A colonist is hungry and has no rations left. Sent once each time it happens. */
    'colonist-starving': { id: EntityId; name: string };
  }
}

declare module '../../core/commands' {
  interface CommandMap {
    /** Player order: walk this colonist to a tile. */
    'move-colonist': { id: EntityId; x: number; y: number };
  }
}

/** New-game settings for the people module: `settings['f3-people']`. */
export interface PeopleSettings {
  /** How many colonists land (default 12). */
  colonists?: number;
}

/** Everything the inspector shows about one colonist. */
export interface ColonistView {
  id: EntityId;
  person: Person;
  needs: Needs;
  /** Position including progress towards the next tile, for smooth drawing. */
  x: number;
  y: number;
  activity: ActivityKind;
}

export interface PeopleService {
  /** Living colonists, in arrival order. */
  ids(): EntityId[];
  get(id: EntityId): ColonistView | null;
  /** The landing site: the colony's first home tile. */
  home(): { x: number; y: number };
  isIdle(id: EntityId): boolean;
  /** Sends a colonist to a tile. False when there is no way there. */
  walkTo(id: EntityId, x: number, y: number): boolean;
}

/** Without the people module there is nobody. */
export const people = defineService<PeopleService>('f3-people.people', {
  ids: () => [],
  get: () => null,
  home: () => ({ x: 0, y: 0 }),
  isIdle: () => false,
  walkTo: () => false,
});
