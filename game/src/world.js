// Verde Bay's world: the player, cars, pedestrians, bullets, particles and
// pickups, and one fixed step that moves them all. Pure logic, no DOM: the
// renderer and the main loop read this state and draw it.
import { buildCity, collideBuildings, isOnRoad, randomRoadPoint, randomSidewalkPoint, WORLD_W, WORLD_H, HALF_ROAD, AVENUES, STREETS, PLACES } from './city.js';
import { makeRng, clamp, angleDiff, dist } from './rng.js';
import { updateTraffic, updatePedestrians, spawnTrafficCar, spawnPedestrian } from './traffic.js';
import { updatePolice, gainWanted } from './police.js';
import { updateMissions, missionState } from './missions.js';
import { updateCombat } from './combat.js';

export const PLAYER_R = 13;
export const CAR_R = 17;
export const CAR_COLORS = ['#d94f3d', '#3d7bd9', '#e8c33a', '#4f9d5d', '#e8e8e8', '#2b2b33', '#c77fd9', '#e08a2e', '#7fc9d9', '#a3b8c4'];
export const PED_COLORS = ['#e8b88a', '#c98d64', '#8a5a3b', '#f0c8a0', '#6b4a2f'];
export const PED_SHIRTS = ['#d94f3d', '#3d7bd9', '#4f9d5d', '#e8c33a', '#8a5fc0', '#e08a2e', '#5db8a0', '#c05f8a'];

const FOOT_SPEED = 185;
const CAR_ACCEL = 340;
const CAR_BRAKE = 520;
const CAR_MAX_SPEED = 430;
const CAR_REVERSE_MAX = 150;
const CAR_TURN = 2.4;

export function createWorld(seed = 1) {
  const rng = makeRng(seed);
  const city = buildCity(rng);
  const world = {
    seed,
    rng,
    city,
    time: 0,
    money: 150,
    health: 100,
    wanted: 0,
    wantedTimer: 0,
    quietTimer: 0,
    missionIndex: 0,
    missionsDone: 0,
    player: null,
    cars: [],
    peds: [],
    bullets: [],
    particles: [],
    skids: [],
    pickups: [],
    police: [],
    ammoMag: 12,
    ammoReserve: 36,
    punchCooldown: 0,
    shootCooldown: 0,
    wasted: false,
    wastedTimer: 0,
    gameComplete: false,
    stats: { carsStolen: 0, pedsHit: 0, shotsFired: 0, missionsPaid: 0 },
    events: [],
    messages: [],
  };
  resetWorld(world);
  return world;
}

export function resetWorld(world) {
  const { rng } = world;
  world.time = 0;
  world.money = 150;
  world.health = 100;
  world.wanted = 0;
  world.wantedTimer = 0;
  world.quietTimer = 0;
  world.missionIndex = 0;
  world.missionsDone = 0;
  world.cars = [];
  world.peds = [];
  world.bullets = [];
  world.particles = [];
  world.skids = [];
  world.pickups = [];
  world.police = [];
  world.ammoMag = 12;
  world.ammoReserve = 36;
  world.punchCooldown = 0;
  world.shootCooldown = 0;
  world.wasted = false;
  world.wastedTimer = 0;
  world.gameComplete = false;
  world.stats = { carsStolen: 0, pedsHit: 0, shotsFired: 0, missionsPaid: 0 };
  world.events = [];
  world.messages = [];
  world.player = {
    x: PLACES.apartments.x,
    y: PLACES.apartments.y,
    angle: -Math.PI / 2,
    speed: 0,
    onFoot: true,
    car: null,
    r: PLAYER_R,
    walkPhase: 0,
  };
  // Traffic on the roads.
  for (let i = 0; i < 14; i += 1) world.cars.push(spawnTrafficCar(world));
  // Parked cars along the road edges.
  for (let i = 0; i < 10; i += 1) {
    const p = randomRoadPoint(rng);
    const onAvenue = AVENUES.includes(p.x);
    const angle = onAvenue ? (rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2) : (rng.chance(0.5) ? 0 : Math.PI);
    const off = (HALF_ROAD + 20) * rng.pick([-1, 1]);
    world.cars.push({
      id: `parked-${i}`,
      kind: 'parked',
      x: clamp(p.x + (onAvenue ? off : 0), 170, WORLD_W - 20),
      y: clamp(p.y + (onAvenue ? 0 : off), 20, WORLD_H - 20),
      angle,
      speed: 0,
      color: rng.pick(CAR_COLORS),
      health: 100,
      driver: false,
    });
  }
  // Pedestrians on the sidewalks.
  for (let i = 0; i < 26; i += 1) world.peds.push(spawnPedestrian(world));
  // Pickups: ammo crates, medkits and loose cash.
  const pickupSpots = [];
  for (let i = 0; i < 8; i += 1) pickupSpots.push({ kind: 'ammo', at: randomSidewalkPoint(rng) });
  for (let i = 0; i < 6; i += 1) pickupSpots.push({ kind: 'health', at: randomSidewalkPoint(rng) });
  for (let i = 0; i < 10; i += 1) pickupSpots.push({ kind: 'cash', at: randomSidewalkPoint(rng) });
  for (const spot of pickupSpots) {
    world.pickups.push({ x: spot.at.x, y: spot.at.y, kind: spot.kind, taken: false, bob: rng.range(0, 6) });
  }
  missionState(world).reset();
}

