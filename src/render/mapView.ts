import { Application, Container, Sprite, Texture } from 'pixi.js';
import type { MapSnapshot } from '../protocol';

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
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const [r, gr, b] = placeholderColour(x, y);
        const o = (y * map.width + x) * 4;
        image.data[o] = r;
        image.data[o + 1] = gr;
        image.data[o + 2] = b;
        image.data[o + 3] = 255;
      }
    }
    g.putImageData(image, 0, 0);

    const texture = Texture.from(canvas);
    texture.source.scaleMode = 'nearest';
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
    window.addEventListener('pointermove', (e) => {
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

/** Bare ground with a faint grid, until the world module draws real terrain. */
function placeholderColour(x: number, y: number): [number, number, number] {
  const grid = x % 10 === 0 || y % 10 === 0;
  return grid ? [52, 48, 40] : [44, 40, 33];
}
