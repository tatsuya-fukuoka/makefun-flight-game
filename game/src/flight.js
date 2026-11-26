// Flight model and fixed-timestep physics: throttle, drag and gravity along the flight path, lift that
// fades below stall speed, bank-driven turns, fuel burn, ground roll, terrain and water contact, and
// touchdown evaluation (sink rate, bank, runway alignment, airspeed).

const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);
const tmpQuat = new THREE.Quaternion();
const tmpEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const tmpForward = new THREE.Vector3();
const tmpRight = new THREE.Vector3();
const tmpUp = new THREE.Vector3();

function createPlaneState() {
  return {
    pos: new THREE.Vector3(),
    prevPos: new THREE.Vector3(),
    quat: new THREE.Quaternion(),
    speed: 0,
    sinkVel: 0,
    vs: 0,
    throttle: 0,
    fuel: 100,
    damage: 0,
    gearDown: true,
    gearAnim: 1,
    onGround: true,
    airborneOnce: false,
    engineOn: true,
    crashed: null,
    touchdown: null,
    stall: false,
    agl: 0,
    heading: 0,
    pitch: 0,
    bank: 0,
    propAngle: 0,
    ctrl: { pitch: 0, roll: 0, yaw: 0 },
  };
}

function setPlaneAttitude(plane, heading, pitch, bank) {
  tmpEuler.set(pitch, -heading, -bank, 'YXZ');
  plane.quat.setFromEuler(tmpEuler);
  readPlaneAttitude(plane);
}

// Heading 0 = north (-Z), clockwise positive; pitch positive nose up; bank positive right wing down.
function readPlaneAttitude(plane) {
  tmpForward.set(0, 0, -1).applyQuaternion(plane.quat);
  tmpRight.set(1, 0, 0).applyQuaternion(plane.quat);
  tmpUp.set(0, 1, 0).applyQuaternion(plane.quat);
  plane.heading = Math.atan2(tmpForward.x, -tmpForward.z);
  plane.pitch = Math.asin(clamp(tmpForward.y, -1, 1));
  plane.bank = Math.atan2(-tmpRight.y, tmpUp.y);
  return tmpForward;
}

function rotateLocal(quat, axis, angle) {
  tmpQuat.setFromAxisAngle(axis, angle);
  quat.multiply(tmpQuat);
}

function liftFactor(speed) {
  const vs = CONFIG.flight.stallSpeed;
  return smoothstep(vs * 0.55, vs, speed);
}

function runwayAlignment(heading) {
  const d = Math.abs(wrapAngle(heading - CONFIG.runway.heading * DEG));
  return Math.min(d, Math.PI - d) / DEG;
}

function contactClearance(plane) {
  const F = CONFIG.flight;
  const gear = plane.gearAnim > 0.9 ? F.gearDownHeight : F.gearUpHeight;
  return Math.max(gear * Math.cos(plane.bank), F.halfSpan * Math.abs(Math.sin(plane.bank)) + 0.2);
}

function placePlaneOnRunway(plane, z) {
  const rw = CONFIG.runway;
  Object.assign(plane, createPlaneState());
  plane.pos.set(rw.x, rw.elevation + CONFIG.flight.gearDownHeight, rw.z + z);
  plane.prevPos.copy(plane.pos);
  setPlaneAttitude(plane, 0, 0, 0);
}

