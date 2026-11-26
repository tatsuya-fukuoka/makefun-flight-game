// The sortie: state machine (title -> flying -> debrief), the ring sequence and pass detection, pilot
// cues, scoring and the debrief screen, plus the staged demo scenes (?demo=1&scene=...) and the
// autopilot that flies them and the title-screen attract loop.

const tmpRingA = new THREE.Vector3();
const tmpRingB = new THREE.Vector3();

function createSortie() {
  return { nextRing: 0, time: 0, ringTimes: [], ended: false, endDelay: 0, result: null, cues: {}, lastHint: -99 };
}

function showScreen(name) {
  document.body.dataset.screen = name;
}

function resetScene(game) {
  clearImpactDebris(game.aircraft, game.scene);
  game.sortie = createSortie();
  game.message = null;
  game.frozen = false;
}

function enterTitle(game) {
  resetScene(game);
  game.mode = 'title';
  stageAttractFlight(game);
  showScreen('title');
}

function startSortie(game) {
  resetScene(game);
  game.mode = 'flying';
  game.demo = null;
  placePlaneOnRunway(game.plane, CONFIG.runway.length / 2 - 40);
  snapChaseCamera(game);
  showScreen('flying');
  showFlightMessage(game, 'Cleared for take-off, runway 36 — Shift for power, ↓ to rotate at 60 kt', 7);
}

function stepMission(game, events, dt) {
  if (game.mode !== 'flying') return;
  const s = game.sortie;
  const p = game.plane;
  if (!s.ended) s.time += dt;
  checkRingPass(game);
  for (const e of events) handleFlightEvent(game, e);
  if (!s.ended) checkMissionCues(game);
  if (!s.ended) {
    if (p.crashed) endSortie(game, 2.8);
    else if (p.onGround && p.airborneOnce && p.speed < 0.8) endSortie(game, 1.4);
  } else if (!game.demo) {
    s.endDelay -= dt;
    if (s.endDelay <= 0) showDebrief(game);
  }
}

// A ring counts when the flight path crosses its plane, in the direction of travel, inside the hoop.
function checkRingPass(game) {
  const s = game.sortie;
  const rings = game.world.rings;
  const ring = rings[s.nextRing];
  const p = game.plane;
  if (!ring || p.crashed) return;
  const s0 = tmpRingA.subVectors(p.prevPos, ring.center).dot(ring.normal);
  const s1 = tmpRingB.subVectors(p.pos, ring.center).dot(ring.normal);
  if (!(s0 < 0 && s1 >= 0)) return;
  const hit = tmpRingA.copy(p.prevPos).lerp(p.pos, s0 / (s0 - s1));
  const miss = hit.distanceTo(ring.center);
  if (miss < CONFIG.rings.radius - CONFIG.rings.tube * 0.4) {
    s.nextRing++;
    s.ringTimes.push(s.time);
    game.audio.chime();
    if (s.nextRing === rings.length) {
      showFlightMessage(game, 'All ' + rings.length + ' rings! Head home to the strip — gear down, under 90 kt', 6, 'good');
    } else {
      showFlightMessage(game, 'Ring ' + s.nextRing + '/' + rings.length + ' ✓  +' + CONFIG.scoring.ring + ' — ring ' + (s.nextRing + 1) + ' next', 3, 'good');
    }
  } else if (miss < CONFIG.rings.radius * 4) {
    showFlightMessage(game, 'Missed ring ' + (s.nextRing + 1) + ' — circle back and line up', 4, 'warn');
  }
}

