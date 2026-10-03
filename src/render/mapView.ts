import { Application, Container, Sprite, Texture } from 'pixi.js';
import type { MapSnapshot } from '../protocol';
import { colourMap } from './mapColours';

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
    const canvas = document.createElement('canvas');
    canvas.width = map.width;
    canvas.height = map.height;
    const g = canvas.getContext('2d');
    if (!g) throw new Error('2D canvas not available');
    const image = g.createImageData(map.width, map.height);
    image.data.set(colourMap(map));
    g.putImageData(image, 0, 0);

    const texture = Texture.from(canvas);
    texture.source.scaleMode = 'nearest';
    this.mapSize = { width: map.width, height: map.height };
    this.mapSprite?.destroy();
    this.mapSprite = new Sprite(texture);
    this.mapSprite.scale.set(TILE_PX);
    this.camera.addChild(this.mapSprite);

    // Start centred on the map.
    this.camera.position.set(
      this.app.screen.width / 2 - (map.width * TILE_PX) / 2,
      this.app.screen.height / 2 - (map.height * TILE_PX) / 2,
    );
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
