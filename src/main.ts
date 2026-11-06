import { Game } from './game/game';
import { SWARM } from './config';
import { showLobby, LobbyChoice } from './game/lobby';
import { LocalTransport, PeerTransport, Transport } from './net/transport';
import { NetSession } from './net/session';

const q = new URLSearchParams(location.search);
const base = {
  seed: +(q.get('seed') || 1),
  bench: q.has('bench'),
  bugs: +(q.get('bugs') || SWARM.defaultBugs),
  auto: q.has('auto'),
  act: q.has('act') ? +q.get('act')! : undefined,
  res: q.has('res') ? +q.get('res')! : undefined,
};
const canvas = document.getElementById('game') as HTMLCanvasElement;

async function start() {
  let choice: LobbyChoice;
  if (q.has('host')) choice = { mode: 'host', net: (q.get('net') as any) || 'local', room: (q.get('host') || 'TEST').toUpperCase() };
  else if (q.has('join')) choice = { mode: 'join', net: (q.get('net') as any) || 'local', room: (q.get('join') || 'TEST').toUpperCase() };
  else if ([...q.keys()].length) choice = { mode: 'solo' };
  else choice = await showLobby();

  if (choice.mode === 'solo') {
    new Game(canvas, { ...base, role: 'solo' }).start();
    return;
  }
  const t: Transport = choice.net === 'local' ? new LocalTransport(choice.room, choice.mode === 'host') : new PeerTransport(choice.room, choice.mode === 'host');
  if (t instanceof PeerTransport) await t.ready;
  if (choice.mode === 'host') {
    const session = new NetSession(t, null, 'host', null);
    new Game(canvas, { ...base, role: 'host', session, room: choice.room }).start();
  } else {
    const session = new NetSession(t, null, t.id, null);
    const msg = document.getElementById('menu')!;
    msg.style.display = 'flex';
    msg.innerHTML = `<div class="lobby"><h1>TUNNELS</h1><div class="tag">Joining room ${choice.room}…</div></div>`;
    session.onWelcome = (snap, you) => {
      msg.style.display = 'none';
      new Game(canvas, { ...base, seed: snap.seed, bugs: snap.targetBugs, role: 'client', session, snapshot: snap, localId: you, room: choice.room }).start();
    };
  }
}
start();
