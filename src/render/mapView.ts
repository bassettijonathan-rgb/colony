import { Application, Container, Sprite, Texture } from 'pixi.js';
import type { MapSnapshot } from '../protocol';
import { colourMap, snowOverlay } from './mapColours';

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
  private snowSprite: Sprite | null = null;
  private readonly night = new Sprite(Texture.WHITE);
  private mapSize = { width: 0, height: 0 };
  /** Called with the tile under the mouse, or null when the mouse leaves the map. */
  onHover: (tile: { x: number; y: number } | null) => void = () => {};

  async mount(parent: HTMLElement): Promise<void> {
    await this.app.init({ resizeTo: parent, background: '#0b0d10', antialias: false });
    parent.appendChild(this.app.canvas);
    this.app.stage.addChild(this.camera);
    this.enablePanZoom(this.app.canvas);
  }

  showMap(map: MapSnapshot): void {
    this.mapSize = { width: map.width, height: map.height };
    this.mapSprite?.destroy();
    this.mapSprite = tileSprite(colourMap(map), map.width, map.height);
    this.camera.addChild(this.mapSprite);

    // Night is a dark blue veil over the whole map, faded in and out by setLight.
    this.night.tint = 0x0a1030;
    this.night.width = map.width * TILE_PX;
    this.night.height = map.height * TILE_PX;
    this.night.alpha = 0;
    this.camera.addChild(this.night);
    this.updateLayers(map, map.layers);

    // Start centred on the map.
    this.camera.position.set(
      this.app.screen.width / 2 - (map.width * TILE_PX) / 2,
      this.app.screen.height / 2 - (map.height * TILE_PX) / 2,
    );
  }

  /** Redraws overlays for layers that changed. `map` holds the latest copy of every layer. */
  updateLayers(map: MapSnapshot, changed: Record<string, ArrayLike<number>>): void {
    const snow = changed.snow;
    if (snow) {
      this.snowSprite?.destroy();
      this.snowSprite = tileSprite(snowOverlay(map, snow), map.width, map.height);
      // Snow sits on the ground, under the night veil.
      this.camera.addChildAt(this.snowSprite, this.camera.getChildIndex(this.night));
    }
  }

  /** Daylight from 0 (night) to 1 (clear noon). */
  setLight(light: number): void {
    this.night.alpha = (1 - light) * 0.65;
  }

  private reportHover(canvas: HTMLCanvasElement, e: PointerEvent): void {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left - this.camera.x) / (this.camera.scale.x * TILE_PX));
    const y = Math.floor((e.clientY - rect.top - this.camera.y) / (this.camera.scale.y * TILE_PX));
    const inside = x >= 0 && y >= 0 && x < this.mapSize.width && y < this.mapSize.height;
    this.onHover(inside ? { x, y } : null);
  }

  private enablePanZoom(canvas: HTMLCanvasElement): void {
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    canvas.addEventListener('pointerdown', (e) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    });
    window.addEventListener('pointerup', () => (dragging = false));
    canvas.addEventListener('pointerleave', () => this.onHover(null));
    window.addEventListener('pointermove', (e) => {
      if (e.target === canvas) this.reportHover(canvas, e);
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
