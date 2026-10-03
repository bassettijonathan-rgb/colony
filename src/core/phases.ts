/**
 * Every tick runs these phases in this order. Within a phase, systems run in
 * module order (dependencies first, then lower layers, then by id).
 */
export const PHASES = [
  'commands',
  'environment',
  'rooms',
  'needs',
  'mood',
  'jobs',
  'work',
  'social',
  'events',
  'history',
] as const;

export type Phase = (typeof PHASES)[number];

/** Module layers, from the bottom of the game up. */
export const LAYERS = ['foundation', 'core', 'society', 'pressure', 'frontier', 'dark', 'living'] as const;

export type Layer = (typeof LAYERS)[number];

/** One tick is about five in-game seconds. */
export const SECONDS_PER_TICK = 5;
