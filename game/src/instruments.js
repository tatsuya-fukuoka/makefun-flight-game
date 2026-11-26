// HUD and instruments: airspeed, altitude, vertical speed and heading figures, the artificial horizon
// and heading tape (canvas), fuel, throttle and airframe gauges, gear lights, the ring counter, the
// marker pointing at the next target and the pilot message line.

function createInstruments() {
  const $ = (id) => document.getElementById(id);
  const ids = ['hud', 'hdg-value', 'message', 'spd-value', 'spd-flag', 'alt-value', 'vs-value', 'agl-value', 'fuel-bar', 'fuel-value',
    'thr-bar', 'thr-value', 'dmg-bar', 'dmg-value', 'gear-light', 'brake-light', 'ring-count', 'ring-dist', 'mission-time',
    'target-marker', 'target-label', 'target-arrow', 'mute-flag', 'score-value'];
  const el = {};
  for (const id of ids) el[id] = $(id);
  const horizon = $('horizon');
  const tape = $('hdg-tape');
  return { el, horizon, horizonCtx: horizon.getContext('2d'), tape, tapeCtx: tape.getContext('2d'), projected: new THREE.Vector3() };
}

function showFlightMessage(game, text, seconds, tone) {
  game.message = { text, tone: tone || 'info', until: game.simTime + (seconds || 3) };
}

