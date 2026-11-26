// The "Kestrel" low-wing propeller plane built from Three.js primitives: spinning propeller, moving
// ailerons, elevator and rudder, retracting tricycle gear, a ground shadow and crash/splash debris.
// The model faces -Z (forward), +X is the right wing, +Y is up; the origin is the centre of mass.

function flatMaterial(color, extra) {
  return new THREE.MeshLambertMaterial(Object.assign({ color, flatShading: true }, extra || {}));
}

function addPart(parent, geometry, material, x, y, z) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function buildHinge(parent, x, y, z, surfaceGeo, material, offset) {
  const hinge = new THREE.Group();
  hinge.position.set(x, y, z);
  addPart(hinge, surfaceGeo, material, offset.x, offset.y, offset.z);
  parent.add(hinge);
  return hinge;
}

function buildAircraft() {
  const cream = flatMaterial(0xf2e8d5);
  const red = flatMaterial(0xc8452f);
  const teal = flatMaterial(0x2f8f9d);
  const dark = flatMaterial(0x30343a);
  const glass = new THREE.MeshPhongMaterial({ color: 0x23435c, specular: 0xffe0b0, shininess: 90, flatShading: true });
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const fuselageGeo = new THREE.CylinderGeometry(0.62, 0.26, 6.6, 8);
  fuselageGeo.rotateX(-Math.PI / 2);
  addPart(body, fuselageGeo, cream, 0, 0, 0.7);
  const bandGeo = new THREE.CylinderGeometry(0.5, 0.42, 0.9, 8);
  bandGeo.rotateX(-Math.PI / 2);
  addPart(body, bandGeo, teal, 0, 0, 2.2);
  const cowlGeo = new THREE.CylinderGeometry(0.6, 0.66, 1.1, 10);
  cowlGeo.rotateX(-Math.PI / 2);
  addPart(body, cowlGeo, red, 0, 0, -3.1);
  const spinnerGeo = new THREE.ConeGeometry(0.3, 0.7, 8);
  spinnerGeo.rotateX(-Math.PI / 2);
  addPart(body, spinnerGeo, cream, 0, 0, -3.95);
  const canopy = addPart(body, new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), glass, 0, 0.42, -0.7);
  canopy.scale.set(0.5, 0.55, 1.25);

  // Low wing in two halves with a little dihedral, red tips, ailerons hinged at the trailing edge.
  const wingGeo = new THREE.BoxGeometry(5.5, 0.16, 1.7);
  const tipGeo = new THREE.BoxGeometry(0.6, 0.18, 1.5);
  const aileronGeo = new THREE.BoxGeometry(2.1, 0.09, 0.42);
  const ailerons = [];
  for (const side of [-1, 1]) {
    const half = new THREE.Group();
    half.position.set(0, -0.3, -0.6);
    half.rotation.z = side * 0.07;
    addPart(half, wingGeo, cream, side * 2.75, 0, 0);
    addPart(half, tipGeo, red, side * 5.2, 0, -0.05);
    ailerons.push(buildHinge(half, side * 3.7, 0, 0.85, aileronGeo, red, new THREE.Vector3(0, 0, 0.21)));
    body.add(half);
  }

  const tailGeo = new THREE.BoxGeometry(3.6, 0.1, 0.9);
  addPart(body, tailGeo, cream, 0, 0.15, 3.55);
  const elevator = buildHinge(body, 0, 0.15, 4.0, new THREE.BoxGeometry(3.6, 0.07, 0.5), red, new THREE.Vector3(0, 0, 0.25));
  const finGeo = new THREE.BoxGeometry(0.1, 1.4, 1.0);
  addPart(body, finGeo, teal, 0, 0.9, 3.5);
  const rudder = buildHinge(body, 0, 0.9, 4.0, new THREE.BoxGeometry(0.08, 1.3, 0.5), red, new THREE.Vector3(0, 0, 0.25));

  const propeller = new THREE.Group();
  propeller.position.set(0, 0, -3.75);
  const bladeGeo = new THREE.BoxGeometry(0.2, 2.7, 0.06);
  addPart(propeller, bladeGeo, dark, 0, 0, 0);
  addPart(propeller, bladeGeo, dark, 0, 0, 0).rotation.z = Math.PI / 2;
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.38, 20), new THREE.MeshBasicMaterial({ color: 0xd8d0c0, transparent: true, opacity: 0, depthWrite: false }));
  disc.position.z = -3.8;
  body.add(propeller, disc);

  // Tricycle gear: each leg pivots about its top so it can fold forward into the wing.
  const gearLegs = [];
  const strutGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.2, 6);
  const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.18, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  for (const [x, z, top] of [[-1.55, -0.3, -0.42], [1.55, -0.3, -0.42], [0, -2.5, -0.45]]) {
    const leg = new THREE.Group();
    leg.position.set(x, top, z);
    addPart(leg, strutGeo, dark, 0, -0.6, 0);
    addPart(leg, wheelGeo, dark, 0, -1.0, 0);
    body.add(leg);
    gearLegs.push(leg);
  }

  const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 20), new THREE.MeshBasicMaterial({ color: 0x1d2a2a, transparent: true, opacity: 0.32, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(5, 3.4, 1);
  shadow.renderOrder = 2;

  return { root, body, propeller, disc, ailerons, elevator, rudder, gearLegs, shadow, debris: null };
}

// Copies the simulated state onto the model: pose, propeller angle, control-surface deflection, gear travel.
function updateAircraftModel(model, plane, world) {
  model.root.position.copy(plane.pos);
  model.root.quaternion.copy(plane.quat);
  model.propeller.rotation.z = plane.propAngle;
  const spin = plane.engineOn ? 0.15 + plane.throttle * 0.25 : 0;
  model.disc.material.opacity = spin;
  model.propeller.visible = spin < 0.3;
  model.ailerons[0].rotation.x = plane.ctrl.roll * 0.45;
  model.ailerons[1].rotation.x = -plane.ctrl.roll * 0.45;
  model.elevator.rotation.x = plane.ctrl.pitch * 0.45;
  model.rudder.rotation.y = -plane.ctrl.yaw * 0.45;
  for (const leg of model.gearLegs) {
    leg.rotation.x = (1 - plane.gearAnim) * -1.45;
    leg.visible = plane.gearAnim > 0.02;
  }
  const g = world.groundAt(plane.pos.x, plane.pos.z);
  const agl = plane.pos.y - g.height;
  model.shadow.visible = !plane.crashed && agl < 160;
  model.shadow.position.set(plane.pos.x, g.height + 0.15, plane.pos.z);
  model.shadow.rotation.z = -plane.heading;
  model.shadow.material.opacity = 0.32 * clamp(1 - agl / 160, 0, 1);
  model.root.visible = !plane.crashed;
}

// Spawns a deterministic burst of debris: white spray for a ditching, dark earth and flame for terrain.
function spawnImpactDebris(model, scene, position, kind) {
  const rng = createRng(CONFIG.seed + 99);
  const group = new THREE.Group();
  const geo = new THREE.IcosahedronGeometry(1, 0);
  const palette = kind === 'splash' ? [0xffffff, 0xd9f2f5, 0x9fd8e0] : [0x3b322b, 0xff8a3d, 0x5c4a3a, 0xffd36b];
  const parts = [];
  for (let i = 0; i < 46; i++) {
    const mesh = new THREE.Mesh(geo, flatMaterial(rng.pick(palette)));
    mesh.position.copy(position);
    const s = rng.range(0.6, 2.2);
    mesh.scale.setScalar(s);
    const a = rng.range(0, Math.PI * 2);
    const up = kind === 'splash' ? rng.range(10, 26) : rng.range(5, 16);
    const out = rng.range(3, 12);
    parts.push({ mesh, vel: new THREE.Vector3(Math.cos(a) * out, up, Math.sin(a) * out), size: s });
    group.add(mesh);
  }
  if (kind === 'splash') {
    const ripple = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
    ripple.rotation.x = -Math.PI / 2;
    ripple.position.set(position.x, 0.3, position.z);
    group.add(ripple);
    parts.ripple = ripple;
  }
  scene.add(group);
  model.debris = { group, parts, age: 0 };
}

function stepImpactDebris(model, dt) {
  const d = model.debris;
  if (!d) return;
  d.age += dt;
  for (const p of d.parts) {
    p.vel.y -= 9.81 * dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    if (p.mesh.position.y < 0) p.mesh.position.y = 0;
    p.mesh.scale.setScalar(p.size * Math.max(0.05, 1 - d.age / 3));
  }
  if (d.parts.ripple) {
    d.parts.ripple.scale.setScalar(1 + d.age * 14);
    d.parts.ripple.material.opacity = Math.max(0, 0.7 - d.age * 0.25);
  }
}

function clearImpactDebris(model, scene) {
  if (model.debris) scene.remove(model.debris.group);
  model.debris = null;
}
