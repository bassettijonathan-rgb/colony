/**
 * What other modules, the worker and the UI may use from the rooms module:
 * the room layer, signals and the rooms service.
 */
import { defineService } from '../../core';

export const ROOMS_MODULE_ID = 'c2-rooms';

/**
 * Tile layer (Uint16): 0 for tiles that bound rooms (walls, doors, rock),
 * OUTDOORS for open ground connected to the map edge, 2 and up for enclosed
 * rooms. Room numbers are given afresh whenever walls or rock change.
 */
export const ROOM_LAYER = 'room';
export const OUTDOORS = 1;

export interface RoomInfo {
  id: number;
  /** Tiles inside. */
  size: number;
  /** Closed off by walls, doors and rock, not open to the outside. */
  enclosed: boolean;
  /** Share of its tiles with a roof overhead, 0 to 1. */
  roofed: number;
}

declare module '../../core/signals' {
  interface SignalMap {
    /** Rooms were worked out again after walls or rock changed. */
    'rooms-changed': { rooms: number };
  }
}

export interface RoomsService {
  /** The room a tile is in, or null for walls, doors and rock. */
  roomAt(x: number, y: number): RoomInfo | null;
  /** Every enclosed room, by number. */
  rooms(): RoomInfo[];
}

/** Without the rooms module everywhere is outdoors. */
export const rooms = defineService<RoomsService>('c2-rooms.rooms', {
  roomAt: () => ({ id: OUTDOORS, size: 0, enclosed: false, roofed: 0 }),
  rooms: () => [],
});
