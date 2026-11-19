// Neon Harbor — the city itself: a seeded grid of streets, blocks, buildings,
// parks, the bay and the pier. Everything is deterministic from one seed, so a
// screenshot with ?seed=N always shows the same city.
import { mulberry32, rand, randInt, choice, clamp, circleRectResolve } from './utils.js';

export const WORLD_W = 2560;
export const WORLD_H = 1920;
export const ROAD_W = 72;
export const PITCH = 304;
export const WATER_Y = 1690;

const V_NAMES = ['Harbor Blvd', 'Coral Ave', 'Neon St', 'Sunset Rd', 'Palm Row', 'Marina Way', 'Dock St', 'Vesper Ln', 'Bay Rd'];
const H_NAMES = ['Ocean Dr', 'Sunrise Ave', 'Market St', 'Rook St', 'Canal Rd', 'Shoreline'];
const DOWNTOWN = ['#c96f4a', '#b85c68', '#a05a7a', '#7a6a8a', '#4a7a8a'];
const RESIDENTIAL = ['#d8a05a', '#c98a6a', '#e0b070', '#b0785a', '#d0c08a'];
const INDUSTRIAL = ['#8a7a6a', '#6a6a72', '#9a8a7a', '#7a6a5a'];
const ROOFS = ['#5a3a30', '#3a3a4a', '#6a4a3a', '#2e2e3a'];

export function streetName(axis, index) {
  return axis === 'v' ? V_NAMES[index % V_NAMES.length] : H_NAMES[index % H_NAMES.length];
}

/** Build the whole city from a seed. Pure data — no canvas work here. */
export function generateCity(seed) {
  const rng = mulberry32(seed);
  const vStreets = [];
  for (let i = 0; i < 9; i += 1) vStreets.push(i * PITCH + ROAD_W / 2);
  const hStreets = [];
  for (let j = 0; j < 6; j += 1) hStreets.push(j * PITCH + ROAD_W / 2);

  const buildings = [];
  const parks = [];
  const palms = [];
  const lots = [];

  // Blocks live between neighbouring streets. Rows below the last street are
  // the industrial docks; the far east strip is the beach.
  for (let i = 0; i < 8; i += 1) {
    for (let j = 0; j < 5; j += 1) {
      const bx = vStreets[i] + ROAD_W / 2;
      const by = hStreets[j] + ROAD_W / 2;
      const bw = PITCH - ROAD_W;
      const bh = PITCH - ROAD_W;
      const roll = rng();
      const downtown = by < 700;
      const residential = bx < 700 && by >= 700;
      const industrial = by >= 1250;
      if (roll < 0.14) {
        parks.push({ x: bx, y: by, w: bw, h: bh });
        const n = randInt(rng, 4, 8);
        for (let k = 0; k < n; k += 1) palms.push({ x: rand(rng, bx + 16, bx + bw - 16), y: rand(rng, by + 16, by + bh - 16) });
        continue;
      }
      if (roll < 0.24) {
        lots.push({ x: bx, y: by, w: bw, h: bh });
        continue;
      }
      const palette = downtown ? DOWNTOWN : residential ? RESIDENTIAL : INDUSTRIAL;
      const count = downtown ? randInt(rng, 2, 3) : randInt(rng, 1, 2);
      if (count === 1) {
        buildings.push(makeBuilding(rng, bx + 14, by + 14, bw - 28, bh - 28, palette, downtown));
      } else if (count === 2) {
        const vertical = rng() < 0.5;
        if (vertical) {
          buildings.push(makeBuilding(rng, bx + 12, by + 12, bw / 2 - 18, bh - 24, palette, downtown));
          buildings.push(makeBuilding(rng, bx + bw / 2 + 6, by + 12, bw / 2 - 18, bh - 24, palette, downtown));
        } else {
          buildings.push(makeBuilding(rng, bx + 12, by + 12, bw - 24, bh / 2 - 18, palette, downtown));
          buildings.push(makeBuilding(rng, bx + 12, by + bh / 2 + 6, bw - 24, bh / 2 - 18, palette, downtown));
        }
      } else {
        buildings.push(makeBuilding(rng, bx + 10, by + 10, bw / 2 - 14, bh / 2 - 14, palette, downtown));
        buildings.push(makeBuilding(rng, bx + bw / 2 + 4, by + 10, bw / 2 - 14, bh / 2 - 14, palette, downtown));
        buildings.push(makeBuilding(rng, bx + 10, by + bh / 2 + 4, bw - 20, bh / 2 - 14, palette, downtown));
      }
    }
  }

  // Beach strip on the far east, palms along the shore road.
  for (let k = 0; k < 10; k += 1) palms.push({ x: rand(rng, 2500, 2545), y: rand(rng, 120, 1640) });

  return {
    seed,
    vStreets,
    hStreets,
    buildings,
    parks,
    palms,
    lots,
    waterY: WATER_Y,
    pier: { x: 1150, y: WATER_Y - 10, w: 100, h: 190 },
    yacht: { x: 1200, y: 1852 },
    spots: {
      hospital: { x: 340, y: 180, label: 'St. Vesper Hospital' },
      garage: { x: 2164, y: 340, label: "Mara's Garage" },
      club: { x: 1860, y: 948, label: 'Club Neon' },
      docks: { x: 644, y: 1556, label: 'Harbor Docks' },
      warehouse: { x: 340, y: 1252, label: 'Old Warehouse' },
      pierEnd: { x: 1200, y: 1830, label: 'The Yacht' },
      safehouse: { x: 2164, y: 1252, label: 'Safehouse' },
      harborGate: { x: 1252, y: 1556, label: 'Harbor Gate' },
    },
  };
}

