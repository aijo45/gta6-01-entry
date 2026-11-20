// Verde Bay's map: a coastal grid city. Avenues run north-south, streets east-west;
// between them sit blocks of buildings, parks and landmarks. The west edge is the
// marina, the south edge is the beach. Everything is laid out from a seed, so the
// same seed always builds the same city.
import { clamp } from './rng.js';

export const WORLD_W = 3200;
export const WORLD_H = 2400;
export const ROAD_W = 96;
export const HALF_ROAD = ROAD_W / 2;

export const AVENUES = [200, 600, 1000, 1400, 1800, 2200, 2600, 3000];
export const STREETS = [200, 600, 1000, 1400, 1800, 2200];

// Block columns between the avenues (x ranges) and rows between the streets.
const BLOCK_X = [[248, 552], [648, 952], [1048, 1352], [1448, 1752], [1848, 2152], [2248, 2552], [2648, 2952]];
const BLOCK_Y = [[248, 552], [648, 952], [1048, 1352], [1448, 1752], [1848, 2152]];

export const BUILDING_COLORS = [
  '#c98f5f', '#b7a99a', '#8fa3b8', '#d9c08a', '#a8b89a',
  '#c47f6a', '#9a8fb5', '#d8b25e', '#7fa3a0', '#b5654d',
];
export const ROOF_COLORS = ['#7a6a58', '#5d6b7a', '#8a7a5f', '#6b5d4f', '#4f5d6b'];

/** Special named places the story and missions use. */
export const PLACES = {
  marina: { name: 'Verde Marina', x: 110, y: 1200 },
  apartments: { name: 'Verde Apartments', x: 1600, y: 2000 },
  hospital: { name: 'Verde General Hospital', x: 1600, y: 2000 },
  garage: { name: 'Northside Garage', x: 2400, y: 350 },
  airstrip: { name: 'Verde Bay Airstrip', x: 2800, y: 400 },
  plaza: { name: 'Bay Plaza', x: 1600, y: 1200 },
  parkWest: { name: 'Palm Court Park', x: 800, y: 1200 },
  parkEast: { name: 'Jacaranda Park', x: 2000, y: 800 },
};

/** True when the point is on asphalt (inside a road's width). */
export function isOnRoad(x, y) {
  for (const ax of AVENUES) if (Math.abs(x - ax) <= HALF_ROAD) return true;
  for (const sy of STREETS) if (Math.abs(y - sy) <= HALF_ROAD) return true;
  return false;
}

/** All road-centre intersections, for autopilot routing and spawning. */
export function roadIntersections() {
  const nodes = [];
  for (const x of AVENUES) for (const y of STREETS) nodes.push({ x, y });
  return nodes;
}

/** A random point on a road centre line. */
export function randomRoadPoint(rng) {
  if (rng.chance(0.5)) {
    return { x: rng.pick(AVENUES), y: rng.range(60, WORLD_H - 60) };
  }
  return { x: rng.range(180, WORLD_W - 60), y: rng.pick(STREETS) };
}

/** A random point on a sidewalk (just off a road's edge). */
export function randomSidewalkPoint(rng) {
  const p = randomRoadPoint(rng);
  const onAvenue = AVENUES.includes(p.x);
  if (onAvenue) p.x += rng.pick([-1, 1]) * (HALF_ROAD + 14);
  else p.y += rng.pick([-1, 1]) * (HALF_ROAD + 14);
  p.x = clamp(p.x, 170, WORLD_W - 20);
  p.y = clamp(p.y, 20, WORLD_H - 20);
  return p;
}

/** Snap a point to the nearest road centre line. */
export function nearestRoadPoint(x, y) {
  let bestX = AVENUES[0];
  let bestD = Infinity;
  for (const ax of AVENUES) {
    if (Math.abs(x - ax) < bestD) { bestD = Math.abs(x - ax); bestX = ax; }
  }
  let bestY = STREETS[0];
  bestD = Infinity;
  for (const sy of STREETS) {
    if (Math.abs(y - sy) < bestD) { bestD = Math.abs(y - sy); bestY = sy; }
  }
  return Math.abs(x - bestX) < Math.abs(y - bestY) ? { x: bestX, y } : { x, y: bestY };
}

/** Build the city from a seed: buildings, parks, trees, beach and water. */
export function buildCity(rng) {
  const buildings = [];
  const parks = [];
  const trees = [];
  const specialBlocks = {
    '6,0': 'airstrip',
    '5,0': 'garage',
    '3,4': 'hospital',
    '3,2': 'plaza',
    '1,2': 'park',
    '4,1': 'park',
  };
  for (let col = 0; col < BLOCK_X.length; col += 1) {
    for (let row = 0; row < BLOCK_Y.length; row += 1) {
      const [bx0, bx1] = BLOCK_X[col];
      const [by0, by1] = BLOCK_Y[row];
      const kind = specialBlocks[`${col},${row}`];
      if (kind === 'park' || kind === 'plaza') {
        parks.push({ x: bx0, y: by0, w: bx1 - bx0, h: by1 - by0, plaza: kind === 'plaza' });
        const count = kind === 'plaza' ? 6 : 12;
        for (let i = 0; i < count; i += 1) {
          trees.push({ x: rng.range(bx0 + 20, bx1 - 20), y: rng.range(by0 + 20, by1 - 20), r: rng.range(9, 15) });
        }
        continue;
      }
      if (kind === 'airstrip') {
        // A runway strip with a hangar at its north end.
        buildings.push({ x: bx0 + 30, y: by0 + 10, w: 120, h: 80, color: '#8a8f96', roof: '#5d6b7a', label: 'HANGAR' });
        continue;
      }
      const count = rng.int(1, 3);
      for (let i = 0; i < count; i += 1) {
        const w = rng.range(70, 130);
        const h = rng.range(70, 130);
        const x = rng.range(bx0 + 8, bx1 - w - 8);
        const y = rng.range(by0 + 8, by1 - h - 8);
        buildings.push({
          x, y, w, h,
          color: rng.pick(BUILDING_COLORS),
          roof: rng.pick(ROOF_COLORS),
          label: kind === 'hospital' ? 'HOSPITAL' : kind === 'garage' ? 'GARAGE' : null,
        });
      }
    }
  }
  // Beach palms along the south strip.
  for (let i = 0; i < 26; i += 1) {
    trees.push({ x: rng.range(180, WORLD_W - 40), y: rng.range(2260, 2330), r: rng.range(9, 14), palm: true });
  }
  // A few palms on the marina walk.
  for (let i = 0; i < 8; i += 1) {
    trees.push({ x: rng.range(140, 170), y: rng.range(300, 2100), r: rng.range(9, 13), palm: true });
  }
  return { buildings, parks, trees };
}

/** Push a circle (x, y, r) out of every building it overlaps. Returns true if it hit one. */
export function collideBuildings(buildings, body) {
  let hit = false;
  for (const b of buildings) {
    const cx = clamp(body.x, b.x, b.x + b.w);
    const cy = clamp(body.y, b.y, b.y + b.h);
    const dx = body.x - cx;
    const dy = body.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < body.r * body.r) {
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        body.x = cx + (dx / d) * body.r;
        body.y = cy + (dy / d) * body.r;
      } else {
        body.x += body.r;
      }
    }
  }
  return hit;
}
