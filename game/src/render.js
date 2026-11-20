// Everything on screen: the city, cars, people, effects, HUD, minimap and
// menus. The renderer only reads the world; it never changes it.
import { WORLD_W, WORLD_H, AVENUES, STREETS, ROAD_W, HALF_ROAD } from './city.js';
import { clamp } from './rng.js';
import { currentObjective, missionMarker, currentMission } from './missions.js';
import { loadSave } from './save.js';

export const VIEW_W = 1280;
export const VIEW_H = 720;

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function createCamera() {
  return { x: WORLD_W / 2, y: WORLD_H / 2 };
}

export function updateCamera(camera, world, dt) {
  const p = world.player;
  const tx = clamp(p.x, VIEW_W / 2 - 80, WORLD_W - VIEW_W / 2 + 80);
  const ty = clamp(p.y, VIEW_H / 2 - 80, WORLD_H - VIEW_H / 2 + 80);
  camera.x += (tx - camera.x) * Math.min(1, dt * 4);
  camera.y += (ty - camera.y) * Math.min(1, dt * 4);
}

/** Draw the whole frame for one screen: title, play, pause, wasted, complete. */
export function render(ctx, world, screen, camera) {
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  ctx.save();
  const ox = Math.round(VIEW_W / 2 - camera.x);
  const oy = Math.round(VIEW_H / 2 - camera.y);
  ctx.translate(ox, oy);
  drawGround(ctx, world);
  drawRoads(ctx, world);
  drawCity(ctx, world);
  drawSkids(ctx, world);
  drawPickups(ctx, world);
  drawMissionMarker(ctx, world);
  drawCars(ctx, world);
  drawPeds(ctx, world);
  drawPlayer(ctx, world);
  drawBullets(ctx, world);
  drawParticles(ctx, world);
  ctx.restore();
  if (screen === 'play' || screen === 'pause') drawHud(ctx, world);
  if (screen === 'title') drawTitle(ctx, world);
  if (screen === 'pause') drawPause(ctx, world);
  if (screen === 'wasted') drawWasted(ctx, world);
  if (screen === 'complete') drawComplete(ctx, world);
}

function drawGround(ctx, world) {
  // Base grass.
  ctx.fillStyle = '#7fae62';
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  // Marina water on the west edge.
  ctx.fillStyle = '#2f7fb8';
  ctx.fillRect(0, 0, 120, WORLD_H);
  ctx.fillStyle = '#57a8d8';
  for (let y = 40; y < WORLD_H; y += 130) {
    ctx.fillRect(18, y, 84, 5);
  }
  // Pier planks at the marina.
  ctx.fillStyle = '#8a6f4d';
  ctx.fillRect(100, 1140, 70, 130);
  ctx.fillStyle = '#6b5638';
  for (let y = 1140; y < 1270; y += 16) ctx.fillRect(100, y, 70, 3);
  // Beach sand along the south edge, water beyond it.
  ctx.fillStyle = '#e8d29a';
  ctx.fillRect(0, 2248, WORLD_W, 112);
  ctx.fillStyle = '#2f7fb8';
  ctx.fillRect(0, 2360, WORLD_W, 40);
  ctx.fillStyle = '#57a8d8';
  for (let x = 60; x < WORLD_W; x += 170) ctx.fillRect(x, 2372, 90, 4);
}

