import { roomCode } from '../net/transport';

export type LobbyChoice =
  | { mode: 'solo' }
  | { mode: 'host'; net: 'local' | 'webrtc'; room: string }
  | { mode: 'join'; net: 'local' | 'webrtc'; room: string };

/** Title menu: solo, or host/join with a short room code (same machine tabs or online). */
export function showLobby(): Promise<LobbyChoice> {
  const el = document.getElementById('menu')!;
  el.innerHTML = `
    <div class="lobby">
      <h1>TUNNELS</h1>
      <div class="tag">Xterminator's — "Bugs worst nightmare"</div>
      <button data-a="solo">Play solo</button>
      <div class="row"><button data-a="host-local">Host (tabs on this machine)</button><button data-a="host-webrtc">Host online</button></div>
      <div class="row"><input id="room" maxlength="4" placeholder="CODE" /><button data-a="join-local">Join (this machine)</button><button data-a="join-webrtc">Join online</button></div>
      <div class="hint">Online play uses WebRTC with PeerJS's free public signalling server.</div>
    </div>`;
  el.style.display = 'flex';
  return new Promise((res) => {
    el.querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', () => {
        const a = (b as HTMLElement).dataset.a!;
        const code = ((el.querySelector('#room') as HTMLInputElement).value || '').toUpperCase();
        el.style.display = 'none';
        if (a === 'solo') res({ mode: 'solo' });
        else if (a.startsWith('host')) res({ mode: 'host', net: a.endsWith('local') ? 'local' : 'webrtc', room: roomCode() });
        else res({ mode: 'join', net: a.endsWith('local') ? 'local' : 'webrtc', room: code });
      }),
    );
  });
}