function handleFlightEvent(game, e) {
  const p = game.plane;
  const audio = game.audio;
  if (e.type === 'liftoff') {
    if (game.sortie.nextRing === 0 && !game.sortie.cues.liftoff) {
      game.sortie.cues.liftoff = true;
      showFlightMessage(game, 'Airborne — gear up with G, ring 1 dead ahead', 5, 'good');
    }
  } else if (e.type === 'touchdown') {
    audio.thud(e.damage ? 0.7 : 0.15);
    const tone = e.damage ? 'warn' : 'good';
    showFlightMessage(game, 'Touchdown — ' + e.quality + ', ' + e.sink.toFixed(1) + ' m/s sink' + (e.damage ? ', airframe damaged' : '. Brakes: B'), 5, tone);
  } else if (e.type === 'damage') {
    audio.thud(0.8);
    showFlightMessage(game, 'Terrain strike! Airframe ' + Math.round(100 - p.damage) + '% — climb!', 4, 'bad');
  } else if (e.type === 'crash') {
    if (e.kind === 'splash') audio.splash();
    else audio.thud(1);
    spawnImpactDebris(game.aircraft, game.scene, p.pos, e.kind);
    showFlightMessage(game, e.kind === 'splash' ? 'Splash! Ditched in the bay' : 'Crashed into the hillside', 4, 'bad');
  } else if (e.type === 'stall') {
    showFlightMessage(game, 'Stall! Nose down, add power', 2.5, 'bad');
  } else if (e.type === 'engine-out') {
    showFlightMessage(game, 'Engine out — tanks dry. Glide for the strip', 6, 'bad');
  }
}

function checkMissionCues(game) {
  const s = game.sortie;
  const p = game.plane;
  const c = s.cues;
  const rw = CONFIG.runway;
  const allRings = s.nextRing >= game.world.rings.length;
  const home = Math.hypot(p.pos.x - rw.x, p.pos.z - rw.z);
  const once = (key, text, secs, tone) => {
    if (!c[key]) {
      c[key] = true;
      showFlightMessage(game, text, secs, tone);
    }
  };
  if (!p.airborneOnce && p.speed > CONFIG.flight.rotateSpeed * 0.85) once('rotate', 'Rotate — ease back on ↓', 3, 'info');
  if (p.fuel < 25) once('fuel25', 'Fuel low — ' + Math.round(p.fuel) + '% left, ease the throttle', 4, 'warn');
  if (p.fuel < 10) once('fuel10', 'Fuel critical — land soon', 4, 'bad');
  if (allRings && home < 2600 && !p.onGround) {
    if (p.gearAnim < 0.5) once('gearWarn', 'Gear down (G) — final approach', 5, 'warn');
    else once('final', 'Gear down, three green — final approach. Under 90 kt, gentle sink', 6, 'good');
  }
  const edge = Math.max(Math.abs(p.pos.x), Math.abs(p.pos.z));
  if (edge > CONFIG.world.boundary && s.time - s.lastHint > 6) {
    s.lastHint = s.time;
    showFlightMessage(game, 'Leaving the archipelago — turn back', 4, 'warn');
  }
}

function endSortie(game, delay) {
  const s = game.sortie;
  s.ended = true;
  s.endDelay = delay;
  s.result = computeSortieResult(game);
}

function computeSortieResult(game) {
  const sc = CONFIG.scoring;
  const s = game.sortie;
  const p = game.plane;
  const total = game.world.rings.length;
  const rows = [];
  let verdict;
  let landing = 'None';
  const complete = s.nextRing === total;
  rows.push(['Rings', s.nextRing + ' / ' + total, s.nextRing * sc.ring]);
  if (p.crashed) {
    verdict = p.crashed === 'splash' ? 'Ditched in the bay' : 'Crashed — airframe lost';
    rows.push(['Time', formatClock(s.time), 0]);
  } else {
    const td = p.touchdown;
    const onRunway = td && td.onRunway;
    landing = td ? td.quality + ' (' + td.sink.toFixed(1) + ' m/s, ' + td.align.toFixed(0) + '° off axis)' : 'None';
    verdict = complete && onRunway ? 'Sortie complete' : onRunway ? 'Landed early' : 'Put down off-field';
    const timeBonus = complete && onRunway ? Math.max(0, Math.round(sc.timePar - s.time * sc.timeLossPerSecond)) : 0;
    rows.push(['Time', formatClock(s.time), timeBonus]);
    rows.push(['Landing', landing, td ? sc.landing[td.quality] || 0 : 0]);
    rows.push(['Fuel left', Math.round(p.fuel) + '%', Math.round(p.fuel * sc.fuelPerPercent)]);
  }
  rows.push(['Airframe', Math.round(100 - p.damage) + '%', -Math.round(p.damage * sc.damagePerPercent)]);
  const score = Math.max(0, rows.reduce((sum, r) => sum + r[2], 0));
  return { verdict, rows, score, landing, crashed: !!p.crashed };
}

