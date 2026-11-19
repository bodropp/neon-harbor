[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/bodropp/neon-harbor/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/bodropp/neon-harbor/reward.svg)](https://make.fun/bounty/gta6-01)

# Neon Harbor

An original open-world crime game for the [make.fun GTA 6 bounty](https://make.fun/bounty/gta6-01) — a sun-soaked harbor city you explore on foot and by car, with traffic, pedestrians, a wanted level and police chases, five story missions, combat, a HUD with a minimap, and a save. Everything in it is original: the city, the characters, the vehicles, the names and the story. Nothing from any commercial game.

## The story

Fresh out of prison, **Rook** owes fixer **Mara Voss** one last favor: take the harbor back from the **Coral Kings**. Steal cars, outrun the Harbor PD, run five jobs — and become the King of the Harbor.

## Play

Serve `game/` with any static server (`node serve.ts`, then open http://localhost:8080) or just open `game/index.html` in desktop Chrome. No network, no build step.

| Key | Action |
| --- | --- |
| WASD / Arrows | Walk & drive (Shift to sprint) |
| E | Enter / steal a car, step out again |
| F | Punch |
| Mouse + Click | Aim & shoot (R reloads) |
| P | Pause · M | Mute |

## The systems

- **A city** — a seeded grid of streets, blocks, parks, palms, the bay and the pier; every building, road and palm drawn by code.
- **Driving** — arcade car physics with drift, skid marks, crashes and a camera that follows the action.
- **Traffic & pedestrians** — cars follow the street grid and brake for each other; pedestrians stroll the sidewalks and flee from gunshots and speeding cars.
- **Stealing cars** — any parked, traffic or police car can be taken (and the cops notice).
- **Wanted level** — crimes raise your heat from 0 to 5 stars; police cars and foot cops chase, ram and try to bust you. Lose them to cool down.
- **Missions** — five jobs with a story arc: steal wheels, deliver a package, collect a debt, steal an armored van, and take the yacht. Markers, a waypoint arrow and a minimap guide you.
- **Combat** — fists and a pistol against enforcers and yacht guards, with health, ammo and knockouts.
- **HUD & minimap** — health, cash, wanted stars, the clock, mission objectives, a live minimap and a speedometer.
- **Save** — progress, cash and mission state save to localStorage automatically; continue from the title screen.
- **Sound** — engine hum, sirens, gunshots, crashes and a sunset groove, all synthesized with WebAudio. No audio files.

## Layout

- `game/index.html` — the page and HUD
- `game/css/style.css` — HUD and menu styling
- `game/src/main.js` — game loop, camera, rendering, input, save
- `game/src/city.js` — the seeded city (streets, buildings, bay, pier)
- `game/src/vehicles.js` — car physics, traffic AI, police chases
- `game/src/pedestrians.js` — pedestrians
- `game/src/police.js` — the wanted system
- `game/src/missions.js` — the five story jobs and their enemies
- `game/src/player.js` — Rook on foot and behind the wheel
- `game/src/hud.js` — HUD and minimap
- `game/src/audio.js` — synthesized sound
- `game/src/shots.js` — the four deterministic screenshot scenes
- `game/src/utils.js` — seeded RNG and math helpers
- `main.ts` — the entry program: copies `game/` and `screenshots/` to `/output` and writes `dossier.json`
- `screenshots/` — four renders of the game itself: a police chase, on foot at the docks, a mission fight on the pier, and a golden-hour drive

## License

MIT — see `LICENSE`.
