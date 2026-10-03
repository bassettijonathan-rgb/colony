/** Read by the time and weather module. Temperatures in °C. */
export interface ClimateDef {
  /** Average temperature over the year. */
  meanTemp: number;
  /** Mid-summer is this much warmer than the mean, mid-winter this much colder. */
  seasonalSwing: number;
  /** Mid-afternoon is this much warmer than the day's average, the small hours this much colder. */
  dailySwing: number;
  /** Typical size of multi-day warm and cold spells. */
  variability: number;
  /** How often it rains or snows, 1 = normal. */
  rainfall: number;
}

/** Biomes decide what a map looks like and what its climate is. */
export interface BiomeDef {
  id: string;
  name: string;
  description: string;
  /** Share of the map under lakes, 0 to 1. */
  water: number;
  /** Share of the map that is marsh around water, 0 to 1. */
  marsh: number;
  /** Chance a map has a river crossing it. */
  riverChance: number;
  /** Share of open ground that is rich soil, gravel and sand. The rest is plain soil. */
  richSoil: number;
  gravel: number;
  sand: number;
  /** Lakes freeze to ice instead of open water. */
  frozenLakes: boolean;
  /** Rock types that can appear; each map picks two or three. */
  rocks: readonly string[];
  climate: ClimateDef;
}

export const BIOMES: readonly BiomeDef[] = [
  {
    id: 'temperate-forest',
    name: 'Temperate forest',
    description: 'Mild, wet and fertile. The easiest place to start.',
    water: 0.06,
    marsh: 0.03,
    riverChance: 0.6,
    richSoil: 0.2,
    gravel: 0.1,
    sand: 0.02,
    frozenLakes: false,
    rocks: ['granite', 'limestone', 'slate', 'sandstone'],
    climate: { meanTemp: 8, seasonalSwing: 14, dailySwing: 5, variability: 4, rainfall: 1 },
  },
  {
    id: 'boreal-forest',
    name: 'Boreal forest',
    description: 'Long dark winters, short summers, plenty of lakes.',
    water: 0.1,
    marsh: 0.05,
    riverChance: 0.5,
    richSoil: 0.08,
    gravel: 0.2,
    sand: 0.02,
    frozenLakes: false,
    rocks: ['granite', 'slate', 'basalt'],
    climate: { meanTemp: -1, seasonalSwing: 18, dailySwing: 5, variability: 5, rainfall: 0.9 },
  },
  {
    id: 'arid-shrubland',
    name: 'Arid shrubland',
    description: 'Dry, sandy and hot. Little water, poor soil.',
    water: 0.02,
    marsh: 0,
    riverChance: 0.3,
    richSoil: 0.03,
    gravel: 0.2,
    sand: 0.35,
    frozenLakes: false,
    rocks: ['sandstone', 'limestone', 'granite'],
    climate: { meanTemp: 22, seasonalSwing: 9, dailySwing: 10, variability: 3, rainfall: 0.3 },
  },
  {
    id: 'tundra',
    name: 'Tundra',
    description: 'Frozen ground and frozen lakes. Very hard to feed a colony.',
    water: 0.05,
    marsh: 0.02,
    riverChance: 0.2,
    richSoil: 0,
    gravel: 0.45,
    sand: 0.05,
    frozenLakes: true,
    rocks: ['granite', 'basalt', 'slate'],
    climate: { meanTemp: -12, seasonalSwing: 15, dailySwing: 4, variability: 6, rainfall: 0.6 },
  },
];

/** How much of the map is hills and mountains. */
export const HILLINESS = {
  flat: { name: 'Flat', rock: 0 },
  'small-hills': { name: 'Small hills', rock: 0.08 },
  'large-hills': { name: 'Large hills', rock: 0.18 },
  mountainous: { name: 'Mountainous', rock: 0.35 },
} as const;

export type Hilliness = keyof typeof HILLINESS;
