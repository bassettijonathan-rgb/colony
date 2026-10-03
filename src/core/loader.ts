import type { AnyModule } from './module';
import { LAYERS } from './phases';

export interface ResolvedModules {
  /** Enabled modules in run order. */
  order: AnyModule[];
  /** Every switched-off module, including those switched off because a dependency was. */
  disabled: string[];
}

/**
 * Works out which modules run and in what order.
 *
 * Switching a module off also switches off every module that depends on it.
 * Run order puts dependencies first; among modules that are ready at the
 * same time, lower layers go first, then ids in alphabetical order.
 */
export function resolveModules(all: readonly AnyModule[], disabled: readonly string[] = []): ResolvedModules {
  const byId = new Map<string, AnyModule>();
  for (const m of all) {
    if (byId.has(m.id)) throw new Error(`Two modules share the id "${m.id}"`);
    byId.set(m.id, m);
  }
  for (const id of disabled) {
    if (!byId.has(id)) throw new Error(`Cannot switch off unknown module "${id}"`);
  }
  for (const m of all) {
    for (const dep of m.deps ?? []) {
      if (!byId.has(dep)) throw new Error(`Module "${m.id}" depends on unknown module "${dep}"`);
    }
  }

  // Spread "off" down to dependents until nothing changes.
  const off = new Set(disabled);
  let changed = true;
  while (changed) {
    changed = false;
    for (const m of all) {
      if (!off.has(m.id) && (m.deps ?? []).some((d) => off.has(d))) {
        off.add(m.id);
        changed = true;
      }
    }
  }

  const enabled = all.filter((m) => !off.has(m.id));
  const rank = (m: AnyModule): number => LAYERS.indexOf(m.layer);
  const before = (a: AnyModule, b: AnyModule): number => rank(a) - rank(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

  const order: AnyModule[] = [];
  const placed = new Set<string>();
  const remaining = [...enabled];
  while (remaining.length > 0) {
    const ready = remaining.filter((m) => (m.deps ?? []).every((d) => placed.has(d))).sort(before);
    const next = ready[0];
    if (!next) {
      throw new Error(`Modules depend on each other in a loop: ${remaining.map((m) => m.id).join(', ')}`);
    }
    order.push(next);
    placed.add(next.id);
    remaining.splice(remaining.indexOf(next), 1);
  }

  return { order, disabled: [...off].sort() };
}