// One physics step. Controls: pitch/roll/yaw in [-1, 1], throttleDelta in [-1, 1] or throttleSet in [0, 1], brakes.
// Returns the events the mission cares about (liftoff, touchdown, damage, crash).
function stepFlight(plane, controls, world, dt) {
  const F = CONFIG.flight;
  const events = [];
  if (plane.crashed) return events;

  if (controls.throttleSet !== undefined) plane.throttle = clamp(controls.throttleSet, 0, 1);
  else plane.throttle = clamp(plane.throttle + (controls.throttleDelta || 0) * F.throttleRate * dt, 0, 1);
  plane.engineOn = plane.fuel > 0;
  const power = plane.engineOn ? plane.throttle : 0;
  if (plane.engineOn) plane.fuel = Math.max(0, plane.fuel - (F.fuelBase + F.fuelThrottle * power * power) * dt);
  if (!plane.engineOn && plane.engineWasOn) events.push({ type: 'engine-out' });
  plane.engineWasOn = plane.engineOn;

  const ease = Math.min(1, dt * 8);
  plane.ctrl.pitch += (controls.pitch - plane.ctrl.pitch) * ease;
  plane.ctrl.roll += (controls.roll - plane.ctrl.roll) * ease;
  plane.ctrl.yaw += (controls.yaw - plane.ctrl.yaw) * ease;
  plane.gearAnim = clamp(plane.gearAnim + (plane.gearDown ? 1 : -1) * F.gearSpeed * dt, 0, 1);

  readPlaneAttitude(plane);
  const lift = liftFactor(plane.speed);
  const authority = clamp(plane.speed / F.stallSpeed, 0.2, 1);
  let pitchRate = plane.ctrl.pitch * F.pitchRate * authority;
  let rollRate = -plane.ctrl.roll * F.rollRate * authority;
  let yawRate = -plane.ctrl.yaw * F.yawRate * authority;
  if (plane.onGround) {
    yawRate = -(plane.ctrl.yaw + plane.ctrl.roll) * F.groundSteerRate * Math.min(1, plane.speed / 8);
    rollRate = 0;
    if (plane.speed < F.rotateSpeed * 0.8) pitchRate = Math.min(pitchRate, 0);
  } else {
    pitchRate -= (1 - lift) * 0.75; // a stalled wing drops the nose
    if (Math.abs(controls.roll) < 0.1 && Math.abs(plane.bank) < 50 * DEG) rollRate += plane.bank * F.rollStability;
  }
  rotateLocal(plane.quat, AXIS_X, pitchRate * dt);
  rotateLocal(plane.quat, AXIS_Z, rollRate * dt);
  rotateLocal(plane.quat, AXIS_Y, yawRate * dt);
  readPlaneAttitude(plane);

  if (!plane.onGround) {
    // Coordinated turn: rate from bank and airspeed (g * tan(bank) / v), weaker as lift fades.
    const omega = clamp((F.gravity * Math.tan(clamp(plane.bank, -1.35, 1.35))) / Math.max(plane.speed, 15), -F.maxTurnRate, F.maxTurnRate) * lift;
    tmpQuat.setFromAxisAngle(AXIS_Y, -omega * dt);
    plane.quat.premultiply(tmpQuat).normalize();
  }
  const forward = readPlaneAttitude(plane).clone();

  let accel = power * F.thrust - (F.drag + plane.gearAnim * F.gearDrag) * plane.speed * plane.speed - F.gravity * forward.y;
  if (!plane.onGround) accel -= F.inducedDrag * (Math.max(0, plane.ctrl.pitch) + (1 / Math.max(0.3, Math.abs(Math.cos(plane.bank))) - 1) * 0.5);
  if (plane.onGround) accel -= F.rollingDrag + (controls.brakes ? F.brakeDecel : 0);
  if (plane.speed > F.maxSpeed) accel -= (plane.speed - F.maxSpeed) * 0.6;
  plane.speed = Math.max(0, plane.speed + accel * dt);

  if (!plane.onGround) {
    const bankLoss = 1 - 0.3 * (1 - Math.abs(Math.cos(plane.bank)));
    plane.sinkVel += (F.gravity * (1 - lift * bankLoss) - plane.sinkVel * 0.9) * dt;
  } else {
    plane.sinkVel = 0;
  }

  plane.prevPos.copy(plane.pos);
  plane.pos.addScaledVector(forward, plane.speed * dt);
  plane.pos.y -= plane.sinkVel * dt;
  plane.vs = (plane.pos.y - plane.prevPos.y) / dt;
  plane.propAngle = (plane.propAngle + (plane.engineOn ? 8 + power * 60 : plane.speed * 0.15) * dt) % (Math.PI * 2);

  const ground = world.groundAt(plane.pos.x, plane.pos.z);
  if (plane.onGround) rollOnGround(plane, ground, forward, events);
  else if (plane.pos.y - contactClearance(plane) <= ground.height) resolveContact(plane, ground, events);

  readPlaneAttitude(plane);
  plane.agl = plane.pos.y - contactClearance(plane) - ground.height;
  const wasStalled = plane.stall;
  plane.stall = !plane.onGround && lift < 0.9 && plane.airborneOnce;
  if (plane.stall && !wasStalled) events.push({ type: 'stall' });
  if (plane.damage >= 100 && !plane.crashed) crashPlane(plane, ground.water ? 'splash' : 'terrain', events);
  return events;
}