function formatClock(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

function setText(node, text) {
  if (node.textContent !== text) node.textContent = text;
}

function updateInstruments(game) {
  const hud = game.hud;
  const el = hud.el;
  const p = game.plane;
  const U = CONFIG.units;
  const headingDeg = ((Math.round(p.heading / DEG) % 360) + 360) % 360;
  setText(el['spd-value'], String(Math.round(p.speed * U.kt)).padStart(3, ' '));
  setText(el['alt-value'], String(Math.max(0, Math.round((p.pos.y * U.ft) / 10) * 10)));
  setText(el['hdg-value'], String(headingDeg === 0 ? 360 : headingDeg).padStart(3, '0') + '°');
  const fpm = Math.round((p.vs * U.fpm) / 50) * 50;
  setText(el['vs-value'], (fpm > 0 ? '+' : '') + fpm + ' FPM');
  setText(el['agl-value'], 'AGL ' + Math.max(0, Math.round(p.agl * U.ft)) + ' FT');
  el['spd-flag'].className = p.stall ? 'flag warn blink' : p.speed > CONFIG.flight.maxSpeed ? 'flag warn' : 'flag';
  setText(el['spd-flag'], p.stall ? 'STALL' : p.speed > CONFIG.flight.maxSpeed ? 'VNE' : 'KT');

  setGauge(el['fuel-bar'], el['fuel-value'], p.fuel, p.fuel < 10 ? 'bad' : p.fuel < 25 ? 'warn' : 'ok', Math.round(p.fuel) + '%');
  setGauge(el['thr-bar'], el['thr-value'], p.throttle * 100, p.engineOn ? 'ok' : 'bad', p.engineOn ? Math.round(p.throttle * 100) + '%' : 'OUT');
  const health = 100 - p.damage;
  setGauge(el['dmg-bar'], el['dmg-value'], health, health < 40 ? 'bad' : health < 75 ? 'warn' : 'ok', Math.round(health) + '%');
  const gearState = p.gearAnim > 0.99 ? 'down' : p.gearAnim < 0.01 ? 'up' : 'transit';
  el['gear-light'].className = 'light gear-' + gearState;
  setText(el['gear-light'], gearState === 'down' ? 'GEAR ▼▼▼' : gearState === 'up' ? 'GEAR UP' : 'GEAR ···');
  el['brake-light'].className = 'light' + (game.lastControls && game.lastControls.brakes && p.onGround ? ' on' : '');

  const s = game.sortie;
  const total = game.world.rings.length;
  setText(el['ring-count'], s.nextRing >= total ? 'RINGS ' + total + '/' + total + ' ✓' : 'RING ' + (s.nextRing + 1) + '/' + total);
  const target = currentTarget(game);
  const dist = Math.hypot(target.x - p.pos.x, target.z - p.pos.z);
  setText(el['ring-dist'], (s.nextRing >= total ? 'STRIP ' : 'NEXT ') + (dist >= 1000 ? (dist / 1000).toFixed(1) + ' km' : Math.round(dist) + ' m'));
  setText(el['mission-time'], 'TIME ' + formatClock(s.time));
  setText(el['score-value'], 'RINGS +' + s.nextRing * CONFIG.scoring.ring);
  el['mute-flag'].style.display = game.audio.muted ? 'block' : 'none';

  const msg = game.message;
  const active = msg && game.simTime < msg.until;
  el.message.className = active ? 'message tone-' + msg.tone : 'message hidden';
  if (active) setText(el.message, msg.text);

  const bearing = Math.atan2(target.x - p.pos.x, -(target.z - p.pos.z));
  drawArtificialHorizon(hud.horizonCtx, hud.horizon.width, p.pitch, p.bank);
  drawHeadingTape(hud.tapeCtx, hud.tape.width, hud.tape.height, p.heading, bearing);
  if (s.nextRing >= total && p.onGround) {
    el['target-marker'].style.display = 'none';
    el['target-arrow'].style.display = 'none';
  } else {
    updateTargetMarker(game, target, dist, s.nextRing >= total ? 'RWY' : String(s.nextRing + 1));
  }
}

function setGauge(bar, label, percent, tone, text) {
  bar.style.height = clamp(percent, 0, 100) + '%';
  bar.className = 'gauge-fill ' + tone;
  setText(label, text);
}

function currentTarget(game) {
  const rings = game.world.rings;
  if (game.sortie.nextRing < rings.length) return rings[game.sortie.nextRing].center;
  const rw = CONFIG.runway;
  const fromSouth = game.plane.pos.z > rw.z;
  return new THREE.Vector3(rw.x, rw.elevation, rw.z + (fromSouth ? rw.length * 0.3 : -rw.length * 0.3));
}

function drawArtificialHorizon(ctx, size, pitch, bank) {
  const r = size / 2;
  const pxPerDeg = r / 30;
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.beginPath();
  ctx.arc(r, r, r - 6, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(r, r);
  ctx.rotate(-bank);
  const offset = (pitch / DEG) * pxPerDeg;
  const sky = ctx.createLinearGradient(0, -size, 0, offset);
  sky.addColorStop(0, '#1f5d9c');
  sky.addColorStop(1, '#79b4e0');
  ctx.fillStyle = sky;
  ctx.fillRect(-size, -size * 2, size * 2, size * 2 + offset);
  const earth = ctx.createLinearGradient(0, offset, 0, size);
  earth.addColorStop(0, '#9b6a3c');
  earth.addColorStop(1, '#5a3a20');
  ctx.fillStyle = earth;
  ctx.fillRect(-size, offset, size * 2, size * 2);
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-size, offset);
  ctx.lineTo(size, offset);
  ctx.stroke();
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 1.5;
  for (let d = -40; d <= 40; d += 5) {
    if (d === 0) continue;
    const y = offset - d * pxPerDeg;
    const w = d % 10 === 0 ? r * 0.38 : r * 0.18;
    ctx.beginPath();
    ctx.moveTo(-w, y);
    ctx.lineTo(w, y);
    ctx.stroke();
    if (d % 10 === 0) {
      ctx.fillText(String(Math.abs(d)), -w - 12, y);
      ctx.fillText(String(Math.abs(d)), w + 12, y);
    }
  }
  ctx.restore();

  ctx.save();
  ctx.translate(r, r);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, r - 16, -Math.PI / 2 - Math.PI / 3, -Math.PI / 2 + Math.PI / 3);
  ctx.stroke();
  for (const d of [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]) {
    const a = -Math.PI / 2 + d * DEG;
    const len = d % 30 === 0 ? 11 : 6;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * (r - 16), Math.sin(a) * (r - 16));
    ctx.lineTo(Math.cos(a) * (r - 16 - len), Math.sin(a) * (r - 16 - len));
    ctx.stroke();
  }
  ctx.rotate(-bank);
  ctx.fillStyle = '#ffb347';
  ctx.beginPath();
  ctx.moveTo(0, -r + 18);
  ctx.lineTo(-7, -r + 30);
  ctx.lineTo(7, -r + 30);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Fixed aircraft symbol.
  ctx.save();
  ctx.translate(r, r);
  ctx.strokeStyle = '#ffb347';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-r * 0.55, 0);
  ctx.lineTo(-r * 0.2, 0);
  ctx.lineTo(-r * 0.1, r * 0.1);
  ctx.moveTo(r * 0.55, 0);
  ctx.lineTo(r * 0.2, 0);
  ctx.lineTo(r * 0.1, r * 0.1);
  ctx.stroke();
  ctx.fillStyle = '#ffb347';
  ctx.beginPath();
  ctx.arc(0, 0, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = '#1b2228';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(r, r, r - 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(190,255,215,0.55)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(r, r, r - 1, 0, Math.PI * 2);
  ctx.stroke();
}

function drawHeadingTape(ctx, w, h, heading, bearing) {
  const pxPerDeg = 4;
  const hdg = heading / DEG;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(8,18,24,0.55)';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#a8ffc8';
  ctx.fillStyle = '#a8ffc8';
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'center';
  ctx.lineWidth = 2;
  const span = w / 2 / pxPerDeg + 5;
  for (let d = Math.ceil((hdg - span) / 5) * 5; d <= hdg + span; d += 5) {
    const x = w / 2 + (d - hdg) * pxPerDeg;
    const norm = ((d % 360) + 360) % 360;
    const major = norm % 10 === 0;
    ctx.beginPath();
    ctx.moveTo(x, h);
    ctx.lineTo(x, h - (major ? 14 : 7));
    ctx.stroke();
    if (norm % 30 === 0) {
      const label = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[norm] || String(norm / 10).padStart(2, '0');
      ctx.fillText(label, x, h - 20);
    }
  }
  const rel = wrapAngle(bearing - heading) / DEG;
  const bx = w / 2 + clamp(rel, -span + 6, span - 6) * pxPerDeg;
  ctx.fillStyle = '#ff9a4d';
  ctx.beginPath();
  ctx.moveTo(bx, h - 2);
  ctx.lineTo(bx - 8, h - 14);
  ctx.lineTo(bx + 8, h - 14);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(w / 2, 0);
  ctx.lineTo(w / 2 - 7, 9);
  ctx.lineTo(w / 2 + 7, 9);
  ctx.closePath();
  ctx.fill();
}

// Brackets the next target when it is on screen, otherwise an arrow at the screen edge points to it.
function updateTargetMarker(game, target, dist, label) {
  const el = game.hud.el;
  const v = game.hud.projected.copy(target).project(game.camera);
  const W = window.innerWidth;
  const H = window.innerHeight;
  const behind = v.z > 1;
  let sx = ((v.x + 1) / 2) * W;
  let sy = ((1 - v.y) / 2) * H;
  const margin = 70;
  const onScreen = !behind && sx > margin && sx < W - margin && sy > margin && sy < H - margin;
  if (onScreen) {
    el['target-marker'].style.display = 'block';
    el['target-arrow'].style.display = 'none';
    el['target-marker'].style.transform = 'translate(' + (sx - 32) + 'px,' + (sy - 32) + 'px)';
    setText(el['target-label'], label + ' · ' + (dist >= 1000 ? (dist / 1000).toFixed(1) + 'km' : Math.round(dist) + 'm'));
    return;
  }
  let dx = sx - W / 2;
  let dy = sy - H / 2;
  if (behind) {
    dx = -dx;
    dy = -dy;
  }
  const angle = Math.atan2(dy, dx);
  const rx = W / 2 - margin;
  const ry = H / 2 - margin;
  const k = 1 / Math.max(Math.abs(Math.cos(angle)) / rx, Math.abs(Math.sin(angle)) / ry);
  el['target-marker'].style.display = 'none';
  el['target-arrow'].style.display = 'block';
  el['target-arrow'].style.transform = 'translate(' + (W / 2 + Math.cos(angle) * k - 22) + 'px,' + (H / 2 + Math.sin(angle) * k - 22) + 'px)';
  el['target-arrow'].firstElementChild.style.transform = 'rotate(' + angle + 'rad)';
  setText(el['target-arrow'].lastElementChild, label);
}