function makeBuilding(rng, x, y, w, h, palette, downtown) {
  return {
    x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h),
    base: choice(rng, palette),
    roof: choice(rng, ROOFS),
    win: rng() < 0.7 ? '#ffe9a8' : '#9fd8ff',
    hgt: downtown ? randInt(rng, 10, 22) : randInt(rng, 4, 10),
    type: downtown ? 'tower' : 'house',
  };
}

export function isWater(x, y) { return y >= WATER_Y; }

export function isRoadAt(city, x, y) {
  if (isWater(x, y)) return false;
  for (const cx of city.vStreets) if (Math.abs(x - cx) <= ROAD_W / 2) return true;
  for (const cy of city.hStreets) if (Math.abs(y - cy) <= ROAD_W / 2) return true;
  return false;
}

export function pointInBuilding(city, x, y) {
  for (const b of city.buildings) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
  }
  return null;
}

/**
 * Resolve a circle against buildings, the bay and the world edge. Returns a
 * corrected {x, y} (and `hit: true` when it touched anything solid). The pier
 * is walkable deck over the bay, so the water does not block it.
 */
export function collideCircle(city, x, y, r) {
  let hit = false;
  x = clamp(x, r, WORLD_W - r);
  y = clamp(y, r, WORLD_H - r);
  const onPier = x > city.pier.x - r && x < city.pier.x + city.pier.w + r
    && y > city.pier.y - r && y < city.pier.y + city.pier.h + r;
  if (!onPier) {
    const fix = circleRectResolve(x, y, r, { x: 0, y: WATER_Y, w: WORLD_W, h: WORLD_H - WATER_Y });
    if (fix) { x = fix.x; y = fix.y; hit = true; }
  }
  for (const b of city.buildings) {
    const fix = circleRectResolve(x, y, r, b);
    if (fix) { x = fix.x; y = fix.y; hit = true; }
  }
  return { x, y, hit };
}

/** A random point on a random street centre line (for spawning traffic). */
export function randomStreetPoint(rng, city) {
  if (rng() < 0.5) {
    const cx = choice(rng, city.vStreets);
    return { x: cx, y: rand(rng, 60, WATER_Y - 60), axis: 'v', line: cx };
  }
  const cy = choice(rng, city.hStreets);
  return { x: rand(rng, 60, WORLD_W - 60), y: cy, axis: 'h', line: cy };
}

/** The nearest street centre coordinate on the given axis. */
export function nearestStreet(axis, city, v) {
  const list = axis === 'v' ? city.vStreets : city.hStreets;
  let best = list[0];
  for (const c of list) if (Math.abs(c - v) < Math.abs(best - v)) best = c;
  return best;
}
