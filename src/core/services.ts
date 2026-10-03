/**
 * Services are the only way one module calls into another. Each service is
 * declared with a stand-in: a simple implementation used when the module
 * that provides it is switched off. For example the climate module's
 * `temperatureAt` stand-in always answers 21 °C, so everything that asks
 * about temperature keeps working without it.
 */

export interface ServiceKey<T> {
  readonly id: string;
  readonly standIn: T;
}

export function defineService<T>(id: string, standIn: T): ServiceKey<T> {
  return { id, standIn };
}

export class Services {
  private readonly impls = new Map<string, unknown>();

  provide<T>(key: ServiceKey<T>, impl: T): void {
    if (this.impls.has(key.id)) throw new Error(`Service "${key.id}" is already provided`);
    this.impls.set(key.id, impl);
  }

  /** The real implementation if a module provides it, otherwise the stand-in. */
  get<T>(key: ServiceKey<T>): T {
    return (this.impls.get(key.id) as T | undefined) ?? key.standIn;
  }

  isProvided(key: ServiceKey<unknown>): boolean {
    return this.impls.has(key.id);
  }
}
