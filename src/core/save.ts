import type { LoggedCommand } from './commands';
import { layerKind, makeLayer, type LayerArray, type LayerKind, type World } from './world';

/**
 * Turns world state into JSON and back. Maps and typed arrays get small
 * tagged wrappers so they survive the round trip exactly.
 */

export const SAVE_VERSION = 1;

export interface SaveFile {
  version: number;
  modules: string[];
  /** Modules that were switched off, so loading switches them off again. */
  disabled: string[];
  world: unknown;
  commandLog: LoggedCommand[];
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] as number;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += B64[a >> 2];
    out += B64[((a & 3) << 4) | ((b ?? 0) >> 4)];
    out += b === undefined ? '=' : B64[((b & 15) << 2) | ((c ?? 0) >> 6)];
    out += c === undefined ? '=' : B64[c & 63];
  }
  return out;
}

function fromBase64(s: string): Uint8Array {
  const clean = s.replace(/=+$/, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let bits = 0;
  let value = 0;
  let o = 0;
  for (let i = 0; i < clean.length; i++) {
    value = (value << 6) | B64.indexOf(clean.charAt(i));
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (value >> bits) & 0xff;
    }
  }
  return out;
}

function encode(v: unknown): unknown {
  if (v instanceof Map) return { $map: [...v].map(([k, val]) => [encode(k), encode(val)]) };
  if (ArrayBuffer.isView(v)) {
    const layer = v as LayerArray;
    const bytes = new Uint8Array(layer.buffer, layer.byteOffset, layer.byteLength);
    return { $layer: layerKind(layer), data: toBase64(bytes) };
  }
  if (Array.isArray(v)) return v.map(encode);
  if (v !== null && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v).sort()) out[k] = encode((v as Record<string, unknown>)[k]);
    return out;
  }
  return v;
}

function decode(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(decode);
  if (v !== null && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.$map)) {
      return new Map((o.$map as [unknown, unknown][]).map(([k, val]) => [decode(k), decode(val)]));
    }
    if (typeof o.$layer === 'string' && typeof o.data === 'string') {
      const bytes = fromBase64(o.data);
      const kind = o.$layer as LayerKind;
      const probe = makeLayer(kind, 0);
      const layer = makeLayer(kind, bytes.byteLength / probe.BYTES_PER_ELEMENT);
      new Uint8Array(layer.buffer).set(bytes);
      return layer;
    }
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(o)) out[k] = decode(o[k]);
    return out;
  }
  return v;
}

export function encodeWorld(world: World): unknown {
  return encode(world);
}

export function decodeWorld(data: unknown): World {
  return decode(data) as World;
}
