/**
 * Ground types. A tile's terrain is stored as its index in this list, so add
 * new entries at the end; reordering breaks saves.
 */
export interface TerrainDef {
  id: string;
  name: string;
  colour: string;
  /** Walking time multiplier. 0 means nobody can walk here. */
  moveCost: number;
  /** How well plants grow, 1 = normal soil. */
  fertility: number;
  /** Whether walls and furniture can be built here. */
  buildable: boolean;
  water: boolean;
}

export const TERRAIN: readonly TerrainDef[] = [
  { id: 'soil', name: 'Soil', colour: '#5b4a35', moveCost: 1, fertility: 1, buildable: true, water: false },
  { id: 'rich-soil', name: 'Rich soil', colour: '#4a3b28', moveCost: 1, fertility: 1.4, buildable: true, water: false },
  { id: 'gravel', name: 'Gravel', colour: '#7a705e', moveCost: 1, fertility: 0.7, buildable: true, water: false },
  { id: 'sand', name: 'Sand', colour: '#a8946a', moveCost: 1.2, fertility: 0.1, buildable: true, water: false },
  { id: 'marsh', name: 'Marsh', colour: '#3f4a36', moveCost: 2, fertility: 0, buildable: false, water: false },
  { id: 'shallow-water', name: 'Shallow water', colour: '#3d5a6b', moveCost: 3, fertility: 0, buildable: false, water: true },
  { id: 'deep-water', name: 'Deep water', colour: '#223a4d', moveCost: 0, fertility: 0, buildable: false, water: true },
  { id: 'rough-stone', name: 'Rough stone', colour: '#55534f', moveCost: 1, fertility: 0, buildable: true, water: false },
  { id: 'ice', name: 'Ice', colour: '#b9c6cc', moveCost: 1.5, fertility: 0, buildable: true, water: false },
];