function showDebrief(game) {
  const r = game.sortie.result;
  game.mode = 'debrief';
  let best = 0;
  try {
    best = Math.max(Number(localStorage.getItem('aonami-best') || 0), r.score);
    localStorage.setItem('aonami-best', String(best));
  } catch (err) {
    best = r.score;
  }
  document.getElementById('debrief-title').textContent = r.verdict;
  document.getElementById('debrief-title').className = r.crashed ? 'bad' : 'good';
  document.getElementById('debrief-rows').innerHTML = r.rows
    .map((row) => '<tr><td>' + row[0] + '</td><td>' + row[1] + '</td><td>' + (row[2] > 0 ? '+' : '') + row[2] + '</td></tr>')
    .join('');
  document.getElementById('debrief-score').textContent = String(r.score);
  document.getElementById('debrief-best').textContent = 'Best ' + best;
  showScreen('debrief');
}

// ---- Demo scenes and autopilot -------------------------------------------------------------

function poseAirborne(plane, pos, heading, speed, opts) {
  Object.assign(plane, createPlaneState());
  plane.pos.copy(pos);
  plane.prevPos.copy(pos);
  setPlaneAttitude(plane, heading, (opts && opts.pitch) || 0, (opts && opts.bank) || 0);
  plane.speed = speed;
  plane.onGround = false;
  plane.airborneOnce = true;
  plane.throttle = (opts && opts.throttle) || 0.6;
  plane.gearDown = !!(opts && opts.gear);
  plane.gearAnim = plane.gearDown ? 1 : 0;
  plane.fuel = (opts && opts.fuel) || 80;
}

function stageAttractFlight(game) {
  game.demo = { mode: 'orbit', bank: 0.42, alt: 240, speed: 52 };
  poseAirborne(game.plane, new THREE.Vector3(-700, 240, -300), 90 * DEG, 52, { bank: 0.42 });
  snapChaseCamera(game);
  runSimulationSteps(game, 30);
}

const DEMO_SCENES = {
  rings(game) {
    const ring = game.world.rings[2];
    const heading = Math.atan2(ring.normal.x, -ring.normal.z);
    const start = ring.center.clone().addScaledVector(ring.normal, -300);
    poseAirborne(game.plane, start, heading, 55, { throttle: 0.62, fuel: 81 });
    game.sortie.nextRing = 2;
    game.sortie.time = 94;
    game.demo = { mode: 'ring', speed: 55 };
    return { steps: 150, message: ['Ring 2/8 ✓  +400 — ring 3 next', 'good'] };
  },
  approach(game) {
    const rw = CONFIG.runway;
    const dist = 950;
    const pos = new THREE.Vector3(rw.x, rw.elevation + CONFIG.flight.gearDownHeight + dist * Math.tan(3.5 * DEG), rw.z + rw.length / 2 - 50 + dist);
    poseAirborne(game.plane, pos, 0, 38, { throttle: 0.4, gear: true, fuel: 52, pitch: -1 * DEG });
    game.sortie.nextRing = game.world.rings.length;
    game.sortie.time = 236;
    game.demo = { mode: 'approach' };
    return { steps: 90, message: ['Gear down, three green — final approach runway 36', 'good'] };
  },
  bank(game) {
    const a = game.world.rings[3].center;
    const b = game.world.rings[4].center;
    const pos = a.clone().lerp(b, 0.45).setY(215);
    poseAirborne(game.plane, pos, 200 * DEG, 58, { throttle: 0.7, bank: 1.0, fuel: 68 });
    game.sortie.nextRing = 4;
    game.sortie.time = 151;
    game.demo = { mode: 'orbit', bank: 1.0, alt: 215, speed: 58 };
    return { steps: 120, message: ['Hard right bank — hold the nose up, watch the sink', 'info'] };
  },
  touchdown(game) {
    const rw = CONFIG.runway;
    placePlaneOnRunway(game.plane, 120);
    const p = game.plane;
    p.speed = 25;
    p.airborneOnce = true;
    p.fuel = 41;
    setPlaneAttitude(p, 0, 4 * DEG, 0);
    p.touchdown = { quality: 'Smooth', sink: 1.3, bank: 1, align: 1, speed: 33, onRunway: true, offset: Math.abs(p.pos.x - rw.x) };
    game.sortie.nextRing = game.world.rings.length;
    game.sortie.time = 262;
    game.demo = { mode: 'rollout' };
    return { steps: 20, message: ['Touchdown — Smooth, 1.3 m/s sink. Welcome home', 'good'] };
  },
};

