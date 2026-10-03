/** Messages between the page (main thread) and the simulation worker. */

export type Speed = 0 | 1 | 3;

/** Ticks per real second at each speed. 1x is 10 ticks a second. */
export const TICKS_PER_SECOND: Record<Speed, number> = { 0: 0, 1: 10, 3: 30 };

export type ToWorker =
  | { type: 'start'; seed: number }
  | { type: 'speed'; speed: Speed }
  | { type: 'command'; command: { type: string; payload: unknown } };

export interface MapSnapshot {
  width: number;
  height: number;
  /** Layer name to a copy of its data. */
  layers: Record<string, ArrayLike<number>>;
}

export type FromWorker =
  | { type: 'started'; seed: number; modules: string[]; map: MapSnapshot }
  | { type: 'tick'; tick: number; tickMs: number }
  | { type: 'error'; message: string };
