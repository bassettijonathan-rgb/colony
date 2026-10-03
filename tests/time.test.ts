import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/core';
import { BIOMES } from '../src/content/biomes';
import { WEATHER, type Season } from '../src/content/weather';
import { ALL_MODULES } from '../src/modules';
import { LAYER, ROOF } from '../src/modules/f1-world';
import {
  clock,
  DAYS_PER_SEASON,
  DAYS_PER_YEAR,
  SNOW_LAYER,
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
  type CalendarDate,
} from '../src/modules/f2-time';
import { baseTemperature, calendarAt, dayLength, sunlight } from '../src/modules/f2-time/sky';

/** These tests are about time and weather; colonists would only slow them down. */
const OFF = ['f3-people'];

const temperate = (BIOMES.find((b) => b.id === 'temperate-forest') as (typeof BIOMES)[number]).climate;

function newGame(seed: number, opts: { biome?: string; season?: Season; hour?: number; size?: number } = {}): Simulation {
  const size = opts.size ?? 48;
  return Simulation.create({
    seed,
    modules: ALL_MODULES,
    disabled: OFF,
    width: size,
    height: size,
    settings: {
      'f1-world': { biome: opts.biome ?? 'temperate-forest' },
      'f2-time': { startSeason: opts.season ?? 'spring', startHour: opts.hour ?? 6 },
    },
  });
}

/** Calendar time at the given day of the year and hour. */
const at = (dayOfYear: number, hour: number): number => dayOfYear * TICKS_PER_DAY + hour * TICKS_PER_HOUR;

describe('calendar', () => {
  it('has 26-hour days, 15-day seasons and a 60-day year', () => {
    expect(calendarAt(0)).toEqual({ day: 0, year: 1, season: 'spring', dayOfSeason: 1, dayOfYear: 0, hour: 0, minute: 0 });
    expect(calendarAt(at(0, 25) + TICKS_PER_HOUR / 2)).toMatchObject({ day: 0, hour: 25, minute: 30 });
    expect(calendarAt(at(1, 0))).toMatchObject({ day: 1, dayOfSeason: 2 });
    expect(calendarAt(at(DAYS_PER_SEASON, 0))).toMatchObject({ season: 'summer', dayOfSeason: 1 });
    expect(calendarAt(at(3 * DAYS_PER_SEASON + 14, 12))).toMatchObject({ season: 'winter', dayOfSeason: 15 });
    expect(calendarAt(at(DAYS_PER_YEAR, 0))).toMatchObject({ year: 2, season: 'spring', dayOfYear: 0 });
  });

  it('starts in the chosen season and hour', () => {
    const d = newGame(1, { season: 'autumn', hour: 20 }).services.get(clock).now();
    expect(d).toMatchObject({ year: 1, season: 'autumn', dayOfSeason: 1, hour: 20, minute: 0 });
  });

  it('rejects an unknown season', () => {
    expect(() => newGame(1, { season: 'monsoon' as Season })).toThrow(/Unknown season "monsoon"/);
  });

  it('announces each new day and each new season', () => {
    const days: CalendarDate[] = [];
    const seasons: string[] = [];
    // Listen through a tiny extra module, the way any other module would.
    const listener = {
      id: 'listener',
      name: 'Listener',
      layer: 'core' as const,
      listen: {
        'new-day': (_: unknown, d: CalendarDate) => void days.push(d),
        'new-season': (_: unknown, s: { season: string }) => void seasons.push(s.season),
      },
    };
    const game = Simulation.create({
      seed: 2,
      modules: [...ALL_MODULES, listener],
      disabled: OFF,
      width: 32,
      height: 32,
      settings: { 'f2-time': { startHour: 0 } },
    });
    // Run through the first tick of day 16.
    game.step(TICKS_PER_DAY * (DAYS_PER_SEASON + 1) + 1);
    expect(days.map((d) => d.day)).toEqual([...Array(DAYS_PER_SEASON + 1).keys()].map((k) => k + 1));
    expect(seasons).toEqual(['summer']);
  });
});

describe('daylight', () => {
  it('is full at noon and dark at midnight', () => {
    expect(sunlight(at(10, 13))).toBe(1);
    expect(sunlight(at(10, 0))).toBeCloseTo(0.05);
  });

  it('gives long summer days and short winter days', () => {
    const midsummer = at(22, 12);
    const midwinter = at(52, 12);
    expect(dayLength(midsummer)).toBeGreaterThan(16);
    expect(dayLength(midwinter)).toBeLessThan(10);
    // 07:00 is daylight in summer and dark in winter.
    expect(sunlight(at(22, 7))).toBe(1);
    expect(sunlight(at(52, 7))).toBeCloseTo(0.05);
  });

  it('is dimmed by cloud but never darker than starlight', () => {
    const sim = newGame(3, { hour: 13 });
    const light = sim.services.get(clock).light();
    const weather = sim.services.get(clock).weather();
    expect(light).toBeCloseTo(0.05 + 0.95 * weather.light);
  });
});

