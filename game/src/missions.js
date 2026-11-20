// The story: four jobs for Rook, a wheelman for the Verde Bay crew. Each mission
// has a briefing, an objective, a map marker and a payout. The module owns the
// mission state machine; the world calls updateMissions once a step.
import { PLACES } from './city.js';
import { dist } from './rng.js';
import { addMessage, emit } from './world.js';
import { gainWanted } from './police.js';

export const MISSIONS = [
  {
    id: 'pickup',
    title: '1 · The Pickup',
    briefing: 'Marla needs a package moved. Pick it up at the Marina pier — walk into the yellow marker and hold still.',
    objective: 'Pick up the package at Verde Marina',
    target: { x: PLACES.marina.x, y: PLACES.marina.y },
    radius: 46,
    dwell: 1.5,
    payout: 200,
  },
  {
    id: 'delivery',
    title: '2 · Cross-Town Delivery',
    briefing: 'The package goes to Northside Garage, across town. Three minutes, no excuses. A car would help.',
    objective: 'Deliver the package to Northside Garage',
    target: { x: PLACES.garage.x, y: PLACES.garage.y },
    radius: 56,
    timer: 180,
    payout: 400,
  },
  {
    id: 'heat',
    title: '3 · Heat',
    briefing: 'Someone talked. The precinct is on you — three stars. Lose them all and meet Marla at Bay Plaza.',
    objective: 'Lose the wanted level — get to 0 stars',
    target: { x: PLACES.plaza.x, y: PLACES.plaza.y },
    radius: 60,
    payout: 600,
    onStart(world) {
      gainWanted(world, 3, 'the job went loud');
    },
  },
  {
    id: 'getaway',
    title: '4 · The Getaway',
    briefing: 'Last job: the crew is leaving Verde Bay tonight. Get to the airstrip — with the cops on your tail.',
    objective: 'Reach the Verde Bay Airstrip',
    target: { x: PLACES.airstrip.x, y: PLACES.airstrip.y },
    radius: 70,
    payout: 1000,
    onStart(world) {
      gainWanted(world, 2, 'the getaway');
    },
  },
];

/** The mission bookkeeping on the world (created by resetWorld). */
export function missionState(world) {
  if (!world._mission) {
    world._mission = {
      started: false,
      dwell: 0,
      timerLeft: 0,
      reset() {
        this.started = false;
        this.dwell = 0;
        this.timerLeft = 0;
      },
    };
  }
  return world._mission;
}

export function currentMission(world) {
  return world.missionIndex < MISSIONS.length ? MISSIONS[world.missionIndex] : null;
}

export function currentObjective(world) {
  const mission = currentMission(world);
  if (!mission) return 'Verde Bay is yours. Free roam.';
  const state = missionState(world);
  if (mission.timer && state.started) {
    const t = Math.max(0, Math.ceil(state.timerLeft));
    return `${mission.objective} — ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  }
  return mission.objective;
}

export function missionMarker(world) {
  const mission = currentMission(world);
  return mission ? mission.target : null;
}

export function updateMissions(world, dt) {
  const mission = currentMission(world);
  if (!mission || world.wasted || world.gameComplete) return;
  const state = missionState(world);
  if (!state.started) {
    state.started = true;
    state.dwell = 0;
    state.timerLeft = mission.timer ?? 0;
    if (mission.onStart) mission.onStart(world);
    addMessage(world, `${mission.title}: ${mission.briefing}`);
    emit(world, 'mission-start', { id: mission.id, title: mission.title });
    return;
  }
  if (mission.timer) {
    state.timerLeft -= dt;
    if (state.timerLeft <= 0) {
      state.reset();
      addMessage(world, 'Too slow — Marla is not happy. The job is back on.');
      emit(world, 'mission-fail', { id: mission.id });
      return;
    }
  }
  const p = world.player;
  const d = dist(p.x, p.y, mission.target.x, mission.target.y);
  if (mission.id === 'heat') {
    // Complete by losing the heat, then reaching the plaza.
    if (world.wanted === 0 && d < mission.radius) completeMission(world, mission);
    return;
  }
  if (d < mission.radius) {
    if (mission.dwell) {
      state.dwell += dt;
      if (state.dwell >= mission.dwell) completeMission(world, mission);
    } else {
      completeMission(world, mission);
    }
  } else {
    state.dwell = 0;
  }
}

function completeMission(world, mission) {
  world.money += mission.payout;
  world.missionsDone += 1;
  world.stats.missionsPaid += mission.payout;
  world.missionIndex += 1;
  missionState(world).reset();
  addMessage(world, `Job done — +$${mission.payout}. ${world.missionIndex >= MISSIONS.length ? 'That is the whole story.' : 'Next job is on the board.'}`);
  emit(world, 'mission-complete', { id: mission.id, payout: mission.payout });
  if (world.missionIndex >= MISSIONS.length) {
    world.gameComplete = true;
    emit(world, 'game-complete', { money: world.money });
  }
}
