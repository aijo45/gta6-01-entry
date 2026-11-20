// Screenshot scenes behind ?shot=start|drive|mission|chase. Each one plays the
// real rules forward from a fresh world for a fixed number of steps, steered by
// an autopilot that drives the road grid (never across blocks), so the frame is
// what real play looks like and the same seed always gives the same frame.
import { stepWorld } from './world.js';
import { dist, clamp, angleDiff } from './rng.js';
import { AVENUES, STREETS, PLACES } from './city.js';

const STEP = 1 / 60;

function nearestValue(list, v) {
  let best = list[0];
  for (const n of list) if (Math.abs(n - v) < Math.abs(best - v)) best = n;
  return best;
}

/** Manhattan route on the road grid: nearest intersection, then along a street
 * to the goal avenue, then along that avenue to the goal's street. */
function planRoute(x, y, tx, ty) {
  const gx = nearestValue(AVENUES, tx);
  const gy = nearestValue(STREETS, ty);
  const sx = nearestValue(AVENUES, x);
  const sy = nearestValue(STREETS, y);
  return [{ x: sx, y: sy }, { x: gx, y: sy }, { x: gx, y: gy }];
}

/** Drive/walk toward the current goal: returns the input for one step. */
function autopilot(world, goals) {
  const p = world.player;
  const input = {
    up: false, down: false, left: false, right: false,
    throttle: 0, steer: 0, enter: false, punch: false,
    shoot: false, reload: false, anyKey: false, aimWorld: null,
  };
  // Advance to the next goal in the list when the current one is reached.
  let goal = goals[world._goalIndex ?? 0];
  if (dist(p.x, p.y, goal.x, goal.y) < 90 && world._goalIndex < goals.length - 1) {
    world._goalIndex = (world._goalIndex ?? 0) + 1;
    world._route = null;
    goal = goals[world._goalIndex];
  }
  if (p.onFoot) {
    // Walk to the nearest parked car first, then follow the route on foot.
    if (!world._shotDrove) {
      let best = null;
      let bestD = 420;
      for (const car of world.cars) {
        if (car.kind !== 'parked') continue;
        const d = dist(p.x, p.y, car.x, car.y);
        if (d < bestD) { bestD = d; best = car; }
      }
      if (best) {
        if (bestD < 52) {
          input.enter = true;
          world._shotDrove = true;
          return input;
        }
        walkToward(input, p, best.x, best.y);
        return input;
      }
    }
    const wp = nextWaypoint(world, goal);
    walkToward(input, p, wp.x, wp.y);
    return input;
  }
  // Driving: steer toward the next route waypoint; reverse out when stuck.
  const car = p.car;
  const wp = nextWaypoint(world, goal);
  const d = dist(car.x, car.y, wp.x, wp.y);
  if (d < 60) {
    world._route = null;
    return input;
  }
  const targetAngle = Math.atan2(wp.y - car.y, wp.x - car.x);
  const diff = angleDiff(car.angle, targetAngle);
  if (world._stuckTimer === undefined) world._stuckTimer = 0;
  if (Math.abs(car.speed) < 25 && Math.abs(diff) > 0.4) world._stuckTimer += STEP;
  else world._stuckTimer = 0;
  if (world._stuckTimer > 1.2) {
    input.throttle = -0.8;
    input.steer = 1;
    if (world._stuckTimer > 2.2) world._stuckTimer = 0;
    return input;
  }
  input.steer = clamp(diff * 2.2, -1, 1);
  input.throttle = Math.abs(diff) > 1.5 ? 0.25 : 1;
  return input;
}

function walkToward(input, p, tx, ty) {
  const dx = tx - p.x;
  const dy = ty - p.y;
  if (Math.abs(dx) > 12) input[dx > 0 ? 'right' : 'left'] = true;
  if (Math.abs(dy) > 12) input[dy > 0 ? 'down' : 'up'] = true;
}

/** The next route waypoint for the current goal, planning on demand. */
function nextWaypoint(world, goal) {
  const p = world.player;
  const key = `${goal.x},${goal.y}`;
  if (!world._route || world._routeGoal !== key) {
    world._route = planRoute(p.x, p.y, goal.x, goal.y);
    world._routeGoal = key;
  }
  const route = world._route;
  while (route.length > 1 && dist(p.x, p.y, route[0].x, route[0].y) < 50) route.shift();
  if (route.length === 1 && dist(p.x, p.y, route[0].x, route[0].y) < 50) {
    // Last leg: the final approach, straight to the goal itself.
    return goal;
  }
  return route[0];
}

function runSteps(world, seconds, goals) {
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    stepWorld(world, STEP, autopilot(world, goals));
    if (world.wasted) break;
  }
}

/**
 * Set `world` to the named scene and return the screen to draw over it.
 * start: the title over a living city. drive: stealing a car and crossing town.
 * mission: job 3, driving for Bay Plaza with three stars and the law closing in.
 * chase: the getaway, driving for the airstrip with cruisers on your tail.
 */
export function stageShot(name, world) {
  if (name === 'start') {
    for (let i = 0; i < 5 / STEP; i += 1) {
      stepWorld(world, STEP, { up: false, down: false, left: false, right: false, throttle: 0, steer: 0, enter: false, punch: false, shoot: false, reload: false, anyKey: false });
    }
    return 'title';
  }
  if (name === 'mission') {
    world.missionIndex = 2;
    world.missionsDone = 2;
    world.money = 750;
    runSteps(world, 9, [PLACES.plaza]);
    return 'play';
  }
  if (name === 'chase') {
    world.missionIndex = 3;
    world.missionsDone = 3;
    world.money = 1350;
    // Stop short of the airstrip so the chase is still on in the frame.
    runSteps(world, 16, [{ x: 2500, y: 500 }]);
    return 'play';
  }
  // drive: a cross-town loop, so the car is still moving in the frame.
  runSteps(world, 26, [{ x: 2600, y: 1800 }, { x: 600, y: 600 }]);
  return 'play';
}

export function parseShot() {
  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  const seed = Number(params.get('seed') || 1) || 1;
  return { shot: shot || null, seed };
}
