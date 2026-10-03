import { Container, Graphics, Text } from 'pixi.js';

/** What the map needs to draw one colonist. */
export interface PawnDraw {
  id: number;
  name: string;
  x: number;
  y: number;
  activity: string;
}

/** Shirt colours, picked by id so a colonist keeps theirs. */
const COLOURS = [0xe0a458, 0x6fa8dc, 0x93c47d, 0xc27ba0, 0xf6b26b, 0x76a5af, 0xd5a6bd, 0xb4a7d6, 0xe06666, 0xffd966];

interface Sprite {
  root: Container;
  body: Graphics;
  label: Text;
  /** Where the sprite is drawn now, gliding towards the latest snapshot. */
  shownX: number;
  shownY: number;
  targetX: number;
  targetY: number;
}

/** Draws colonists as coloured dots with name labels, smoothed between snapshots. */
export class PawnLayer extends Container {
  private readonly sprites = new Map<number, Sprite>();
  private selected: number | null = null;

  constructor(private readonly tilePx: number) {
    super();
  }

  update(pawns: readonly PawnDraw[], selected: number | null): void {
    const seen = new Set<number>();
    const selectionChanged = selected !== this.selected;
    this.selected = selected;
    for (const p of pawns) {
      seen.add(p.id);
      let s = this.sprites.get(p.id);
      const cx = (p.x + 0.5) * this.tilePx;
      const cy = (p.y + 0.5) * this.tilePx;
      if (!s) {
        const root = new Container();
        const body = new Graphics();
        const label = new Text({ text: p.name.split(' ')[0] ?? p.name, style: { fill: 0xf2efe6, fontSize: 11, fontFamily: 'system-ui' } });
        label.anchor.set(0.5, 0);
        label.y = this.tilePx * 0.6;
        root.addChild(body, label);
        this.addChild(root);
        s = { root, body, label, shownX: cx, shownY: cy, targetX: cx, targetY: cy };
        this.sprites.set(p.id, s);
        this.drawBody(s, p, p.id === selected);
      } else if (selectionChanged || s.body.label !== p.activity) {
        this.drawBody(s, p, p.id === selected);
      }
      s.targetX = cx;
      s.targetY = cy;
    }
    for (const [id, s] of this.sprites) {
      if (!seen.has(id)) {
        s.root.destroy({ children: true });
        this.sprites.delete(id);
      }
    }
  }

  /** Moves sprites a little closer to their latest positions. Call every frame. */
  glide(deltaMs: number, zoom: number): void {
    const k = Math.min(1, deltaMs / 80);
    for (const s of this.sprites.values()) {
      s.shownX += (s.targetX - s.shownX) * k;
      s.shownY += (s.targetY - s.shownY) * k;
      s.root.position.set(s.shownX, s.shownY);
      // Names only when zoomed in far enough to read them, and never smaller on screen.
      s.label.visible = zoom >= 0.6;
      s.label.scale.set(1 / Math.max(zoom, 0.6));
    }
  }

  private drawBody(s: Sprite, p: PawnDraw, selected: boolean): void {
    const r = this.tilePx * 0.42;
    const colour = COLOURS[p.id % COLOURS.length] as number;
    s.body.clear();
    if (selected) s.body.circle(0, 0, r + 3).stroke({ color: 0xffffff, width: 2 });
    s.body.circle(0, 0, r).fill({ color: colour, alpha: p.activity === 'sleep' ? 0.5 : 1 }).stroke({ color: 0x1a1a1a, width: 1 });
    // Remember what was drawn so the body is only redrawn when it changes.
    s.body.label = p.activity;
  }
}
