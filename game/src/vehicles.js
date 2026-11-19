// Neon Harbor — cars: arcade driving physics, traffic that follows the street
// grid, and police cars that chase the player. All cars are drawn top-down
// with canvas paths; no image assets.
import { clamp, rand, choice, angleDiff, angleLerp, dist, TAU } from './utils.js';
import { ROAD_W, collideCircle, nearestStreet, isWater } from './city.js';

export const CAR_TYPES = {
  sedan: { len: 46, wid: 22, max: 380, accel: 330, color: '#4a7ac9' },
  taxi: { len: 46, wid: 22, max: 360, accel: 330, color: '#e8b93c' },
  sport: { len: 48, wid: 22, max: 540, accel: 470, color: '#d93c4a' },
  truck: { len: 58, wid: 24, max: 300, accel: 240, color: '#7a8a9a' },
  van: { len: 54, wid: 24, max: 330, accel: 260, color: '#5a6a7a' },
  police: { len: 48, wid: 22, max: 470, accel: 420, color: '#20242e' },
};

const TRAFFIC_COLORS = ['#4a7ac9', '#c9a04a', '#6a9a5a', '#9a5a8a', '#c96a4a', '#5a8a9a', '#b8b8c0'];

export function makeCar(city, rng, opts = {}) {
  const type = opts.type || choice(rng, ['sedan', 'sedan', 'taxi', 'truck', 'sport']);
  const spec = CAR_TYPES[type];
  return {
    x: opts.x ?? 0, y: opts.y ?? 0,
    angle: opts.angle ?? 0,
    speed: 0,
    type,
    len: spec.len, wid: spec.wid,
    max: spec.max, accel: spec.accel,
    color: opts.color || spec.color,
    police: type === 'police',
    // traffic AI state
    axis: opts.axis || 'v', line: opts.line || 0, dir: opts.dir || 1,
    targetSpeed: opts.targetSpeed ?? rand(rng, 120, 180),
    stuckT: 0,
    siren: 0,
    skid: [],
  };
}

/** Arcade driving for the player's car. `input` has up/down/left/right. */
export function drivePlayerCar(G, car, input, dt) {
  const forward = input.up ? 1 : input.down ? -1 : 0;
  const steer = input.left ? -1 : input.right ? 1 : 0;
  if (forward > 0) car.speed += car.accel * dt;
  else if (forward < 0) {
    if (car.speed > 30) car.speed -= 620 * dt; // brake
    else car.speed -= 200 * dt; // reverse
  } else {
    car.speed -= car.speed * 0.9 * dt; // coast
  }
  car.speed = clamp(car.speed, -170, car.max);
  const spd = Math.abs(car.speed);
  if (spd > 12) {
    const turn = steer * (2.4 * clamp(spd / 240, 0.35, 1)) * (car.speed < 0 ? -1 : 1);
    car.angle += turn * dt;
    if (Math.abs(steer) > 0 && spd > 300) {
      car.skid.push({ x: car.x, y: car.y, a: car.angle, t: 1.6 });
      if (car.skid.length > 40) car.skid.shift();
    }
  }
  for (const s of car.skid) s.t -= dt;
  car.skid = car.skid.filter((s) => s.t > 0);
  moveCarWithCollisions(G, car, dt);
}

/**
 * Move a car by its heading and speed, resolving buildings and the bay.
 * The move is split into its X and Y parts so a car slides along a wall
 * instead of pinning itself against it.
 */
export function moveCarWithCollisions(G, car, dt) {
  const r = car.len / 2 - 4;
  const dx = Math.cos(car.angle) * car.speed * dt;
  const dy = Math.sin(car.angle) * car.speed * dt;
  let hit = false;
  let fix = collideCircle(G.city, car.x + dx, car.y, r);
  if (fix.hit) hit = true;
  car.x = fix.x; car.y = fix.y;
  fix = collideCircle(G.city, car.x, car.y + dy, r);
  if (fix.hit) hit = true;
  car.x = fix.x; car.y = fix.y;
  if (hit && Math.abs(car.speed) > 180) {
    G.audio.crash();
    G.shake = Math.min(10, G.shake + 4);
    car.speed *= 0.45;
    addCrashSparks(G, car.x, car.y);
  } else if (hit) {
    car.speed *= 0.6;
  }
}

export function addCrashSparks(G, x, y) {
  for (let i = 0; i < 10; i += 1) {
    G.particles.push({
      x, y,
      vx: (G.rng() - 0.5) * 260, vy: (G.rng() - 0.5) * 260,
      life: 0.5, max: 0.5, color: '#ffb03c', size: 3,
    });
  }
}

