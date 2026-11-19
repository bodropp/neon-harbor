// Neon Harbor — the wanted system: heat from crimes, stars, police spawns,
// chases, and getting busted. The Harbor PD responds to what the player does.
import { clamp, dist, rand, choice } from './utils.js';
import { makeCar, updatePoliceCar } from './vehicles.js';
import { nearestStreet, randomStreetPoint } from './city.js';

const STAR_THRESHOLDS = [0, 60, 180, 360, 600, 900];
export const MAX_STARS = 5;

export function createWanted() {
  return { level: 0, heat: 0, lastCrimeT: -99, coolT: 0 };
}

export function wantedLevelFor(heat) {
  let level = 0;
  for (let i = 1; i <= MAX_STARS; i += 1) if (heat >= STAR_THRESHOLDS[i]) level = i;
  return level;
}

/** Add heat for a crime. Shows a toast the first time the level rises. */
export function addWanted(G, points, label) {
  const w = G.wanted;
  const before = w.level;
  w.heat = clamp(w.heat + points, 0, 1000);
  w.lastCrimeT = G.time;
  w.level = wantedLevelFor(w.heat);
  if (w.level > before) {
    G.hud.toast(`${label} — WANTED LEVEL ${w.level} ★`);
    if (w.level >= 2) G.audio.setSiren(true);
  }
}

function spawnPointNear(G, minD, maxD) {
  // A point on a street 500-750 px from the player, so cops arrive visibly.
  for (let tries = 0; tries < 12; tries += 1) {
    const p = randomStreetPoint(G.rng, G.city);
    const d = dist(p.x, p.y, G.player.x, G.player.y);
    if (d >= minD && d <= maxD) return p;
  }
  const p = randomStreetPoint(G.rng, G.city);
  return p;
}

export function updateWanted(G, dt) {
  const w = G.wanted;
  // Heat cools down when the player has been clean for a while and no cop is
  // close enough to keep eyes on them.
  const anyCopNear = G.police.some((c) => dist(c.x, c.y, G.player.x, G.player.y) < 420);
  if (G.time - w.lastCrimeT > 9 && !anyCopNear) {
    w.heat = Math.max(0, w.heat - 9 * dt);
    const nl = wantedLevelFor(w.heat);
    if (nl < w.level) {
      w.level = nl;
      if (nl === 0) {
        G.hud.toast('You lost the cops.');
        G.audio.setSiren(false);
      } else {
        G.hud.toast(`Wanted level down — ${nl} ★`);
      }
    }
  }
  if (w.level === 0) G.audio.setSiren(false);

  // Spawn police to match the wanted level.
  const wantCars = Math.min(w.level, 4);
  const wantFoot = G.player.car ? 0 : Math.min(w.level, 3);
  const cars = G.police.filter((c) => c.kind === 'car').length;
  const foot = G.police.filter((c) => c.kind === 'foot').length;
  if (cars < wantCars && G.time - (G.lastCopSpawn || 0) > 1.2) {
    G.lastCopSpawn = G.time;
    const p = spawnPointNear(G, 480, 760);
    const car = makeCar(G.city, G.rng, { x: p.x, y: p.y, type: 'police', axis: p.axis, line: p.line, dir: 1 });
    car.kind = 'car';
    car.bustT = 0;
    G.police.push(car);
  }
  if (foot < wantFoot && G.time - (G.lastFootSpawn || 0) > 1.6) {
    G.lastFootSpawn = G.time;
    const p = spawnPointNear(G, 300, 560);
    G.police.push({ kind: 'foot', x: p.x, y: p.y, angle: 0, speed: 155, bustT: 0 });
  }
  // Despawn cops that fell far behind once the heat is gone.
  if (w.level === 0) {
    G.police = G.police.filter((c) => dist(c.x, c.y, G.player.x, G.player.y) < 900);
  }
}

export function updatePolice(G, dt) {
  const player = G.player;
  for (const cop of G.police) {
    if (cop.kind === 'car') {
      updatePoliceCar(G, cop, dt);
      // Busted in a car: pinned down slow next to a cop car for 2 seconds.
      if (player.car && Math.abs(player.car.speed) < 25 && dist(cop.x, cop.y, player.car.x, player.car.y) < 64) {
        cop.bustT += dt;
        if (cop.bustT > 2) { G.events.push({ type: 'busted' }); return; }
      } else {
        cop.bustT = 0;
      }
    } else {
      // Foot cop chases the player on foot.
      const d = dist(cop.x, cop.y, player.x, player.y);
      const want = Math.atan2(player.y - cop.y, player.x - cop.x);
      cop.angle = want;
      cop.x += Math.cos(want) * cop.speed * dt;
      cop.y += Math.sin(want) * cop.speed * dt;
      if (!player.car && d < 30) {
        cop.bustT += dt;
        if (cop.bustT > 1.2) { G.events.push({ type: 'busted' }); return; }
      } else {
        cop.bustT = 0;
      }
    }
  }
  // Remove police that are absurdly far away while the player is wanted, so
  // the chase never stalls on a stuck unit.
  G.police = G.police.filter((c) => dist(c.x, c.y, player.x, player.y) < 1600);
}

/** Draw police: cars use the car renderer; foot cops are drawn here. */
export function drawFootCop(ctx, cop, time) {
  ctx.save();
  ctx.translate(cop.x, cop.y);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(2, 3, 7, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.rotate(cop.angle);
  const swing = Math.sin(time * 12) * 2.5;
  ctx.fillStyle = '#20242e';
  ctx.fillRect(-4, -3, 8, 6);
  ctx.fillStyle = '#2e4a7a';
  ctx.beginPath(); ctx.arc(0, 0, 5.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e8c9a0';
  ctx.beginPath(); ctx.arc(6, 0, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#20242e';
  ctx.beginPath(); ctx.arc(6, 0, 4.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2e7bff';
  ctx.fillRect(4, -5, 3, 10);
  ctx.strokeStyle = '#2e4a7a';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-2, -4); ctx.lineTo(-2 + swing, -7); ctx.moveTo(-2, 4); ctx.lineTo(-2 - swing, 7); ctx.stroke();
  ctx.restore();
}
