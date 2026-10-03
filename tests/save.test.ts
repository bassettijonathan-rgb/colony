import { describe, expect, it } from 'vitest';
import { createWorld, decodeWorld, encodeWorld, hashValue, spawnEntity } from '../src/core';

describe('hashing', () => {
  it('ignores object key order', () => {
    expect(hashValue({ a: 1, b: [2, 3] })).toBe(hashValue({ b: [2, 3], a: 1 }));
  });

  it('notices any change in content', () => {
    expect(hashValue({ a: 1 })).not.toBe(hashValue({ a: 2 }));
    expect(hashValue(new Uint8Array([1, 2]))).not.toBe(hashValue(new Uint8Array([2, 1])));
  });
});

describe('saving', () => {
  it('round-trips layers, entities, components and module state exactly', () => {
    const world = createWorld(5, 10, 10);
    world.layers.u8 = Uint8Array.from({ length: 100 }, (_, i) => i);
    world.layers.i16 = Int16Array.from({ length: 100 }, (_, i) => -i * 300);
    world.layers.f32 = Float32Array.from({ length: 100 }, (_, i) => i / 7);
    const id = spawnEntity(world);
    world.components.position = new Map([[id, { x: 3, y: 4 }]]);
    world.modules.test = { nested: new Map([['k', [1, 2, 3]]]) };

    const restored = decodeWorld(JSON.parse(JSON.stringify(encodeWorld(world))));
    expect(restored.layers.i16).toBeInstanceOf(Int16Array);
    expect(restored.layers.f32).toEqual(world.layers.f32);
    expect(restored.entities.get(id)).toBe(true);
    expect(hashValue(restored)).toBe(hashValue(world));
  });
});
