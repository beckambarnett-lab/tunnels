export { asciiLayout } from '../src/sim/layouts';

/** An open rectangular room of w x h cells. */
export function room(w: number, h: number): string[] {
  return Array.from({ length: h }, () => '.'.repeat(w));
}
