// The seeded archipelago: island layout, terrain heightfield and mesh, water, sky, runway and airfield,
// the eight target rings, trees, houses, boats and clouds. Same seed, same world, every time.

const WORLD_UP = new THREE.Vector3(0, 1, 0);

function generateIslands(rng) {
  const islands = [
    { x: 0, z: 0, rx: 560, rz: 860, height: 30, rot: 0 }, // the airstrip island
    { x: 540, z: -170, rx: 300, rz: 260, height: 92, rot: 0.4 }, // its eastern hill
  ];
  const inCorridor = (x, z) => Math.abs(x) < 420 && Math.abs(z) < 2800 && Math.abs(z) > 700;
  for (const p of CONFIG.rings.route) {
    for (let tries = 0; tries < 12; tries++) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(240, 480);
      const x = p[0] + Math.cos(a) * d;
      const z = p[1] + Math.sin(a) * d;
      if (inCorridor(x, z) || Math.hypot(x, z) < 900) continue;
      islands.push({ x, z, rx: rng.range(300, 500), rz: rng.range(280, 480), height: rng.range(70, 200), rot: rng.range(0, Math.PI) });
      break;
    }
  }
  let tries = 0;
  const target = islands.length + CONFIG.world.extraIslands;
  while (islands.length < target && tries++ < 600) {
    const x = rng.range(-3300, 3300);
    const z = rng.range(-3300, 3300);
    const r = rng.range(140, 420);
    if (inCorridor(x, z) || Math.hypot(x, z) < 1000 + r) continue;
    if (islands.some((i) => Math.hypot(i.x - x, i.z - z) < (i.rx + r) * 0.8)) continue;
    islands.push({ x, z, rx: r, rz: r * rng.range(0.6, 1.2), height: rng.range(20, 150), rot: rng.range(0, Math.PI) });
  }
  for (const isl of islands) {
    isl.cos = Math.cos(isl.rot);
    isl.sin = Math.sin(isl.rot);
    isl.reach = Math.max(isl.rx, isl.rz) * 1.3;
  }
  return islands;
}

function createHeightSampler(islands, seed) {
  const sea = CONFIG.world.seaFloor;
  const rw = CONFIG.runway;
  return function heightAt(x, z) {
    let best = 0;
    for (const isl of islands) {
      const dx = x - isl.x;
      const dz = z - isl.z;
      if (Math.abs(dx) > isl.reach || Math.abs(dz) > isl.reach) continue;
      const lx = dx * isl.cos + dz * isl.sin;
      const lz = -dx * isl.sin + dz * isl.cos;
      const d = Math.sqrt((lx / isl.rx) ** 2 + (lz / isl.rz) ** 2);
      const wobble = 1 + (valueNoise2D(x * 0.0028 + isl.x * 0.01, z * 0.0028, seed) - 0.5) * 0.6;
      const t = clamp(1 - d * wobble, 0, 1);
      if (t <= 0) continue;
      const shape = Math.pow(t, 1.35) * (3 - 2 * Math.pow(t, 0.9));
      best = Math.max(best, (isl.height - sea) * shape * 0.5 + (isl.height - sea) * 0.5 * t * t);
    }
    let h = sea + best;
    if (h > -4) h += (fractalNoise2D(x * 0.006, z * 0.006, seed + 7, 3) - 0.5) * clamp(h + 4, 0, 60) * 0.7;
    const ax = Math.max(0, Math.abs(x - rw.x) - (rw.width / 2 + 45));
    const az = Math.max(0, Math.abs(z - rw.z) - (rw.length / 2 + 60));
    const d = Math.hypot(ax, az);
    if (d < 190) h = lerp(rw.elevation - 0.25, h, smoothstep(0, 190, d));
    return h;
  };
}

function isOnRunway(x, z) {
  const rw = CONFIG.runway;
  return Math.abs(x - rw.x) <= rw.width / 2 + 2 && Math.abs(z - rw.z) <= rw.length / 2;
}

function terrainColor(h, normalY, jitter, out) {
  let c;
  if (h < -9) c = 0x2d7787;
  else if (h < -1) c = 0x6cc0b3;
  else if (h < 3.5) c = 0xe6d29b;
  else if (normalY < 0.72 || h > 175) c = h > 185 ? 0xd9cfc0 : 0x9b8c78;
  else if (h < 30) c = 0x93b65b;
  else if (h < 95) c = 0x6f9e48;
  else c = 0x5b8640;
  out.setHex(c);
  out.multiplyScalar(0.93 + jitter * 0.14);
  return out;
}