export function addMessage(world, text) {
  world.messages.push({ text, t: 4 });
  if (world.messages.length > 3) world.messages.shift();
}

export function emit(world, name, data = {}) {
  world.events.push({ name, ...data });
}

/** One fixed step of the whole simulation. `input` is the normalized controls. */
export function stepWorld(world, dt, input) {
  world.time += dt;
  if (world.wasted) {
    world.wastedTimer -= dt;
    if (world.wastedTimer <= 0 && input.anyKey) respawnPlayer(world);
    updateParticles(world, dt);
    return;
  }
  world.punchCooldown = Math.max(0, world.punchCooldown - dt);
  world.shootCooldown = Math.max(0, world.shootCooldown - dt);
  updatePlayer(world, dt, input);
  updateTraffic(world, dt);
  updatePedestrians(world, dt);
  updatePolice(world, dt);
  updateMissions(world, dt);
  updateCombat(world, dt, input);
  updatePickups(world, dt);
  updateParticles(world, dt);
  updateWantedDecay(world, dt);
  for (const m of world.messages) m.t -= dt;
  world.messages = world.messages.filter((m) => m.t > 0);
}

function respawnPlayer(world) {
  world.wasted = false;
  world.health = 100;
  world.player.x = PLACES.hospital.x;
  world.player.y = PLACES.hospital.y;
  world.player.onFoot = true;
  world.player.car = null;
  world.player.speed = 0;
  world.wanted = 0;
  world.police = [];
  addMessage(world, 'You woke up at Verde General. -$200 hospital bill.');
}

function updatePlayer(world, dt, input) {
  const p = world.player;
  if (p.onFoot) {
    let mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    if (mx !== 0 || my !== 0) {
      const len = Math.hypot(mx, my);
      mx /= len;
      my /= len;
      p.x += mx * FOOT_SPEED * dt;
      p.y += my * FOOT_SPEED * dt;
      p.angle = Math.atan2(my, mx);
      p.walkPhase += dt * 10;
    }
    p.x = clamp(p.x, 12, WORLD_W - 12);
    p.y = clamp(p.y, 12, WORLD_H - 12);
    collideBuildings(world.city.buildings, p);
    // Bump into cars: slide around them.
    for (const car of world.cars) {
      const d = dist(p.x, p.y, car.x, car.y);
      if (d < CAR_R + p.r && d > 0.01) {
        p.x = car.x + ((p.x - car.x) / d) * (CAR_R + p.r);
        p.y = car.y + ((p.y - car.y) / d) * (CAR_R + p.r);
      }
    }
    if (input.enter) tryEnterCar(world);
    if (input.punch && world.punchCooldown <= 0) doPunch(world);
  } else if (p.car) {
    driveCar(world, p.car, dt, input.throttle, input.steer, true);
    p.x = p.car.x;
    p.y = p.car.y;
    p.angle = p.car.angle;
    if (input.enter) exitCar(world);
  }
}

