/**
 * Pure calendar, daylight and temperature maths. Everything here is a
 * function of the clock and the module's state, so it can be tested alone.
 */
import type { ClimateDef } from '../../content/biomes';
import { SEASONS } from '../../content/weather';
import {
  DAYS_PER_SEASON,
  DAYS_PER_YEAR,
  HOURS_PER_DAY,
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
  type CalendarDate,
} from './api';

/** Calendar time: game ticks plus the landing offset. */
export function calendarAt(time: number): CalendarDate {
  const day = Math.floor(time / TICKS_PER_DAY);
  const dayOfYear = day % DAYS_PER_YEAR;
  const inDay = time - day * TICKS_PER_DAY;
  const hour = Math.floor(inDay / TICKS_PER_HOUR);
  return {
    day,
    year: Math.floor(day / DAYS_PER_YEAR) + 1,
    season: SEASONS[Math.floor(dayOfYear / DAYS_PER_SEASON)] as CalendarDate['season'],
    dayOfSeason: (dayOfYear % DAYS_PER_SEASON) + 1,
    dayOfYear,
    hour,
    minute: Math.floor(((inDay - hour * TICKS_PER_HOUR) / TICKS_PER_HOUR) * 60),
  };
}

/** Position in the year as a fraction of a day count, 0 to 60. */
function yearDay(time: number): number {
  return (time / TICKS_PER_DAY) % DAYS_PER_YEAR;
}

/** Hour of the day with fractions, 0 to 26. */
function dayHour(time: number): number {
  return (time % TICKS_PER_DAY) / TICKS_PER_HOUR;
}

/** Mid-summer, the warmest and longest day: halfway through summer. */
const MIDSUMMER = DAYS_PER_SEASON * 1.5;
const NOON = HOURS_PER_DAY / 2;

/** -1 at mid-winter, 1 at mid-summer. */
function seasonWave(time: number): number {
  return Math.cos((2 * Math.PI * (yearDay(time) - MIDSUMMER)) / DAYS_PER_YEAR);
}

/** Hours of daylight: 13 on average, 17 at mid-summer, 9 at mid-winter. */
export function dayLength(time: number): number {
  return NOON + 4 * seasonWave(time);
}

/** Daylight from 0.05 (starlight) to 1, with an hour of twilight at each end of the day. Before weather. */
export function sunlight(time: number): number {
  const h = dayHour(time);
  const half = dayLength(time) / 2;
  const fromSunrise = h - (NOON - half);
  const toSunset = NOON + half - h;
  const ramp = Math.min(1, Math.max(0, Math.min(fromSunrise, toSunset) + 0.5));
  return 0.05 + 0.95 * ramp;
}

/** Temperature from season and time of day alone, before spells and weather. */
export function baseTemperature(time: number, climate: ClimateDef): number {
  // Warmest mid-afternoon, coldest in the small hours.
  const daily = Math.cos((2 * Math.PI * (dayHour(time) - (NOON + 2))) / HOURS_PER_DAY);
  return climate.meanTemp + climate.seasonalSwing * seasonWave(time) + climate.dailySwing * daily;
}
