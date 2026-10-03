import type { Command, LoggedCommand } from './commands';
import { hashValue } from './hash';
import { resolveModules } from './loader';
import type { AnyModule, ModuleContext, SetupContext, SimContext } from './module';
import { PHASES, type Phase } from './phases';
import { Registries } from './registry';
import { Rng } from './rng';
import { decodeWorld, encodeWorld, SAVE_VERSION, type SaveFile } from './save';
import { Services } from './services';
import type { QueuedSignal } from './signals';
import { createWorld, type World } from './world';

export interface SimulationOptions {
  seed: number;
  modules: readonly AnyModule[];
  /** Module ids to switch off. Their dependents are switched off too. */
  disabled?: readonly string[];
  width?: number;
  height?: number;
  /** New-game settings keyed by module id, e.g. `{ 'f1-world': { biome: 'tundra' } }`. */
  settings?: Record<string, unknown>;
}

/** Guards against two modules bouncing signals back and forth forever. */
const MAX_SIGNALS_PER_PHASE = 100_000;

/**
 * Runs the world one tick at a time. Contains no browser code, so it runs
 * the same in the page's worker, in Node for the headless runner, and in
 * tests.
 */
export class Simulation {
  readonly world: World;
  readonly modules: readonly AnyModule[];
  readonly disabled: readonly string[];
  readonly registries = new Registries();
  readonly services = new Services();
  readonly commandLog: LoggedCommand[] = [];

  private readonly rng: Rng;
  private readonly enabledIds: Set<string>;
  private readonly pendingCommands: Command[] = [];
  private readonly signalQueue: QueuedSignal[] = [];
  private readonly ctx: SimContext;
  private readonly moduleCtx = new Map<string, ModuleContext<unknown>>();
  private readonly systemsByPhase: Map<Phase, { module: AnyModule; system: NonNullable<AnyModule['systems']>[number] }[]>;

  private constructor(world: World, allModules: readonly AnyModule[], disabled: readonly string[], fresh: boolean) {
    const resolved = resolveModules(allModules, disabled);
    this.world = world;
    this.modules = resolved.order;
    this.disabled = resolved.disabled;
    this.enabledIds = new Set(this.modules.map((m) => m.id));
    this.rng = new Rng(world.rng);

    this.ctx = {
      world,
      rng: this.rng,
      registries: this.registries,
      services: this.services,
      emit: (name, payload) => {
        this.signalQueue.push({ name, payload });
      },
      isEnabled: (id) => this.enabledIds.has(id),
    };

    for (const m of this.modules) {
      const ctx = this.ctx;
      this.moduleCtx.set(m.id, {
        ...ctx,
        get state() {
          return world.modules[m.id];
        },
      });
    }

    const setupCtx = (m: AnyModule): SetupContext => ({
      world,
      registries: this.registries,
      services: this.services,
      isEnabled: this.ctx.isEnabled,
      get state() {
        return world.modules[m.id];
      },
    });
    // Each module starts and then sets up before the next one starts, so a module's
    // init can already use the services of the modules it comes after.
    for (const m of this.modules) {
      if (fresh) world.modules[m.id] = m.init ? m.init(this.ctx) : null;
      m.setup?.(setupCtx(m));
    }
    for (const m of this.modules) m.contribute?.(setupCtx(m));

    this.systemsByPhase = new Map(PHASES.map((p) => [p, []]));
    for (const module of this.modules) {
      for (const system of module.systems ?? []) {
        this.systemsByPhase.get(system.phase)?.push({ module, system });
      }
    }

    if (fresh) this.deliverSignals();
  }

  static create(options: SimulationOptions): Simulation {
    const world = createWorld(options.seed, options.width, options.height, structuredClone(options.settings ?? {}));
    return new Simulation(world, options.modules, options.disabled ?? [], true);
  }

  /** Restores a saved game. The same module list must be passed in; switched-off modules stay off. */
  static load(save: SaveFile, modules: readonly AnyModule[], disabled: readonly string[] = save.disabled ?? []): Simulation {
    if (save.version !== SAVE_VERSION) throw new Error(`Save version ${save.version} is not supported`);
    const sim = new Simulation(decodeWorld(save.world), modules, disabled, false);
    const enabled = sim.modules.map((m) => m.id);
    if (enabled.join(',') !== save.modules.join(',')) {
      throw new Error(`Save was made with modules [${save.modules.join(', ')}], not [${enabled.join(', ')}]`);
    }
    sim.commandLog.push(...save.commandLog);
    return sim;
  }

  /**
   * Rebuilds a game from its seed and command log, running until `untilTick`.
   * Gives the same world as the original game, tick for tick.
   */
  static replay(options: SimulationOptions, log: readonly LoggedCommand[], untilTick: number): Simulation {
    const sim = Simulation.create(options);
    let next = 0;
    while (sim.world.tick < untilTick) {
      while (next < log.length && (log[next] as LoggedCommand).tick === sim.world.tick) {
        const entry = log[next++] as LoggedCommand;
        sim.enqueue({ type: entry.type, payload: entry.payload } as Command);
      }
      sim.step();
    }
    return sim;
  }

  /** Queues a player command. It is applied at the start of the next tick. */
  enqueue(command: Command): void {
    this.pendingCommands.push(command);
  }

  step(ticks = 1): void {
    for (let i = 0; i < ticks; i++) this.runTick();
  }

  hash(): string {
    return hashValue(this.world);
  }

  save(): SaveFile {
    return {
      version: SAVE_VERSION,
      modules: this.modules.map((m) => m.id),
      disabled: [...this.disabled],
      world: encodeWorld(this.world),
      commandLog: this.commandLog.map((c) => ({ ...c })),
    };
  }

  private runTick(): void {
    const tick = this.world.tick;
    for (const phase of PHASES) {
      if (phase === 'commands') this.applyCommands(tick);
      for (const { module, system } of this.systemsByPhase.get(phase) ?? []) {
        const every = system.every ?? 1;
        if ((tick - (system.offset ?? 0)) % every !== 0) continue;
        system.run(this.moduleCtx.get(module.id) as ModuleContext<unknown>);
      }
      this.deliverSignals();
    }
    this.world.tick = tick + 1;
  }

  private applyCommands(tick: number): void {
    const commands = this.pendingCommands.splice(0);
    for (const command of commands) {
      let handled = false;
      for (const m of this.modules) {
        const handler = m.commands?.[command.type] as ((ctx: ModuleContext<unknown>, p: unknown) => void) | undefined;
        if (!handler) continue;
        handler(this.moduleCtx.get(m.id) as ModuleContext<unknown>, command.payload);
        handled = true;
      }
      // Commands for switched-off modules are dropped and not logged.
      if (handled) this.commandLog.push({ tick, type: command.type, payload: command.payload });
    }
  }

  private deliverSignals(): void {
    let delivered = 0;
    while (this.signalQueue.length > 0) {
      const signal = this.signalQueue.shift() as QueuedSignal;
      for (const m of this.modules) {
        const listener = (m.listen as Record<string, ((ctx: ModuleContext<unknown>, p: unknown) => void) | undefined>)?.[signal.name];
        listener?.(this.moduleCtx.get(m.id) as ModuleContext<unknown>, signal.payload);
      }
      if (++delivered > MAX_SIGNALS_PER_PHASE) {
        throw new Error(`More than ${MAX_SIGNALS_PER_PHASE} signals in one phase; last was "${signal.name}"`);
      }
    }
  }
}