function buildTerrainMesh(heightAt, seed) {
  const W = CONFIG.world;
  const n = W.segments;
  const step = W.size / n;
  const half = W.size / 2;
  const heights = new Float32Array((n + 1) * (n + 1));
  for (let iz = 0; iz <= n; iz++) {
    for (let ix = 0; ix <= n; ix++) heights[iz * (n + 1) + ix] = heightAt(-half + ix * step, -half + iz * step);
  }
  const positions = new Float32Array(n * n * 18);
  const colors = new Float32Array(n * n * 18);
  const color = new THREE.Color();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  let o = 0;
  const pushTri = (p0, p1, p2, jitter) => {
    a.subVectors(p1, p0);
    b.subVectors(p2, p0);
    c.crossVectors(a, b).normalize();
    terrainColor((p0.y + p1.y + p2.y) / 3, c.y, jitter, color);
    for (const p of [p0, p1, p2]) {
      positions[o] = p.x; positions[o + 1] = p.y; positions[o + 2] = p.z;
      colors[o] = color.r; colors[o + 1] = color.g; colors[o + 2] = color.b;
      o += 3;
    }
  };
  const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const x0 = -half + ix * step;
      const z0 = -half + iz * step;
      v[0].set(x0, heights[iz * (n + 1) + ix], z0);
      v[1].set(x0 + step, heights[iz * (n + 1) + ix + 1], z0);
      v[2].set(x0, heights[(iz + 1) * (n + 1) + ix], z0 + step);
      v[3].set(x0 + step, heights[(iz + 1) * (n + 1) + ix + 1], z0 + step);
      const j1 = hash2(ix, iz, seed);
      const j2 = hash2(ix + 977, iz, seed);
      if (hash2(ix, iz, seed + 3) < 0.5) {
        pushTri(v[0], v[2], v[1], j1);
        pushTri(v[1], v[2], v[3], j2);
      } else {
        pushTri(v[0], v[2], v[3], j1);
        pushTri(v[0], v[3], v[1], j2);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
}

function buildWater(seed) {
  const group = new THREE.Group();
  const size = CONFIG.world.size * 2.6;
  const geo = new THREE.PlaneGeometry(size, size, 96, 96);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, (hash2(i, 17, seed) - 0.5) * 1.1);
  geo.computeVertexNormals();
  const water = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({
    color: CONFIG.colors.water, specular: 0xffd9a8, shininess: 70, flatShading: true, transparent: true, opacity: 0.8,
  }));
  water.renderOrder = 1;
  const seabed = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000), new THREE.MeshLambertMaterial({ color: CONFIG.colors.seabed }));
  seabed.rotation.x = -Math.PI / 2;
  seabed.position.y = CONFIG.world.seaFloor - 0.6;
  group.add(seabed, water);
  return group;
}

function buildSky() {
  const C = CONFIG.colors;
  const radius = 9000;
  const geo = new THREE.SphereGeometry(radius, 32, 20);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const zenith = new THREE.Color(C.skyZenith);
  const mid = new THREE.Color(C.skyMid);
  const horizon = new THREE.Color(C.skyHorizon);
  const fog = new THREE.Color(C.fog);
  const col = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / radius;
    if (t < 0.02) col.copy(fog);
    else if (t < 0.22) col.copy(horizon).lerp(mid, smoothstep(0.02, 0.22, t));
    else col.copy(mid).lerp(zenith, smoothstep(0.22, 0.85, t));
    colors.set([col.r, col.g, col.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const sky = new THREE.Group();
  sky.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })));
  const sunDir = new THREE.Vector3(...CONFIG.sunDirection).normalize();
  const sun = new THREE.Mesh(new THREE.CircleGeometry(300, 24), new THREE.MeshBasicMaterial({ color: C.sun, fog: false, depthWrite: false }));
  sun.position.copy(sunDir).multiplyScalar(8400);
  sun.lookAt(0, 0, 0);
  const glow = new THREE.Mesh(new THREE.CircleGeometry(900, 24), new THREE.MeshBasicMaterial({ color: 0xffe2b0, fog: false, depthWrite: false, transparent: true, opacity: 0.28 }));
  glow.position.copy(sunDir).multiplyScalar(8500);
  glow.lookAt(0, 0, 0);
  sky.add(glow, sun);
  sky.renderOrder = -1;
  return sky;
}

function paintRunwayTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 2048;
  const g = canvas.getContext('2d');
  g.fillStyle = '#4b4c52';
  g.fillRect(0, 0, 128, 2048);
  const rng = createRng(CONFIG.seed + 5);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = rng.chance(0.5) ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.05)';
    g.fillRect(rng.range(0, 128), rng.range(0, 2048), rng.range(2, 8), rng.range(4, 30));
  }
  g.fillStyle = '#f4f1e8';
  g.fillRect(4, 0, 3, 2048);
  g.fillRect(121, 0, 3, 2048);
  for (let y = 260; y < 1790; y += 70) g.fillRect(62, y, 4, 38);
  for (const top of [12, 2036 - 90]) {
    for (let x = 14; x < 116; x += 12) if (Math.abs(x + 3 - 64) > 8) g.fillRect(x, top, 6, 90);
  }
  g.font = 'bold 64px sans-serif';
  g.textAlign = 'center';
  g.fillText(CONFIG.runway.number, 64, 1900);
  g.save();
  g.translate(64, 148);
  g.rotate(Math.PI);
  g.fillText('18', 0, 0);
  g.restore();
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  return tex;
}

function buildAirfield(heightAt, rng) {
  const rw = CONFIG.runway;
  const group = new THREE.Group();
  const lambert = (color) => new THREE.MeshLambertMaterial({ color, flatShading: true });
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(rw.width, rw.length), new THREE.MeshLambertMaterial({ map: paintRunwayTexture() }));
  strip.rotation.x = -Math.PI / 2;
  strip.position.set(rw.x, rw.elevation + 0.04, rw.z);
  group.add(strip);
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(70, 150), lambert(0x6d6a66));
  apron.rotation.x = -Math.PI / 2;
  apron.position.set(rw.x + 70, rw.elevation + 0.03, rw.z + 60);
  const taxi = new THREE.Mesh(new THREE.PlaneGeometry(36, 12), lambert(0x5a5a5e));
  taxi.rotation.x = -Math.PI / 2;
  taxi.position.set(rw.x + 34, rw.elevation + 0.03, rw.z + 60);
  group.add(apron, taxi);
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff0b0 });
  const lightGeo = new THREE.BoxGeometry(0.7, 0.5, 0.7);
  for (let z = -rw.length / 2; z <= rw.length / 2; z += 40) {
    for (const side of [-1, 1]) {
      const l = new THREE.Mesh(lightGeo, lightMat);
      l.position.set(rw.x + side * (rw.width / 2 + 2), rw.elevation + 0.3, rw.z + z);
      group.add(l);
    }
  }
  const approachMat = new THREE.MeshBasicMaterial({ color: 0xff6b3d });
  for (let i = 1; i <= 6; i++) {
    for (const end of [-1, 1]) {
      const z = rw.z + end * (rw.length / 2 + i * 30);
      const l = new THREE.Mesh(new THREE.BoxGeometry(8, 0.6, 0.8), approachMat);
      l.position.set(rw.x, Math.max(0.5, heightAt(rw.x, z) + 0.5), z);
      group.add(l);
    }
  }
  const hangar = new THREE.Group();
  const walls = new THREE.Mesh(new THREE.BoxGeometry(34, 10, 26), lambert(0xd8d2c4));
  walls.position.y = 5;
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(13, 13, 34, 8, 1, false, 0, Math.PI), lambert(0x4f7f8a));
  roof.rotation.z = Math.PI / 2;
  roof.position.y = 10;
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.4, 8, 20), lambert(0x33373b));
  door.position.set(-17, 4, 0);
  hangar.add(walls, roof, door);
  hangar.position.set(rw.x + 120, rw.elevation, rw.z + 30);
  const tower = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.2, 16, 8), lambert(0xe9e3d6));
  shaft.position.y = 8;
  const cab = new THREE.Mesh(new THREE.CylinderGeometry(5, 4.2, 4, 8), lambert(0x2d4f63));
  cab.position.y = 18;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(5.6, 5.6, 0.8, 8), lambert(0xc8452f));
  cap.position.y = 20.4;
  tower.add(shaft, cab, cap);
  tower.position.set(rw.x + 90, rw.elevation, rw.z + 150);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 7), lambert(0xdddddd));
  pole.position.set(rw.x - 45, rw.elevation + 3.5, rw.z - 250);
  const sock = new THREE.Mesh(new THREE.ConeGeometry(0.9, 4, 8, 1, true), lambert(0xff7a2f));
  sock.rotation.z = Math.PI / 2 - 0.2;
  sock.position.set(rw.x - 43, rw.elevation + 6.6, rw.z - 250);
  group.add(hangar, tower, pole, sock);
  for (let i = 0; i < 3; i++) {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 5, 10), lambert(0xf0ece2));
    tank.position.set(rw.x + 150 + i * 8, rw.elevation + 2.5, rw.z + 110);
    group.add(tank);
  }
  group.add(buildVillage(heightAt, rng));
  return group;
}

