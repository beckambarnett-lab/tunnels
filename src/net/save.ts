import type { World } from '../sim/world';
import { fullSnapshot } from './serialize';
import { NetSession } from './session';
import { MemoryHub, MemoryTransport } from './transport';

const KEY = 'tunnels-save';

/**
 * Save / load (GDD "Save and pause"): a snapshot of world state (every dug cell, lights, wires,
 * fuel, queen memory and director state), stored in the browser or exported as a file.
 * Loading marks the run as continued from a save, so it can only reach the bad ending (M5).
 */
export function makeSave(w: World, pristine: Uint8Array) {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    snap: fullSnapshot(w, pristine),
    learning: { unlocked: [...w.learning.unlocked], habits: { ...w.learning.habits, campSpots: [...w.learning.habits.campSpots.entries()] } },
    director: { state: w.director.state, act: w.director.act },
    queen: w.queen ? { chosen: w.queen.chosen, lastChosenAt: w.queen.lastChosenAt, memory: Array.from(w.queen.influence.memory) } : null,
    fuelSpent: w.fuel.spent,
    usedSave: true,
  };
}

export function saveToBrowser(w: World, pristine: Uint8Array) {
  try {
    localStorage.setItem(KEY, JSON.stringify(makeSave(w, pristine)));
    return true;
  } catch {
    return false;
  }
}

export function exportFile(w: World, pristine: Uint8Array) {
  const blob = new Blob([JSON.stringify(makeSave(w, pristine))], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `tunnels-save-${Date.now()}.json`;
  a.click();
}

export function readBrowserSave(key = KEY): any | null {
  try {
    const s = localStorage.getItem(key);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

/** Restore a save into a freshly constructed (same-seed) authoritative world. */
export function applySave(w: World, save: any) {
  // reuse the client-side snapshot application, then restore the host-only minds
  const s = new NetSession(new MemoryTransport(new MemoryHub(), 'load', true), w, 'load', null);
  s.applyWelcome(w, save.snap);
  w.players.forEach((p) => (p.connected = p.id === 'local' || p.id === 'host'));
  for (const u of save.learning?.unlocked ?? []) w.learning.unlocked.add(u);
  if (save.learning?.habits) Object.assign(w.learning.habits, { ...save.learning.habits, campSpots: new Map(save.learning.habits.campSpots) });
  if (save.director) {
    w.director.act = save.director.act;
    w.director.state = save.director.state;
    w.director.since = w.time;
  }
  if (save.queen && w.queen) {
    w.queen.chosen = save.queen.chosen;
    w.queen.lastChosenAt = save.queen.lastChosenAt;
    w.queen.influence.memory.set(save.queen.memory);
  }
  Object.assign(w.fuel.spent, save.fuelSpent ?? {});
  w.usedSave = true;
}
