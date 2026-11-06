import type { FieldParams } from './flowfield';
import type { Field } from './fieldManager';

export type TendrilMode = 'idle' | 'mass' | 'strike' | 'retreat';

/**
 * A tendril: 20-200 bugs following one goal through one shared flow field.
 * The queen sets goal + mode + field params; bugs only steer.
 */
export interface Tendril {
  id: number;
  intent: string; // the queen intent this tendril serves
  mode: TendrilMode;
  fieldName: string; // tendrils with the same fieldName + params share one field
  goals: number[]; // goal nodes
  gx: number; // goal point in world metres (final approach)
  gz: number;
  params: FieldParams;
  field: Field | null;
  size: number; // target member count
  members: number; // current member count
  speedMul: number;
  braveness: number; // light tolerance multiplier (siege raises it)
  targetId?: string;
  born: number;
  modeSince: number;
}

let nextId = 1;
export function makeTendril(over: Partial<Tendril> & { params: FieldParams }): Tendril {
  return {
    id: nextId++,
    intent: 'probe',
    mode: 'mass',
    fieldName: 'none',
    goals: [],
    gx: 0,
    gz: 0,
    field: null,
    size: 50,
    members: 0,
    speedMul: 1,
    braveness: 1,
    born: 0,
    modeSince: 0,
    ...over,
  };
}
