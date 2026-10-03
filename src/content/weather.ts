/**
 * Sky weather, which changes every few hours. Multi-day warm and cold
 * spells are separate (see the time module's fronts).
 */
export interface WeatherDef {
  id: string;
  name: string;
  /** Name used when it is at or below freezing and something is falling. */
  coldName?: string;
  /** 0 = dry, 1 = heavy rain or snow. */
  precipitation: number;
  /** Daylight multiplier, 1 = clear sky. */
  light: number;
  /** Added to the outdoor temperature, °C. */
  tempOffset: number;
  /** How long it lasts, in hours. */
  hours: [number, number];
  /** How likely it is to come next in each season. Wet weather is scaled by the biome's rainfall. */
  weights: { spring: number; summer: number; autumn: number; winter: number };
}

export const WEATHER: readonly WeatherDef[] = [
  {
    id: 'clear',
    name: 'Clear',
    precipitation: 0,
    light: 1,
    tempOffset: 0,
    hours: [6, 30],
    weights: { spring: 4, summer: 6, autumn: 3, winter: 3 },
  },
  {
    id: 'overcast',
    name: 'Overcast',
    precipitation: 0,
    light: 0.7,
    tempOffset: -1,
    hours: [4, 20],
    weights: { spring: 3, summer: 2, autumn: 4, winter: 4 },
  },
  {
    id: 'fog',
    name: 'Fog',
    precipitation: 0,
    light: 0.55,
    tempOffset: -1,
    hours: [2, 8],
    weights: { spring: 1, summer: 0.5, autumn: 2, winter: 1 },
  },
  {
    id: 'rain',
    name: 'Rain',
    coldName: 'Snow',
    precipitation: 0.5,
    light: 0.6,
    tempOffset: -2,
    hours: [3, 14],
    weights: { spring: 3, summer: 2, autumn: 3, winter: 2.5 },
  },
  {
    id: 'storm',
    name: 'Thunderstorm',
    coldName: 'Blizzard',
    precipitation: 1,
    light: 0.4,
    tempOffset: -3,
    hours: [2, 8],
    weights: { spring: 1, summer: 1.5, autumn: 1, winter: 1 },
  },
];

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;
export type Season = (typeof SEASONS)[number];
