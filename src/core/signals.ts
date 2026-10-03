/**
 * Signals are typed, one-way messages between modules ("a wall broke",
 * "a room froze"). Modules add their own signals by augmenting SignalMap:
 *
 *   declare module '../../core/signals' {
 *     interface SignalMap { 'room-froze': { roomId: number } }
 *   }
 *
 * Emitted signals are queued and delivered after the current phase ends,
 * in emission order, to listeners in module order. That keeps delivery
 * deterministic and stops one module from reacting mid-way through another.
 */

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface SignalMap {}

export type SignalName = keyof SignalMap & string;

export interface QueuedSignal {
  name: string;
  payload: unknown;
}

/** A listener gets the payload of the signal it subscribed to. */
export type SignalHandler<K extends SignalName, C> = (ctx: C, payload: SignalMap[K]) => void;
