/**
 * What other modules, the worker and the UI may use from the work module:
 * the job board service, designations, priorities, signals and commands.
 */
import { defineService, type EntityId } from '../../core';

export const WORK_MODULE_ID = 'c1-work';

/** Tile layer (Uint8) marking what the player has asked to be done on each tile. */
export const DESIGNATION_LAYER = 'designation';
export const DESIGNATION = { none: 0, mine: 1 } as const;

/** Component table: colonist id to `{ workTypeId: priority }`. Missing entries use DEFAULT_PRIORITY. */
export const PRIORITIES_COMPONENT = 'c1-work.priorities';
/** Priorities run from 1 (do first) to 4 (do last); 0 means never. */
export const MAX_PRIORITY = 4;
export const DEFAULT_PRIORITY = 3;

/** A piece of work for one colonist, done standing next to a target tile. */
export interface JobPost {
  /** Work type id from content/work.ts; decides who does it, and which skill sets the pace. */
  workType: string;
  /** The poster's own name for the job, e.g. "mine". Comes back in `job-done`. */
  kind: string;
  /** Module that posted the job and handles `job-done`. */
  owner: string;
  x: number;
  y: number;
  /** Work needed, in ticks at speed 1. A skill-10 colonist works at speed 1. */
  amount: number;
  /** Shown in the inspector while a colonist works on it, e.g. "Mining granite". */
  label: string;
}

export interface Job extends JobPost {
  id: number;
  /** Work done so far. Kept when the worker leaves, so the next one carries on. */
  done: number;
  /** Who has taken the job, or null when it is open. */
  worker: EntityId | null;
  /** The tile the worker stands on, next to the target. */
  stand: { x: number; y: number } | null;
}

declare module '../../core/signals' {
  interface SignalMap {
    'job-started': { job: number; kind: string; worker: EntityId; x: number; y: number };
    /** A job is finished. The owner applies the result. */
    'job-done': { job: number; kind: string; owner: string; worker: EntityId; x: number; y: number };
    /** A rock tile has been dug out. `ore` is the ore id, if the rock held any. */
    'rock-mined': { x: number; y: number; rock: string; ore: string | null; worker: EntityId };
  }
}

/** A rectangle of tiles, corners included, in any order. */
export interface TileArea {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

declare module '../../core/commands' {
  interface CommandMap {
    /** Mark every rock tile in the area for mining. */
    'designate-mine': TileArea;
    /** Remove designations (and their jobs) in the area. */
    'cancel-designations': TileArea;
    /** 0 (never) to 4. */
    'set-work-priority': { id: EntityId; workType: string; priority: number };
  }
}

export interface WorkBoardService {
  /** Adds a job. Returns its id, or null when nobody will ever do it (the work module is off). */
  post(job: JobPost): number | null;
  /** Removes a job; anyone working on it stops. */
  cancel(id: number): void;
  get(id: number): Job | null;
  /** Every job, oldest first. */
  jobs(): readonly Job[];
  priorityOf(colonist: EntityId, workType: string): number;
}

/** Without the work module nobody takes jobs, and every colonist would do everything at the default priority. */
export const workBoard = defineService<WorkBoardService>('c1-work.board', {
  post: () => null,
  cancel: () => {},
  get: () => null,
  jobs: () => [],
  priorityOf: () => DEFAULT_PRIORITY,
});
