// Neon Harbor — the game itself: state, loop, camera, rendering, input, save.
// A top-down open-world crime game in a sun-soaked harbor city of its own.
import { mulberry32, clamp, dist, TAU, rand } from './utils.js';
import { generateCity, WORLD_W, WORLD_H, WATER_Y, ROAD_W, pointInBuilding } from './city.js';
import { AudioEngine } from './audio.js';
import { makeCar, spawnTraffic, updateTraffic, drivePlayerCar, updatePoliceCar, drawCar } from './vehicles.js';
import { spawnPeds, updatePeds, drawPed, scarePeds } from './pedestrians.js';
import { createWanted, updateWanted, updatePolice, drawFootCop } from './police.js';
import { MISSION_DEFS, startMission, updateMission, missionObjective, missionMarker, updateEnemies, drawEnemy, damagePlayer } from './missions.js';
import { createPlayer, updatePlayerOnFoot, nearestCar, enterCar, exitCar, punch, shoot, checkCarPedHits, drawPlayer } from './player.js';
import { initHUD, updateHUD, showScreen } from './hud.js';
import { stageShot } from './shots.js';

const SAVE_KEY = 'neonharbor-save-v1';
const STEP = 1 / 60;

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d');
    this.audio = new AudioEngine();
    this.input = { up: false, down: false, left: false, right: false, shift: false };
    this.mouse = { x: 0, y: 0, down: false };
    this.screen = 'title';
    this.time = 0;
    this.clockHour = 18.7;
    this.shake = 0;
    this.shotFrozen = false;
    this.events = [];
    this.camera = { x: 0, y: 0 };
    this.rng = mulberry32(7);
    this.resetWorld(7);
    this.loadSave();
    initHUD(this);
    this.bindInput();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resetWorld(seed) {
    this.rng = mulberry32(seed);
    this.city = generateCity(seed);
    this.player = createPlayer(this.city, 340, 340);
    this.traffic = [];
    this.parked = [];
    this.peds = [];
    this.police = [];
    this.enemies = [];
    this.bullets = [];
    this.particles = [];
    this.wanted = createWanted();
    this.mission = { index: 0, stage: 0, data: {}, done: false };
    this.missionVan = null;
    this.missionVanTaken = false;
    this.lastCopSpawn = 0;
    this.lastFootSpawn = 0;
    this.events = [];
    this.time = 0;
    this.clockHour = 18.7;
    this.camera.x = this.player.x;
    this.camera.y = this.player.y;
    // Parked cars in the parking lots.
    for (const lot of this.city.lots) {
      const n = 2 + Math.floor(this.rng() * 3);
      for (let i = 0; i < n; i += 1) {
        const car = makeCar(this.city, this.rng, {
          x: lot.x + 30 + (i % 2) * 90,
          y: lot.y + 30 + Math.floor(i / 2) * 80,
          angle: this.rng() < 0.5 ? 0 : Math.PI / 2,
        });
        this.parked.push(car);
      }
    }
  }

  loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const s = JSON.parse(raw);
      if (!s || typeof s.cash !== 'number') return false;
      this.savedState = s;
      const btn = document.getElementById('btn-continue');
      const label = document.getElementById('continue-label');
      if (btn && label) {
        label.textContent = `Mission ${Math.min(s.missionIndex + 1, 5)}/5 · $${s.cash}`;
        btn.classList.remove('hidden');
      }
      return true;
    } catch { return false; }
  }

  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        cash: this.player.cash,
        missionIndex: this.mission.index,
        x: this.player.x, y: this.player.y,
        health: this.player.health,
      }));
    } catch { /* storage unavailable */ }
  }

  applySave() {
    const s = this.savedState;
    if (!s) return;
    this.player.cash = s.cash;
    this.player.x = s.x; this.player.y = s.y;
    this.player.health = s.health || 100;
    this.camera.x = s.x; this.camera.y = s.y;
    startMission(this, Math.min(s.missionIndex, MISSION_DEFS.length - 1));
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  bindInput() {
    const keymap = {
      KeyW: 'up', ArrowUp: 'up',
      KeyS: 'down', ArrowDown: 'down',
      KeyA: 'left', ArrowLeft: 'left',
      KeyD: 'right', ArrowRight: 'right',
      ShiftLeft: 'shift', ShiftRight: 'shift',
    };
    window.addEventListener('keydown', (e) => {
      if (keymap[e.code] !== undefined) { this.input[keymap[e.code]] = true; e.preventDefault(); }
      if (e.code === 'KeyE' && this.screen === 'play' && !this.player.car) {
        const car = nearestCar(this, 70);
        if (car) enterCar(this, car);
      } else if (e.code === 'KeyE' && this.screen === 'play' && this.player.car) {
        exitCar(this);
      }
      if (e.code === 'KeyF' && this.screen === 'play') punch(this);
      if (e.code === 'KeyR' && this.screen === 'play' && !this.player.car && this.player.ammo < 12) {
        this.player.reloadT = 0.9;
        this.audio.reload();
      }
      if (e.code === 'KeyP' && (this.screen === 'play' || this.screen === 'pause')) this.togglePause();
      if (e.code === 'KeyM') {
        const muted = this.audio.toggleMute();
        this.hud.toast(muted ? 'Sound off' : 'Sound on');
      }
      if (e.code === 'Enter' && this.screen === 'title') this.startGame(false);
    });
    window.addEventListener('keyup', (e) => {
      if (keymap[e.code] !== undefined) this.input[keymap[e.code]] = false;
    });
    this.canvas.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      const ch = document.getElementById('crosshair');
      if (!this.player.car && this.screen === 'play') {
        ch.classList.remove('hidden');
        ch.style.left = `${e.clientX}px`;
        ch.style.top = `${e.clientY}px`;
      } else {
        ch.classList.add('hidden');
      }
    });
    this.canvas.addEventListener('mousedown', (e) => {
      if (this.screen !== 'play' || this.player.car) return;
      this.audio.ensure();
      const wx = this.camera.x - this.canvas.width / 2 + e.clientX;
      const wy = this.camera.y - this.canvas.height / 2 + e.clientY;
      shoot(this, wx, wy);
    });
    document.getElementById('btn-start').addEventListener('click', () => this.startGame(false));
    document.getElementById('btn-continue').addEventListener('click', () => this.startGame(true));
    document.getElementById('btn-resume').addEventListener('click', () => this.togglePause());
    document.getElementById('btn-restart').addEventListener('click', () => {
      try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
      this.resetWorld(7);
      spawnTraffic(this, 14);
      spawnPeds(this, 26);
      this.screen = 'play';
      startMission(this, 0);
      showScreen(this, 'play');
    });
    this.canvas.addEventListener('mousedown', () => this.audio.ensure());
  }

  startGame(useSave) {
    this.audio.ensure();
    this.audio.startMusic();
    this.resetWorld(7);
    spawnTraffic(this, 14);
    spawnPeds(this, 26);
    this.screen = 'play';
    if (useSave && this.savedState) this.applySave();
    else startMission(this, 0);
    showScreen(this, 'play');
    this.hud.toast('Welcome to Neon Harbor. Good luck, Rook.');
  }

  togglePause() {
    if (this.screen === 'play') {
      this.screen = 'pause';
      const p = this.player;
      document.getElementById('pause-stats').innerHTML =
        `Cash $${p.cash.toLocaleString('en-US')} &nbsp;·&nbsp; Mission ${Math.min(this.mission.index + 1, 5)}/5<br>` +
        `Wanted ${this.wanted.level} ★ &nbsp;·&nbsp; Health ${Math.ceil(p.health)}`;
      showScreen(this, 'pause');
    } else if (this.screen === 'pause') {
      this.screen = 'play';
      showScreen(this, 'play');
    }
  }

  update(dt) {
    this.time += dt;
    this.clockHour += dt * 0.004;
    if (this.clockHour >= 24) this.clockHour -= 24;
    const p = this.player;
    if (p.car) {
      drivePlayerCar(this, p.car, this.input, dt);
      p.x = p.car.x; p.y = p.car.y;
      p.angle = p.car.angle;
      checkCarPedHits(this);
      this.audio.setEngine(Math.abs(p.car.speed) / p.car.max, true);
    } else {
      updatePlayerOnFoot(this, dt);
      this.audio.setEngine(0, false);
    }
    updateTraffic(this, dt);
    updatePeds(this, dt);
    updateWanted(this, dt);
    updatePolice(this, dt);
    updateMission(this, dt);
    updateEnemies(this, dt);
    this.updateBullets(dt);
    this.updateParticles(dt);
    // Car-vs-car: the player's car pushes traffic.
    if (p.car) {
      for (const car of this.traffic) {
        const d = dist(p.car.x, p.car.y, car.x, car.y);
        if (d < 48 && d > 0.01) {
          const nx = (car.x - p.car.x) / d, ny = (car.y - p.car.y) / d;
          car.x += nx * (48 - d) * 0.5; car.y += ny * (48 - d) * 0.5;
          if (Math.abs(p.car.speed) > 150) {
            car.speed *= 0.8;
            this.audio.crash();
            this.shake = Math.min(8, this.shake + 3);
          }
        }
      }
    }
    // Camera follows the player (or the car) with a little look-ahead.
    const lookX = p.car ? Math.cos(p.car.angle) * 60 : 0;
    const lookY = p.car ? Math.sin(p.car.angle) * 60 : 0;
    const tx = clamp(p.x + lookX, this.canvas.width / 2, WORLD_W - this.canvas.width / 2);
    const ty = clamp(p.y + lookY, this.canvas.height / 2, WORLD_H - this.canvas.height / 2);
    this.camera.x += (tx - this.camera.x) * Math.min(1, 5 * dt);
    this.camera.y += (ty - this.camera.y) * Math.min(1, 5 * dt);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - 30 * dt);
    // Events (busted / wasted).
    for (const ev of this.events) {
      if (ev.type === 'busted') this.handleBusted();
      if (ev.type === 'wasted') this.handleWasted(ev.note);
    }
    this.events = [];
    // Autosave every 10 seconds of play.
    const sec = Math.floor(this.time);
    if (sec % 10 === 0 && sec !== this._lastSaveSec) {
      this._lastSaveSec = sec;
      this.save();
    }
  }

  updateBullets(dt) {
    for (const b of this.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      const hitB = pointInBuilding(this.city, b.x, b.y);
      if (hitB || b.x < 0 || b.y < 0 || b.x > WORLD_W || b.y > WORLD_H) b.life = 0;
      if (b.life <= 0) continue;
      if (b.from === 'player') {
        for (const e of this.enemies) {
          if (e.hp > 0 && dist(b.x, b.y, e.x, e.y) < 16) {
            e.hp -= b.dmg; e.flash = 0.15; b.life = 0;
            this.player.cash += 5;
            break;
          }
        }
        if (b.life > 0) {
          const ped = this.peds.find((pd) => pd.state !== 'down' && dist(b.x, b.y, pd.x, pd.y) < 12);
          if (ped) {
            ped.state = 'down'; ped.downT = 8;
            addWanted(this, 50, 'You shot a pedestrian');
            scarePeds(this, b.x, b.y, 220);
            b.life = 0;
          }
        }
      } else if (dist(b.x, b.y, this.player.x, this.player.y) < 14 && !this.player.car) {
        damagePlayer(this, b.dmg, 'Shot by a guard');
        b.life = 0;
      }
    }
    this.bullets = this.bullets.filter((b) => b.life > 0);
  }

  updateParticles(dt) {
    for (const pt of this.particles) {
      pt.x += pt.vx * dt; pt.y += pt.vy * dt;
      pt.vx *= (1 - 2 * dt); pt.vy *= (1 - 2 * dt);
      pt.life -= dt;
    }
    this.particles = this.particles.filter((pt) => pt.life > 0);
  }

  handleBusted() {
    this.audio.bust();
    this.audio.setSiren(false);
    const fine = Math.floor(this.player.cash * 0.2);
    this.player.cash -= fine;
    this.player.health = 100;
    this.wanted = createWanted();
    this.police = [];
    if (this.player.car) { this.parked.push(this.player.car); this.player.car = null; }
    const h = this.city.spots.hospital;
    this.player.x = h.x; this.player.y = h.y;
    this.camera.x = h.x; this.camera.y = h.y;
    this.screen = 'busted';
    showScreen(this, 'busted');
    this.hud.toast(`Busted — fined $${fine}.`);
    setTimeout(() => {
      if (this.screen === 'busted') { this.screen = 'play'; showScreen(this, 'play'); }
    }, 2600);
    this.save();
  }

  handleWasted(note) {
    this.audio.bust();
    this.audio.setSiren(false);
    const lost = Math.floor(this.player.cash * 0.2);
    this.player.cash -= lost;
    this.player.health = 100;
    this.wanted = createWanted();
    this.police = [];
    this.enemies = [];
    if (this.player.car) { this.parked.push(this.player.car); this.player.car = null; }
    const h = this.city.spots.hospital;
    this.player.x = h.x; this.player.y = h.y;
    this.camera.x = h.x; this.camera.y = h.y;
    this.screen = 'wasted';
    showScreen(this, 'wasted');
    this.hud.toast(`Wasted — lost $${lost}.`);
    setTimeout(() => {
      if (this.screen === 'wasted') { this.screen = 'play'; showScreen(this, 'play'); }
    }, 2600);
    this.save();
  }

  render() {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    const shx = this.shake > 0 ? (this.rng() - 0.5) * this.shake : 0;
    const shy = this.shake > 0 ? (this.rng() - 0.5) * this.shake : 0;
    // Never let the view leave the world, whatever the camera state is.
    const camX = clamp(this.camera.x - W / 2, 0, Math.max(0, WORLD_W - W)) + shx;
    const camY = clamp(this.camera.y - H / 2, 0, Math.max(0, WORLD_H - H)) + shy;
    ctx.save();
    ctx.translate(-camX, -camY);
    this.drawWorld(ctx, camX, camY, W, H);
    ctx.restore();
    // Golden-hour tint + vignette.
    const warm = this.clockHour >= 17.5 && this.clockHour <= 19.5 ? 0.10 : 0.05;
    const grad = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.85);
    grad.addColorStop(0, `rgba(255,170,80,${warm * 0.4})`);
    grad.addColorStop(1, 'rgba(20,10,40,0.28)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  drawWorld(ctx, camX, camY, W, H) {
    const city = this.city;
    const x0 = Math.max(0, camX - 80), y0 = Math.max(0, camY - 80);
    const x1 = Math.min(WORLD_W, camX + W + 80), y1 = Math.min(WORLD_H, camY + H + 80);
    // Ground.
    ctx.fillStyle = '#b89a6a';
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    // Bay water.
    ctx.fillStyle = '#2e6a9a';
    ctx.fillRect(x0, Math.max(y0, WATER_Y), x1 - x0, Math.max(0, y1 - Math.max(y0, WATER_Y)));
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    for (let y = WATER_Y + 24; y < WORLD_H; y += 46) {
      ctx.beginPath();
      for (let x = Math.floor(x0 / 40) * 40; x < x1; x += 40) {
        const yy = y + Math.sin(x * 0.02 + this.time * 1.4) * 3;
        if (x === Math.floor(x0 / 40) * 40) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    // Beach strip along the water.
    ctx.fillStyle = '#e0c890';
    ctx.fillRect(x0, WATER_Y - 26, x1 - x0, 26);
    // Parks.
    for (const park of city.parks) {
      if (park.x > x1 || park.x + park.w < x0 || park.y > y1 || park.y + park.h < y0) continue;
      ctx.fillStyle = '#4a7a3a';
      ctx.fillRect(park.x, park.y, park.w, park.h);
      ctx.fillStyle = '#5a8a4a';
      for (let i = 0; i < 5; i += 1) {
        ctx.beginPath();
        ctx.arc(park.x + 30 + i * 40, park.y + 30 + (i % 2) * 90, 22, 0, TAU);
        ctx.fill();
      }
    }
    // Roads.
    ctx.fillStyle = '#2e2e38';
    for (const cx of city.vStreets) ctx.fillRect(cx - ROAD_W / 2, Math.max(y0, 0), ROAD_W, Math.min(y1, WATER_Y) - Math.max(y0, 0));
    for (const cy of city.hStreets) ctx.fillRect(Math.max(x0, 0), cy - ROAD_W / 2, Math.min(x1, WORLD_W) - Math.max(x0, 0), ROAD_W);
    // Sidewalks.
    ctx.strokeStyle = '#c9b890';
    ctx.lineWidth = 6;
    for (const cx of city.vStreets) {
      ctx.beginPath(); ctx.moveTo(cx - ROAD_W / 2 - 3, 0); ctx.lineTo(cx - ROAD_W / 2 - 3, WATER_Y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + ROAD_W / 2 + 3, 0); ctx.lineTo(cx + ROAD_W / 2 + 3, WATER_Y); ctx.stroke();
    }
    for (const cy of city.hStreets) {
      ctx.beginPath(); ctx.moveTo(0, cy - ROAD_W / 2 - 3); ctx.lineTo(WORLD_W, cy - ROAD_W / 2 - 3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, cy + ROAD_W / 2 + 3); ctx.lineTo(WORLD_W, cy + ROAD_W / 2 + 3); ctx.stroke();
    }
    // Centre dashes.
    ctx.strokeStyle = '#e8d878';
    ctx.lineWidth = 3;
    ctx.setLineDash([18, 22]);
    for (const cx of city.vStreets) {
      ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, WATER_Y); ctx.stroke();
    }
    for (const cy of city.hStreets) {
      ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(WORLD_W, cy); ctx.stroke();
    }
    ctx.setLineDash([]);
    // Pier.
    const pier = city.pier;
    ctx.fillStyle = '#7a5a3a';
    ctx.fillRect(pier.x, pier.y, pier.w, pier.h);
    ctx.strokeStyle = '#5a4028';
    ctx.lineWidth = 3;
    for (let y = pier.y + 20; y < pier.y + pier.h; y += 24) {
      ctx.beginPath(); ctx.moveTo(pier.x, y); ctx.lineTo(pier.x + pier.w, y); ctx.stroke();
    }
    // Yacht at the pier end.
    ctx.save();
    ctx.translate(city.yacht.x, city.yacht.y);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(4, 5, 46, 14, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#f0f0f8';
    ctx.beginPath(); ctx.ellipse(0, 0, 44, 13, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2e6a9a';
    ctx.fillRect(-20, -8, 40, 7);
    ctx.fillStyle = '#ffd23c';
    ctx.fillRect(-6, -16, 12, 9);
    ctx.restore();
    // Buildings with long sunset shadows.
    for (const b of city.buildings) {
      if (b.x > x1 || b.x + b.w < x0 || b.y > y1 || b.y + b.h < y0) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(b.x + b.hgt, b.y + b.hgt, b.w, b.h);
      ctx.fillStyle = b.base;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = b.roof;
      ctx.fillRect(b.x, b.y, b.w, 8);
      ctx.fillStyle = b.win;
      const cols = Math.max(1, Math.floor(b.w / 22));
      const rows = Math.max(1, Math.floor(b.h / 24));
      for (let i = 0; i < cols; i += 1) {
        for (let j = 0; j < rows; j += 1) {
          if ((i * 7 + j * 3 + b.x) % 5 === 0) continue;
          ctx.fillRect(b.x + 8 + i * 22, b.y + 14 + j * 24, 8, 10);
        }
      }
    }
    // Palms.
    for (const palm of city.palms) {
      if (palm.x < x0 || palm.x > x1 || palm.y < y0 || palm.y > y1) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath(); ctx.ellipse(palm.x + 4, palm.y + 5, 8, 4, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#6a4a2e';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(palm.x, palm.y + 8); ctx.lineTo(palm.x, palm.y - 6); ctx.stroke();
      ctx.fillStyle = '#3a8a4a';
      for (let k = 0; k < 5; k += 1) {
        const a = (k / 5) * TAU + 0.4;
        ctx.beginPath();
        ctx.ellipse(palm.x + Math.cos(a) * 8, palm.y - 6 + Math.sin(a) * 6, 9, 3.5, a, 0, TAU);
        ctx.fill();
      }
    }
    // Mission marker beacon.
    const marker = missionMarker(this);
    if (marker && this.screen === 'play') {
      const pulse = 1 + Math.sin(this.time * 5) * 0.15;
      ctx.save();
      ctx.translate(marker.x, marker.y);
      ctx.fillStyle = 'rgba(255,210,60,0.25)';
      ctx.beginPath(); ctx.arc(0, 0, 46 * pulse, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#ffd23c';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, 30 * pulse, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#ffd23c';
      ctx.beginPath(); ctx.arc(0, 0, 8, 0, TAU); ctx.fill();
      ctx.restore();
      // Off-screen arrow pointing at the marker.
      const sx = marker.x - camX, sy = marker.y - camY;
      if (sx < 60 || sx > this.canvas.width - 60 || sy < 60 || sy > this.canvas.height - 60) {
        const cx = clamp(sx, 70, this.canvas.width - 70);
        const cy = clamp(sy, 70, this.canvas.height - 70);
        const a = Math.atan2(sy - cy, sx - cx);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(a);
        ctx.fillStyle = '#ffd23c';
        ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-10, -10); ctx.lineTo(-10, 10); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }
    // Parked cars, mission van, traffic, police, enemies, peds, player.
    for (const car of this.parked) drawCar(ctx, car, this.time);
    if (this.missionVan && !this.parked.includes(this.missionVan) && this.missionVan !== this.player.car) drawCar(ctx, this.missionVan, this.time);
    for (const car of this.traffic) drawCar(ctx, car, this.time);
    for (const cop of this.police) {
      if (cop.kind === 'car') drawCar(ctx, cop, this.time);
      else drawFootCop(ctx, cop, this.time);
    }
    for (const e of this.enemies) drawEnemy(ctx, e, this.time);
    for (const ped of this.peds) drawPed(ctx, ped, this.time);
    if (this.player.car) drawCar(ctx, this.player.car, this.time);
    else drawPlayer(ctx, this.player, this.time);
    // Bullets as tracers.
    for (const b of this.bullets) {
      ctx.strokeStyle = '#ffe08a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    // Particles.
    for (const pt of this.particles) {
      ctx.globalAlpha = clamp(pt.life / pt.max, 0, 1);
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
    }
    ctx.globalAlpha = 1;
  }

  loop = (now) => {
    requestAnimationFrame(this.loop);
    if (this.screen === 'play' && !this.shotFrozen) {
      this.update(STEP);
      updateHUD(this);
    } else if (this.screen === 'title') {
      // Slow cinematic pan over the city behind the title screen.
      this.time += STEP;
      this.camera.x = 1280 + Math.sin(this.time * 0.05) * 500;
      this.camera.y = 960 + Math.cos(this.time * 0.04) * 300;
    }
    this.render();
  };
}

// ---- Boot ----
const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seed = Number(params.get('seed') || '7');
const game = new Game();
window.__game = game;

if (shotName) {
  // Screenshot mode: build the scene, freeze it, draw one frame.
  document.getElementById('start-screen').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  stageShot(game, shotName);
  updateHUD(game);
  game.render();
} else {
  showScreen(game, 'title');
  requestAnimationFrame(game.loop);
}