function buildVillage(heightAt, rng) {
  const village = new THREE.Group();
  const wallMat = new THREE.MeshLambertMaterial({ color: 0xf3ede0, flatShading: true });
  const roofMats = [0xc65a3a, 0xb8492f, 0x4f7f8a].map((c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true }));
  let placed = 0;
  for (let tries = 0; tries < 300 && placed < 16; tries++) {
    const x = rng.range(-380, 260);
    const z = rng.range(250, 720);
    const h = heightAt(x, z);
    if (Math.abs(x) < 70 || h < 3 || h > 28) continue;
    const house = new THREE.Group();
    const w = rng.range(6, 10);
    const d = rng.range(6, 9);
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, 4.5, d), wallMat);
    body.position.y = 2.25;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.75, 3.2, 4), rng.pick(roofMats));
    roof.position.y = 6.1;
    roof.rotation.y = Math.PI / 4;
    house.add(body, roof);
    house.position.set(x, h - 0.3, z);
    house.rotation.y = rng.range(0, Math.PI);
    village.add(house);
    placed++;
  }
  return village;
}

function placeTrees(heightAt, rng) {
  const W = CONFIG.world;
  const rw = CONFIG.runway;
  const geo = new THREE.ConeGeometry(1, 1, 6);
  const mat = new THREE.MeshLambertMaterial({ flatShading: true });
  const mesh = new THREE.InstancedMesh(geo, mat, W.treeAttempts);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const col = new THREE.Color();
  const greens = [0x4f7d36, 0x5d8d3b, 0x3f6d34, 0x6b9842];
  let count = 0;
  for (let i = 0; i < W.treeAttempts; i++) {
    const x = rng.range(-W.size / 2, W.size / 2);
    const z = rng.range(-W.size / 2, W.size / 2);
    const h = heightAt(x, z);
    if (h < 6 || h > 150) continue;
    if (Math.abs(x - rw.x) < 200 && Math.abs(z - rw.z) < rw.length / 2 + 220) continue;
    if (Math.abs(heightAt(x + 10, z) - h) > 7 || Math.abs(heightAt(x, z + 10) - h) > 7) continue;
    const height = rng.range(6, 13);
    p.set(x, h + height * 0.42, z);
    s.set(height * 0.33, height, height * 0.33);
    q.setFromAxisAngle(WORLD_UP, rng.range(0, Math.PI));
    m.compose(p, q, s);
    mesh.setMatrixAt(count, m);
    col.setHex(rng.pick(greens));
    mesh.setColorAt(count, col);
    count++;
  }
  mesh.count = count;
  return mesh;
}

function placeClouds(rng) {
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0xfff4ea, emissive: 0x6a5048, flatShading: true });
  const geo = new THREE.IcosahedronGeometry(1, 0);
  for (let i = 0; i < CONFIG.world.cloudCount; i++) {
    const cloud = new THREE.Group();
    const puffs = rng.int(3, 6);
    for (let j = 0; j < puffs; j++) {
      const puff = new THREE.Mesh(geo, mat);
      const r = rng.range(28, 60);
      puff.scale.set(r * 1.4, r * 0.75, r);
      puff.position.set(j * 45 - puffs * 20 + rng.range(-15, 15), rng.range(-8, 14), rng.range(-25, 25));
      cloud.add(puff);
    }
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(600, 4200);
    cloud.position.set(Math.cos(a) * d, rng.range(430, 680), Math.sin(a) * d);
    cloud.rotation.y = rng.range(0, Math.PI);
    group.add(cloud);
  }
  return group;
}

function placeBoats(heightAt, rng) {
  const group = new THREE.Group();
  const hullMat = new THREE.MeshLambertMaterial({ color: 0xf7f3ea, flatShading: true });
  const sailMat = new THREE.MeshLambertMaterial({ color: 0xfff8ee, flatShading: true, side: THREE.DoubleSide });
  let placed = 0;
  for (let tries = 0; tries < 200 && placed < 9; tries++) {
    const x = rng.range(-2600, 2800);
    const z = rng.range(-2600, 2800);
    if (heightAt(x, z) > -8) continue;
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.2, 9), hullMat);
    hull.position.y = 0.4;
    const sail = new THREE.Mesh(new THREE.ConeGeometry(2.4, 9, 3), sailMat);
    sail.position.y = 5.4;
    boat.add(hull, sail);
    boat.position.set(x, 0, z);
    boat.rotation.y = rng.range(0, Math.PI * 2);
    group.add(boat);
    placed++;
  }
  return group;
}

