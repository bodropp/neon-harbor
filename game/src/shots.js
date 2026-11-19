// Neon Harbor — the screenshot scenes behind ?shot=chase|foot|mission|city.
// Each one builds a real game state from the same seed, plays it forward a
// fixed number of steps with a scripted driver, then freezes it — so the
// frame is what a short game really looks like, and the same seed always
// gives the same frame.
import { makeCar, spawnTraffic } from './vehicles.js';
import { spawnPeds } from './pedestrians.js';
import { spawnThugs, startMission } from './missions.js';
import { addWanted } from './police.js';

const STEP = 1 / 60;

/** Drive a car forward with slight steering for `seconds` of simulation. */
function driveForward(G, seconds, steerTo) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const car = G.player.car;
    if (!car) break;
    G.input.up = true;
    G.input.left = steerTo && car.angle > steerTo;
    G.input.right = steerTo && car.angle < steerTo;
    G.update(STEP);
    G.input.up = false; G.input.left = false; G.input.right = false;
  }
}

/** Walk the player toward (x, y) for `seconds` of simulation. */
function walkToward(G, x, y, seconds) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const dx = x - G.player.x, dy = y - G.player.y;
    if (Math.hypot(dx, dy) < 12) break;
    G.input.right = dx > 8;
    G.input.left = dx < -8;
    G.input.down = dy > 8;
    G.input.up = dy < -8;
    G.update(STEP);
    G.input.up = false; G.input.down = false; G.input.left = false; G.input.right = false;
  }
}

/**
 * Set the world to the named scene and return the screen to draw. The game
 * is frozen afterwards (G.shotFrozen = true) so the screenshot is stable.
 */
export function stageShot(G, name) {
  G.resetWorld(7);
  G.screen = 'play';
  spawnTraffic(G, 14);
  spawnPeds(G, 26);
  const city = G.city;

  if (name === 'chase') {
    // Cover shot: Rook in a sports car, 3 stars, two police cars closing in,
    // traffic ahead, a mission objective on the HUD. The car runs east along
    // Sunrise Ave (y=644) so it stays on the road the whole drive.
    const car = makeCar(city, G.rng, { x: 1252, y: 644, angle: 0, type: 'sport', color: '#d93c4a' });
    G.player.car = car;
    G.player.x = car.x; G.player.y = car.y;
    G.player.cash = 2450;
    startMission(G, 1);
    G.mission.stage = 1;
    G.hud.setObjective('JOB 2 — THE PACKAGE', 'Deliver the package to Club Neon', 'Somebody tipped off the cops. Drive fast.');
    addWanted(G, 360, 'Cops on your tail');
    const cop1 = makeCar(city, G.rng, { x: 1150, y: 644, angle: 0, type: 'police' });
    const cop2 = makeCar(city, G.rng, { x: 1100, y: 662, angle: 0, type: 'police' });
    cop1.kind = 'car'; cop2.kind = 'car';
    G.police.push(cop1, cop2);
    driveForward(G, 2.2, 0);
    G.camera.x = G.player.car.x; G.camera.y = G.player.car.y;
  } else if (name === 'foot') {
    // On foot at the docks: mission marker, pedestrians, traffic, the city.
    // The player stands on Harbor Blvd (x=644) with a parked car beside them.
    G.player.x = 620; G.player.y = 1480;
    G.player.cash = 300;
    startMission(G, 0);
    G.hud.setObjective('JOB 1 — WHEELS', 'Steal any car (walk up to one, press E)', 'Mara needs a driver. Steal any car and bring it to the Harbor Gate.');
    // A tempting parked car right by the player.
    const parked = makeCar(city, G.rng, { x: 664, y: 1420, angle: Math.PI / 2, type: 'sedan', color: '#4a7ac9' });
    G.parked.push(parked);
    walkToward(G, 650, 1450, 1.5);
    G.camera.x = G.player.x; G.camera.y = G.player.y;
  } else if (name === 'mission') {
    // Mission 3 in progress: two enforcers down on the pier, one left, 2 stars.
    G.player.x = 1180; G.player.y = 1720;
    G.player.cash = 1050;
    G.player.ammo = 9;
    startMission(G, 2);
    G.mission.stage = 1;
    G.hud.setObjective('JOB 3 — COLLECT THE DEBT', 'Take down the enforcers (1 of 3 left)', 'Watch your health — they hit back.');
    spawnThugs(G, [
      { x: 1170, y: 1720 }, { x: 1230, y: 1780 }, { x: 1190, y: 1840 },
    ], 'thug');
    // Two are already down.
    G.enemies[0].hp = 0; G.enemies[1].hp = 0;
    G.enemies = G.enemies.filter((e) => e.hp > 0);
    G.peds.push({ x: 1175, y: 1750, angle: 0.5, speed: 0, state: 'down', downT: 6, shirt: '#8a2e3a', pants: '#1a1a22', axis: 'v', line: 0, dir: 1, pauseT: 0 });
    G.peds.push({ x: 1225, y: 1810, angle: 2.2, speed: 0, state: 'down', downT: 6, shirt: '#8a2e3a', pants: '#1a1a22', axis: 'v', line: 0, dir: 1, pauseT: 0 });
    addWanted(G, 180, 'Witnesses called the cops');
    walkToward(G, 1200, 1720, 1.2);
    G.camera.x = G.player.x; G.camera.y = G.player.y;
  } else {
    // 'city' (and any other name): golden-hour drive down the main avenue.
    const car = makeCar(city, G.rng, { x: 948, y: 1252, angle: 0, type: 'sedan', color: '#2a9a8a' });
    G.player.car = car;
    G.player.x = car.x; G.player.y = car.y;
    G.player.cash = 5200;
    startMission(G, 3);
    G.hud.setObjective('JOB 4 — HOT CARGO', 'Steal the armored van at the Old Warehouse', 'The alarm will bring the cops.');
    G.clockHour = 18.9;
    driveForward(G, 2.6, 0);
    G.camera.x = G.player.car.x; G.camera.y = G.player.car.y;
  }

  G.shotFrozen = true;
  G.clockHour = G.clockHour || 18.7;
  return { screen: 'play' };
}
