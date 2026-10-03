/**
 * Structures colonists build from blueprints. A built tile stores its
 * building as index + 1 in this list, so add new entries at the end.
 */
export interface BuildingDef {
  id: string;
  name: string;
  colour: string;
  /** Materials, by item tag (any item carrying the tag will do). */
  cost: readonly { tag: string; count: number }[];
  /** Hours of work for a skill-10 builder once the materials are there. */
  workHours: number;
  /** Walking cost multiplier once built: 0 blocks the tile (a wall). */
  moveCost: number;
  /** Whether it closes off a room, as walls and doors do. */
  roomEdge: boolean;
  /** How the build tool lays it out when dragged: just the edge of the box (walls) or every tile. */
  drag: 'outline' | 'fill';
}

export const BUILDINGS: readonly BuildingDef[] = [
  { id: 'stone-wall', name: 'Stone wall', colour: '#8c8478', cost: [{ tag: 'stone', count: 1 }], workHours: 0.75, moveCost: 0, roomEdge: true, drag: 'outline' },
  { id: 'steel-wall', name: 'Steel wall', colour: '#a9b2bc', cost: [{ tag: 'metal', count: 5 }], workHours: 0.5, moveCost: 0, roomEdge: true, drag: 'outline' },
  { id: 'door', name: 'Door', colour: '#b0773e', cost: [{ tag: 'metal', count: 25 }], workHours: 1, moveCost: 2, roomEdge: true, drag: 'fill' },
];
