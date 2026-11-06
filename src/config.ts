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

// Camp (M2)
export const CAMP = {
  spoolLength: 15, // m of cable per spool (GDD: about 15 m)
  wirePointStep: 0.5, // m between laid cable points
  reelPerCrank: 0.5, // m wound in per left/right alternation
  cutTime: 1.0, // bug-seconds of chewing to cut a wire segment
  chewRadius: 0.45,
  repairTime: 1.2, // s holding R
  repairRadius: 1.6,
  interactRange: 2.2,
  carrySpeedMul: 0.6, // two-handed generator
  liftHold: 0.5, // s holding E to lift the generator
  zapperRange: 2.4,
  zapperCone: 0.5, // rad half-angle
  zapperMaxKills: 3,
  zapperCooldown: 0.45,
  zapperFuelPerKill: 3,
  stompRange: 0.9,
  stompCooldown: 0.7,
  flashlightBattery: 240, // s of light per charge
  bodyRadius: 1.6, // E collects all bodies within this
  motionRange: 5,
};

// Queen, learning, director (M3)
export const QUEEN = {
  thinkInterval: 1.0, // GDD: scores intents about once a second
  minCommit: 6, // s an intent is kept at least
  maxCommit: 16,
  senseRange: 14, // m: the queen only knows what her bugs sense (bugs within this of the event)
  minTendril: 20, // GDD: 20 to 200 bugs
  maxTendril: 200,
  assaultSilence: 3, // s of nest-wide silence before an assault (the tell)
  siegeBraveryRate: 0.15, // braveness gained per second of siege: the ring grows bolder
  siegeMaxBravery: 7, // enough to rush an electric lamp's fixture
  fixtureDamagePerBug: 0.06, // hp/s per attacking bug (fixture hp 1)
};
export const BELIEF = { touchDrop: 0.02, lightningRise: 0.05, floor: 0.1, lightningRadius: 5, touchCooldown: 3, typeCooldown: 2 };
export const LEARN = {
  // habit thresholds (GDD learning tree)
  touchLight: 25, // electric touches without burning -> Testing the light
  sameSpotCamps: 2, // camps set up in the same kind of spot -> Flanking
  backToWallSecs: 25, // seconds a player stands with their back to a wall -> Breaching
  longWireM: 25, // total cable laid -> Sabotage (cables); +3 cuts -> generator
  flameSecs: 20, // seconds of flamethrower -> Spreading out + Baiting
  harvestBodies: 10, // bodies harvested -> Dragging the dead
  motionTriggers: 8, // motion lamp switch-ons -> Triggering them from range
  playerDigCells: 20, // cells dug by Enlite suits -> Taking over tunnels
  fuelLowFrac: 0.3, // -> Dark rush
  // time-based fallback unlocks (fairness: keep pace with strong teams), minutes of run time
  fallbackMin: { testLight: 6, flank: 8, breach: 10, sabotage: 7, sabotageGenerator: 14, spreadOut: 12, bait: 12, dragDead: 15, triggerMotion: 15, takeOver: 30, darkRush: 40 },
};
export const DIRECTOR = {
  peakThreshold: 0.75,
  calmThreshold: 0.25,
  sustainMin: 3, // GDD: 3-5 s
  sustainMax: 5,
  decayPerSec: 0.06,
  // slow curve per act (GDD): relax seconds, peak ceiling (budget 0..1, max tendril size)
  acts: {
    1: { relax: 90, budget: 0.25, maxTendril: 40 },
    2: { relax: 75, budget: 0.5, maxTendril: 80 },
    3: { relax: 30, budget: 0.8, maxTendril: 150 },
    4: { relax: 15, budget: 1.0, maxTendril: 200 },
    5: { relax: 0, budget: 1.0, maxTendril: 200 },
  } as Record<number, { relax: number; budget: number; maxTendril: number }>,
};

// Death, the hive and respawn (M4)
export const DEATH = {
  carriers: 6, // bugs needed to lift a downed player
  carrySpeed: 1.3, // m/s toward the queen
  carryMax: 45, // s: GDD "the trip takes about 45 seconds"
  devourDist: 3, // m from the queen (hive centre)
  reviveTime: 3, // s holding E on a downed teammate
  reviveOverwhelm: 0.5,
  bodyBugs: 60, // GDD: mass about 60 bugs into a human shape
  recruitRadius: 3.5,
  ritualLight: 0.25, // raw light the body must stand in
  ritualTime: 10, // s of electrocution
  lightningRitual: 2, // s of progress per lightning hit on the body
  willDrainResist: 0.15, // per s pushing against orders
  willDrainLight: 0.08, // per s dragging the body into light
  willRefill: 0.1, // per s obeying
  breakBugs: 15, // hostile bugs on the body break the ritual
  respawnOverwhelm: 0.6, // "re-form as a human at low health"
  soloZapperPerSec: 6, // solo bug zapper costs more fuel than a teammate's lightning
  soloGrace: 180, // s a solo player may spend in the hive with a bug zapper before the run fails
};