describe('temperature', () => {
  it('is warmer in the afternoon than before dawn', () => {
    // Warmest at 15:00, coldest 13 hours later at 02:00.
    const afternoon = baseTemperature(at(30, 15), temperate);
    const smallHours = baseTemperature(at(31, 2), temperate);
    expect(afternoon - smallHours).toBeGreaterThan(2 * temperate.dailySwing - 1);
  });

  it('follows the seasons in every biome: mid-summer warmest, mid-winter coldest', () => {
    for (const b of BIOMES) {
      const summer = baseTemperature(at(22.5, 13), b.climate);
      const winter = baseTemperature(at(52.5, 13), b.climate);
      expect(summer - winter).toBeCloseTo(2 * b.climate.seasonalSwing, 0);
    }
  });

  it('makes temperate winters freezing and tundra winters brutal', () => {
    const mean = (biome: string, day: number): number => {
      const climate = (BIOMES.find((b) => b.id === biome) as (typeof BIOMES)[number]).climate;
      let sum = 0;
      for (let h = 0; h < 26; h++) sum += baseTemperature(at(day, h), climate);
      return sum / 26;
    };
    expect(mean('temperate-forest', 52)).toBeLessThan(-4);
    expect(mean('tundra', 52)).toBeLessThan(-20);
    expect(mean('arid-shrubland', 22)).toBeGreaterThan(28);
  });
});

describe('weather', () => {
  it('changes over time, with each spell lasting as long as its definition says', () => {
    const sim = newGame(4);
    const c = sim.services.get(clock);
    const runs: { id: string; hours: number }[] = [];
    let current = c.weather().id;
    let hours = 0;
    for (let h = 0; h < 26 * 30; h++) {
      sim.step(TICKS_PER_HOUR);
      const id = c.weather().id;
      if (id === current) hours++;
      else {
        runs.push({ id: current, hours: hours + 1 });
        current = id;
        hours = 0;
      }
    }
    expect(new Set(runs.map((r) => r.id)).size).toBeGreaterThanOrEqual(3);
    // The first run started at landing; skip it. Back-to-back repeats can merge, so only check the minimum.
    for (const r of runs.slice(1)) {
      const def = WEATHER.find((w) => w.id === r.id) as (typeof WEATHER)[number];
      expect(r.hours).toBeGreaterThanOrEqual(Math.floor(def.hours[0]));
    }
  });

  it('calls rain snow below freezing', () => {
    const sim = newGame(5, { biome: 'tundra', season: 'winter' });
    const c = sim.services.get(clock);
    let sawSnow = false;
    for (let h = 0; h < 26 * 15 && !sawSnow; h++) {
      sim.step(TICKS_PER_HOUR);
      if (c.weather().precipitation > 0) {
        expect(c.weatherName()).toBe(c.weather().coldName);
        sawSnow = true;
      }
    }
    expect(sawSnow).toBe(true);
  });

  it('brings cold snaps in winter', () => {
    let snaps = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const kinds: string[] = [];
      const listener = {
        id: 'listener',
        name: 'Listener',
        layer: 'core' as const,
        listen: { 'spell-started': (_: unknown, s: { kind: string }) => void kinds.push(s.kind) },
      };
      const sim = Simulation.create({
        seed,
        modules: [...ALL_MODULES, listener],
        disabled: OFF,
        width: 24,
        height: 24,
        settings: { 'f2-time': { startSeason: 'winter' } },
      });
      sim.step(TICKS_PER_DAY * DAYS_PER_SEASON);
      snaps += kinds.filter((k) => k === 'cold-snap').length;
      expect(kinds).not.toContain('heat-wave');
    }
    expect(snaps).toBeGreaterThan(0);
  });
});

describe('snow', () => {
  it('builds up through a tundra winter and lies only on open, dry ground', () => {
    const sim = newGame(6, { biome: 'tundra', season: 'winter', size: 64 });
    sim.step(TICKS_PER_DAY * 10);
    const snow = sim.world.layers[SNOW_LAYER] as Uint16Array;
    const roof = sim.world.layers[LAYER.roof] as Uint8Array;
    let deepest = 0;
    for (let i = 0; i < snow.length; i++) {
      if (roof[i] !== ROOF.none) expect(snow[i]).toBe(0);
      deepest = Math.max(deepest, snow[i] as number);
    }
    expect(deepest).toBeGreaterThan(50); // more than 5 cm
    expect(sim.world.layerVersions[SNOW_LAYER]).toBeGreaterThan(0);
  });

  it('melts away in a warm spell', () => {
    const sim = newGame(7, { season: 'winter', size: 32 });
    const snow = sim.world.layers[SNOW_LAYER] as Uint16Array;
    snow.fill(300); // 30 cm everywhere, as if after a blizzard
    (sim.world.modules['f2-time'] as { hasSnow: boolean }).hasSnow = true;
    sim.step(TICKS_PER_DAY * (DAYS_PER_SEASON + 10)); // into a temperate spring
    expect(Math.max(...snow)).toBe(0);
  });
});

describe('time module as a whole', () => {
  it('is deterministic and survives save and load mid-weather', () => {
    const a = newGame(8);
    a.step(TICKS_PER_DAY * 3 + 123);
    const b = Simulation.load(JSON.parse(JSON.stringify(a.save())), ALL_MODULES);
    a.step(TICKS_PER_DAY * 2);
    b.step(TICKS_PER_DAY * 2);
    expect(b.hash()).toBe(a.hash());
    expect(b.services.get(clock).now()).toEqual(a.services.get(clock).now());
  });

  it('falls back to a clear spring noon when switched off', () => {
    const sim = Simulation.create({ seed: 1, modules: ALL_MODULES, disabled: ['f2-time'], width: 16, height: 16 });
    const c = sim.services.get(clock);
    expect(c.outdoorTemperature()).toBe(21);
    expect(c.light()).toBe(1);
    expect(c.now().season).toBe('spring');
  });

  it('uses the stand-in climate when the world module is off', () => {
    const sim = Simulation.create({ seed: 1, modules: ALL_MODULES, disabled: ['f1-world'], width: 16, height: 16 });
    sim.step(TICKS_PER_DAY);
    expect(Number.isFinite(sim.services.get(clock).outdoorTemperature())).toBe(true);
  });
});
