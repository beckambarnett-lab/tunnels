import { Game } from './game/game';
import { SWARM } from './config';

const q = new URLSearchParams(location.search);
const opts = {
  seed: +(q.get('seed') || 1),
  bench: q.has('bench'),
  bugs: +(q.get('bugs') || SWARM.defaultBugs),
  auto: q.has('auto'),
  act: q.has('act') ? +q.get('act')! : undefined,
  res: q.has('res') ? +q.get('res')! : undefined,
};
const game = new Game(document.getElementById('game') as HTMLCanvasElement, opts);
game.start();
