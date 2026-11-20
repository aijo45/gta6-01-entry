// Traffic and pedestrians: cars that follow the road grid and people who walk
// the sidewalks, turn at intersections and run when things get violent.
import { AVENUES, STREETS, WORLD_W, WORLD_H, HALF_ROAD } from './city.js';
import { clamp, dist, angleDiff } from './rng.js';
import { CAR_COLORS, PED_COLORS, PED_SHIRTS, CAR_R, knockPedDown, spawnSparks } from './world.js';

let carSeq = 0;

export function spawnTrafficCar(world) {
  const { rng } = world;
  const onAvenue = rng.chance(0.5);
  const line = onAvenue ? rng.pick(AVENUES) : rng.pick(STREETS);
  const pos = onAvenue ? rng.range(80, WORLD_H - 80) : rng.range(200, WORLD_W - 80);
  const dir = rng.pick([-1, 1]);
  const lane = rng.pick([-1, 1]) * 22;
  return {
    id: `traffic-${carSeq += 1}`,
    kind: 'traffic',
    axis: onAvenue ? 'v' : 'h',
    line,
    pos,
    dir,
    lane,
    x: onAvenue ? line + lane : pos,
    y: onAvenue ? pos : line + lane,
    angle: onAvenue ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI),
    speed: rng.range(110, 165),
    cruise: rng.range(110, 165),
    color: rng.pick(CAR_COLORS),
    health: 100,
    driver: true,
  };
}

export function spawnPedestrian(world) {
  const { rng } = world;
  const onAvenue = rng.chance(0.5);
  const line = onAvenue ? rng.pick(AVENUES) : rng.pick(STREETS);
  const pos = onAvenue ? rng.range(80, WORLD_H - 80) : rng.range(200, WORLD_W - 80);
  const dir = rng.pick([-1, 1]);
  const side = rng.pick([-1, 1]) * (HALF_ROAD + 14);
  return {
    x: onAvenue ? line + side : pos,
    y: onAvenue ? pos : line + side,
    axis: onAvenue ? 'v' : 'h',
    line,
    pos,
    dir,
    side,
    angle: onAvenue ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI),
    speed: rng.range(42, 66),
    color: rng.pick(PED_COLORS),
    shirt: rng.pick(PED_SHIRTS),
    state: 'walk',
    fleeTimer: 0,
    downTimer: 0,
    driving: null,
    walkPhase: rng.range(0, 6),
  };
}

/** Keep traffic on the roads: drive along a centre line, turn at intersections. */
export function updateTraffic(world, dt) {
  const { rng } = world;
  for (const car of world.cars) {
    if (car.kind !== 'traffic') continue;
    // Slow down for a car ahead on the same lane.
    let targetSpeed = car.cruise;
    for (const other of world.cars) {
      if (other === car || other.kind === 'dead') continue;
      const dx = other.x - car.x;
      const dy = other.y - car.y;
      const ahead = Math.cos(car.angle) * dx + Math.sin(car.angle) * dy;
      const side = Math.abs(-Math.sin(car.angle) * dx + Math.cos(car.angle) * dy);
      if (ahead > 0 && ahead < 64 && side < 26) {
        targetSpeed = Math.min(targetSpeed, 30);
        break;
      }
    }
    // And for a pedestrian stepping out ahead.
    for (const ped of world.peds) {
      if (ped.state === 'down') continue;
      const dx = ped.x - car.x;
      const dy = ped.y - car.y;
      const ahead = Math.cos(car.angle) * dx + Math.sin(car.angle) * dy;
      const side = Math.abs(-Math.sin(car.angle) * dx + Math.cos(car.angle) * dy);
      if (ahead > 0 && ahead < 52 && side < 22) {
        targetSpeed = Math.min(targetSpeed, 25);
        break;
      }
    }
    // Ease toward the target speed.
    car.speed += clamp(targetSpeed - car.speed, -260 * dt, 200 * dt);
    car.pos += car.dir * car.speed * dt;
    // At an intersection, sometimes turn onto the crossing road.
    const crossings = car.axis === 'v' ? STREETS : AVENUES;
    for (const cross of crossings) {
      if (Math.abs(car.pos - cross) < 6 && rng.chance(0.22)) {
        const oldLine = car.line;
        car.axis = car.axis === 'v' ? 'h' : 'v';
        car.line = cross;
        car.pos = oldLine;
        car.dir = rng.pick([-1, 1]);
        car.lane = rng.pick([-1, 1]) * 22;
        break;
      }
    }
    // Wrap around the far end of a road instead of leaving the city.
    const maxPos = car.axis === 'v' ? WORLD_H - 40 : WORLD_W - 40;
    if (car.pos > maxPos) car.pos = 40;
    if (car.pos < 40) car.pos = maxPos;
    car.x = car.axis === 'v' ? car.line + car.lane : car.pos;
    car.y = car.axis === 'v' ? car.pos : car.line + car.lane;
    car.angle = car.axis === 'v'
      ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2)
      : (car.dir > 0 ? 0 : Math.PI);
    // Running over a pedestrian on the road: rare, but it happens.
    for (const ped of world.peds) {
      if (ped.state !== 'walk' && ped.state !== 'flee') continue;
      if (dist(car.x, car.y, ped.x, ped.y) < CAR_R + 4 && Math.abs(car.speed) > 90) {
        knockPedDown(world, ped, 'run over', false);
        car.speed *= 0.85;
        spawnSparks(world, ped.x, ped.y, 6);
      }
    }
  }
  // Player car vs traffic: simple circle push-apart with damage.
  const playerCar = world.player.car;
  if (playerCar) {
    for (const other of world.cars) {
      if (other === playerCar || other.kind === 'dead') continue;
      const d = dist(playerCar.x, playerCar.y, other.x, other.y);
      if (d < CAR_R * 2 && d > 0.01) {
        const push = (CAR_R * 2 - d) / 2;
        const nx = (playerCar.x - other.x) / d;
        const ny = (playerCar.y - other.y) / d;
        playerCar.x += nx * push;
        playerCar.y += ny * push;
        if (other.kind === 'traffic' || other.kind === 'parked') {
          other.x -= nx * push;
          other.y -= ny * push;
        }
        const impact = Math.abs(playerCar.speed);
        if (impact > 130) {
          playerCar.speed *= 0.55;
          if (other.kind === 'traffic') other.speed *= 0.4;
          world.events.push({ name: 'crash', x: playerCar.x, y: playerCar.y, hard: impact > 260 });
          spawnSparks(world, (playerCar.x + other.x) / 2, (playerCar.y + other.y) / 2, 8);
        }
      }
    }
  }
}

