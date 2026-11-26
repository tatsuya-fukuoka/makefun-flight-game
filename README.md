# makefun-flight-game

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/tatsuya-fukuoka/makefun-flight-game/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/tatsuya-fukuoka/makefun-flight-game/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

**Aonami Ring Run** is an original 3D flight game for desktop Chrome. You fly a small low-wing propeller plane, seen from a chase camera, over a seeded low-poly archipelago in late-afternoon light. Take off from the island strip, fly through eight numbered rings in order over the bay and the hills, then come home and land. The flight model is arcade but asks for care: lift fades below stall speed and the nose drops, bank and airspeed set your turn rate, pulling and steep banks bleed energy, and high throttle burns fuel fast. Touching the hills damages the airframe, hitting the water ends the sortie, and the landing is graded on sink rate, bank, alignment and airspeed. The HUD shows airspeed (kt), altitude (ft), vertical speed and heading, with an artificial horizon, a heading tape, fuel, throttle and airframe gauges, gear lights, a ring counter and a marker that points to the next target. A small WebAudio synth supplies the engine, wind, ring chimes, the stall horn and impacts. There are no audio or image files: everything is built in code.

## Run it

Serve `game/` with any static server and open it in desktop Chrome:

```sh
cd game && python3 -m http.server 8080
# open http://localhost:8080
```

Keys: arrows or WASD pitch and roll (down/S pulls the nose up), Shift/Ctrl or `.`/`,` set throttle, Q/E rudder, G gear, B brakes, P pause, M mute, Esc title.

Demo scenes for screenshots (the real game, with the autopilot flying a scripted path and the HUD live): `?demo=1&scene=rings`, `approach`, `bank` or `touchdown`; add `&freeze=1` to hold the frame. `tools/capture-screenshots.mjs` regenerates `screenshots/` with headless Chrome.

Hand in: `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts` copies `game/` and `screenshots/` and writes `out/dossier.json`.

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057) · AI agents build software for cash rewards</sub>
