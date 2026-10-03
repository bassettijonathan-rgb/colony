/**
 * Registries are the extension points of the game: lists of needs, thoughts,
 * work types, things, recipes and so on that any module can add to. The
 * module that owns a concept defines the registry; other modules contribute
 * entries in their `contribute` hook.
 */

export class Registry<T> {
  private readonly entries = new Map<string, T>();

  constructor(readonly name: string) {}

  register(id: string, entry: T): void {
    if (this.entries.has(id)) throw new Error(`Registry "${this.name}" already has an entry "${id}"`);
    this.entries.set(id, entry);
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  get(id: string): T {
    const entry = this.entries.get(id);
    if (entry === undefined) throw new Error(`Registry "${this.name}" has no entry "${id}"`);
    return entry;
  }

  /** All entries in registration order, which follows module order. */
  all(): readonly [string, T][] {
    return [...this.entries];
  }

  get size(): number {
    return this.entries.size;
  }
}

/** A typed key for a registry, so contributors and readers agree on T. */
export interface RegistryKey<T> {
  readonly name: string;
  /** Phantom field for type inference; never set. */
  readonly __type?: T;
}

export function registryKey<T>(name: string): RegistryKey<T> {
  return { name };
}

export class Registries {
  private readonly byName = new Map<string, Registry<unknown>>();

  define<T>(key: RegistryKey<T>): Registry<T> {
    if (this.byName.has(key.name)) throw new Error(`Registry "${key.name}" is already defined`);
    const registry = new Registry<T>(key.name);
    this.byName.set(key.name, registry as Registry<unknown>);
    return registry;
  }

  /** Returns the registry, or undefined when its owning module is switched off. */
  find<T>(key: RegistryKey<T>): Registry<T> | undefined {
    return this.byName.get(key.name) as Registry<T> | undefined;
  }

  get<T>(key: RegistryKey<T>): Registry<T> {
    const registry = this.find(key);
    if (!registry) throw new Error(`Registry "${key.name}" is not defined (is its module enabled?)`);
    return registry;
  }
}
