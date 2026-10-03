/**
 * What other modules, the worker and the UI may use from the time module:
 * calendar constants, signals and the clock service.
 */
import { defineService, SECONDS_PER_TICK } from '../../core';
import { SEASONS, WEATHER, type Season, type WeatherDef } from '../../content/weather';

export const TIME_MODULE_ID = 'f2-time';

export const HOURS_PER_DAY = 26;
export const TICKS_PER_HOUR = 3600 / SECONDS_PER_TICK;
export const TICKS_PER_DAY = HOURS_PER_DAY * TICKS_PER_HOUR;
export const DAYS_PER_SEASON = 15;
export const DAYS_PER_YEAR = DAYS_PER_SEASON * SEASONS.length;

/** Snow depth per tile, in millimetres. */
export const SNOW_LAYER = 'snow';

declare module '../../core/signals' {
  interface SignalMap {
    /** A new day has begun (at midnight). */
    'new-day': CalendarDate;
    /** The first day of a season has begun. */
    'new-season': { season: Season; year: number };
    'weather-changed': { weather: string; previous: string };
    /** A multi-day warm or cold spell has started. */
    'spell-started': { kind: SpellKind; offset: number };
  }
}

export type SpellKind = 'normal' | 'cold-snap' | 'heat-wave';

export interface CalendarDate {
  /** Days since landing, starting at 0. */
  day: number;
  /** Year of the colony, starting at 1. */
  year: number;
  season: Season;
  /** 1 to 15. */
  dayOfSeason: number;
  /** 0 to 59. */
  dayOfYear: number;
  /** 0 to 25. */
  hour: number;
  minute: number;
}

/** New-game settings for the time module: `settings['f2-time']`. All optional. */
export interface TimeSettings {
  /** Season the colony lands in (default spring). */
  startSeason?: Season;
  /** Hour of landing, 0 to 25 (default 6). */
  startHour?: number;
}

export interface ClockService {
  now(): CalendarDate;
  /** Daylight, 0 (dark night) to 1 (clear noon). */
  light(): number;
  /** Outdoor air temperature in °C. */
  outdoorTemperature(): number;
  weather(): WeatherDef;
  /** The weather's name right now, e.g. "Snow" instead of "Rain" below freezing. */
  weatherName(): string;
  /** The current multi-day spell. */
  spell(): SpellKind;
  /** Snow on a tile, in centimetres. */
  snowAt(x: number, y: number): number;
}

const CLEAR = WEATHER[0] as WeatherDef;

/** Without the time module it is always a clear spring noon at 21 °C. */
export const clock = defineService<ClockService>('f2-time.clock', {
  now: () => ({ day: 0, year: 1, season: 'spring', dayOfSeason: 1, dayOfYear: 0, hour: 12, minute: 0 }),
  light: () => 1,
  outdoorTemperature: () => 21,
  weather: () => CLEAR,
  weatherName: () => CLEAR.name,
  spell: () => 'normal',
  snowAt: () => 0,
});
