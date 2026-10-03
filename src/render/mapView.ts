import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { MapSnapshot } from '../protocol';
import { blueprintOverlay, buildingOverlay, colourMap, designationOverlay, drawItems, roomOverlay, snowOverlay } from './mapColours';
import { PawnLayer, type PawnDraw } from './pawnLayer';

/** Screen pixels per tile at zoom 1. */
const TILE_PX = 8;

/**
 * Draws the map. Reads snapshots sent by the worker and never touches the
 * simulation directly.
 */
export class MapView {
  private readonly app = new Application();
  private readonly camera = new Container();
  private mapSprite: Sprite | null = null;
  /**
   * One slot per overlay, in drawing order. Ground things sit under the night
   * veil; the player's marks and plans stay bright above it.
   */
  private readonly slots = {
    snow: new Container(),
    building: new Container(),
    items: new Container(),
    room: new Container(),
    designation: new Container(),
    blueprint: new Container(),
  };
  /** Rectangle being dragged out with an area tool. */
  private readonly areaBox = new Graphics();
  /** When set, left-drag marks out an area instead of panning; the colour is the box outline. */
  areaTool: number | null = null;
  /** Called when an area is dragged out with an area tool (corners included). */
  onArea: (area: { x0: number; y0: number; x1: number; y1: number }) => void = () => {};
  private readonly night = new Sprite(Texture.WHITE);
  private readonly pawns = new PawnLayer(TILE_PX);
  /** Left click on a tile (not a drag). */
  onClick: (tile: { x: number; y: number }) => void = () => {};
  /** Right click on a tile. */
  onRightClick: (tile: { x: number; y: number }) => void = () => {};
  private mapSize = { width: 0, height: 0 };
  /** Called with the tile under the mouse, or null when the mouse leaves the map. */
  onHover: (tile: { x: number; y: number } | null) => void = () => {};

  async mount(parent: HTMLElement): Promise<void> {
    await this.app.init({ resizeTo: parent, background: '#0b0d10', antialias: false });
    parent.appendChild(this.app.canvas);
    this.app.stage.addChild(this.camera);
    this.enablePanZoom(this.app.canvas);
    this.enableKeyboardPan();
    this.app.ticker.add((t) => this.pawns.glide(t.deltaMS, this.camera.scale.x));
  }

  /** Centres the view on a tile at the given zoom. */
  focus(x: number, y: number, zoom: number): void {
    this.camera.scale.set(zoom);
    this.camera.position.set(
      this.app.screen.width / 2 - (x + 0.5) * TILE_PX * zoom,
      this.app.screen.height / 2 - (y + 0.5) * TILE_PX * zoom,
    );
  }

  /** Draws colonists; `selected` gets a ring. */
  showPawns(pawns: readonly PawnDraw[], selected: number | null): void {
    this.pawns.update(pawns, selected);
  }

  showMap(map: MapSnapshot): void {
    this.mapSize = { width: map.width, height: map.height };
    this.mapSprite?.destroy();
    this.mapSprite = tileSprite(colourMap(map), map.width, map.height);
    this.camera.addChild(this.mapSprite);
    this.camera.addChild(this.slots.snow, this.slots.building, this.slots.items);

    // Night is a dark blue veil over the whole map, faded in and out by setLight.
    this.night.tint = 0x0a1030;
    this.night.width = map.width * TILE_PX;
    this.night.height = map.height * TILE_PX;
    this.night.alpha = 0;
    this.camera.addChild(this.night);
    // Colonists and the player's marks stay visible above the night veil.
    this.slots.room.visible = false;
    this.camera.addChild(this.slots.room, this.slots.designation, this.slots.blueprint);
    this.camera.addChild(this.pawns);
    this.camera.addChild(this.areaBox);
    this.updateLayers(map, map.layers);

    this.focus(map.width / 2, map.height / 2, 1);
  }

  /** Redraws overlays for layers that changed. `map` holds the latest copy of every layer. */
  updateLayers(map: MapSnapshot, changed: Record<string, ArrayLike<number>>): void {
    // Mining changes the ground itself.
    if (this.mapSprite && (changed.rock || changed.ore || changed.terrain || changed.roof) && changed !== map.layers) {
      const index = this.camera.getChildIndex(this.mapSprite);
      this.mapSprite.destroy();
      this.mapSprite = tileSprite(colourMap(map), map.width, map.height);
      this.camera.addChildAt(this.mapSprite, index);
    }
    const { width, height } = map;
    if (changed.designation) this.fill('designation', tileSprite(designationOverlay(map, changed.designation), width, height));
    if (changed.snow) this.fill('snow', tileSprite(snowOverlay(map, changed.snow), width, height));
    if (changed.building) this.fill('building', tileSprite(buildingOverlay(map, changed.building), width, height));
    if (changed.room) this.fill('room', tileSprite(roomOverlay(map, changed.room), width, height));
    if (changed.blueprint) this.fill('blueprint', tileSprite(blueprintOverlay(map, changed.blueprint), width, height));
    if (changed.item || changed['item-count']) {
      const g = new Graphics();
      drawItems(g, map, TILE_PX);
      this.fill('items', g);
    }
  }

  /** Shows or hides the rooms view. */
  showRooms(visible: boolean): void {
    this.slots.room.visible = visible;
  }

  /** Replaces what an overlay slot shows. */
  private fill(slot: keyof typeof this.slots, content: Container): void {
    for (const old of this.slots[slot].removeChildren()) old.destroy();
    this.slots[slot].addChild(content);
  }

