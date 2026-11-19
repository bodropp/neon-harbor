// Neon Harbor — the player: Rook, on foot and behind the wheel. Walking,
// stealing cars, punching, shooting, and getting in and out of vehicles.
import { clamp, dist, TAU } from './utils.js';
import { collideCircle, pointInBuilding } from './city.js';
import { makeCar, CAR_TYPES } from './vehicles.js';
import { addWanted } from './police.js';
import { nearestPed, scarePeds } from './pedestrians.js';

export function createPlayer(city, x, y) {
  return {
    x: x ?? 340, y: y ?? 340,
    angle: 0,
    health: 100,
    cash: 0,
    car: null,
    ammo: 12, mag: 12,
    punchT: 0, shootT: 0, reloadT: 0,
    sprint: false,
  };
}

/** On-foot movement + collisions. Returns nothing; mutates the player. */
export function updatePlayerOnFoot(G, dt) {
  const p = G.player;
  const input = G.input;
  const sprint = input.shift ? 1.55 : 1;
  const speed = 215 * sprint;
  let mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  if (mx !== 0 || my !== 0) {
    const len = Math.hypot(mx, my);
    mx /= len; my /= len;
    p.angle = Math.atan2(my, mx);
    const nx = p.x + mx * speed * dt;
    const ny = p.y + my * speed * dt;
    const fix = collideCircle(G.city, nx, ny, 12);
    p.x = fix.x; p.y = fix.y;
  }
  p.punchT -= dt;
  p.shootT -= dt;
  if (p.reloadT > 0) {
    p.reloadT -= dt;
    if (p.reloadT <= 0) { p.mag = 12; p.ammo = 12; }
  }
}

/** The nearest car the player could enter (parked, traffic, police, mission). */
export function nearestCar(G, radius = 64) {
  const p = G.player;
  let best = null, bestD = radius;
  const consider = (car) => {
    const d = dist(p.x, p.y, car.x, car.y);
    if (d < bestD) { best = car; bestD = d; }
  };
  for (const car of G.traffic) consider(car);
  for (const car of G.parked) consider(car);
  for (const car of G.police) if (car.kind === 'car') consider(car);
  if (G.missionVan) consider(G.missionVan);
  return best;
}

/** Enter the nearest car — stealing it if it is not already the player's. */
export function enterCar(G, car) {
  const p = G.player;
  if (!car) return false;
  const wasParked = G.parked.includes(car);
  const wasTraffic = G.traffic.includes(car);
  const wasPolice = car.police === true;
  const wasVan = car.missionVan === true;
  if (wasParked) G.parked.splice(G.parked.indexOf(car), 1);
  if (wasTraffic) G.traffic.splice(G.traffic.indexOf(car), 1);
  if (wasPolice) G.police.splice(G.police.indexOf(car), 1);
  if (wasVan) {
    G.missionVan = null;
    G.missionVanTaken = true;
    addWanted(G, 120, 'Van alarm tripped');
    G.hud.toast('Van alarm! The cops are coming.');
  } else if (wasTraffic || wasPolice) {
    addWanted(G, 80, 'Car stolen');
  } else if (wasParked) {
    addWanted(G, 60, 'Car stolen');
  }
  p.car = car;
  car.speed = 0;
  G.audio.click();
  return true;
}

/** Step out of the car onto the street beside it. */
export function exitCar(G) {
  const p = G.player;
  const car = p.car;
  if (!car) return;
  const side = { x: car.x - Math.sin(car.angle) * 30, y: car.y + Math.cos(car.angle) * 30 };
  const fix = collideCircle(G.city, side.x, side.y, 12);
  p.x = fix.x; p.y = fix.y;
  p.angle = car.angle;
  p.car = null;
  // The car stays where it is, parked, and can be re-entered for free.
  if (!G.parked.includes(car) && !G.traffic.includes(car)) G.parked.push(car);
  car.speed = 0;
}

