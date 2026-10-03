import { describe, expect, it } from 'vitest';
import { findPath } from '../src/core';

/** Builds a cost function from a picture: '#' is blocked, '~' costs 3, anything else costs 1. */
function grid(rows: string[]) {
  const height = rows.length;
  const width = (rows[0] as string).length;
  const cost = (x: number, y: number): number => {
    const c = rows[y]?.[x];
    return c === undefined || c === '#' ? 0 : c === '~' ? 3 : 1;
  };
  return { width, height, cost };
}

const xy = (i: number, width: number) => ({ x: i % width, y: Math.floor(i / width) });

describe('pathfinding', () => {
  it('walks straight across open ground, diagonals included', () => {
    const g = grid(['.....', '.....', '.....']);
    const path = findPath(g.width, g.height, g.cost, { x: 0, y: 0 }, { x: 4, y: 2 }) as number[];
    expect(path.length).toBe(4);
    expect(xy(path[path.length - 1] as number, g.width)).toEqual({ x: 4, y: 2 });
  });

  it('goes round walls and never cuts a corner between two blocked tiles', () => {
    const g = grid(['..#..', '..#..', '.....']);
    const path = findPath(g.width, g.height, g.cost, { x: 0, y: 0 }, { x: 4, y: 0 }) as number[];
    const tiles = path.map((i) => xy(i, g.width));
    for (const t of tiles) expect(g.cost(t.x, t.y)).toBeGreaterThan(0);
    expect(tiles.some((t) => t.y === 2)).toBe(true);
    // Each step moves at most one tile, and a diagonal step never squeezes past a wall.
    let prev = { x: 0, y: 0 };
    for (const t of tiles) {
      expect(Math.max(Math.abs(t.x - prev.x), Math.abs(t.y - prev.y))).toBe(1);
      if (t.x !== prev.x && t.y !== prev.y) {
        expect(g.cost(t.x, prev.y)).toBeGreaterThan(0);
        expect(g.cost(prev.x, t.y)).toBeGreaterThan(0);
      }
      prev = t;
    }
  });

  it('prefers a longer dry route over wading through costly water', () => {
    const g = grid(['.......', '.~~~~~.', '.~~~~~.', '.......']);
    const path = findPath(g.width, g.height, g.cost, { x: 0, y: 1 }, { x: 6, y: 2 }) as number[];
    for (const i of path) expect(g.cost(xy(i, g.width).x, xy(i, g.width).y)).toBe(1);
  });

  it('returns null when the goal is walled off or blocked, and [] when already there', () => {
    const g = grid(['..#..', '..#..', '..#..']);
    expect(findPath(g.width, g.height, g.cost, { x: 0, y: 0 }, { x: 4, y: 0 })).toBeNull();
    expect(findPath(g.width, g.height, g.cost, { x: 0, y: 0 }, { x: 2, y: 0 })).toBeNull();
    expect(findPath(g.width, g.height, g.cost, { x: 1, y: 1 }, { x: 1, y: 1 })).toEqual([]);
  });

  it('gives up after the search limit', () => {
    const g = grid(Array.from({ length: 50 }, () => '.'.repeat(50)));
    expect(findPath(g.width, g.height, g.cost, { x: 0, y: 0 }, { x: 49, y: 49 }, 10)).toBeNull();
  });
});
