// The wanted system: stars 0-5, police cars that spawn, chase and ram, and
// the heat that fades when you stay out of sight.
import { randomRoadPoint } from './city.js';
import { dist, angleDiff, clamp } from './rng.js';
import { CAR_R, damageCar, hurtPlayer, addMessage, emit, spawnSparks } from './world.js';

export const MAX_WANTED = 5;
const POLICE_COLOR = '#20242e';
const POLICE_SPEED = 470;

/** Raise the wanted level (never above 5) and remember the crime. */
export function gainWanted(world, stars, reason) {
  if (world.wanted >= MAX_WANTED) return;
  const before = world.wanted;
  world.wanted = Math.min(MAX_WANTED, world.wanted + stars);
  world.quietTimer = 0;
  if (world.wanted > before) {
    emit(world, 'wanted', { wanted: world.wanted, reason });
    if (world.wanted >= 3) addMessage(world, `Wanted level ${world.wanted} — the whole precinct is coming.`);
  }
}

/** Spawn, chase and despawn police cars to match the wanted level. */
export function updatePolice(world, dt) {
  const p = world.player;
  // Spawn police up to the wanted level, at road points away from the player.
  while (world.police.length < world.wanted) {
    const spot = randomRoadPoint(world.rng);
    if (dist(spot.x, spot.y, p.x, p.y) < 500) continue;
    const car = {
      id: `police-${world.time.toFixed(2)}-${world.police.length}`,
      kind: 'police',
      x: spot.x,
      y: spot.y,
      angle: Math.atan2(p.y - spot.y, p.x - spot.x),
      speed: 0,
      maxSpeed: POLICE_SPEED + world.wanted * 12,
      color: POLICE_COLOR,
      health: 100,
      driver: true,
      ramCooldown: 0,
    };
    world.police.push(car);
    world.cars.push(car);
  }
  // Wanted dropped: extra police peel off and drive away.
  while (world.police.length > world.wanted) {
    const car = world.police.pop();
    const index = world.cars.indexOf(car);
    if (index !== -1) world.cars.splice(index, 1);
  }
  for (const car of world.police) {
    car.ramCooldown = Math.max(0, car.ramCooldown - dt);
    // The chase: police home in on the player while they can see them. Lose
    // sight for a few seconds and a cruiser falls back to searching the last
    // known area, so the heat can actually die down.
    const dPlayer = dist(car.x, car.y, p.x, p.y);
    if (dPlayer < 620) {
      car.lastSeen = { x: p.x, y: p.y };
      car.lostTimer = 0;
      car.searching = false;
    } else {
      car.lostTimer = (car.lostTimer ?? 0) + dt;
      if (car.lostTimer > 4 && !car.searching) {
        car.searching = true;
        const spot = randomRoadPoint(world.rng);
        car.searchTarget = spot;
      }
    }
    let target;
    let chaseSpeed;
    if (car.searching) {
      target = car.searchTarget ?? { x: p.x, y: p.y };
      chaseSpeed = 210;
      car._wobble = 0;
      if (dist(car.x, car.y, target.x, target.y) < 60) {
        car.searchTarget = randomRoadPoint(world.rng);
      }
    } else {
      // Chase the player's last seen spot, with a little wobble so two
      // cruisers do not stack on the same line.
      const wobble = Math.sin(world.time * 1.7 + car.x * 0.01) * 0.25;
      target = car.lastSeen ?? { x: p.x, y: p.y };
      chaseSpeed = car.maxSpeed;
      car._wobble = wobble;
    }
    const targetAngle = Math.atan2(target.y - car.y, target.x - car.x) + (car._wobble ?? 0);
    const diff = angleDiff(car.angle, targetAngle);
    const accel = 380;
    if (car.speed < chaseSpeed) car.speed = Math.min(chaseSpeed, car.speed + accel * dt);
    car.angle += clamp(diff, -2.6 * dt, 2.6 * dt);
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    car.x = clamp(car.x, 20, 3200 - 20);
    car.y = clamp(car.y, 20, 2400 - 20);
    // Ram the player: on foot it hurts, in a car it wrecks both.
    const d = dist(car.x, car.y, p.x, p.y);
    if (d < CAR_R + 14 && car.ramCooldown <= 0) {
      car.ramCooldown = 0.9;
      if (p.onFoot) {
        hurtPlayer(world, 22, 'rammed by police');
        emit(world, 'crash', { x: p.x, y: p.y, hard: true });
        spawnSparks(world, p.x, p.y, 8);
      } else if (p.car) {
        damageCar(world, p.car, 14);
        damageCar(world, car, 8);
        p.car.speed *= 0.6;
        car.speed *= 0.7;
        emit(world, 'crash', { x: p.x, y: p.y, hard: true });
        spawnSparks(world, (car.x + p.x) / 2, (car.y + p.y) / 2, 10);
      }
    }
    // Police push through traffic instead of queuing behind it.
    for (const other of world.cars) {
      if (other === car || other.kind === 'police' || other.kind === 'dead') continue;
      const od = dist(car.x, car.y, other.x, other.y);
      if (od < CAR_R * 2 && od > 0.01) {
        const push = (CAR_R * 2 - od) / 2;
        other.x -= ((car.x - other.x) / od) * push;
        other.y -= ((car.y - other.y) / od) * push;
        if (other.kind === 'traffic') other.speed *= 0.6;
      }
    }
    // Smoke when a cruiser is wrecked.
    if (car.health < 55 && world.rng.chance(dt * 6)) {
      world.particles.push({
        x: car.x, y: car.y, vx: world.rng.range(-8, 8), vy: world.rng.range(-26, -10),
        life: 0.9, maxLife: 0.9, size: 7, color: '#5a5a5a', kind: 'smoke',
      });
    }
  }
}
