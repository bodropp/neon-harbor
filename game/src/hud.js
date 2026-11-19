// Neon Harbor — the HUD: DOM readouts (health, cash, wanted stars, mission
// panel, speedometer, toasts) and the minimap canvas.
import { clamp, dist } from './utils.js';
import { WORLD_W, WORLD_H } from './city.js';
import { missionMarker } from './missions.js';

export function initHUD(G) {
  G.hud = {
    el: {},
    toastTimer: null,
    toast(msg) {
      const t = document.getElementById('toast');
      t.textContent = msg;
      t.style.opacity = '1';
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => { t.style.opacity = '0'; }, 3400);
    },
    setObjective(title, obj, sub) {
      document.getElementById('mission-title').textContent = title;
      document.getElementById('mission-obj').textContent = obj;
      document.getElementById('mission-sub').textContent = sub || '';
    },
  };
  const ids = ['healthfill', 'healthtext', 'cash', 'ammo', 'ammotext', 'stars', 'clock', 'speedo', 'speed', 'minimap', 'crosshair', 'wasted'];
  for (const id of ids) G.hud.el[id] = document.getElementById(id);
  G.hud.minimapCtx = G.hud.el.minimap.getContext('2d');
}

export function updateHUD(G) {
  const p = G.player;
  const hud = G.hud;
  hud.el.healthfill.style.width = `${clamp(p.health, 0, 100)}%`;
  hud.el.healthtext.textContent = `${Math.ceil(p.health)}`;
  hud.el.cash.textContent = p.cash.toLocaleString('en-US');
  const stars = G.wanted.level;
  let html = '';
  for (let i = 0; i < 5; i += 1) html += `<span class="${i < stars ? 'lit' : 'dim'}">★</span>`;
  hud.el.stars.innerHTML = html;
  const hour = Math.floor(G.clockHour);
  const min = Math.floor((G.clockHour - hour) * 60);
  hud.el.clock.textContent = `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  if (p.car) {
    hud.el.speedo.classList.remove('hidden');
    hud.el.speed.textContent = `${Math.round(Math.abs(p.car.speed) * 0.24)}`;
    hud.el.ammo.classList.add('hidden');
  } else {
    hud.el.speedo.classList.add('hidden');
    hud.el.ammo.classList.remove('hidden');
    hud.el.ammotext.textContent = p.reloadT > 0 ? 'RELOADING…' : `${p.ammo} / 12`;
  }
  drawMinimap(G);
}

/** Minimap: the whole city shrunk, with the player, cops and mission marker. */
export function drawMinimap(G) {
  const ctx = G.hud.minimapCtx;
  if (!ctx) return;
  const W = 216, H = 162;
  const sx = W / WORLD_W, sy = H / WORLD_H;
  const city = G.city;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#232833';
  ctx.fillRect(0, 0, W, H);
  // Water.
  ctx.fillStyle = '#2e6a9a';
  ctx.fillRect(0, city.waterY * sy, W, H - city.waterY * sy);
  // Parks.
  ctx.fillStyle = '#3a6a3a';
  for (const park of city.parks) ctx.fillRect(park.x * sx, park.y * sy, park.w * sx, park.h * sy);
  // Roads.
  ctx.strokeStyle = '#4a4a55';
  ctx.lineWidth = 4;
  for (const cx of city.vStreets) {
    ctx.beginPath(); ctx.moveTo(cx * sx, 0); ctx.lineTo(cx * sx, city.waterY * sy); ctx.stroke();
  }
  for (const cy of city.hStreets) {
    ctx.beginPath(); ctx.moveTo(0, cy * sy); ctx.lineTo(W, cy * sy); ctx.stroke();
  }
  // Buildings.
  ctx.fillStyle = '#6a6a78';
  for (const b of city.buildings) ctx.fillRect(b.x * sx, b.y * sy, Math.max(1, b.w * sx), Math.max(1, b.h * sy));
  // Mission marker.
  const marker = missionMarker(G);
  if (marker) {
    const pulse = 3 + Math.sin(G.time * 5) * 1.5;
    ctx.fillStyle = '#ffd23c';
    ctx.beginPath(); ctx.arc(marker.x * sx, marker.y * sy, pulse + 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#20242e';
    ctx.beginPath(); ctx.arc(marker.x * sx, marker.y * sy, 3, 0, Math.PI * 2); ctx.fill();
  }
  // Police dots.
  ctx.fillStyle = '#2e7bff';
  for (const cop of G.police) {
    ctx.beginPath(); ctx.arc(cop.x * sx, cop.y * sy, 2.5, 0, Math.PI * 2); ctx.fill();
  }
  // Player arrow.
  const px = G.player.x * sx, py = G.player.y * sy;
  const a = G.player.car ? G.player.car.angle : G.player.angle;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(a);
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-5, -4.5); ctx.lineTo(-5, 4.5); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#2a9a8a';
  ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

export function showScreen(G, name) {
  const start = document.getElementById('start-screen');
  const pause = document.getElementById('pause-screen');
  const hud = document.getElementById('hud');
  const wasted = document.getElementById('wasted');
  start.classList.toggle('hidden', name !== 'title');
  pause.classList.toggle('hidden', name !== 'pause');
  hud.classList.toggle('hidden', name === 'title');
  wasted.classList.toggle('hidden', name !== 'busted' && name !== 'wasted');
  if (name === 'busted' || name === 'wasted') {
    wasted.querySelector('.big').textContent = name === 'busted' ? 'BUSTED' : 'WASTED';
    wasted.querySelector('.small').textContent = name === 'busted'
      ? 'The Harbor PD caught up with you.'
      : 'Rook went down. The harbor waits.';
  }
}
