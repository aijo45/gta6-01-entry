// Streets of Verde Bay: bootstrap, game loop, screens and wiring. The world
// holds the simulation; this file owns the loop, the menus and the sounds.
import { createWorld, stepWorld } from './world.js';
import { createInput } from './input.js';
import { createCamera, updateCamera, render, VIEW_W, VIEW_H } from './render.js';
import { SoundBank } from './audio.js';
import { loadSave, writeSave, clearSave } from './save.js';
import { stageShot, parseShot } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = VIEW_W;
canvas.height = VIEW_H;

const input = createInput(canvas);
const sound = new SoundBank();
const camera = createCamera();

const { shot, seed } = parseShot();
const world = createWorld(seed);
let screen = 'title';
let lastTime = 0;
let saveTimer = 0;

if (shot) {
  screen = stageShot(shot, world);
  updateCamera(camera, world, 1);
  render(ctx, world, screen, camera);
  window.__shotReady = true;
} else {
  window.__shotReady = false;
  requestAnimationFrame(loop);
}

function applySave(save) {
  if (!save) return;
  world.money = save.money ?? 150;
  world.missionIndex = save.missionIndex ?? 0;
  world.missionsDone = save.missionsDone ?? 0;
  world.player.x = save.playerX ?? world.player.x;
  world.player.y = save.playerY ?? world.player.y;
  world.health = save.health ?? 100;
  world.ammoReserve = save.ammoReserve ?? 36;
}

function startGame(continueSave) {
  sound.ensure();
  sound.click();
  if (continueSave) {
    applySave(loadSave());
  } else {
    clearSave();
  }
  screen = 'play';
}

function drainEvents() {
  for (const event of world.events) {
    if (event.name === 'shot') sound.gunshot();
    else if (event.name === 'punch') sound.punch();
    else if (event.name === 'crash') sound.crash();
    else if (event.name === 'pickup') sound.pickup();
    else if (event.name === 'mission-complete') sound.cash();
    else if (event.name === 'wanted') sound.wanted();
    else if (event.name === 'steal') sound.click();
  }
  world.events.length = 0;
}

/** Convert the mouse position to world coordinates through the camera. */
function mouseToWorld() {
  return {
    x: input.mouse.x + camera.x - VIEW_W / 2,
    y: input.mouse.y + camera.y - VIEW_H / 2,
  };
}

function buildInput() {
  const p = world.player;
  return {
    up: input.down('w', 'ArrowUp'),
    down: input.down('s', 'ArrowDown'),
    left: input.down('a', 'ArrowLeft'),
    right: input.down('d', 'ArrowRight'),
    throttle: p.onFoot ? 0 : (input.down('w', 'ArrowUp') ? 1 : input.down('s', 'ArrowDown') ? -0.7 : 0),
    steer: p.onFoot ? 0 : (input.down('a', 'ArrowLeft') ? -1 : input.down('d', 'ArrowRight') ? 1 : 0),
    enter: input.wasPressed('e'),
    punch: input.wasPressed('f'),
    shoot: input.mouse.down,
    reload: input.wasPressed('r'),
    anyKey: input.keys.size > 0 || input.mouse.clicked,
    aimWorld: mouseToWorld(),
  };
}

function loop(timestamp) {
  requestAnimationFrame(loop);
  const dt = Math.min(1 / 30, Math.max(0, (timestamp - lastTime) / 1000 || 1 / 60));
  lastTime = timestamp;

  if (screen === 'title') {
    world.time += dt;
    if (input.wasPressed('Enter') || input.mouse.clicked) {
      startGame(Boolean(loadSave()));
    }
    updateCamera(camera, world, dt);
    render(ctx, world, 'title', camera);
    input.endFrame();
    return;
  }

  if (screen === 'pause') {
    if (input.wasPressed('p') || input.wasPressed('Escape')) {
      screen = 'play';
      sound.click();
    } else if (input.wasPressed('s')) {
      writeSave(world);
      sound.pickup();
    } else if (input.wasPressed('q')) {
      writeSave(world);
      screen = 'title';
    }
    render(ctx, world, 'pause', camera);
    input.endFrame();
    return;
  }

  if (screen === 'complete') {
    world.time += dt;
    if (input.wasPressed('Enter')) screen = 'play';
    else if (input.wasPressed('q')) screen = 'title';
    render(ctx, world, 'complete', camera);
    input.endFrame();
    return;
  }

  // Playing (including the wasted overlay, which the world steps itself).
  if (input.wasPressed('p') || input.wasPressed('Escape')) {
    screen = 'pause';
    sound.click();
    input.endFrame();
    return;
  }
  if (input.wasPressed('m')) {
    const muted = sound.toggleMute();
    world.messages.push({ text: muted ? 'Sound off' : 'Sound on', t: 2 });
  }
  const frameInput = buildInput();
  stepWorld(world, dt, frameInput);
  drainEvents();
  updateCamera(camera, world, dt);
  // Engine and siren follow the action.
  const car = world.player.car;
  sound.setEngine(car ? Math.abs(car.speed) / 430 : 0, Boolean(car));
  sound.setSiren(world.police.length > 0 && world.wanted > 0, world.time);
  saveTimer += dt;
  if (saveTimer > 30) {
    saveTimer = 0;
    writeSave(world);
  }
  if (world.wasted) {
    render(ctx, world, 'wasted', camera);
  } else if (world.gameComplete && screen !== 'complete') {
    writeSave(world);
    screen = 'complete';
    render(ctx, world, 'complete', camera);
  } else {
    render(ctx, world, 'play', camera);
  }
  input.endFrame();
}
