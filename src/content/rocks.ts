/**
 * Natural rock that forms hills and mountains. Mined rock leaves rough stone
 * floor and a rock roof overhead. Stored as index + 1 (0 = no rock), so add
 * new entries at the end.
 */
export interface RockDef {
  id: string;
  name: string;
  colour: string;
  /** Work needed to mine one tile, relative to granite. */
  hardness: number;
}

export const ROCKS: readonly RockDef[] = [
  { id: 'granite', name: 'Granite', colour: '#7d7470', hardness: 1 },
  { id: 'basalt', name: 'Basalt', colour: '#4a4a4f', hardness: 1.1 },
  { id: 'sandstone', name: 'Sandstone', colour: '#9a7e5c', hardness: 0.7 },
  { id: 'slate', name: 'Slate', colour: '#5c6066', hardness: 0.9 },
  { id: 'limestone', name: 'Limestone', colour: '#a39d8a', hardness: 0.8 },
];