/** Drive a car with arcade physics; `playerDriven` marks skid marks and damage sounds. */
export function driveCar(world, car, dt, throttle, steer, playerDriven) {
  const forward = throttle > 0 ? CAR_ACCEL : CAR_BRAKE;
  if (throttle !== 0) {
    car.speed += throttle * forward * dt;
  } else {
    // Coast down.
    car.speed -= Math.sign(car.speed) * 140 * dt;
    if (Math.abs(car.speed) < 8) car.speed = 0;
  }
  // Drag and limits.
  car.speed -= car.speed * 0.35 * dt;
  car.speed = clamp(car.speed, -CAR_REVERSE_MAX, car.maxSpeed ?? CAR_MAX_SPEED);
  const speedRatio = Math.abs(car.speed) / CAR_MAX_SPEED;
  const turn = steer * CAR_TURN * speedRatio * (car.speed < 0 ? -1 : 1);
  car.angle += turn * dt;
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const beforeX = car.x;
  const beforeY = car.y;
  car.x = clamp(nx, 20, WORLD_W - 20);
  car.y = clamp(ny, 20, WORLD_H - 20);
  const body = { x: car.x, y: car.y, r: CAR_R };
  if (collideBuildings(world.city.buildings, body)) {
    const impact = Math.abs(car.speed);
    car.x = body.x;
    car.y = body.y;
    if (impact > 120) {
      damageCar(world, car, impact * 0.06);
      emit(world, 'crash', { x: car.x, y: car.y, hard: impact > 260 });
      spawnSparks(world, car.x, car.y, 10);
    }
    car.speed *= 0.35;
  }
  // Skid marks while turning hard at speed.
  if (playerDriven && Math.abs(steer) > 0.7 && speedRatio > 0.45) {
    world.skids.push({ x1: beforeX, y1: beforeY, x2: car.x, y2: car.y, life: 6 });
    if (world.skids.length > 220) world.skids.shift();
  }
  // Damage smoke.
  if (car.health < 55 && world.rng.chance(dt * (car.health < 25 ? 14 : 5))) {
    world.particles.push({
      x: car.x + world.rng.range(-8, 8), y: car.y + world.rng.range(-8, 8),
      vx: world.rng.range(-8, 8), vy: world.rng.range(-26, -10),
      life: 0.9, maxLife: 0.9, size: world.rng.range(5, 9),
      color: car.health < 25 ? '#3a3a3a' : '#8a8a8a', kind: 'smoke',
    });
  }
}

export function damageCar(world, car, amount) {
  car.health = Math.max(0, car.health - amount);
  if (car.health <= 0 && car.kind !== 'dead') {
    car.kind = 'dead';
    car.speed = 0;
    emit(world, 'car-dead', { x: car.x, y: car.y });
  }
}

export function spawnSparks(world, x, y, count) {
  for (let i = 0; i < count; i += 1) {
    const a = world.rng.range(0, Math.PI * 2);
    const s = world.rng.range(40, 160);
    world.particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: 0.35, maxLife: 0.35, size: 2.5, color: '#ffd94d', kind: 'spark',
    });
  }
}

export function spawnBlood(world, x, y) {
  for (let i = 0; i < 8; i += 1) {
    const a = world.rng.range(0, Math.PI * 2);
    const s = world.rng.range(20, 90);
    world.particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: 0.5, maxLife: 0.5, size: 3, color: '#c0392b', kind: 'blood',
    });
  }
}

