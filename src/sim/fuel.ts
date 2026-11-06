import { FUEL } from '../config';
import { Events } from '../core/events';

/** The one shared fuel pool: weapon, light, respawn and clock (GDD pillar 5). */
export class Fuel {
  value = FUEL.start;
  spent: Record<string, number> = {};
  gained: Record<string, number> = {};
  out = false;
  /** last-minute spend, for the director's intensity */
  recent: { t: number; a: number }[] = [];
  constructor(public events: Events) {}

  drain(amount: number, reason: string, time = 0) {
    if (amount <= 0 || this.out) return;
    this.value -= amount;
    this.spent[reason] = (this.spent[reason] || 0) + amount;
    this.recent.push({ t: time, a: amount });
    if (this.recent.length > 4000) this.recent.splice(0, 2000);
    if (this.value <= 0) {
      this.value = 0;
      this.out = true;
      this.events.emit('fuelOut', {});
    }
  }
  /** Can we afford this right now? */
  has(amount: number) {
    return !this.out && this.value >= amount;
  }
  add(amount: number, reason: string) {
    if (amount <= 0) return;
    this.value += amount;
    this.gained[reason] = (this.gained[reason] || 0) + amount;
  }
  spentLastMinute(time: number) {
    let s = 0;
    for (const r of this.recent) if (time - r.t < 60) s += r.a;
    return s;
  }
}
