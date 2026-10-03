import { defineModule, touchLayer, type ModuleContext, type Services, type World } from '../../core';
import { SEASONS, WEATHER, type Season, type WeatherDef } from '../../content/weather';
import { check, checkRange, checkUniqueIds } from '../../content/validate';
import { ROOF, worldMap } from '../f1-world/api';
import {
  clock,
  SNOW_LAYER,
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
  DAYS_PER_SEASON,
  TIME_MODULE_ID,
  type SpellKind,
  type TimeSettings,
} from './api';
import { baseTemperature, calendarAt, sunlight } from './sky';

export * from './api';

export interface TimeState {
  /** Ticks from the start of year 1 to the landing. */
  startOffset: number;
  /** Last day index seen, to announce new days. */
  lastDay: number;
  weather: { id: string; untilTick: number };
  /** Multi-day warm or cold spell. The offset eases in from `fromOffset` over the first 12 hours. */
  spell: { kind: SpellKind; offset: number; fromOffset: number; startTick: number; untilTick: number };
  /** Fractions of a millimetre of snow not yet added to (or taken from) tiles. */
  snowCarry: number;
  /** Whether any tile has snow, so melting can skip the map when it is bare. */
  hasSnow: boolean;
}

/** How often snow is updated, in ticks (5 in-game minutes). */
export const SNOW_EVERY = 60;
/** Millimetres of snow per hour at full precipitation. */
const SNOWFALL_MM_PER_HOUR = 6;
/** Millimetres of snow melted per hour for each °C above freezing. */
const MELT_MM_PER_DEGREE_HOUR = 3;
/** Hours over which a new spell's temperature eases in. */
const SPELL_EASE_HOURS = 12;

function validateWeather(): void {
  checkUniqueIds('weather', WEATHER);
  check(WEATHER.length > 0 && WEATHER[0]?.precipitation === 0, 'weather: the first entry must be dry (it is the stand-in)');
  for (const w of WEATHER) {
    checkRange('weather', w.id, 'precipitation', w.precipitation, 0, 1);
    checkRange('weather', w.id, 'light', w.light, 0, 1);
    checkRange('weather', w.id, 'tempOffset', w.tempOffset, -30, 30);
    check(w.hours[0] > 0 && w.hours[0] <= w.hours[1], `weather: "${w.id}" hours must be [min, max] with 0 < min <= max`);
    for (const s of SEASONS) checkRange('weather', w.id, `weights.${s}`, w.weights[s], 0, 100);
  }
}

function weatherDef(id: string): WeatherDef {
  return WEATHER.find((w) => w.id === id) ?? (WEATHER[0] as WeatherDef);
}

/** The parts of the module context the helpers below need. Services get one too. */
interface Env {
  readonly world: World;
  readonly state: TimeState;
  readonly services: Services;
}

const calendarTime = (ctx: Env): number => ctx.world.tick + ctx.state.startOffset;
const climateOf = (ctx: Env) => ctx.services.get(worldMap).biome().climate;

function spellOffset(state: TimeState, tick: number): number {
  const { spell } = state;
  const eased = Math.min(1, (tick - spell.startTick) / (SPELL_EASE_HOURS * TICKS_PER_HOUR));
  return spell.fromOffset + (spell.offset - spell.fromOffset) * eased;
}

function outdoorTemperature(ctx: Env): number {
  const t = calendarTime(ctx);
  return baseTemperature(t, climateOf(ctx)) + spellOffset(ctx.state, ctx.world.tick) + weatherDef(ctx.state.weather.id).tempOffset;
}

type Ctx = ModuleContext<TimeState>;