/** Pedestrians stroll the sidewalks, flee danger, and get back up after a fall. */
export function updatePedestrians(world, dt) {
  const { rng } = world;
  const p = world.player;
  const playerCar = p.car;
  for (const ped of world.peds) {
    if (ped.state === 'down') {
      ped.downTimer -= dt;
      if (ped.downTimer <= 0) {
        ped.state = 'flee';
        ped.fleeTimer = 3;
      }
      continue;
    }
    // Danger nearby: a speeding car or a fresh gunshot.
    const threatX = playerCar ? playerCar.x : p.x;
    const threatY = playerCar ? playerCar.y : p.y;
    const threatSpeed = playerCar ? Math.abs(playerCar.speed) : 0;
    const nearDanger = dist(ped.x, ped.y, threatX, threatY) < (threatSpeed > 120 ? 170 : 90) && threatSpeed > 60;
    if (ped.state !== 'flee' && nearDanger) {
      ped.state = 'flee';
      ped.fleeTimer = 2.5;
    }
    if (ped.state === 'flee') {
      ped.fleeTimer -= dt;
      const away = Math.atan2(ped.y - threatY, ped.x - threatX);
      ped.x += Math.cos(away) * 210 * dt;
      ped.y += Math.sin(away) * 210 * dt;
      ped.angle = away;
      ped.walkPhase += dt * 12;
      ped.x = clamp(ped.x, 12, WORLD_W - 12);
      ped.y = clamp(ped.y, 12, WORLD_H - 12);
      if (ped.fleeTimer <= 0) {
        ped.state = 'walk';
        // Rejoin the nearest sidewalk.
        const onAvenue = rng.chance(0.5);
        ped.axis = onAvenue ? 'v' : 'h';
        ped.line = onAvenue ? AVENUES.reduce((a, b) => (Math.abs(b - ped.x) < Math.abs(a - ped.x) ? b : a)) : STREETS.reduce((a, b) => (Math.abs(b - ped.y) < Math.abs(a - ped.y) ? b : a));
        ped.pos = onAvenue ? ped.y : ped.x;
        ped.dir = rng.pick([-1, 1]);
        ped.side = rng.pick([-1, 1]) * (HALF_ROAD + 14);
      }
      continue;
    }
    // Stroll along the sidewalk.
    ped.pos += ped.dir * ped.speed * dt;
    const crossings = ped.axis === 'v' ? STREETS : AVENUES;
    for (const cross of crossings) {
      if (Math.abs(ped.pos - cross) < 4 && rng.chance(0.12)) {
        const oldLine = ped.line;
        ped.axis = ped.axis === 'v' ? 'h' : 'v';
        ped.line = cross;
        ped.dir = rng.pick([-1, 1]);
        // Turn the corner: start on the new road's sidewalk, past the crossing,
        // instead of walking across the middle of the road.
        ped.pos = oldLine + ped.dir * (HALF_ROAD + 14);
        ped.side = rng.pick([-1, 1]) * (HALF_ROAD + 14);
        break;
      }
    }
    const maxPos = ped.axis === 'v' ? WORLD_H - 40 : WORLD_W - 40;
    if (ped.pos > maxPos) ped.pos = 40;
    if (ped.pos < 40) ped.pos = maxPos;
    ped.x = ped.axis === 'v' ? ped.line + ped.side : ped.pos;
    ped.y = ped.axis === 'v' ? ped.pos : ped.line + ped.side;
    ped.angle = ped.axis === 'v'
      ? (ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2)
      : (ped.dir > 0 ? 0 : Math.PI);
    ped.walkPhase += dt * 8;
    // The player's car can run a pedestrian down.
    if (playerCar && Math.abs(playerCar.speed) > 60 && dist(ped.x, ped.y, playerCar.x, playerCar.y) < CAR_R + 12) {
      knockPedDown(world, ped, 'run over');
      playerCar.speed *= 0.88;
      spawnSparks(world, ped.x, ped.y, 6);
    }
  }
  // Keep the crowd topped up.
  while (world.peds.length < 26) world.peds.push(spawnPedestrian(world));
}