/** Spawn `n` traffic cars on random streets. */
export function spawnTraffic(G, n) {
  const rng = G.rng;
  for (let i = 0; i < n; i += 1) {
    const axis = rng() < 0.5 ? 'v' : 'h';
    const line = nearestStreet(axis, G.city, axis === 'v' ? rand(rng, 100, 2460) : rand(rng, 100, 1560));
    const dir = rng() < 0.5 ? 1 : -1;
    const pos = axis === 'v' ? rand(rng, 100, 1600) : rand(rng, 100, 2460);
    const lane = dir > 0 ? 18 : -18;
    const car = makeCar(G.city, rng, {
      x: axis === 'v' ? line + lane : pos,
      y: axis === 'v' ? pos : line + lane,
      angle: axis === 'v' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI),
      axis, line, dir,
      color: choice(rng, TRAFFIC_COLORS),
    });
    car.speed = car.targetSpeed;
    G.traffic.push(car);
  }
}

/** Traffic follows its street; at an intersection it may turn. */
export function updateTraffic(G, dt) {
  const city = G.city;
  for (const car of G.traffic) {
    // Slow down for the car ahead on the same street.
    let ahead = null;
    for (const other of G.traffic) {
      if (other === car || other.axis !== car.axis || other.line !== car.line || other.dir !== car.dir) continue;
      const along = car.axis === 'v' ? (other.y - car.y) * car.dir : (other.x - car.x) * car.dir;
      if (along > 0 && along < 90 && (ahead === null || along < ahead)) ahead = along;
    }
    const playerCar = G.player.car;
    if (playerCar) {
      const along = car.axis === 'v'
        ? (playerCar.y - car.y) * car.dir
        : (playerCar.x - car.x) * car.dir;
      const side = car.axis === 'v' ? Math.abs(playerCar.x - car.x) : Math.abs(playerCar.y - car.y);
      if (along > 0 && along < 80 && side < 30) ahead = ahead === null ? along : Math.min(ahead, along);
    }
    const want = ahead !== null ? Math.min(car.targetSpeed, ahead * 1.4) : car.targetSpeed;
    car.speed += clamp(want - car.speed, -300 * dt, 200 * dt);

    // Move along the street.
    if (car.axis === 'v') car.y += car.dir * car.speed * dt;
    else car.x += car.dir * car.speed * dt;

    // At an intersection, maybe turn onto the crossing street.
    const cross = car.axis === 'v' ? city.hStreets : city.vStreets;
    const alongPos = car.axis === 'v' ? car.y : car.x;
    for (const c of cross) {
      if (Math.abs(alongPos - c) < 14 && G.rng() < 0.012) {
        const ndir = G.rng() < 0.5 ? 1 : -1;
        const lane = ndir > 0 ? 18 : -18;
        if (car.axis === 'v') {
          car.axis = 'h'; car.line = c; car.y = c + lane; car.x = alongPos;
          car.angle = ndir > 0 ? 0 : Math.PI; car.dir = ndir;
        } else {
          car.axis = 'v'; car.line = c; car.x = c + lane; car.y = alongPos;
          car.angle = ndir > 0 ? Math.PI / 2 : -Math.PI / 2; car.dir = ndir;
        }
        break;
      }
    }

    // Wrap around the world edge: respawn on the opposite side.
    if (car.axis === 'v' && (car.y < 40 || car.y > 1640)) {
      car.y = car.dir > 0 ? 60 : 1620;
      car.x = nearestStreet('v', city, rand(G.rng, 100, 2460)) + (car.dir > 0 ? 18 : -18);
      car.line = nearestStreet('v', city, car.x);
    }
    if (car.axis === 'h' && (car.x < 40 || car.x > 2500)) {
      car.x = car.dir > 0 ? 60 : 2480;
      car.y = nearestStreet('h', city, rand(G.rng, 100, 1560)) + (car.dir > 0 ? 18 : -18);
      car.line = nearestStreet('h', city, car.y);
    }
  }

  // Simple car-vs-car push so traffic does not stack.
  for (let i = 0; i < G.traffic.length; i += 1) {
    for (let j = i + 1; j < G.traffic.length; j += 1) {
      const a = G.traffic[i], b = G.traffic[j];
      const d = dist(a.x, a.y, b.x, b.y);
      if (d < 44 && d > 0.01) {
        const push = (44 - d) / 2;
        const nx = (b.x - a.x) / d, ny = (b.y - a.y) / d;
        a.x -= nx * push; a.y -= ny * push;
        b.x += nx * push; b.y += ny * push;
        a.speed *= 0.9; b.speed *= 0.9;
      }
    }
  }
}

