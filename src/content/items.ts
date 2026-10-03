/**
 * Things that lie on the ground and get carried about: building materials,
 * ore, and later food, tools and clothes. A tile's item is stored as its
 * index + 1 in this list, so add new entries at the end.
 */
export interface ItemDef {
  id: string;
  name: string;
  colour: string;
  /** Most that fits in one stack on one tile (and in one trip). */
  stack: number;
  /** What the item counts as in building costs, e.g. "stone" or "metal". */
  tags: readonly string[];
}

export const ITEMS: readonly ItemDef[] = [
  { id: 'steel', name: 'Steel', colour: '#9aa3ad', stack: 75, tags: ['metal'] },
  { id: 'granite-chunk', name: 'Granite chunk', colour: '#8a817c', stack: 1, tags: ['stone'] },
  { id: 'basalt-chunk', name: 'Basalt chunk', colour: '#5a5a60', stack: 1, tags: ['stone'] },
  { id: 'sandstone-chunk', name: 'Sandstone chunk', colour: '#a88a66', stack: 1, tags: ['stone'] },
  { id: 'slate-chunk', name: 'Slate chunk', colour: '#6a6e75', stack: 1, tags: ['stone'] },
  { id: 'limestone-chunk', name: 'Limestone chunk', colour: '#b3ad98', stack: 1, tags: ['stone'] },
  { id: 'iron-ore', name: 'Iron ore', colour: '#a0583c', stack: 50, tags: ['ore'] },
  { id: 'copper-ore', name: 'Copper ore', colour: '#4f9a7e', stack: 50, tags: ['ore'] },
  { id: 'gold-ore', name: 'Gold ore', colour: '#d4b04a', stack: 50, tags: ['ore'] },
];

/** What digging out rock leaves behind: the item named `<rock id>-chunk`, and `<ore id>-ore` for ore. */
export const ORE_PER_TILE = 10;

/** What the colony lands with, dropped beside the landing site. */
export const LANDING_SUPPLIES: readonly { item: string; count: number }[] = [{ item: 'steel', count: 300 }];
