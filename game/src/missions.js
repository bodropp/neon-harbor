// Neon Harbor — the story: five jobs for fixer Mara Voss, taking the harbor
// back from the Coral Kings. Each mission is a small state machine with a
// marker, an objective line, and a completion check.
import { dist, rand, choice } from './utils.js';
import { addWanted } from './police.js';
import { makeCar } from './vehicles.js';

export const MISSION_DEFS = [
  {
    id: 'wheels', title: 'JOB 1 — WHEELS', reward: 300,
    brief: 'Mara needs a driver. Steal any car and bring it to the Harbor Gate.',
  },
  {
    id: 'package', title: 'JOB 2 — THE PACKAGE', reward: 500,
    brief: 'Pick up the package at the docks, then deliver it to Club Neon. Quietly.',
  },
  {
    id: 'debt', title: 'JOB 3 — COLLECT THE DEBT', reward: 700,
    brief: 'Three Coral Kings enforcers are shaking down the pier. Teach them a lesson.',
  },
  {
    id: 'cargo', title: 'JOB 4 — HOT CARGO', reward: 1200,
    brief: 'Steal the armored van at the warehouse, lose the cops, park it at the garage.',
  },
  {
    id: 'king', title: 'JOB 5 — KING OF THE HARBOR', reward: 2500,
    brief: 'The Coral Kings boss is on his yacht. Take his guards down, grab the ledger, get out.',
  },
];

export function startMission(G, index) {
  G.mission = { index, stage: 0, data: {}, done: false };
  const def = MISSION_DEFS[index];
  G.hud.toast(`${def.title} — $${def.reward}`);
  G.hud.setObjective(def.title, def.brief, '');
  if (def.id === 'cargo') {
    // Park the armored van at the warehouse for the player to steal.
    const s = G.city.spots.warehouse;
    const van = makeCar(G.city, G.rng, { x: s.x + 40, y: s.y + 30, angle: 0, type: 'van', color: '#5a6a7a' });
    van.missionVan = true;
    G.missionVan = van;
    G.parked.push(van);
  }
  if (def.id === 'debt' || def.id === 'king') {
    G.mission.data.armed = false;
  }
}

export function missionObjective(G) {
  const m = G.mission;
  if (!m || m.index >= MISSION_DEFS.length) {
    return { title: 'NEON HARBOR', obj: 'You own the harbor. Free roam — cause trouble, lose the cops, stack cash.', sub: 'All five jobs complete. King of the Harbor.' };
  }
  const def = MISSION_DEFS[m.index];
  switch (def.id) {
    case 'wheels':
      return m.stage === 0
        ? { title: def.title, obj: 'Steal any car (walk up to one, press E)', sub: def.brief }
        : { title: def.title, obj: 'Drive to the Harbor Gate marker', sub: 'Follow the yellow beacon on the map.' };
    case 'package':
      return m.stage === 0
        ? { title: def.title, obj: 'Pick up the package at the Harbor Docks', sub: 'Walk into the yellow marker.' }
        : { title: def.title, obj: 'Deliver the package to Club Neon', sub: 'Somebody tipped off the cops. Drive fast.' };
    case 'debt':
      return m.stage === 0
        ? { title: def.title, obj: 'Go to the pier — the enforcers are waiting', sub: 'Punch (F) or shoot (click) to take them down.' }
        : { title: def.title, obj: `Take down the enforcers (${3 - G.enemies.length} of 3 left)`, sub: 'Watch your health — they hit back.' };
    case 'cargo':
      if (m.stage === 0) return { title: def.title, obj: 'Steal the armored van at the Old Warehouse', sub: 'The alarm will bring the cops.' };
      if (m.stage === 1) return { title: def.title, obj: 'Lose the cops — get your wanted level to zero', sub: 'Hide, or outrun them until the heat dies down.' };
      return { title: def.title, obj: "Deliver the van to Mara's Garage", sub: 'Park inside the yellow marker.' };
    case 'king':
      if (m.stage === 0) return { title: def.title, obj: 'Board the yacht at the end of the pier', sub: 'Five guards. Bring ammo.' };
      if (m.stage === 1) return { title: def.title, obj: `Take down the guards (${5 - G.enemies.filter((e) => e.hp > 0).length} of 5 down)`, sub: 'They shoot back. Use cover.' };
      if (m.stage === 2) return { title: def.title, obj: 'Grab the ledger from the yacht', sub: 'Walk onto the deck marker.' };
      return { title: def.title, obj: 'Escape to the Safehouse', sub: 'The harbor is yours if you make it.' };
    default:
      return { title: def.title, obj: def.brief, sub: '' };
  }
}

