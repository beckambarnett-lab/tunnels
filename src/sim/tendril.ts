import type { FieldParams } from './flowfield';
import type { Field } from './fieldManager';

/** pest: the act-1 house infestation, acting like ordinary bugs (see HouseInfestation) */
export type TendrilMode = 'idle' | 'mass' | 'strike' | 'retreat' | 'pest';

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
  holdDist: number; // massing tendrils wait this far (m) from the goal point until they strike
  sepMul: number; // separation multiplier (spreading out against fire)
  aliMul: number; // alignment multiplier (conceal: slightly too organised)
  probeAmp: number; // scouts tap into the light and retreat (tolerance oscillation)
  attackDevice: number | null; // fixture this tendril attacks (siege, generator sabotage)
  breakRitual?: string | null; // hive player whose respawn ritual this tendril breaks up
  carryTarget?: string | null; // downed player this carrier group lifts
  /** striking through an opening: when to go (nearest first), whom, and when to give up */
  strike?: { openingId: number; kind: string; targetId: string; at: number; until: number } | null;
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
    holdDist: 3.5,
    sepMul: 1,
    aliMul: 1,
    probeAmp: 0,
    attackDevice: null,
    born: 0,
    modeSince: 0,
    ...over,
  };
}
