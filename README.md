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
npm run sim -- --seed 7 --days 2 --colonists 200                   # speed check with a big colony
```

In the game, click a colonist (or a name in the list) to inspect them, and right-click the map to send
them somewhere. Press **M** (or the Mine button) and drag over rock to mark it for mining; **X** drags
to remove marks; **P** opens work priorities (click a cell to raise, right-click to lower). Esc or
right-click puts a tool away. WASD or the arrow keys move the view; the mouse wheel zooms.

In the browser, pick a map with the address bar: `?seed=7&biome=tundra&hills=mountainous&river=yes&season=winter`.
Biomes: `temperate-forest`, `boreal-forest`, `arid-shrubland`, `tundra`. Hills: `flat`, `small-hills`,
`large-hills`, `mountainous`. Seasons: `spring` (default), `summer`, `autumn`, `winter`. Colonists: `&colonists=12`.

The game is built from modules that can be switched on and off. See `CLAUDE.md`
for how the code is organised and the rules it follows.