export function missionMarker(G) {
  const m = G.mission;
  if (!m || m.index >= MISSION_DEFS.length) return null;
  const s = G.city.spots;
  const def = MISSION_DEFS[m.index];
  switch (def.id) {
    case 'wheels': return m.stage === 0 ? null : { x: s.harborGate.x, y: s.harborGate.y };
    case 'package': return m.stage === 0 ? { x: s.docks.x, y: s.docks.y } : { x: s.club.x, y: s.club.y };
    case 'debt': return { x: s.pierEnd.x, y: 1740 };
    case 'cargo':
      if (m.stage === 0) return { x: s.warehouse.x, y: s.warehouse.y };
      if (m.stage === 1) return null;
      return { x: s.garage.x, y: s.garage.y };
    case 'king':
      if (m.stage === 0 || m.stage === 1) return { x: s.pierEnd.x, y: s.pierEnd.y };
      if (m.stage === 2) return { x: 1200, y: 1830 };
      return { x: s.safehouse.x, y: s.safehouse.y };
    default: return null;
  }
}

function playerPos(G) {
  return G.player.car ? { x: G.player.car.x, y: G.player.car.y } : { x: G.player.x, y: G.player.y };
}

export function updateMission(G, dt) {
  const m = G.mission;
  if (!m || m.index >= MISSION_DEFS.length) return;
  const def = MISSION_DEFS[m.index];
  const pos = playerPos(G);
  const at = (x, y, r = 70) => dist(pos.x, pos.y, x, y) < r;

  switch (def.id) {
    case 'wheels':
      if (m.stage === 0 && G.player.car) { m.stage = 1; G.hud.toast('Nice wheels. Now drive to the Harbor Gate.'); }
      else if (m.stage === 1 && at(G.city.spots.harborGate.x, G.city.spots.harborGate.y, 80)) completeMission(G);
      break;
    case 'package': {
      if (m.stage === 0 && at(G.city.spots.docks.x, G.city.spots.docks.y, 60)) {
        m.stage = 1;
        G.hud.toast('Package picked up. Move!');
        addWanted(G, 60, 'Setup — the cops were tipped off');
        G.audio.pickup();
      } else if (m.stage === 1 && at(G.city.spots.club.x, G.city.spots.club.y, 70)) completeMission(G);
      break;
    }
    case 'debt': {
      const s = G.city.spots;
      if (m.stage === 0 && dist(pos.x, pos.y, s.pierEnd.x, 1740) < 320 && !m.data.armed) {
        m.data.armed = true;
        m.stage = 1;
        spawnThugs(G, [
          { x: s.pierEnd.x - 60, y: 1720 }, { x: s.pierEnd.x + 40, y: 1760 }, { x: s.pierEnd.x + 90, y: 1700 },
        ], 'thug');
        G.hud.toast('The enforcers are here. Handle it.');
      } else if (m.stage === 1 && G.enemies.length === 0) completeMission(G);
      break;
    }
    case 'cargo':
      if (m.stage === 0 && G.missionVanTaken) { m.stage = 1; }
      else if (m.stage === 1 && G.wanted.level === 0) {
        m.stage = 2;
        G.hud.toast('Clean. Now deliver the van to the garage.');
      } else if (m.stage === 2 && G.player.car && G.player.car.missionVan && at(G.city.spots.garage.x, G.city.spots.garage.y, 80)) {
        completeMission(G);
      }
      break;
    case 'king': {
      const s = G.city.spots;
      if (m.stage === 0 && dist(pos.x, pos.y, s.pierEnd.x, s.pierEnd.y) < 300 && !m.data.armed) {
        m.data.armed = true;
        m.stage = 1;
        spawnThugs(G, [
          { x: 1160, y: 1800 }, { x: 1240, y: 1820 }, { x: 1200, y: 1860 },
          { x: 1140, y: 1860 }, { x: 1260, y: 1780 },
        ], 'guard');
        G.hud.toast('Guards on the yacht. Take them all down.');
      } else if (m.stage === 1 && G.enemies.length === 0) {
        m.stage = 2;
        G.hud.toast('The deck is clear. Grab the ledger.');
      } else if (m.stage === 2 && at(1200, 1830, 60)) {
        m.stage = 3;
        G.audio.pickup();
        G.hud.toast('Ledger secured. Run to the Safehouse!');
      } else if (m.stage === 3 && at(s.safehouse.x, s.safehouse.y, 80)) completeMission(G);
      break;
    }
    default: break;
  }
}

