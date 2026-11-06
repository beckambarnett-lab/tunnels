// Every tuning number in one place. Values marked GDD come straight from docs/GDD.md
// ("Proposed" starting points for tuning); others are implementation choices.

export const CELL = 0.5; // m per grid cell (GDD: 0.5 m grid)
export const SEG = 32; // cells per tunnel segment side (16 m)
export const WALL_H = 3.0; // tunnel height in m
export const CHUNK = 16; // cells per terrain render chunk side

// Player
export const PLAYER = {
  walk: 3.0, // m/s
  sprint: 5.0,
  crouch: 1.5,
  radius: 0.3,
  eye: 1.6,
  eyeCrouch: 1.0,
};

// Swarm (GDD "Scale")
export const SWARM = {
  maxBugs: 3000, // GDD: about 3,000 in the nest
  defaultBugs: 500, // GDD: up to about 500 visible in a corridor at the peak
  darkSpeed: PLAYER.walk * 1.5, // GDD: about 1.5x player walking speed
  digSpeed: 0.9, // m/s moving through the under layer
  radius: 0.12, // body radius for separation
  neighbourRadius: 0.9,
  maxNeighbours: 10,
  sepWeight: 2.2,
  aliWeight: 0.35,
  cohWeight: 0.25,
  flowWeight: 1.0,
  lightPushWeight: 6.0,
  // light tolerance: bugs refuse to stand in effective light above this
  tolerance: 0.12,
  strikeTolerance: 0.22, // a striking bug is a little braver
  touchDist: 0.55, // contact with a player
  farSimDist: 40, // beyond this from every player, bugs update at a reduced rate
  digTime: 1.4, // seconds of one bug's work to open a solid cell
  maxDiggersPerCell: 4,
  burnTime: 1.2, // seconds a burning bug lives
  burnSpreadRadius: 0.6,
  burnSpreadChance: 3.5, // per second per burning neighbour
};

// Flow field costs (per cell step, multiplied by step length in cells)
export const FIELD = {
  openCost: 1,
  digCost: 7, // surface solid earth
  underCost: 9, // earth below the floor
  burrowCost: 3, // under-layer cells the hive already crawled through
  layerChangeCost: 4,
  lightCost: 220, // multiplied by effective light (0..1+)
  rebuildInterval: 0.25, // s, minimum time between rebuilds of the same field
  maxFields: 24,
};

// Light
export const LIGHT = {
  darkThreshold: 0.04, // raw light below this counts as a dark spot (breach allowed)
  ambient: 0.0,
};

// Visibility (breach rule)
export const VIS = {
  range: 28, // m
  fovDeg: 100, // horizontal view checked, a bit wider than the camera
  rays: 140,
  nearRadius: 1.5, // m: always "seen" (felt) around the player
  interval: 0.15, // s
};

// Overwhelm (GDD: touching bugs fill the meter; full = downed)
export const OVERWHELM = {
  perBugPerSec: 0.06,
  decayPerSec: 0.25,
  respawnDelay: 3,
};

// Fire
export const FIRE = {
  range: 5.5, // m
  coneDeg: 18,
  particlesPerSec: 90,
  particleSpeed: 9,
  particleLife: 0.6,
  particleRadius: 0.35,
  lightRadius: 6,
  collapseWindow: 12, // s: a hole dug within this long is "fresh" and collapses under fire
  collapseHeat: 0.6, // s of fire contact to collapse a fresh hole
};

// GDD "Starting values" fuel table
export const FUEL = {
  start: 1500,
  flamethrowerPerSec: 6,
  lightningPerShot: 12,
  generatorPerMin: 1,
  lampPerMin: 0.5,
  floodlightPerMin: 2,
  motionLampIdlePerMin: 0.1,
  flashlightRecharge: 3,
  respawn: 150,
  oilPerBody: 2,
};