function rollOnGround(plane, ground, forward, events) {
  const F = CONFIG.flight;
  if (ground.water) {
    crashPlane(plane, 'splash', events);
    return;
  }
  if (!ground.runway) {
    plane.speed = Math.max(0, plane.speed - 3 * CONFIG.dt); // rough grass
    if (plane.speed > 25) plane.damage += 8 * CONFIG.dt;
  }
  const pitch = clamp(plane.pitch, 0, 14 * DEG);
  if (plane.speed > F.rotateSpeed && pitch > 2 * DEG && liftFactor(plane.speed) >= 1) {
    plane.onGround = false;
    plane.airborneOnce = true;
    plane.pos.y += 0.05;
    events.push({ type: 'liftoff' });
    return;
  }
  plane.pos.y = ground.height + F.gearDownHeight;
  const settledPitch = pitch * (plane.speed > F.rotateSpeed * 0.8 ? 1 : 0.9);
  setPlaneAttitude(plane, plane.heading, settledPitch, 0);
  plane.vs = 0;
  if (plane.gearAnim < 0.9 && plane.speed > 0) {
    plane.speed = Math.max(0, plane.speed - 5 * CONFIG.dt); // sliding on the belly
    if (plane.speed > 10) plane.damage += 6 * CONFIG.dt;
  }
}

// First contact after flight: grade a landing, take damage and bounce, or crash.
function resolveContact(plane, ground, events) {
  const L = CONFIG.landing;
  const F = CONFIG.flight;
  const sink = Math.max(0, -plane.vs);
  const bankDeg = Math.abs(plane.bank) / DEG;
  const align = runwayAlignment(plane.heading);
  const gearOk = plane.gearAnim > 0.9;
  const settle = (quality, damage) => {
    plane.damage += damage;
    plane.onGround = true;
    plane.sinkVel = 0;
    plane.pos.y = ground.height + F.gearDownHeight;
    plane.touchdown = { quality, sink, bank: bankDeg, align, speed: plane.speed, onRunway: ground.runway, offset: Math.abs(plane.pos.x - CONFIG.runway.x) };
    setPlaneAttitude(plane, plane.heading, clamp(plane.pitch, 0, 12 * DEG), 0);
    events.push({ type: 'touchdown', quality, sink, damage });
  };
  if (ground.water) {
    crashPlane(plane, 'splash', events);
  } else if (ground.runway && gearOk && sink < L.maxSinkGood && bankDeg < L.maxBankGood && align < L.maxAlignGood && plane.speed < L.maxSpeedGood) {
    settle(sink < 1.0 ? 'Greaser' : sink < 1.9 ? 'Smooth' : 'Firm', 0);
  } else if (ground.runway && gearOk && sink < L.maxSinkHard && bankDeg < 25 && align < 35) {
    settle('Hard', L.hardDamage);
  } else if (sink < 2.5 && bankDeg < 15 && plane.speed < 40) {
    settle(ground.runway ? 'Belly' : 'Off-field', L.fieldDamage);
  } else if (sink < 7 && plane.damage + L.strikeDamage < 100) {
    plane.damage += L.strikeDamage;
    plane.sinkVel = -5; // knocked back up
    plane.pos.y = ground.height + contactClearance(plane) + 0.6;
    rotateLocal(plane.quat, AXIS_X, 5 * DEG);
    plane.speed *= 0.85;
    events.push({ type: 'damage', amount: L.strikeDamage, cause: 'terrain' });
  } else {
    crashPlane(plane, 'terrain', events);
  }
}

function crashPlane(plane, kind, events) {
  plane.crashed = kind;
  plane.speed = 0;
  plane.damage = 100;
  events.push({ type: 'crash', kind });
}