export function completeMission(G) {
  const m = G.mission;
  const def = MISSION_DEFS[m.index];
  G.player.cash += def.reward;
  G.audio.mission();
  G.hud.toast(`JOB COMPLETE — +$${def.reward}`);
  G.missionVan = null;
  G.missionVanTaken = false;
  m.index += 1;
  if (m.index >= MISSION_DEFS.length) {
    G.mission = { index: m.index, stage: 0, data: {}, done: true };
    G.hud.setObjective('KING OF THE HARBOR', 'You own the harbor. Free roam — cause trouble, lose the cops, stack cash.', 'All five jobs complete.');
    G.hud.toast('KING OF THE HARBOR — the city is yours.');
    G.save();
    return;
  }
  startMission(G, m.index);
  G.save();
}

// ---- Enemies ----

export function spawnThugs(G, positions, kind) {
  for (const p of positions) {
    G.enemies.push({
      x: p.x, y: p.y, angle: 0,
      hp: kind === 'guard' ? 75 : 50,
      kind,
      speed: kind === 'guard' ? 120 : 150,
      punchT: 0, shootT: rand(G.rng, 0.5, 1.5),
      flash: 0,
    });
  }
}

export function updateEnemies(G, dt) {
  const player = G.player;
  for (const e of G.enemies) {
    if (e.hp <= 0) continue;
    if (e.flash > 0) e.flash -= dt;
    const d = dist(e.x, e.y, player.x, player.y);
    const want = Math.atan2(player.y - e.y, player.x - e.x);
    e.angle = want;
    if (e.kind === 'thug') {
      if (d > 36) {
        e.x += Math.cos(want) * e.speed * dt;
        e.y += Math.sin(want) * e.speed * dt;
      } else {
        e.punchT -= dt;
        if (e.punchT <= 0) {
          e.punchT = 0.9;
          damagePlayer(G, 8, 'A thug landed a hit');
          G.audio.punch();
        }
      }
    } else {
      // Guards keep some distance and shoot.
      if (d > 320) {
        e.x += Math.cos(want) * e.speed * dt;
        e.y += Math.sin(want) * e.speed * dt;
      } else if (d < 160) {
        e.x -= Math.cos(want) * e.speed * 0.6 * dt;
        e.y -= Math.sin(want) * e.speed * 0.6 * dt;
      }
      e.shootT -= dt;
      if (e.shootT <= 0 && d < 430) {
        e.shootT = 1.5;
        const a = want + (G.rng() - 0.5) * 0.14;
        G.bullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 520, vy: Math.sin(a) * 520, life: 1.2, from: 'enemy', dmg: 10 });
        G.audio.shoot();
      }
    }
  }
  G.enemies = G.enemies.filter((e) => e.hp > 0);
}

export function damagePlayer(G, dmg, note) {
  if (G.screen !== 'play') return;
  G.player.health -= dmg;
  G.shake = Math.min(10, G.shake + 3);
  if (G.player.health <= 0) {
    G.player.health = 0;
    G.events.push({ type: 'wasted', note });
  }
}

export function drawEnemy(ctx, e, time) {
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(2, 3, 8, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.rotate(e.angle);
  const swing = Math.sin(time * 11 + e.x) * 2.5;
  ctx.fillStyle = '#1a1a22';
  ctx.fillRect(-5, -4, 10, 8);
  ctx.fillStyle = e.kind === 'guard' ? '#3a3a4a' : '#8a2e3a';
  ctx.beginPath(); ctx.arc(0, 0, 6.5, 0, Math.PI * 2); ctx.fill();
  if (e.kind === 'guard') {
    ctx.fillStyle = '#c9c9d8';
    ctx.beginPath(); ctx.arc(7, 0, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1a1a22';
    ctx.fillRect(6, -2, 12, 3);
  } else {
    ctx.fillStyle = '#e8c9a0';
    ctx.beginPath(); ctx.arc(7, 0, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d93c4a';
    ctx.fillRect(3, -5, 4, 10);
  }
  ctx.strokeStyle = e.kind === 'guard' ? '#3a3a4a' : '#8a2e3a';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-3, -5); ctx.lineTo(-3 + swing, -8); ctx.moveTo(-3, 5); ctx.lineTo(-3 - swing, 8); ctx.stroke();
  // Health bar.
  const max = e.kind === 'guard' ? 75 : 50;
  ctx.rotate(-e.angle);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(-12, -16, 24, 4);
  ctx.fillStyle = e.flash > 0 ? '#fff' : '#ff4a3c';
  ctx.fillRect(-12, -16, 24 * Math.max(0, e.hp / max), 4);
  ctx.restore();
}
