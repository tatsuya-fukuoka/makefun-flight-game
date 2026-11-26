// Boot and main loop: renderer, lights and fog, the smoothed chase camera, the fixed-timestep
// simulation driver, global keys (start, gear, pause, mute) and the URL demo switch.

function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  return renderer;
}

function createScene() {
  const C = CONFIG.colors;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(C.fog);
  scene.fog = new THREE.Fog(C.fog, CONFIG.world.fogNear, CONFIG.world.fogFar);
  scene.add(new THREE.HemisphereLight(0xcfe0f0, 0x6b5a3a, 0.62));
  const sun = new THREE.DirectionalLight(C.sunLight, 0.95);
  sun.position.set(...CONFIG.sunDirection).multiplyScalar(1000);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0x544a44, 0.25));
  return scene;
}

const camScratch = { forward: new THREE.Vector3(), flat: new THREE.Vector3(), up: new THREE.Vector3(), offset: new THREE.Vector3(), look: new THREE.Vector3() };

// Where the camera wants to be: behind and above the plane, following its heading and part of its pitch,
// with the camera's up vector leaning a little into the bank so the horizon tilts with the turn.
function chaseCameraGoal(plane) {
  const C = CONFIG.camera;
  const s = camScratch;
  s.forward.set(0, 0, -1).applyQuaternion(plane.quat);
  s.flat.set(s.forward.x, 0, s.forward.z);
  if (s.flat.lengthSq() < 1e-4) s.flat.set(0, 0, -1);
  s.flat.normalize().lerp(s.forward, 0.4).normalize();
  s.offset.copy(s.flat).multiplyScalar(-C.distance);
  s.offset.y += C.height;
  s.look.copy(s.forward).multiplyScalar(C.lookAhead);
  s.look.y += 1.5;
  s.up.set(0, 1, 0).applyQuaternion(plane.quat).lerp(WORLD_UP, 1 - C.rollFollow).normalize();
  return s;
}

function snapChaseCamera(game) {
  const goal = chaseCameraGoal(game.plane);
  game.cam.offset.copy(goal.offset);
  game.cam.look.copy(goal.look);
  game.cam.up.copy(goal.up);
  applyChaseCamera(game);
}

function updateChaseCamera(game, dt) {
  if (game.plane.crashed) return;
  const goal = chaseCameraGoal(game.plane);
  const k = 1 - Math.exp(-CONFIG.camera.stiffness * dt);
  game.cam.offset.lerp(goal.offset, k);
  game.cam.look.lerp(goal.look, Math.min(1, k * 1.6));
  game.cam.up.lerp(goal.up, k).normalize();
  applyChaseCamera(game);
}

function applyChaseCamera(game) {
  const camera = game.camera;
  const p = game.plane.pos;
  camera.position.copy(p).add(game.cam.offset);
  const ground = game.world.groundAt(camera.position.x, camera.position.z).height;
  camera.position.y = Math.max(camera.position.y, ground + 2.5);
  camera.up.copy(game.cam.up);
  camera.lookAt(p.x + game.cam.look.x, p.y + game.cam.look.y, p.z + game.cam.look.z);
}

function runSimulationSteps(game, count) {
  for (let i = 0; i < count; i++) simulateStep(game);
}

function simulateStep(game) {
  const dt = CONFIG.dt;
  game.simTime += dt;
  if (game.mode === 'debrief') return;
  const piloted = game.mode === 'flying' && !game.demo;
  const controls = piloted ? readPilotControls() : autopilotControls(game);
  game.lastControls = controls;
  const events = stepFlight(game.plane, controls, game.world, dt);
  if (game.mode === 'title' && game.plane.crashed) stageAttractFlight(game);
  stepMission(game, events, dt);
  stepImpactDebris(game.aircraft, dt);
  updateChaseCamera(game, dt);
}

