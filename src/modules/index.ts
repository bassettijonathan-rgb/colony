import type { AnyModule } from '../core';
import { worldModule } from './f1-world';

/**
 * Every game module, in any order (the loader sorts them). Each module lives
 * in its own folder here, e.g. `f1-world/`, and is added to this list when
 * it lands.
 */
export const ALL_MODULES: readonly AnyModule[] = [worldModule];
