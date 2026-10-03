import type { AnyModule } from '../core';
import { workModule } from './c1-work';
import { worldModule } from './f1-world';
import { timeModule } from './f2-time';
import { peopleModule } from './f3-people';

/**
 * Every game module, in any order (the loader sorts them). Each module lives
 * in its own folder here, e.g. `f1-world/`, and is added to this list when
 * it lands.
 */
export const ALL_MODULES: readonly AnyModule[] = [worldModule, timeModule, peopleModule, workModule];