function startDemoScene(game, name, freeze) {
  resetScene(game);
  game.mode = 'flying';
  const stage = DEMO_SCENES[name] || DEMO_SCENES.rings;
  const plan = stage(game);
  snapChaseCamera(game);
  runSimulationSteps(game, plan.steps);
  showFlightMessage(game, plan.message[0], 9999, plan.message[1]);
  showScreen('flying');
  game.frozen = !!freeze;
}

function autopilotControls(game) {
  const p = game.plane;
  const d = game.demo;
  if (d.mode === 'rollout') {
    return { pitch: 0, roll: 0, yaw: clamp(-wrapAngle(p.heading) * 3 - (p.pos.x - CONFIG.runway.x) * 0.03, -1, 1), throttleSet: 0, brakes: p.speed < 12 };
  }
  if (d.mode === 'orbit') return autopilotHold(p, d.bank, clamp((d.alt - p.pos.y) * 0.5, -6, 6), d.speed);
  if (d.mode === 'ring') {
    const target = game.world.rings[Math.min(game.sortie.nextRing, game.world.rings.length - 1)].center;
    const bearing = Math.atan2(target.x - p.pos.x, -(target.z - p.pos.z));
    const bank = clamp(wrapAngle(bearing - p.heading) * 2, -0.7, 0.7);
    return autopilotHold(p, bank, clamp((target.y - p.pos.y) * 0.6, -10, 10), d.speed);
  }
  // Approach: pursue the far end of the runway for alignment, ride a 3.5 degree glide path, flare low.
  const rw = CONFIG.runway;
  const aim = Math.atan2(rw.x - p.pos.x, -(rw.z - rw.length / 2 - p.pos.z));
  const bank = clamp(wrapAngle(aim - p.heading) * 2, -0.35, 0.35);
  const touchZ = rw.z + rw.length / 2 - 50;
  const dist = Math.max(0, p.pos.z - touchZ);
  const glideAlt = rw.elevation + CONFIG.flight.gearDownHeight + dist * Math.tan(3.5 * DEG);
  let vsCmd = -p.speed * Math.tan(3.5 * DEG) + (glideAlt - p.pos.y) * 0.4;
  if (p.agl < 6) vsCmd = -0.9;
  const ctl = autopilotHold(p, bank, vsCmd, p.agl < 6 ? 0 : 37);
  return ctl;
}

function autopilotHold(p, bankCmd, vsCmd, speedCmd) {
  return {
    pitch: clamp(((vsCmd - p.vs) * 0.06) / Math.max(0.4, Math.cos(p.bank)), -1, 1),
    roll: clamp((bankCmd - p.bank) * 1.6, -1, 1),
    yaw: 0,
    throttleSet: speedCmd === 0 ? 0 : clamp(0.45 + (speedCmd - p.speed) * 0.1, 0, 1),
    brakes: false,
  };
}