/** A police car steers toward the player and tries to ram them. */
export function updatePoliceCar(G, cop, dt) {
  const target = G.player.car || G.player;
  const wantAngle = Math.atan2(target.y - cop.y, target.x - cop.x);
  cop.angle = angleLerp(cop.angle, wantAngle, clamp(2.2 * dt, 0, 1));
  const d = dist(cop.x, cop.y, target.x, target.y);
  const wantSpeed = d > 260 ? cop.max : d > 90 ? cop.max * 0.75 : 200;
  cop.speed += clamp(wantSpeed - cop.speed, -500 * dt, 380 * dt);
  moveCarWithCollisions(G, cop, dt);
  cop.siren += dt;
  // Ram the player's car: shove it and slow it.
  if (G.player.car) {
    const pc = G.player.car;
    const dd = dist(cop.x, cop.y, pc.x, pc.y);
    if (dd < 52 && dd > 0.01) {
      const nx = (pc.x - cop.x) / dd, ny = (pc.y - cop.y) / dd;
      pc.x += nx * 60 * dt; pc.y += ny * 60 * dt;
      pc.speed *= (1 - 0.5 * dt);
      if (Math.abs(pc.speed) > 120 && G.time - (cop.lastRam || 0) > 1) {
        cop.lastRam = G.time;
        G.audio.crash();
        G.shake = Math.min(12, G.shake + 5);
        addCrashSparks(G, pc.x, pc.y);
      }
    }
  }
}

/** Draw a car top-down: shadow, body, cabin, wheels, lights, police livery. */
export function drawCar(ctx, car, time) {
  ctx.save();
  ctx.translate(car.x, car.y);
  // Shadow falls in a fixed sun direction, so it stays axis-aligned.
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  roundRect(ctx, -car.len / 2 + 5, -car.wid / 2 + 6, car.len, car.wid, 8);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.translate(car.x, car.y);
  for (const s of car.skid || []) {
    ctx.save();
    ctx.translate(s.x - car.x, s.y - car.y);
    ctx.rotate(s.a);
    ctx.fillStyle = `rgba(20,20,20,${0.35 * s.t})`;
    ctx.fillRect(-car.len / 2, -car.wid / 2 - 2, 10, 4);
    ctx.fillRect(-car.len / 2, car.wid / 2 - 2, 10, 4);
    ctx.restore();
  }
  ctx.rotate(car.angle);
  // Wheels.
  ctx.fillStyle = '#14141a';
  const wl = car.len / 2 - 8, ww = car.wid / 2 + 1;
  ctx.fillRect(-wl, -ww, 12, 5);
  ctx.fillRect(wl - 4, -ww, 12, 5);
  ctx.fillRect(-wl, ww - 5, 12, 5);
  ctx.fillRect(wl - 4, ww - 5, 12, 5);
  // Body.
  ctx.fillStyle = car.color;
  roundRect(ctx, -car.len / 2, -car.wid / 2, car.len, car.wid, 8);
  ctx.fill();
  // Cabin + windshield.
  ctx.fillStyle = 'rgba(20,30,44,0.9)';
  roundRect(ctx, -car.len / 2 + 12, -car.wid / 2 + 4, car.len / 2 - 8, car.wid - 8, 5);
  ctx.fill();
  ctx.fillStyle = 'rgba(160,220,255,0.55)';
  ctx.fillRect(car.len / 2 - 12, -car.wid / 2 + 5, 4, car.wid - 10);
  // Headlights.
  ctx.fillStyle = '#fff8c8';
  ctx.fillRect(car.len / 2 - 2, -car.wid / 2 + 3, 3, 5);
  ctx.fillRect(car.len / 2 - 2, car.wid / 2 - 8, 3, 5);
  // Police livery + flashing light bar.
  if (car.police) {
    ctx.fillStyle = '#f2f2f2';
    ctx.fillRect(-car.len / 2 + 2, -car.wid / 2 + 2, car.len - 4, 5);
    ctx.fillStyle = '#20242e';
    ctx.font = 'bold 9px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('H.P.D.', 0, 2);
    const phase = Math.floor(time * 4) % 2 === 0;
    ctx.fillStyle = phase ? '#ff2e2e' : '#2e7bff';
    ctx.beginPath(); ctx.arc(-4, -car.wid / 2 - 1, 4, 0, TAU); ctx.fill();
    ctx.fillStyle = phase ? '#2e7bff' : '#ff2e2e';
    ctx.beginPath(); ctx.arc(6, -car.wid / 2 - 1, 4, 0, TAU); ctx.fill();
  }
  if (car.type === 'taxi') {
    ctx.fillStyle = '#20242e';
    ctx.font = 'bold 8px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('TAXI', 0, 2);
  }
  ctx.restore();
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