/** Punch: hits the nearest enemy or pedestrian in front of the player. */
export function punch(G) {
  const p = G.player;
  if (p.punchT > 0 || p.car) return;
  p.punchT = 0.38;
  G.audio.punch();
  const px = p.x + Math.cos(p.angle) * 30;
  const py = p.y + Math.sin(p.angle) * 30;
  let hit = null;
  for (const e of G.enemies) {
    if (e.hp > 0 && dist(px, py, e.x, e.y) < 34) { hit = e; break; }
  }
  if (hit) {
    hit.hp -= 25;
    hit.flash = 0.15;
    G.player.cash += 5;
    addHitSparks(G, hit.x, hit.y);
    return;
  }
  const ped = nearestPed(G, px, py, 34);
  if (ped) {
    ped.state = 'down';
    ped.downT = 6;
    addWanted(G, 40, 'You attacked a pedestrian');
    scarePeds(G, px, py, 200);
    addHitSparks(G, ped.x, ped.y);
  }
}

export function addHitSparks(G, x, y) {
  for (let i = 0; i < 8; i += 1) {
    G.particles.push({
      x, y,
      vx: (G.rng() - 0.5) * 220, vy: (G.rng() - 0.5) * 220,
      life: 0.4, max: 0.4, color: '#ffe08a', size: 3,
    });
  }
}

/** Shoot toward a world point. Consumes ammo, spawns a bullet tracer. */
export function shoot(G, wx, wy) {
  const p = G.player;
  if (p.car || p.shootT > 0 || p.reloadT > 0) return;
  if (p.ammo <= 0) { G.audio.click(); return; }
  p.shootT = 0.26;
  p.ammo -= 1;
  p.angle = Math.atan2(wy - p.y, wx - p.x);
  const a = p.angle + (G.rng() - 0.5) * 0.03;
  G.bullets.push({
    x: p.x + Math.cos(a) * 18, y: p.y + Math.sin(a) * 18,
    vx: Math.cos(a) * 760, vy: Math.sin(a) * 760,
    life: 0.9, from: 'player', dmg: 34,
  });
  G.audio.shoot();
  G.shake = Math.min(6, G.shake + 1.5);
  scarePeds(G, p.x, p.y, 260);
}

/** Running a pedestrian over with the car: a crime, and a bounce. */
export function checkCarPedHits(G) {
  const car = G.player.car;
  if (!car || Math.abs(car.speed) < 60) return;
  for (const ped of G.peds) {
    if (ped.state === 'down') continue;
    if (dist(ped.x, ped.y, car.x, car.y) < 26) {
      ped.state = 'down';
      ped.downT = 8;
      ped.x += (ped.x - car.x) * 0.6;
      ped.y += (ped.y - car.y) * 0.6;
      addWanted(G, 80, 'Pedestrian hit');
      G.audio.crash();
      G.shake = Math.min(10, G.shake + 5);
      scarePeds(G, car.x, car.y, 260);
      car.speed *= 0.7;
    }
  }
}

export function drawPlayer(ctx, p, time) {
  if (p.car) return; // the car renderer draws the vehicle instead
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(2, 3, 8, 5, 0, 0, TAU); ctx.fill();
  ctx.rotate(p.angle);
  const swing = Math.sin(time * 11) * 2.5;
  // Rook: teal jacket, dark jeans.
  ctx.fillStyle = '#2e3a4a';
  ctx.fillRect(-5, -4, 10, 8);
  ctx.fillStyle = '#2a9a8a';
  ctx.beginPath(); ctx.arc(0, 0, 6.5, 0, TAU); ctx.fill();
  ctx.fillStyle = '#e8c9a0';
  ctx.beginPath(); ctx.arc(7, 0, 4.5, 0, TAU); ctx.fill();
  ctx.fillStyle = '#1a1a22';
  ctx.beginPath(); ctx.arc(7, 0, 5, 0, TAU); ctx.fill();
  ctx.fillStyle = '#e8c9a0';
  ctx.beginPath(); ctx.arc(8, 0, 3.5, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#2a9a8a';
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(-3, -5); ctx.lineTo(-3 + swing, -8); ctx.moveTo(-3, 5); ctx.lineTo(-3 - swing, 8); ctx.stroke();
  ctx.restore();
}
