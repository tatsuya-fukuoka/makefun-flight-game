// Aonami Ring Run: every tuning constant in one place (world size, flight model, mission layout seed).
// Units are metres, seconds and radians inside the simulation; the HUD converts to ft, kt and degrees.

const CONFIG = {
  seed: 20261126, // seeds the archipelago, the ring jitter and the scenery
  dt: 1 / 60, // fixed physics timestep
  maxStepsPerFrame: 6,

  world: {
    size: 7600, // terrain square side (m), centred on the runway
    segments: 190, // terrain grid cells per side (40 m cells, flat shaded)
    seaFloor: -26,
    extraIslands: 15,
    treeAttempts: 5200,
    cloudCount: 26,
    boundary: 3500, // beyond this the HUD warns the pilot to turn back
    fogNear: 650,
    fogFar: 5200,
  },

  colors: {
    fog: 0xefc7a2,
    skyZenith: 0x4c7db6,
    skyMid: 0xa7c4df,
    skyHorizon: 0xf6c99c,
    sun: 0xfff1cf,
    sunLight: 0xffd6a3,
    water: 0x3a9db2,
    seabed: 0x1f5f73,
  },

  sunDirection: [-0.62, 0.3, -0.5], // low western sun, late afternoon

  runway: { x: 0, z: 0, length: 760, width: 34, elevation: 5, heading: 0, number: '36' },

  flight: {
    gravity: 9.81,
    thrust: 8.2, // m/s^2 at full throttle
    drag: 0.0016, // quadratic drag: full-throttle level speed about 72 m/s (140 kt)
    inducedDrag: 1.6, // extra deceleration (m/s^2) at full back-stick, and from steep banks
    gearDrag: 0.0007,
    stallSpeed: 27, // 52 kt: lift falls away below this
    rotateSpeed: 31, // 60 kt: wheels leave the ground above this with the nose up
    maxSpeed: 105,
    pitchRate: 0.7,
    rollRate: 1.7,
    yawRate: 0.35,
    maxTurnRate: 0.85,
    throttleRate: 0.55, // throttle travel per second while the key is held
    rollStability: 0.35, // gentle wings-level tendency below 50 degrees of bank
    gearDownHeight: 1.75, // wheel contact below the centre of mass
    gearUpHeight: 0.95, // belly contact
    halfSpan: 5.5,
    gearSpeed: 0.6, // gear travel per second
    rollingDrag: 0.35,
    brakeDecel: 4.5,
    groundSteerRate: 0.55,
    fuelBase: 0.09, // % per second with the engine running
    fuelThrottle: 0.42, // extra % per second at full throttle (scales with throttle squared)
  },

  landing: {
    maxSinkGood: 3.2, // m/s at touchdown for a proper landing
    maxSinkHard: 6,
    maxBankGood: 12, // degrees
    maxAlignGood: 18, // degrees off the runway axis
    maxSpeedGood: 50, // m/s (97 kt)
    hardDamage: 35,
    fieldDamage: 40,
    strikeDamage: 30,
  },

  rings: {
    radius: 20,
    tube: 2.2,
    jitter: 70,
    minClearance: 55,
    // Designed route (x east, z south, altitude m); seeded jitter moves each ring a little.
    route: [
      [120, -1050, 95],
      [700, -1950, 160],
      [1750, -2350, 230],
      [2550, -1350, 185],
      [2150, 0, 110],
      [1400, 1300, 80],
      [200, 2450, 120],
      [-1000, 2050, 140],
    ],
  },

  scoring: {
    ring: 400,
    timePar: 2400, // time bonus starts here and loses 8 points a second
    timeLossPerSecond: 8,
    landing: { Greaser: 2000, Smooth: 1500, Firm: 1000, Hard: 400, Belly: 200, 'Off-field': 100 },
    fuelPerPercent: 15,
    damagePerPercent: 10,
  },

  camera: { distance: 15, height: 4.2, lookAhead: 10, stiffness: 5.5, rollFollow: 0.35, fov: 62 },

  units: { ft: 3.28084, kt: 1.94384, fpm: 196.85 },
};
