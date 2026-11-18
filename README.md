# Sunset City

[![Make GTA 6 bounty](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![Leaderboard rank](https://make.fun/badge/gta6-01/Admin976/sunset-city-gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard)
[![Reward](https://make.fun/badge/gta6-01/Admin976/sunset-city-gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

Sunset City is an original open-world crime sandbox set in Puerto Sol, a sun-baked coastal city of cream stucco, brick and blue-glass towers. You play Nico Reyes, a courier in debt to the Cobra Azul syndicate, working off what he owes one job at a time. Walk the palm-lined boulevards or take any car and drive: the streets run with living traffic, sidewalks fill with pedestrians, and a raised wanted level brings patrol cars, sirens and armed officers. Fight with pistol or fists, then chase the five-mission story from a parcel drop at Galería Sol to the final reckoning on the coast. Everything is built from scratch with three.js and plain primitives: no external models, textures or sounds.

## Run it

The game is static files; serve the `game/` directory with anything that speaks HTTP.

```
cd game
python3 -m http.server 8080
```

Then open http://localhost:8080 in a desktop browser. From the repository root you can also use the bundled Node server:

```
node serve.ts
```

## Controls

- **W A S D** — walk or drive
- **SHIFT** — run
- **SPACE** — jump on foot; handbrake in a car
- **Mouse** — orbit the camera; drag to look around
- **Mouse wheel** — zoom the camera
- **E** — enter or leave a vehicle
- **Left mouse button** — fire the pistol
- **F** — punch
- **R** — reload
- **H** — horn
- **ESC** — pause menu

## Structure

- `game/index.html` — page shell, HUD markup and styling, ES-module import map.
- `game/src/main.js` — boot, sky and sun, the frame loop, screenshot staging.
- `game/src/config.js` — city dimensions, player/camera tuning, sunset palette.
- `game/src/rng.js` — small deterministic random generator used by the city.
- `game/src/city.js` — seeded city data and instanced meshes: roads, blocks, facades, windows, shops, signs, traffic lights, trees, landmarks.
- `game/src/player.js` — low-poly character, walk/run animation, gravity and collisions.
- `game/src/camera.js` — smoothed third-person orbit camera with building avoidance.
- `game/src/vehicles.js` — sedan, pickup, van and sport models plus the police livery.
- `game/src/driving.js` — arcade vehicle physics, damage, drift and chase camera.
- `game/src/traffic.js` — lane-following NPC traffic, parked cars and signals.
- `game/src/peds.js` — pedestrians walking the sidewalks and reacting to the player.
- `game/src/police.js` — wanted level, patrol cars, sirens and officer AI.
- `game/src/combat.js` — pistol, melee, hit reactions, ammo and reload.
- `game/src/missions.js` — five mission definitions, stages, dialogue and objective beacon.
- `game/src/hud.js` — health, cash, clock, wanted stars, speedometer and objective text.
- `game/src/minimap.js` — prerendered street map, player arrow, police blips and objective.
- `game/src/menu.js` — title, pause menu, game-over screen and save handling.
- `game/src/audio.js` — synthesized engine, footsteps, gunshots and siren audio.

Built for the Make GTA 6 bounty on make.fun — https://make.fun/bounty/gta6-01
