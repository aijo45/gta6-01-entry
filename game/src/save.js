// Save and load through localStorage: money, mission progress and position.
// A save never carries the wanted level (you always start clean).
const KEY = 'verde-bay-save-v1';

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return data;
  } catch {
    return null;
  }
}

export function writeSave(state) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({
      money: state.money,
      missionIndex: state.missionIndex,
      missionsDone: state.missionsDone,
      playerX: state.player.x,
      playerY: state.player.y,
      health: state.player.health,
      ammoReserve: state.ammoReserve,
      savedAt: Date.now(),
    }));
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Storage unavailable; the game still runs.
  }
}