function handleGlobalKeys(game) {
  const piloted = game.mode === 'flying' && !game.demo;
  if (takeKeyPress('KeyM')) game.audio.toggleMute();
  if (takeKeyPress('Enter') && game.mode !== 'flying') startSortie(game);
  if (takeKeyPress('Escape') && game.mode !== 'title') enterTitle(game);
  if (piloted && takeKeyPress('KeyG') && !game.plane.crashed) {
    if (game.plane.onGround) {
      showFlightMessage(game, 'Weight on wheels — gear locked down', 2, 'warn');
      return clearKeyPresses();
    }
    game.plane.gearDown = !game.plane.gearDown;
    showFlightMessage(game, game.plane.gearDown ? 'Gear coming down' : 'Gear up — clean for speed', 2);
  }
  if (piloted && takeKeyPress('KeyP')) {
    game.paused = !game.paused;
    if (game.paused) showFlightMessage(game, 'Paused — P to resume', 1e9);
    else game.message = null;
  }
  clearKeyPresses();
}

function renderFrame(game) {
  const p = game.plane;
  updateAircraftModel(game.aircraft, p, game.world);
  setRingStates(game.world.rings, game.mode === 'title' ? 0 : game.sortie.nextRing, game.simTime);
  game.world.sky.position.copy(game.camera.position);
  // On the title screen the view is shifted right so the plane flies beside the title card.
  if (game.mode === 'title') game.camera.setViewOffset(window.innerWidth, window.innerHeight, -window.innerWidth * 0.2, 0, window.innerWidth, window.innerHeight);
  else if (game.camera.view && game.camera.view.enabled) game.camera.clearViewOffset();
  if (game.mode !== 'title') updateInstruments(game);
  game.audio.setEngine(p.throttle, p.speed, p.engineOn && !p.crashed && game.mode !== 'debrief');
  if (p.stall && game.mode === 'flying' && !game.paused) game.audio.stallHorn(game.simTime);
  game.renderer.render(game.scene, game.camera);
}

function boot() {
  const canvas = document.getElementById('scene');
  const scene = createScene();
  const camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, window.innerWidth / window.innerHeight, 0.5, 20000);
  const game = {
    renderer: createRenderer(canvas),
    scene,
    camera,
    world: buildWorld(scene),
    aircraft: buildAircraft(),
    plane: createPlaneState(),
    hud: createInstruments(),
    audio: createAudio(),
    cam: { offset: new THREE.Vector3(), look: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0) },
    sortie: createSortie(),
    mode: 'title',
    demo: null,
    simTime: 0,
    accumulator: 0,
    lastTime: performance.now(),
    paused: false,
    frozen: false,
    message: null,
  };
  scene.add(game.aircraft.root, game.aircraft.shadow);
  window.aonami = game;

  initKeyboard(() => game.audio.start());
  document.getElementById('start-button').addEventListener('click', () => startSortie(game));
  document.getElementById('again-button').addEventListener('click', () => startSortie(game));
  document.getElementById('title-button').addEventListener('click', () => enterTitle(game));
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    game.renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const params = new URLSearchParams(window.location.search);
  if (params.get('demo') === '1') startDemoScene(game, params.get('scene') || 'rings', params.get('freeze') === '1');
  else enterTitle(game);

  function frame(now) {
    requestAnimationFrame(frame);
    const elapsed = Math.min(0.1, (now - game.lastTime) / 1000);
    game.lastTime = now;
    handleGlobalKeys(game);
    if (!game.frozen && !game.paused) {
      game.accumulator += elapsed;
      let steps = 0;
      while (game.accumulator >= CONFIG.dt && steps < CONFIG.maxStepsPerFrame) {
        simulateStep(game);
        game.accumulator -= CONFIG.dt;
        steps++;
      }
      if (steps === CONFIG.maxStepsPerFrame) game.accumulator = 0;
    }
    renderFrame(game);
  }
  renderFrame(game);
  document.body.classList.add('ready');
  requestAnimationFrame(frame);
}

window.addEventListener('load', boot);