function nearestCar(world, x, y, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of world.cars) {
    if (car.kind === 'police' || car.kind === 'dead') continue;
    const d = dist(x, y, car.x, car.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

function tryEnterCar(world) {
  const p = world.player;
  const car = nearestCar(world, p.x, p.y, 52);
  if (!car) return;
  p.onFoot = false;
  p.car = car;
  car.kind = 'player';
  car.maxSpeed = CAR_MAX_SPEED;
  if (car.driver) {
    // The driver bails out and runs.
    const driver = world.peds.find((ped) => ped.driving === car);
    if (driver) {
      driver.driving = null;
      driver.state = 'flee';
      driver.fleeTimer = 4;
      driver.x = car.x + Math.cos(car.angle + Math.PI / 2) * 26;
      driver.y = car.y + Math.sin(car.angle + Math.PI / 2) * 26;
    }
    car.driver = false;
  }
  world.stats.carsStolen += 1;
  gainWanted(world, 1, 'stole a car');
  emit(world, 'steal', { x: car.x, y: car.y });
  addMessage(world, 'You took the car. The law noticed.');
}

function exitCar(world) {
  const p = world.player;
  const car = p.car;
  car.kind = 'parked';
  car.speed = 0;
  p.onFoot = true;
  p.car = null;
  p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 30;
  p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 30;
  p.x = clamp(p.x, 12, WORLD_W - 12);
  p.y = clamp(p.y, 12, WORLD_H - 12);
  collideBuildings(world.city.buildings, p);
}

function doPunch(world) {
  const p = world.player;
  world.punchCooldown = 0.45;
  emit(world, 'punch', { x: p.x + Math.cos(p.angle) * 20, y: p.y + Math.sin(p.angle) * 20 });
  for (const ped of world.peds) {
    if (ped.state === 'down' || ped.driving) continue;
    if (dist(p.x, p.y, ped.x, ped.y) < 34) {
      const facing = Math.abs(angleDiff(p.angle, Math.atan2(ped.y - p.y, ped.x - p.x)));
      if (facing < 1.1) {
        knockPedDown(world, ped, 'punched');
        break;
      }
    }
  }
}

export function knockPedDown(world, ped, how, byPlayer = true) {
  ped.state = 'down';
  ped.downTimer = 4;
  ped.speed = 0;
  spawnBlood(world, ped.x, ped.y);
  if (how !== 'quiet') {
    world.stats.pedsHit += 1;
    // Only the player's own actions raise the wanted level: a traffic car's
    // accident is the city's problem, not yours.
    if (byPlayer) gainWanted(world, 1, how === 'shot' ? 'shot a pedestrian' : 'hit a pedestrian');
  }
}

function updatePickups(world, dt) {
  const p = world.player;
  for (const pk of world.pickups) {
    if (pk.taken) continue;
    pk.bob += dt * 3;
    if (dist(p.x, p.y, pk.x, pk.y) < 30) {
      pk.taken = true;
      if (pk.kind === 'ammo') {
        world.ammoReserve += 24;
        addMessage(world, '+24 pistol ammo');
      } else if (pk.kind === 'health') {
        world.health = Math.min(100, world.health + 40);
        addMessage(world, '+40 health');
      } else {
        world.money += 25;
        addMessage(world, '+$25 found on the street');
      }
      emit(world, 'pickup', { kind: pk.kind, x: pk.x, y: pk.y });
    }
  }
}

function updateParticles(world, dt) {
  for (const pt of world.particles) {
    pt.life -= dt;
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vx *= 0.96;
    pt.vy *= 0.96;
  }
  world.particles = world.particles.filter((pt) => pt.life > 0);
  for (const s of world.skids) s.life -= dt;
  world.skids = world.skids.filter((s) => s.life > 0);
}

function updateWantedDecay(world, dt) {
  if (world.wanted === 0) return;
  const nearestPolice = world.police.reduce((best, c) => Math.min(best, dist(world.player.x, world.player.y, c.x, c.y)), Infinity);
  const seen = nearestPolice < 520;
  if (!seen) {
    world.quietTimer += dt;
    if (world.quietTimer > 12) {
      world.wanted -= 1;
      world.quietTimer = 0;
      addMessage(world, world.wanted > 0 ? 'Heat dying down…' : 'You lost the cops.');
      emit(world, 'wanted-down', { wanted: world.wanted });
    }
  } else {
    world.quietTimer = 0;
  }
}

export function hurtPlayer(world, amount, cause) {
  if (world.wasted) return;
  world.health -= amount;
  if (world.health <= 0) {
    world.health = 0;
    world.wasted = true;
    world.wastedTimer = 3;
    world.money = Math.max(0, world.money - 200);
    emit(world, 'wasted', { cause });
    addMessage(world, 'WASTED');
  }
}
