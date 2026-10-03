import type { CommandMap, CommandType } from './commands';
import type { Layer, Phase } from './phases';
import type { Registries } from './registry';
import type { Rng } from './rng';
import type { Services } from './services';
import type { SignalMap, SignalName } from './signals';
import type { World } from './world';

/** What every system, listener and command handler can reach. */
export interface SimContext {
  readonly world: World;
  readonly rng: Rng;
  readonly registries: Registries;
  readonly services: Services;
  emit<K extends SignalName>(name: K, payload: SignalMap[K]): void;
  isEnabled(moduleId: string): boolean;
}

/** SimContext plus the calling module's own state. */
export interface ModuleContext<S> extends SimContext {
  readonly state: S;
}

/** Used while modules wire themselves up, before the first tick. */
export interface SetupContext {
  readonly world: World;
  readonly registries: Registries;
  readonly services: Services;
  isEnabled(moduleId: string): boolean;
  /** The module's own state. Service implementations close over this. */
  readonly state: unknown;
}

export interface SystemDef<S> {
  id: string;
  phase: Phase;
  /** Run every N ticks (default 1). */
  every?: number;
  /** Tick offset for `every`, to spread heavy systems across ticks. */
  offset?: number;
  run(ctx: ModuleContext<S>): void;
}

export type ListenerDefs<S> = {
  [K in SignalName]?: (ctx: ModuleContext<S>, payload: SignalMap[K]) => void;
};

export type CommandDefs<S> = {
  [K in CommandType]?: (ctx: ModuleContext<S>, payload: CommandMap[K]) => void;
};

/**
 * A game module: one self-contained part of the game (world map, time,
 * people, work, climate...). See CLAUDE.md for the rules modules follow.
 */
export interface GameModule<S = undefined> {
  id: string;
  name: string;
  layer: Layer;
  /** Modules this one cannot run without. Switching one off switches this off too. */
  deps?: readonly string[];
  /** Creates the module's state for a new game. Must be plain data. */
  init?(ctx: SimContext): S;
  /** Defines this module's registries and provides its services. Runs on every start and load. */
  setup?(ctx: SetupContext & { readonly state: S }): void;
  /** Adds entries to other modules' registries. Runs after every module's setup. */
  contribute?(ctx: SetupContext & { readonly state: S }): void;
  systems?: readonly SystemDef<S>[];
  listen?: ListenerDefs<S>;
  commands?: CommandDefs<S>;
}

/** Erased module type for lists that mix modules with different state types. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyModule = GameModule<any>;

/** Identity helper that keeps the state type inferred. */
export function defineModule<S = undefined>(module: GameModule<S>): GameModule<S> {
  return module;
}
