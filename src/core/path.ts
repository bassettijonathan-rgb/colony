/**
 * Grid pathfinding (A*), 8 directions, no cutting corners past blocked
 * tiles. Pure: give it a cost function and two tiles, get back the tiles to
 * walk through. Ties are broken by tile index, so the same map always gives
 * the same path.
 */

/** Walking cost of entering a tile: 1 = normal ground, 0 = can't enter. */
export type TileCost = (x: number, y: number) => number;

const SQRT2 = Math.SQRT2;

class MinHeap {
  private readonly keys: number[] = [];
  private readonly values: number[] = [];

  get size(): number {
    return this.keys.length;
  }

  push(key: number, value: number): void {
    const k = this.keys;
    const v = this.values;
    k.push(key);
    v.push(value);
    let i = k.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.less(parent, i)) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  /** Removes and returns the value with the smallest key. */
  pop(): number {
    const k = this.keys;
    const v = this.values;
    const top = v[0] as number;
    const lastK = k.pop() as number;
    const lastV = v.pop() as number;
    if (k.length > 0) {
      k[0] = lastK;
      v[0] = lastV;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < k.length && this.less(l, m)) m = l;
        if (r < k.length && this.less(r, m)) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }

  private less(a: number, b: number): boolean {
    const ka = this.keys[a] as number;
    const kb = this.keys[b] as number;
    return ka < kb || (ka === kb && (this.values[a] as number) < (this.values[b] as number));
  }

  private swap(a: number, b: number): void {
    const k = this.keys;
    const v = this.values;
    [k[a], k[b]] = [k[b] as number, k[a] as number];
    [v[a], v[b]] = [v[b] as number, v[a] as number];
  }
}

const DIRS: readonly [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, SQRT2],
  [1, -1, SQRT2],
  [-1, 1, SQRT2],
  [-1, -1, SQRT2],
];

/**
 * Tiles from just after `from` up to and including `to`, as `y * width + x`
 * indices. Returns null when there is no way through within `maxNodes`
 * expanded tiles, and [] when already there.
 */
export function findPath(
  width: number,
  height: number,
  cost: TileCost,
  from: { x: number; y: number },
  to: { x: number; y: number },
  maxNodes = 20_000,
): number[] | null {
  const start = from.y * width + from.x;
  const goal = to.y * width + to.x;
  if (start === goal) return [];
  if (cost(to.x, to.y) <= 0) return null;

  const g = new Map<number, number>([[start, 0]]);
  const came = new Map<number, number>();
  const closed = new Set<number>();
  const open = new MinHeap();
  const h = (x: number, y: number): number => {
    const dx = Math.abs(x - to.x);
    const dy = Math.abs(y - to.y);
    return Math.max(dx, dy) + (SQRT2 - 1) * Math.min(dx, dy);
  };
  open.push(h(from.x, from.y), start);

  let expanded = 0;
  while (open.size > 0) {
    const current = open.pop();
    if (current === goal) {
      const path = [goal];
      let step = goal;
      while (came.has(step)) {
        step = came.get(step) as number;
        if (step !== start) path.push(step);
      }
      return path.reverse();
    }
    if (closed.has(current)) continue;
    closed.add(current);
    if (++expanded > maxNodes) return null;

    const cx = current % width;
    const cy = (current - cx) / width;
    const gc = g.get(current) as number;
    for (const [dx, dy, step] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const c = cost(nx, ny);
      if (c <= 0) continue;
      // Diagonals only when both side tiles are open, so nobody squeezes between two rocks.
      if (dx !== 0 && dy !== 0 && (cost(cx + dx, cy) <= 0 || cost(cx, cy + dy) <= 0)) continue;
      const next = ny * width + nx;
      if (closed.has(next)) continue;
      const tentative = gc + step * c;
      if (tentative < (g.get(next) ?? Infinity)) {
        g.set(next, tentative);
        came.set(next, current);
        open.push(tentative + h(nx, ny), next);
      }
    }
  }
  return null;
}