  /** Daylight from 0 (night) to 1 (clear noon). */
  setLight(light: number): void {
    this.night.alpha = (1 - light) * 0.65;
  }

  /** The tile under the pointer. Off the map it is null, or the nearest edge tile when `clamp` is set. */
  private tileAt(canvas: HTMLCanvasElement, e: PointerEvent, clamp = false): { x: number; y: number } | null {
    const rect = canvas.getBoundingClientRect();
    let x = Math.floor((e.clientX - rect.left - this.camera.x) / (this.camera.scale.x * TILE_PX));
    let y = Math.floor((e.clientY - rect.top - this.camera.y) / (this.camera.scale.y * TILE_PX));
    if (clamp) {
      x = Math.max(0, Math.min(this.mapSize.width - 1, x));
      y = Math.max(0, Math.min(this.mapSize.height - 1, y));
    }
    const inside = x >= 0 && y >= 0 && x < this.mapSize.width && y < this.mapSize.height;
    return inside ? { x, y } : null;
  }

  private drawAreaBox(a: { x: number; y: number } | null, b: { x: number; y: number } | null): void {
    this.areaBox.clear();
    if (!a || !b) return;
    const x = Math.min(a.x, b.x) * TILE_PX;
    const y = Math.min(a.y, b.y) * TILE_PX;
    const w = (Math.abs(a.x - b.x) + 1) * TILE_PX;
    const h = (Math.abs(a.y - b.y) + 1) * TILE_PX;
    const colour = this.areaTool ?? 0xffffff;
    this.areaBox
      .rect(x, y, w, h)
      .fill({ color: colour, alpha: 0.15 })
      .stroke({ color: colour, width: 1 / this.camera.scale.x, alignment: 0 });
  }

  /** WASD or the arrow keys move the view. */
  private enableKeyboardPan(): void {
    const held = new Set<string>();
    const keys: Record<string, [number, number]> = {
      w: [0, 1],
      arrowup: [0, 1],
      s: [0, -1],
      arrowdown: [0, -1],
      a: [1, 0],
      arrowleft: [1, 0],
      d: [-1, 0],
      arrowright: [-1, 0],
    };
    const typing = (e: KeyboardEvent): boolean => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
    window.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();
      if (keys[key] && !typing(e) && !e.ctrlKey && !e.metaKey) {
        held.add(key);
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => held.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => held.clear());
    this.app.ticker.add((t) => {
      if (held.size === 0) return;
      // About 900 screen pixels a second, whatever the zoom.
      const step = 0.9 * t.deltaMS;
      let dx = 0;
      let dy = 0;
      for (const key of held) {
        const dir = keys[key];
        if (!dir) continue;
        dx += dir[0];
        dy += dir[1];
      }
      this.camera.x += dx * step;
      this.camera.y += dy * step;
    });
  }

  private reportHover(canvas: HTMLCanvasElement, e: PointerEvent): void {
    this.onHover(this.tileAt(canvas, e));
  }

  private enablePanZoom(canvas: HTMLCanvasElement): void {
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let downX = 0;
    let downY = 0;
    let areaStart: { x: number; y: number } | null = null;
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => {
      downX = e.clientX;
      downY = e.clientY;
      if (e.button !== 0) return;
      if (this.areaTool !== null) {
        areaStart = this.tileAt(canvas, e, true);
        this.drawAreaBox(areaStart, areaStart);
        return;
      }
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    });
    window.addEventListener('pointerup', (e) => {
      dragging = false;
      if (areaStart) {
        const end = this.tileAt(canvas, e, true);
        if (end && e.button === 0) this.onArea({ x0: areaStart.x, y0: areaStart.y, x1: end.x, y1: end.y });
        areaStart = null;
        this.areaBox.clear();
        return;
      }
      // A click is a press and release without dragging the map.
      if (e.target !== canvas || Math.hypot(e.clientX - downX, e.clientY - downY) > 4) return;
      const tile = this.tileAt(canvas, e);
      if (!tile) return;
      if (e.button === 0) this.onClick(tile);
      else if (e.button === 2) this.onRightClick(tile);
    });
    canvas.addEventListener('pointerleave', () => this.onHover(null));
    window.addEventListener('pointermove', (e) => {
      if (e.target === canvas) this.reportHover(canvas, e);
      if (areaStart) this.drawAreaBox(areaStart, this.tileAt(canvas, e, true));
      if (!dragging) return;
      this.camera.x += e.clientX - lastX;
      this.camera.y += e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
    });
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
        const next = Math.min(8, Math.max(0.1, this.camera.scale.x * factor));
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        // Zoom around the cursor.
        const k = next / this.camera.scale.x;
        this.camera.x = mx - (mx - this.camera.x) * k;
        this.camera.y = my - (my - this.camera.y) * k;
        this.camera.scale.set(next);
      },
      { passive: false },
    );
  }
}

/** A sprite showing one pixel per tile, scaled up without smoothing. */
function tileSprite(rgba: Uint8ClampedArray, width: number, height: number): Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('2D canvas not available');
  const image = g.createImageData(width, height);
  image.data.set(rgba);
  g.putImageData(image, 0, 0);
  const texture = Texture.from(canvas);
  texture.source.scaleMode = 'nearest';
  const sprite = new Sprite(texture);
  sprite.scale.set(TILE_PX);
  return sprite;
}