function drawRoads(ctx, world) {
  // Sidewalk border, then asphalt, then centre dashes.
  for (const x of AVENUES) {
    ctx.fillStyle = '#c9c2b2';
    ctx.fillRect(x - HALF_ROAD - 12, 0, ROAD_W + 24, WORLD_H);
    ctx.fillStyle = '#3a3f46';
    ctx.fillRect(x - HALF_ROAD, 0, ROAD_W, WORLD_H);
    ctx.fillStyle = '#d8c95a';
    for (let y = 20; y < WORLD_H; y += 56) ctx.fillRect(x - 2, y, 4, 28);
  }
  for (const y of STREETS) {
    ctx.fillStyle = '#c9c2b2';
    ctx.fillRect(0, y - HALF_ROAD - 12, WORLD_W, ROAD_W + 24);
    ctx.fillStyle = '#3a3f46';
    ctx.fillRect(0, y - HALF_ROAD, WORLD_W, ROAD_W);
    ctx.fillStyle = '#d8c95a';
    for (let x = 20; x < WORLD_W; x += 56) ctx.fillRect(x, y - 2, 28, 4);
  }
  // Crosswalks at every intersection.
  ctx.fillStyle = '#e8e8e8';
  for (const x of AVENUES) {
    for (const y of STREETS) {
      for (let i = -3; i <= 3; i += 1) {
        ctx.fillRect(x + i * 12 - 3, y - HALF_ROAD + 4, 6, 12);
        ctx.fillRect(x + i * 12 - 3, y + HALF_ROAD - 16, 6, 12);
      }
    }
  }
}