function pickWeather(ctx: Ctx): void {
  const season: Season = calendarAt(calendarTime(ctx)).season;
  const rainfall = climateOf(ctx).rainfall;
  const weights = WEATHER.map((w) => w.weights[season] * (w.precipitation > 0 ? rainfall : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = ctx.rng.float() * total;
  let next = WEATHER[0] as WeatherDef;
  for (let k = 0; k < WEATHER.length; k++) {
    roll -= weights[k] as number;
    if (roll < 0) {
      next = WEATHER[k] as WeatherDef;
      break;
    }
  }
  const hours = next.hours[0] + ctx.rng.float() * (next.hours[1] - next.hours[0]);
  const previous = ctx.state.weather.id;
  ctx.state.weather = { id: next.id, untilTick: ctx.world.tick + Math.round(hours * TICKS_PER_HOUR) };
  if (previous !== next.id) ctx.emit('weather-changed', { weather: next.id, previous });
}

function pickSpell(ctx: Ctx): void {
  const season = calendarAt(calendarTime(ctx)).season;
  const v = climateOf(ctx).variability;
  const roll = ctx.rng.float();
  let kind: SpellKind = 'normal';
  let offset = (ctx.rng.float() * 2 - 1) * v;
  if (season === 'winter' && roll < 0.2) {
    kind = 'cold-snap';
    offset = -v * (2 + ctx.rng.float());
  } else if (season === 'summer' && roll < 0.15) {
    kind = 'heat-wave';
    offset = v * (2 + ctx.rng.float());
  }
  const days = kind === 'normal' ? ctx.rng.range(2, 6) : ctx.rng.range(2, 4);
  ctx.state.spell = {
    kind,
    offset,
    fromOffset: spellOffset(ctx.state, ctx.world.tick),
    startTick: ctx.world.tick,
    untilTick: ctx.world.tick + days * TICKS_PER_DAY,
  };
  if (kind !== 'normal') ctx.emit('spell-started', { kind, offset });
}

/** Adds falling snow to open ground and melts it when warm. Roofed tiles and open water stay clear. */
function updateSnow(ctx: Env): void {
  const hours = SNOW_EVERY / TICKS_PER_HOUR;
  const temp = outdoorTemperature(ctx);
  const precipitation = weatherDef(ctx.state.weather.id).precipitation;
  const change =
    (temp <= 0 ? precipitation * SNOWFALL_MM_PER_HOUR : 0) - Math.max(0, temp) * MELT_MM_PER_DEGREE_HOUR;
  const total = ctx.state.snowCarry + change * hours;
  const whole = Math.trunc(total);
  ctx.state.snowCarry = total - whole;
  if (whole === 0 || (whole < 0 && !ctx.state.hasSnow)) {
    if (!ctx.state.hasSnow) ctx.state.snowCarry = Math.max(0, ctx.state.snowCarry);
    return;
  }

  const { width, height } = ctx.world;
  const snow = ctx.world.layers[SNOW_LAYER] as Uint16Array;
  const map = ctx.services.get(worldMap);
  let changed = false;
  let any = false;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const terrain = map.terrainAt(x, y);
      // Open water swallows snow; ice and land keep it.
      const covered = map.roofAt(x, y) !== ROOF.none || map.rockAt(x, y) !== null || terrain.water;
      const before = snow[i] as number;
      const after = covered ? 0 : Math.min(65535, Math.max(0, before + whole));
      if (after !== before) {
        snow[i] = after;
        changed = true;
      }
      if (after > 0) any = true;
    }
  }
  ctx.state.hasSnow = any;
  if (changed) touchLayer(ctx.world, SNOW_LAYER);
}

/**
 * F2 Time and sky: the calendar, day and night, seasons, weather, warm and
 * cold spells, outdoor temperature and snow.
 */
export const timeModule = defineModule<TimeState>({
  id: TIME_MODULE_ID,
  name: 'Time and sky',
  layer: 'foundation',

  init: (ctx) => {
    validateWeather();
    const raw = ctx.world.settings[TIME_MODULE_ID];
    const settings: TimeSettings = raw && typeof raw === 'object' ? (raw as TimeSettings) : {};
    const season = settings.startSeason ?? 'spring';
    const seasonIndex = SEASONS.indexOf(season);
    if (seasonIndex < 0) throw new Error(`Unknown season "${season}". Choose from: ${SEASONS.join(', ')}`);
    const hour = settings.startHour ?? 6;
    if (!Number.isInteger(hour) || hour < 0 || hour > 25) throw new Error(`startHour must be a whole hour from 0 to 25, got ${hour}`);

    ctx.world.layers[SNOW_LAYER] = new Uint16Array(ctx.world.width * ctx.world.height);
    const state: TimeState = {
      startOffset: seasonIndex * DAYS_PER_SEASON * TICKS_PER_DAY + hour * TICKS_PER_HOUR,
      lastDay: 0,
      weather: { id: 'clear', untilTick: 0 },
      spell: { kind: 'normal', offset: 0, fromOffset: 0, startTick: 0, untilTick: 0 },
      snowCarry: 0,
      hasSnow: false,
    };
    state.lastDay = calendarAt(state.startOffset).day;
    return state;
  },

  setup: (ctx) => {
    validateWeather();
    const { world, state } = ctx;
    const view: Env = ctx;
    ctx.services.provide(clock, {
      now: () => calendarAt(calendarTime(view)),
      light: () => {
        const sun = sunlight(calendarTime(view));
        return 0.05 + (sun - 0.05) * weatherDef(state.weather.id).light;
      },
      outdoorTemperature: () => outdoorTemperature(view),
      weather: () => weatherDef(state.weather.id),
      weatherName: () => {
        const w = weatherDef(state.weather.id);
        return w.coldName && w.precipitation > 0 && outdoorTemperature(view) <= 0 ? w.coldName : w.name;
      },
      spell: () => state.spell.kind,
      snowAt: (x, y) => ((world.layers[SNOW_LAYER] as Uint16Array)[y * world.width + x] ?? 0) / 10,
    });
  },

  systems: [
    {
      id: 'calendar',
      phase: 'environment',
      run: (ctx) => {
        const date = calendarAt(calendarTime(ctx));
        if (date.day === ctx.state.lastDay) return;
        ctx.state.lastDay = date.day;
        ctx.emit('new-day', date);
        if (date.dayOfSeason === 1) ctx.emit('new-season', { season: date.season, year: date.year });
      },
    },
    {
      id: 'weather',
      phase: 'environment',
      run: (ctx) => {
        if (ctx.world.tick >= ctx.state.spell.untilTick) pickSpell(ctx);
        if (ctx.world.tick >= ctx.state.weather.untilTick) pickWeather(ctx);
      },
    },
    { id: 'snow', phase: 'environment', every: SNOW_EVERY, run: updateSnow },
  ],
});