function paintRingLabel(number) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const g = canvas.getContext('2d');
  g.fillStyle = 'rgba(20,28,36,0.78)';
  g.beginPath();
  g.arc(64, 64, 58, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 6;
  g.strokeStyle = '#ffb36b';
  g.stroke();
  g.fillStyle = '#fff6e8';
  g.font = 'bold 76px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(number), 64, 68);
  return new THREE.CanvasTexture(canvas);
}

function buildRings(heightAt, rng) {
  const R = CONFIG.rings;
  const rw = CONFIG.runway;
  const centers = R.route.map(([x, z, alt]) => {
    const cx = x + rng.range(-R.jitter, R.jitter);
    const cz = z + rng.range(-R.jitter, R.jitter);
    let ground = 0;
    for (let a = 0; a < 8; a++) ground = Math.max(ground, heightAt(cx + Math.cos(a) * R.radius * 2, cz + Math.sin(a) * R.radius * 2));
    return new THREE.Vector3(cx, Math.max(alt, ground + R.minClearance, heightAt(cx, cz) + R.minClearance), cz);
  });
  const start = new THREE.Vector3(rw.x, 60, rw.z - rw.length / 2);
  const finish = new THREE.Vector3(rw.x, 60, rw.z);
  const geo = new THREE.TorusGeometry(R.radius, R.tube, 8, 32);
  const pillarGeo = new THREE.CylinderGeometry(0.8, 0.8, 1, 6);
  return centers.map((center, i) => {
    const prev = i === 0 ? start : centers[i - 1];
    const next = i === centers.length - 1 ? finish : centers[i + 1];
    const inDir = center.clone().sub(prev).setY(0).normalize();
    const outDir = next.clone().sub(center).setY(0).normalize();
    const normal = inDir.clone().multiplyScalar(1.6).add(outDir).normalize();
    const material = new THREE.MeshLambertMaterial({ color: 0xf4efe6, emissive: 0x000000, flatShading: true, transparent: true, opacity: 1 });
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.copy(center);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: paintRingLabel(i + 1), depthWrite: false }));
    label.scale.set(10, 10, 1);
    label.position.copy(center).add(new THREE.Vector3(0, R.radius + 8, 0));
    const ground = Math.max(0, heightAt(center.x, center.z));
    const pillar = new THREE.Mesh(pillarGeo, new THREE.MeshBasicMaterial({ color: 0xff9a4d, transparent: true, opacity: 0.35 }));
    pillar.scale.y = Math.max(1, center.y - R.radius - ground);
    pillar.position.set(center.x, ground + pillar.scale.y / 2, center.z);
    return { index: i, center, normal, mesh, label, pillar, material };
  });
}

// Recolours the rings: passed ones fade to green, the next one glows and pulses, the rest stay ivory.
function setRingStates(rings, nextIndex, time) {
  for (const ring of rings) {
    const passed = ring.index < nextIndex;
    const isNext = ring.index === nextIndex;
    ring.material.color.setHex(passed ? 0x77e09a : isNext ? 0xff8a3d : 0xf4efe6);
    ring.material.emissive.setHex(passed ? 0x1c4a2a : isNext ? 0xb34a10 : 0x2a2622);
    ring.material.opacity = passed ? 0.35 : 1;
    const pulse = isNext ? 1 + Math.sin(time * 4) * 0.04 : 1;
    ring.mesh.scale.setScalar(pulse);
    ring.label.visible = !passed;
    ring.pillar.visible = isNext;
  }
}

function buildWorld(scene) {
  const seed = CONFIG.seed;
  const rng = createRng(seed);
  const islands = generateIslands(rng);
  const heightAt = createHeightSampler(islands, seed);
  scene.add(buildSky());
  scene.add(buildTerrainMesh(heightAt, seed));
  scene.add(buildWater(seed));
  scene.add(buildAirfield(heightAt, createRng(seed + 11)));
  scene.add(placeTrees(heightAt, createRng(seed + 23)));
  scene.add(placeClouds(createRng(seed + 31)));
  scene.add(placeBoats(heightAt, createRng(seed + 41)));
  const rings = buildRings(heightAt, createRng(seed + 53));
  for (const ring of rings) scene.add(ring.mesh, ring.label, ring.pillar);
  const sky = scene.children[0];
  return {
    islands,
    heightAt,
    rings,
    sky,
    groundAt(x, z) {
      if (isOnRunway(x, z)) return { height: CONFIG.runway.elevation, water: false, runway: true };
      const h = heightAt(x, z);
      return h < 0 ? { height: 0, water: true, runway: false } : { height: h, water: false, runway: false };
    },
  };
}