function drawCity(ctx, world) {
  const { buildings, parks, trees } = world.city;
  for (const park of parks) {
    ctx.fillStyle = park.plaza ? '#b8a888' : '#5d9a4a';
    ctx.fillRect(park.x, park.y, park.w, park.h);
    if (park.plaza) {
      ctx.fillStyle = '#7fb8d8';
      ctx.beginPath();
      ctx.arc(park.x + park.w / 2, park.y + park.h / 2, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#d8e8f0';
      ctx.beginPath();
      ctx.arc(park.x + park.w / 2, park.y + park.h / 2, 16, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Airstrip runway.
  ctx.fillStyle = '#4a4f55';
  ctx.fillRect(2678, 258, 244, 44);
  ctx.fillStyle = '#e8e8e8';
  for (let x = 2690; x < 2900; x += 34) ctx.fillRect(x, 278, 18, 4);
  for (const b of buildings) {
    ctx.fillStyle = '#00000022';
    ctx.fillRect(b.x + 4, b.y + 5, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
    ctx.fillStyle = '#ffffff55';
    const cols = Math.max(1, Math.floor(b.w / 26));
    const rows = Math.max(1, Math.floor(b.h / 26));
    for (let i = 0; i < cols; i += 1) {
      for (let j = 0; j < rows; j += 1) {
        ctx.fillRect(b.x + 12 + i * 26, b.y + 12 + j * 26, 12, 8);
      }
    }
    if (b.label) {
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold 13px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 4);
    }
  }
  for (const t of trees) {
    ctx.fillStyle = t.palm ? '#8a6f4d' : '#6b4a2f';
    ctx.fillRect(t.x - 2, t.y - 2, 4, 4);
    ctx.fillStyle = t.palm ? '#3f9e4d' : '#2f7a38';
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff22';
    ctx.beginPath();
    ctx.arc(t.x - 3, t.y - 3, t.r * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSkids(ctx, world) {
  ctx.strokeStyle = '#22222288';
  ctx.lineWidth = 4;
  for (const s of world.skids) {
    ctx.globalAlpha = Math.min(1, s.life / 6);
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawPickups(ctx, world) {
  for (const pk of world.pickups) {
    if (pk.taken) continue;
    const bob = Math.sin(pk.bob) * 2;
    const y = pk.y + bob;
    if (pk.kind === 'ammo') {
      ctx.fillStyle = '#2f7a38';
      ctx.fillRect(pk.x - 10, y - 8, 20, 16);
      ctx.fillStyle = '#ffd94d';
      ctx.font = `bold 11px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('AMMO', pk.x, y + 4);
    } else if (pk.kind === 'health') {
      ctx.fillStyle = '#e8e8e8';
      ctx.fillRect(pk.x - 10, y - 10, 20, 20);
      ctx.fillStyle = '#d94f3d';
      ctx.fillRect(pk.x - 3, y - 7, 6, 14);
      ctx.fillRect(pk.x - 7, y - 3, 14, 6);
    } else {
      ctx.fillStyle = '#2f9e4d';
      ctx.beginPath();
      ctx.arc(pk.x, y, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold 11px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('$', pk.x, y + 4);
    }
  }
}

function drawMissionMarker(ctx, world) {
  const marker = missionMarker(world);
  if (!marker || world.gameComplete) return;
  const pulse = 1 + Math.sin(world.time * 4) * 0.12;
  ctx.strokeStyle = '#ffd94d';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(marker.x, marker.y, 34 * pulse, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#ffd94d33';
  ctx.beginPath();
  ctx.arc(marker.x, marker.y, 34 * pulse, 0, Math.PI * 2);
  ctx.fill();
  // Beacon column so the marker is visible from across the city.
  ctx.fillStyle = '#ffd94d22';
  ctx.fillRect(marker.x - 10, marker.y - 260, 20, 260);
  // Floating diamond.
  const dy = marker.y - 44 + Math.sin(world.time * 3) * 5;
  ctx.fillStyle = '#ffd94d';
  ctx.beginPath();
  ctx.moveTo(marker.x, dy - 12);
  ctx.lineTo(marker.x + 10, dy);
  ctx.lineTo(marker.x, dy + 12);
  ctx.lineTo(marker.x - 10, dy);
  ctx.closePath();
  ctx.fill();
}

function drawCarShape(ctx, car, isPlayer, time) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  ctx.fillStyle = '#00000033';
  roundRect(ctx, -20, -11, 44, 26, 7);
  ctx.fill();
  ctx.translate(0, -2);
  ctx.fillStyle = car.color;
  roundRect(ctx, -22, -12, 44, 24, 7);
  ctx.fill();
  if (car.kind === 'police') {
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(-6, -12, 12, 24);
    ctx.fillStyle = '#20242e';
    ctx.font = `bold 8px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('PD', 0, 3);
  }
  ctx.fillStyle = '#1c2733';
  roundRect(ctx, -8, -10, 14, 20, 3);
  ctx.fill();
  ctx.fillStyle = '#9fc4d8';
  roundRect(ctx, -5, -9, 8, 18, 2);
  ctx.fill();
  // Headlights.
  ctx.fillStyle = '#fff6b0';
  ctx.fillRect(20, -10, 3, 5);
  ctx.fillRect(20, 5, 3, 5);
  // Damage smoke is a particle; a wrecked car gets a dark hood.
  if (car.health < 55) {
    ctx.fillStyle = '#00000055';
    roundRect(ctx, 8, -12, 14, 24, 7);
    ctx.fill();
  }
  if (car.kind === 'police') {
    const flash = Math.floor(time * 4) % 2 === 0;
    ctx.fillStyle = flash ? '#ff2d2d' : '#2d6bff';
    ctx.fillRect(-2, -12, 5, 5);
    ctx.fillStyle = flash ? '#2d6bff' : '#ff2d2d';
    ctx.fillRect(-2, 7, 5, 5);
  }
  if (isPlayer) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    roundRect(ctx, -25, -15, 50, 30, 9);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCars(ctx, world) {
  for (const car of world.cars) {
    drawCarShape(ctx, car, car === world.player.car, world.time);
  }
}

function drawPeds(ctx, world) {
  for (const ped of world.peds) {
    if (ped.driving) continue;
    ctx.save();
    ctx.translate(ped.x, ped.y);
    if (ped.state === 'down') {
      ctx.rotate(ped.angle + Math.PI / 2);
      ctx.fillStyle = ped.shirt;
      roundRect(ctx, -7, -4, 14, 8, 3);
      ctx.fill();
      ctx.fillStyle = ped.color;
      ctx.beginPath();
      ctx.arc(11, 0, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      continue;
    }
    const bob = Math.sin(ped.walkPhase) * 2;
    ctx.rotate(ped.angle);
    ctx.fillStyle = ped.shirt;
    roundRect(ctx, -6, -5 + bob * 0.3, 12, 10, 4);
    ctx.fill();
    ctx.fillStyle = ped.color;
    ctx.beginPath();
    ctx.arc(9, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawPlayer(ctx, world) {
  const p = world.player;
  if (!p.onFoot || world.wasted) return;
  ctx.save();
  ctx.translate(p.x, p.y);
  const bob = Math.sin(p.walkPhase) * 2;
  ctx.rotate(p.angle);
  // Shadow.
  ctx.fillStyle = '#00000033';
  ctx.beginPath();
  ctx.ellipse(0, 2, 12, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  // Rook: teal jacket, dark cap.
  ctx.fillStyle = '#1f9e8a';
  roundRect(ctx, -7, -6 + bob * 0.3, 14, 12, 5);
  ctx.fill();
  ctx.fillStyle = '#e8b88a';
  ctx.beginPath();
  ctx.arc(10, 0, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#20242e';
  ctx.beginPath();
  ctx.arc(10, -1, 6, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBullets(ctx, world) {
  ctx.strokeStyle = '#ffd94d';
  ctx.lineWidth = 2;
  for (const b of world.bullets) {
    ctx.beginPath();
    ctx.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
}

function drawParticles(ctx, world) {
  for (const pt of world.particles) {
    ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawHud(ctx, world) {
  const p = world.player;
  // Health bar.
  ctx.fillStyle = '#00000088';
  roundRect(ctx, 16, 16, 220, 22, 6);
  ctx.fill();
  ctx.fillStyle = world.health > 50 ? '#4fbf5a' : world.health > 25 ? '#e8a33a' : '#d94f3d';
  roundRect(ctx, 20, 20, 212 * (world.health / 100), 14, 4);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 13px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText(`HEALTH ${Math.ceil(world.health)}`, 24, 31);
  // Money.
  ctx.fillStyle = '#00000088';
  roundRect(ctx, 16, 46, 220, 30, 6);
  ctx.fill();
  ctx.fillStyle = '#7ddb8a';
  ctx.font = `bold 18px ${FONT}`;
  ctx.fillText(`$${world.money.toLocaleString('en-US')}`, 24, 67);
  ctx.fillStyle = '#ffffff';
  ctx.font = `12px ${FONT}`;
  ctx.fillText(p.onFoot ? 'ON FOOT' : `DRIVING  ${Math.round(Math.abs(p.car ? p.car.speed * 0.24 : 0))} mph`, 150, 67);
  // Wanted stars, top right.
  ctx.fillStyle = '#00000088';
  roundRect(ctx, VIEW_W - 216, 16, 200, 34, 6);
  ctx.fill();
  ctx.font = '22px sans-serif';
  ctx.textAlign = 'left';
  for (let i = 0; i < 5; i += 1) {
    ctx.fillStyle = i < world.wanted ? '#ffd94d' : '#ffffff33';
    ctx.fillText('★', VIEW_W - 206 + i * 36, 42);
  }
  // Ammo, bottom left.
  ctx.fillStyle = '#00000088';
  roundRect(ctx, 16, VIEW_H - 56, 170, 40, 6);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 16px ${FONT}`;
  ctx.fillText(p.onFoot ? `PISTOL  ${world.ammoMag} / ${world.ammoReserve}` : 'E — LEAVE CAR', 26, VIEW_H - 30);
  // Objective banner, top centre.
  const objective = currentObjective(world);
  ctx.font = `bold 15px ${FONT}`;
  const ow = ctx.measureText(objective).width + 28;
  ctx.fillStyle = '#00000099';
  roundRect(ctx, (VIEW_W - ow) / 2, 16, ow, 30, 6);
  ctx.fill();
  ctx.fillStyle = '#ffd94d';
  ctx.textAlign = 'center';
  ctx.fillText(objective, VIEW_W / 2, 36);
  // Mission title line under it.
  const mission = currentMission(world);
  if (mission) {
    ctx.fillStyle = '#ffffffcc';
    ctx.font = `12px ${FONT}`;
    ctx.fillText(mission.title.toUpperCase(), VIEW_W / 2, 62);
  }
  // Toasts, bottom centre-left.
  ctx.textAlign = 'left';
  let ty = VIEW_H - 110;
  for (const m of world.messages) {
    ctx.globalAlpha = Math.min(1, m.t);
    ctx.fillStyle = '#000000aa';
    const mw = ctx.measureText(m.text).width + 20;
    roundRect(ctx, 16, ty, mw, 26, 6);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `13px ${FONT}`;
    ctx.fillText(m.text, 26, ty + 18);
    ty -= 32;
  }
  ctx.globalAlpha = 1;
  drawMinimap(ctx, world);
}

function drawMinimap(ctx, world) {
  const mw = 220;
  const mh = 158;
  const mx = VIEW_W - mw - 16;
  const my = VIEW_H - mh - 16;
  const sx = mw / WORLD_W;
  const sy = mh / WORLD_H;
  ctx.fillStyle = '#10141bcc';
  roundRect(ctx, mx - 6, my - 6, mw + 12, mh + 12, 8);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.rect(mx, my, mw, mh);
  ctx.clip();
  ctx.fillStyle = '#233d22';
  ctx.fillRect(mx, my, mw, mh);
  ctx.fillStyle = '#2f7fb8';
  ctx.fillRect(mx, my, 120 * sx, mh);
  ctx.fillStyle = '#e8d29a';
  ctx.fillRect(mx, my + 2248 * sy, mw, mh - 2248 * sy);
  ctx.strokeStyle = '#5a5f66';
  ctx.lineWidth = 3;
  for (const x of AVENUES) {
    ctx.beginPath();
    ctx.moveTo(mx + x * sx, my);
    ctx.lineTo(mx + x * sx, my + mh);
    ctx.stroke();
  }
  for (const y of STREETS) {
    ctx.beginPath();
    ctx.moveTo(mx, my + y * sy);
    ctx.lineTo(mx + mw, my + y * sy);
    ctx.stroke();
  }
  ctx.fillStyle = '#8a8f96';
  for (const b of world.city.buildings) {
    ctx.fillRect(mx + b.x * sx, my + b.y * sy, Math.max(2, b.w * sx), Math.max(2, b.h * sy));
  }
  // Mission marker.
  const marker = missionMarker(world);
  if (marker && !world.gameComplete) {
    ctx.fillStyle = '#ffd94d';
    ctx.beginPath();
    ctx.arc(mx + marker.x * sx, my + marker.y * sy, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffd94d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(mx + marker.x * sx, my + marker.y * sy, 9 + Math.sin(world.time * 4) * 2, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Police, red dots.
  ctx.fillStyle = '#ff3b30';
  for (const car of world.police) {
    ctx.beginPath();
    ctx.arc(mx + car.x * sx, my + car.y * sy, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Traffic, faint dots.
  ctx.fillStyle = '#ffffff66';
  for (const car of world.cars) {
    if (car.kind !== 'traffic') continue;
    ctx.fillRect(mx + car.x * sx - 1, my + car.y * sy - 1, 2, 2);
  }
  // Player arrow.
  const p = world.player;
  ctx.save();
  ctx.translate(mx + p.x * sx, my + p.y * sy);
  ctx.rotate(p.angle);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(7, 0);
  ctx.lineTo(-5, -4);
  ctx.lineTo(-5, 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // Viewport rectangle.
  ctx.strokeStyle = '#ffffff88';
  ctx.lineWidth = 1;
  const cam = { x: clamp(p.x, VIEW_W / 2 - 80, WORLD_W - VIEW_W / 2 + 80), y: clamp(p.y, VIEW_H / 2 - 80, WORLD_H - VIEW_H / 2 + 80) };
  ctx.strokeRect(mx + (cam.x - VIEW_W / 2) * sx, my + (cam.y - VIEW_H / 2) * sy, VIEW_W * sx, VIEW_H * sy);
  ctx.restore();
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 11px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText('VERDE BAY', mx, my - 10);
}

function drawTitle(ctx, world) {
  ctx.fillStyle = '#0b1020aa';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd94d';
  ctx.font = `bold 22px ${FONT}`;
  ctx.fillText('WELCOME TO', VIEW_W / 2, 150);
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 84px ${FONT}`;
  ctx.fillText('STREETS OF', VIEW_W / 2, 240);
  ctx.fillStyle = '#ffd94d';
  ctx.font = `bold 84px ${FONT}`;
  ctx.fillText('VERDE BAY', VIEW_W / 2, 330);
  ctx.fillStyle = '#ffffffcc';
  ctx.font = `20px ${FONT}`;
  ctx.fillText('A sun-soaked open-world crime story — steal cars, dodge the law, run the jobs.', VIEW_W / 2, 380);
  const save = loadSave();
  const blink = Math.floor(world.time * 2) % 2 === 0;
  ctx.font = `bold 26px ${FONT}`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(save ? 'CLICK OR PRESS ENTER — CONTINUE' : 'CLICK OR PRESS ENTER — NEW GAME', VIEW_W / 2, 470);
  if (blink) {
    ctx.fillStyle = '#ffd94d';
    ctx.font = `bold 18px ${FONT}`;
    ctx.fillText('▶  START YOUR ENGINE', VIEW_W / 2, 510);
  }
  ctx.fillStyle = '#ffffff99';
  ctx.font = `15px ${FONT}`;
  const lines = [
    'WASD / ARROWS — move & drive      E — enter / exit car      F or CLICK — punch / shoot',
    'R — reload      P / ESC — pause      M — mute      The yellow marker is your next job.',
  ];
  ctx.fillText(lines[0], VIEW_W / 2, 580);
  ctx.fillText(lines[1], VIEW_W / 2, 606);
  if (save) {
    ctx.fillStyle = '#7ddb8a';
    ctx.fillText(`Saved game: $${save.money} — job ${Math.min(save.missionIndex + 1, 4)} of 4`, VIEW_W / 2, 648);
  }
}

function drawPause(ctx, world) {
  ctx.fillStyle = '#0b1020bb';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 56px ${FONT}`;
  ctx.fillText('PAUSED', VIEW_W / 2, 300);
  ctx.fillStyle = '#ffffffcc';
  ctx.font = `20px ${FONT}`;
  ctx.fillText('P / ESC — resume      S — save game      Q — quit to title', VIEW_W / 2, 360);
  ctx.fillText('Your progress saves automatically after every job.', VIEW_W / 2, 396);
}

function drawWasted(ctx, world) {
  ctx.fillStyle = '#40000099';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ff3b30';
  ctx.font = `bold 96px ${FONT}`;
  ctx.fillText('WASTED', VIEW_W / 2, 360);
  ctx.fillStyle = '#ffffff';
  ctx.font = `22px ${FONT}`;
  ctx.fillText('Press any key to wake up at Verde General Hospital (-$200)', VIEW_W / 2, 420);
}

function drawComplete(ctx, world) {
  ctx.fillStyle = '#0b1020d9';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd94d';
  ctx.font = `bold 64px ${FONT}`;
  ctx.fillText('VERDE BAY LEGEND', VIEW_W / 2, 280);
  ctx.fillStyle = '#ffffff';
  ctx.font = `24px ${FONT}`;
  ctx.fillText('All four jobs done. The crew is gone — and so is the heat.', VIEW_W / 2, 340);
  ctx.font = `20px ${FONT}`;
  ctx.fillText(`Final cash: $${world.money.toLocaleString('en-US')}    Cars stolen: ${world.stats.carsStolen}    Shots fired: ${world.stats.shotsFired}`, VIEW_W / 2, 400);
  ctx.fillStyle = '#7ddb8a';
  ctx.font = `bold 22px ${FONT}`;
  ctx.fillText('ENTER — keep roaming Verde Bay      Q — back to title', VIEW_W / 2, 470);
}
