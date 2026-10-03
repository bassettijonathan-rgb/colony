/**
 * Ore veins found inside rock. Stored as index + 1 (0 = no ore), so add new
 * entries at the end.
 */
export interface OreDef {
  id: string;
  name: string;
  colour: string;
  /** Veins per 1,000 rock tiles. */
  veinsPer1000: number;
  /** Tiles per vein, smallest and largest. */
  veinSize: [number, number];
}

export const ORES: readonly OreDef[] = [
  { id: 'iron', name: 'Iron ore', colour: '#a0583c', veinsPer1000: 2, veinSize: [6, 18] },
  { id: 'copper', name: 'Copper ore', colour: '#4f9a7e', veinsPer1000: 1, veinSize: [4, 12] },
  { id: 'gold', name: 'Gold ore', colour: '#d4b04a', veinsPer1000: 0.25, veinSize: [2, 6] },
];
