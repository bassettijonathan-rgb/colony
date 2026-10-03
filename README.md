# Colony

A deterministic colony simulator set on the planet Verity: Dwarf Fortress scale,
RimWorld-style events, dark hard sci-fi.

```sh
npm install
npm run dev                         # play in the browser
npm test                            # run the tests
npm run sim -- --seed 42 --days 3   # run headless
npm run sim -- --seed 7 --biome tundra --hills mountainous --map   # print the map as text
npm run sim -- --seed 7 --days 60 --climate                        # a year of weather, one line per day
```

In the browser, pick a map with the address bar: `?seed=7&biome=tundra&hills=mountainous&river=yes&season=winter`.
Biomes: `temperate-forest`, `boreal-forest`, `arid-shrubland`, `tundra`. Hills: `flat`, `small-hills`,
`large-hills`, `mountainous`. Seasons: `spring` (default), `summer`, `autumn`, `winter`.

The game is built from modules that can be switched on and off. See `CLAUDE.md`
for how the code is organised and the rules it follows.
