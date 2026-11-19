// Neon Harbor — pedestrians: city folk who stroll the sidewalks, panic and flee
// when shots are fired or a car bears down on them, and can be shoved or hit.
import { clamp, rand, choice, dist, TAU } from './utils.js';
import { ROAD_W, nearestStreet, pointInBuilding, isWater } from './city.js';

const SHIRTS = ['#e85a5a', '#5aa8e8', '#7ac95a', '#e8c95a', '#b07ae8', '#e87ab0', '#5ad8c9', '#f0f0f0'];
const PANTS = ['#2e3a4a', '#4a3a2e', '#3a4a3a', '#5a5a6a'];

export function makePed(city, rng, x, y) {
  return {
    x: x ?? rand(rng, 100, 2400), y: y ?? rand(rng, 100, 1600),
    angle: rand(rng, 0, TAU),
    speed: rand(rng, 38, 68),
    state: 'walk', // walk | flee | down
    fleeT: 0,
    shirt: choice(rng, SHIRTS),
    pants: choice(rng, PANTS),
    // sidewalk strolling: which street line they follow and which way
    axis: rng() < 0.5 ? 'v' : 'h',
    line: 0, dir: rng() < 0.5 ? 1 : -1,
    pauseT: rand(rng, 0, 4),
    downT: 0,
  };
}

export function spawnPeds(G, n) {
  const rng = G.rng;
  for (let i = 0; i < n; i += 1) {
    const ped = makePed(G.city, rng);
    const axis = ped.axis;
    ped.line = nearestStreet(axis, G.city, axis === 'v' ? ped.x : ped.y);
    const side = rng() < 0.5 ? 1 : -1;
    const off = ROAD_W / 2 + 14;
    if (axis === 'v') { ped.x = ped.line + side * off; ped.angle = ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
    else { ped.y = ped.line + side * off; ped.angle = ped.dir > 0 ? 0 : Math.PI; }
    G.peds.push(ped);
  }
}

/** Scare every pedestrian within `radius` of (x, y): they run from it. */
export function scarePeds(G, x, y, radius) {
  for (const ped of G.peds) {
    if (ped.state === 'down') continue;
    const d = dist(ped.x, ped.y, x, y);
    if (d < radius) {
      ped.state = 'flee';
      ped.fleeT = 2.2;
      ped.angle = Math.atan2(ped.y - y, ped.x - x);
    }
  }
}

export function updatePeds(G, dt) {
  const city = G.city;
  for (const ped of G.peds) {
    if (ped.state === 'down') {
      ped.downT -= dt;
      if (ped.downT <= 0) { ped.state = 'walk'; ped.speed = 40; }
      continue;
    }
    if (ped.state === 'flee') {
      ped.fleeT -= dt;
      if (ped.fleeT <= 0) ped.state = 'walk';
    }
    const speed = ped.state === 'flee' ? 150 : ped.speed;
    if (ped.state === 'walk' && ped.pauseT > 0) {
      ped.pauseT -= dt;
      continue;
    }
    let nx = ped.x + Math.cos(ped.angle) * speed * dt;
    let ny = ped.y + Math.sin(ped.angle) * speed * dt;
    // Stay on sidewalks: if the next step leaves the road area or enters a
    // building or the bay, turn around or pick a new direction.
    const blocked = pointInBuilding(city, nx, ny) || isWater(nx, ny) || nx < 30 || ny < 30 || nx > 2530 || ny > 1660;
    if (blocked || ped.state === 'flee') {
      if (ped.state === 'flee') {
        // Fleeing peds just run; if blocked, slide along the obstacle.
        if (pointInBuilding(city, nx, ny)) { nx = ped.x; }
        if (isWater(nx, ny)) { ny = ped.y; }
      } else {
        // Strolling: at a blocked step, turn 90 degrees or reverse.
        ped.angle += (G.rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
        ped.pauseT = G.rng() * 1.2;
        continue;
      }
    }
    ped.x = nx; ped.y = ny;
    // A fast car bearing down scares them.
    const pc = G.player.car;
    if (pc && Math.abs(pc.speed) > 200) {
      const d = dist(ped.x, ped.y, pc.x, pc.y);
      if (d < 90) scarePeds(G, pc.x, pc.y, 90);
    }
  }
}

/** The nearest living pedestrian within `radius` of (x, y), or null. */
export function nearestPed(G, x, y, radius) {
  let best = null, bestD = radius;
  for (const ped of G.peds) {
    if (ped.state === 'down') continue;
    const d = dist(ped.x, ped.y, x, y);
    if (d < bestD) { best = ped; bestD = d; }
  }
  return best;
}

export function drawPed(ctx, ped, time) {
  ctx.save();
  ctx.translate(ped.x, ped.y);
  if (ped.state === 'down') {
    // Lying flat, knocked out.
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(2, 3, 12, 6, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = ped.shirt;
    ctx.beginPath(); ctx.ellipse(0, 0, 11, 5, ped.angle, 0, TAU); ctx.fill();
    ctx.fillStyle = '#e8c9a0';
    ctx.beginPath(); ctx.arc(Math.cos(ped.angle) * 12, Math.sin(ped.angle) * 12, 4, 0, TAU); ctx.fill();
    ctx.restore();
    return;
  }
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(2, 3, 7, 4, 0, 0, TAU); ctx.fill();
  ctx.rotate(ped.angle);
  // Little walking person: body, head, swinging arms.
  const swing = Math.sin(time * 10 + ped.x) * 2;
  ctx.fillStyle = ped.pants;
  ctx.fillRect(-4, -3, 8, 6);
  ctx.fillStyle = ped.shirt;
  ctx.beginPath(); ctx.arc(0, 0, 5.5, 0, TAU); ctx.fill();
  ctx.fillStyle = '#e8c9a0';
  ctx.beginPath(); ctx.arc(6, 0, 4, 0, TAU); ctx.fill();
  ctx.strokeStyle = ped.shirt;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-2, -4); ctx.lineTo(-2 + swing, -7); ctx.moveTo(-2, 4); ctx.lineTo(-2 - swing, 7); ctx.stroke();
  ctx.restore();
}
