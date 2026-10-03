/**
 * Kinds of work colonists can be given priorities for. Each uses one skill,
 * which sets how fast the work goes. `order` breaks ties between work types
 * at the same priority: lower comes first. New types land with the modules
 * that create their jobs (construction, growing, cooking...).
 */
export interface WorkTypeDef {
  id: string;
  name: string;
  /** Skill id from skills.ts. */
  skill: string;
  order: number;
}

export const WORK_TYPES: readonly WorkTypeDef[] = [{ id: 'mining', name: 'Mining', skill: 'mining', order: 50 }];
