// Combat: the pistol (mouse aim, limited ammo), bullets, and what they hit.
import { dist } from './rng.js';
import { CAR_R, damageCar, knockPedDown, spawnSparks, emit } from './world.js';
import { gainWanted } from './police.js';

const BULLET_SPEED = 760;
const BULLET_RANGE = 560;
const MAG_SIZE = 12;

/** Fire one shot from the player toward (aimX, aimY) in world coordinates. */
export function tryShoot(world, aimX, aimY) {
  const p = world.player;
  if (!p.onFoot) return false;
  if (world.shootCooldown > 0) return false;
  if (world.ammoMag <= 0) {
    world.shootCooldown = 0.35;
    emit(world, 'dry-fire', {});
    return false;
  }
  world.shootCooldown = 0.22;
  world.ammoMag -= 1;
  world.stats.shotsFired += 1;
  const angle = Math.atan2(aimY - p.y, aimX - p.x);
  world.bullets.push({
    x: p.x + Math.cos(angle) * 22,
    y: p.y + Math.sin(angle) * 22,
    vx: Math.cos(angle) * BULLET_SPEED,
    vy: Math.sin(angle) * BULLET_SPEED,
    travelled: 0,
  });
  p.angle = angle;
  emit(world, 'shot', { x: p.x, y: p.y, angle });
  gainWanted(world, 1, 'fired a gun');
  return true;
}

/** Reload from the reserve into the magazine. */
export function reload(world) {
  if (world.ammoMag >= MAG_SIZE || world.ammoReserve <= 0) return;
  const need = MAG_SIZE - world.ammoMag;
  const take = Math.min(need, world.ammoReserve);
  world.ammoMag += take;
  world.ammoReserve -= take;
  emit(world, 'reload', {});
}

export function updateCombat(world, dt, input) {
  const p = world.player;
  if (input.shoot && p.onFoot) {
    const aim = input.aimWorld ?? { x: p.x + Math.cos(p.angle) * 100, y: p.y + Math.sin(p.angle) * 100 };
    tryShoot(world, aim.x, aim.y);
  }
  if (input.reload) reload(world);
  for (const b of world.bullets) {
    const step = BULLET_SPEED * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.travelled += step;
    // Hit a building first (bullets stop at walls).
    let blocked = false;
    for (const building of world.city.buildings) {
      if (b.x > building.x && b.x < building.x + building.w && b.y > building.y && b.y < building.y + building.h) {
        blocked = true;
        break;
      }
    }
    if (blocked) {
      spawnSparks(world, b.x, b.y, 4);
      b.travelled = BULLET_RANGE + 1;
      continue;
    }
    // Hit a pedestrian.
    for (const ped of world.peds) {
      if (ped.state === 'down' || ped.driving) continue;
      if (dist(b.x, b.y, ped.x, ped.y) < 13) {
        knockPedDown(world, ped, 'shot');
        b.travelled = BULLET_RANGE + 1;
        break;
      }
    }
    if (b.travelled > BULLET_RANGE) continue;
    // Hit a car.
    for (const car of world.cars) {
      if (car.kind === 'dead') continue;
      if (dist(b.x, b.y, car.x, car.y) < CAR_R) {
        damageCar(world, car, 22);
        spawnSparks(world, b.x, b.y, 6);
        emit(world, 'car-hit', { x: b.x, y: b.y });
        if (car.kind === 'police') gainWanted(world, 1, 'shot a police car');
        b.travelled = BULLET_RANGE + 1;
        break;
      }
    }
  }
  world.bullets = world.bullets.filter((b) => b.travelled <= BULLET_RANGE);
}
