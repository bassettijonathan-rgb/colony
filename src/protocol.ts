/** Messages between the page (main thread) and the simulation worker. */
import type { ColonistView } from './modules/f3-people/api';

export type { ColonistView };

export type Speed = 0 | 1 | 3;

/** Ticks per real second at each speed. 1x is 10 ticks a second. */
export const TICKS_PER_SECOND: Record<Speed, number> = { 0: 0, 1: 10, 3: 30 };

export type ToWorker =
  | { type: 'start'; seed: number; settings: Record<string, unknown> }
  | { type: 'speed'; speed: Speed }
  | { type: 'command'; command: { type: string; payload: unknown } };

/** The work types colonists can be given priorities for, and everyone's priorities. */
export interface WorkStatus {
  /** In the order colonists consider them at equal priority. */
  types: { id: string; name: string; skill: string | null }[];
  /** Colonist id to work type id to priority (0 = never, 1 = first ... 4 = last). */
  priorities: Record<number, Record<string, number>>;
  /** Jobs waiting or under way. */
  jobs: number;
}

export interface MapSnapshot {
  width: number;
  height: number;
  /** Layer name to a copy of its data. */
  layers: Record<string, ArrayLike<number>>;
}

/** What the top bar shows about the sky. */
export interface SkyStatus {
  /** e.g. "Year 1, Spring 3, 07:40" */
  date: string;
  temperature: number;
  weather: string;
  /** 0 (night) to 1 (clear noon). */
  light: number;
}

export type FromWorker =
  | {
      type: 'started';
      seed: number;
      modules: string[];
      map: MapSnapshot;
      summary: string;
      colonists: ColonistView[];
      home: { x: number; y: number };
      /** Null when the work module is off. */
      work: WorkStatus | null;
    }
  | {
      type: 'tick';
      tick: number;
      tickMs: number;
      sky: SkyStatus;
      colonists: ColonistView[];
      work: WorkStatus | null;
      /** Item id to how many the colony has. */
      stock: Record<string, number>;
      /** Tile layers that changed since the last message, if any. */
      layers?: Record<string, ArrayLike<number>>;
    }
  | { type: 'error'; message: string };
