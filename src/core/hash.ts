/**
 * Stable hashing of plain data. Object keys are visited in sorted order so
 * the hash depends only on content, never on insertion order.
 */

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export class Hasher {
  private h = FNV_OFFSET;

  byte(b: number): void {
    this.h = Math.imul(this.h ^ (b & 0xff), FNV_PRIME) >>> 0;
  }

  u32(v: number): void {
    this.byte(v);
    this.byte(v >>> 8);
    this.byte(v >>> 16);
    this.byte(v >>> 24);
  }

  string(s: string): void {
    this.u32(s.length);
    for (let i = 0; i < s.length; i++) this.u32(s.charCodeAt(i));
  }

  value(v: unknown): void {
    if (v === null || v === undefined) {
      this.byte(0);
    } else if (typeof v === 'boolean') {
      this.byte(v ? 2 : 1);
    } else if (typeof v === 'number') {
      this.byte(3);
      this.string(Object.is(v, -0) ? '0' : String(v));
    } else if (typeof v === 'string') {
      this.byte(4);
      this.string(v);
    } else if (ArrayBuffer.isView(v)) {
      this.byte(5);
      const bytes = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
      this.u32(bytes.length);
      for (let i = 0; i < bytes.length; i++) this.byte(bytes[i] as number);
    } else if (Array.isArray(v)) {
      this.byte(6);
      this.u32(v.length);
      for (const item of v) this.value(item);
    } else if (v instanceof Map) {
      this.byte(7);
      const keys = [...v.keys()].sort(compareKeys);
      this.u32(keys.length);
      for (const k of keys) {
        this.value(k);
        this.value(v.get(k));
      }
    } else if (typeof v === 'object') {
      this.byte(8);
      const keys = Object.keys(v).sort();
      this.u32(keys.length);
      for (const k of keys) {
        this.string(k);
        this.value((v as Record<string, unknown>)[k]);
      }
    } else {
      throw new TypeError(`Cannot hash a ${typeof v}`);
    }
  }

  digest(): string {
    return this.h.toString(16).padStart(8, '0');
  }
}

function compareKeys(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

export function hashValue(v: unknown): string {
  const h = new Hasher();
  h.value(v);
  return h.digest();
}
