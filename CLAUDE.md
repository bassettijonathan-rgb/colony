# Colony: conventions for Claude Code

Colony is a deterministic colony simulator set on the planet Verity. The design
docs (game design, setting, technical architecture) live outside this repo; this
file holds the rules the code must follow.

## Commands

- `npm run dev`: run the game in the browser
- `npm test`: unit and scenario tests (Vitest)
- `npm run typecheck`, `npm run lint`: must pass before every push
- `npm run sim -- --seed 42 --days 3 [--off module-id]`: run the game headless and print a summary
- `npm run build`: production build (deployed to GitHub Pages from `main`)

## Layout

- `src/core/`: tick loop, seeded random, registries, signals, services, module loader, saves. No browser code.
- `src/modules/<id>/`: one folder per game module (e.g. `f1-world`, `c3-climate`). Listed in `src/modules/index.ts`.
- `src/content/`: game data files (items, buildings, recipes, traits, events, biomes).
- `src/render/`: PixiJS map drawing. Reads snapshots from the worker only.
- `src/ui/`: Preact panels.
- `src/worker.ts`: runs the simulation in a Web Worker. `src/main.ts`: starts the page.
- `tools/headless.ts`: Node runner. `tests/`: Vitest tests; `tests/scenarios/` holds small hand-built maps with expected outcomes.

## Rules

1. **Deterministic simulation.** Same seed and same commands must give the same world hash.
   - No randomness outside the seeded generator (`ctx.rng`). No `Math.random`.
   - No real time in the simulation. No `Date`, `performance.now` or timers; use `world.tick`.
   - No iteration whose order depends on anything but the data. Maps keep insertion order; when order
     matters, sort by id. Never key a `Set` or `Map` by object identity.
   - Lint enforces the first two in `src/core/` and `src/modules/`.
2. **No browser code in `src/core/` or `src/modules/`.** They run in the worker, in Node and in tests.
3. **World state is plain data.** Everything in `World` must save, hash and copy: numbers, strings,
   arrays, plain objects, `Map`s and typed arrays. No functions or class instances.
4. **Modules talk only through signals and services.** A module never imports another module's
   internals or writes another module's state. It may import another module's exported signal types,
   service keys and registry keys.
5. **Every module works when the modules that depend on it are switched off**, and every service it
   provides has a stand-in so modules that use it keep working when it is off. Hard dependencies go
   in `deps`; anything optional goes through a service.
6. **Every new rule gets a test.** Each module has tests for its own rules plus the module-off test
   (`expectRunsWithout` in `tests/helpers.ts`, run for every module in `tests/modules.test.ts`).
7. **Content goes in data files** in `src/content/`, validated at startup, not hard-coded in rules.
   Content stored in tile layers by position (terrain, rocks, ores) is append-only: reordering breaks saves.
8. **Each build stage is a short series of small pull requests**, one module or feature per PR.

## Writing a module

A module is a `defineModule({...})` object (see `src/core/module.ts` and the sample modules in
`tests/fixtures/sampleModules.ts`):

- `id`, `name`, `layer` (foundation, core, society, pressure, frontier, dark, living), `deps`
- `init`: creates the module's state for a new game (stored in `world.modules[id]`). New-game choices
  (biome, hilliness) arrive in `world.settings[id]`.
- `setup`: defines the module's registries and provides its services (runs on every start and load)
- `contribute`: adds entries to other modules' registries (use `registries.find`, which returns
  undefined when the owner is off)
- `systems`: `{ id, phase, every?, offset?, run(ctx) }`. Phases run in this order: commands,
  environment, rooms, needs, mood, jobs, work, social, events, history. Within a phase, modules run
  dependencies first, then lower layers, then by id.
- `listen`: signal handlers. Signals are declared by augmenting `SignalMap` in `src/core/signals.ts`
  and are delivered after the phase that emitted them.
- `commands`: player command handlers. Command types are declared by augmenting `CommandMap`.

One tick is 5 in-game seconds; 1x speed is 10 ticks per real second. A Verity day is 26 hours.

## Performance budget

200 colonists at 3x under 10 ms per tick, rendering at 60 fps. Tile data lives in typed-array
layers; heavy systems use `every`/`offset` to spread work across ticks.
