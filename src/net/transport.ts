// Message transports. Same interface for same-machine tabs (BroadcastChannel) and real
// cross-machine play (PeerJS / WebRTC data channels). One player hosts; the others join.

export interface Transport {
  id: string;
  isHost: boolean;
  room: string;
  kind: 'local' | 'webrtc' | 'memory';
  /** to = undefined: broadcast (host -> everyone, client -> host) */
  send(msg: any, to?: string): void;
  onMessage: (from: string, msg: any) => void;
  onPeer: (id: string, joined: boolean) => void;
  close(): void;
  /** bytes sent, for the overlay */
  sentBytes: number;
}

export const randomId = () => Math.random().toString(36).slice(2, 8);
export const roomCode = () => Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]).join('');

/** Same-machine tabs: one BroadcastChannel per room. Heartbeats detect closed tabs. */
export class LocalTransport implements Transport {
  kind = 'local' as const;
  ch: BroadcastChannel;
  onMessage: (from: string, msg: any) => void = () => {};
  onPeer: (id: string, joined: boolean) => void = () => {};
  sentBytes = 0;
  private seen = new Map<string, number>();
  private hb: any;
  constructor(public room: string, public isHost: boolean, public id = isHost ? 'host' : 'p-' + randomId()) {
    this.ch = new BroadcastChannel('tunnels-' + room);
    this.ch.onmessage = (e) => {
      const { from, to, msg } = e.data;
      if (from === this.id) return;
      if (to && to !== this.id) return;
      if (!this.isHost && from !== 'host') return; // clients only listen to the host
      if (!this.seen.has(from)) this.onPeer(from, true);
      this.seen.set(from, performance.now());
      if (msg.t !== 'hb') this.onMessage(from, msg);
    };
    this.hb = setInterval(() => {
      this.send({ t: 'hb' });
      const now = performance.now();
      for (const [p, t] of this.seen)
        if (now - t > 6000) {
          this.seen.delete(p);
          this.onPeer(p, false);
        }
    }, 1000);
    addEventListener('beforeunload', () => this.send({ t: 'bye' }));
  }
  send(msg: any, to?: string) {
    const data = { from: this.id, to: to ?? (this.isHost ? undefined : 'host'), msg };
    this.ch.postMessage(data);
    this.sentBytes += 64; // structured clone: size not exposed; counted roughly per message
  }
  close() {
    clearInterval(this.hb);
    this.ch.close();
  }
}

/**
 * Cross-machine play over WebRTC using PeerJS's free public signalling server. The host's peer id
 * is derived from the room code. Untested in the build container (no outbound WebRTC there).
 */
export class PeerTransport implements Transport {
  kind = 'webrtc' as const;
  onMessage: (from: string, msg: any) => void = () => {};
  onPeer: (id: string, joined: boolean) => void = () => {};
  sentBytes = 0;
  id: string;
  peer: any;
  conns = new Map<string, any>();
  ready: Promise<void>;
  constructor(public room: string, public isHost: boolean) {
    this.id = isHost ? 'host' : 'p-' + randomId();
    this.ready = (async () => {
      const { Peer } = await import('peerjs');
      const pid = isHost ? 'tunnels-' + room : undefined;
      this.peer = new (Peer as any)(pid, { debug: 1 });
      await new Promise<void>((res, rej) => {
        this.peer.on('open', () => res());
        this.peer.on('error', (e: any) => rej(e));
      });
      if (isHost) {
        this.peer.on('connection', (c: any) => this.wire(c));
      } else {
        const c = this.peer.connect('tunnels-' + room, { reliable: true, metadata: { id: this.id } });
        await new Promise<void>((res) => c.on('open', () => res()));
        this.wire(c, 'host');
      }
    })();
  }
  private wire(c: any, forcedId?: string) {
    const id = forcedId ?? c.metadata?.id ?? c.peer;
    this.conns.set(id, c);
    this.onPeer(id, true);
    c.on('data', (d: any) => this.onMessage(id, d));
    c.on('close', () => {
      this.conns.delete(id);
      this.onPeer(id, false);
    });
  }
  send(msg: any, to?: string) {
    if (to) this.conns.get(to)?.send(msg);
    else for (const c of this.conns.values()) c.send(msg);
  }
  close() {
    this.peer?.destroy();
  }
}

/** In-process transport pair for Node tests. */
export class MemoryHub {
  nodes = new Map<string, MemoryTransport>();
  queue: { from: string; to: string; msg: any }[] = [];
  deliver() {
    const q = this.queue;
    this.queue = [];
    for (const m of q) this.nodes.get(m.to)?.onMessage(m.from, structuredClone(m.msg));
  }
}
export class MemoryTransport implements Transport {
  kind = 'memory' as const;
  room = 'mem';
  onMessage: (from: string, msg: any) => void = () => {};
  onPeer: (id: string, joined: boolean) => void = () => {};
  sentBytes = 0;
  constructor(public hub: MemoryHub, public id: string, public isHost: boolean) {
    hub.nodes.set(id, this);
    if (!isHost) setTimeout(() => hub.nodes.get('host')?.onPeer(id, true), 0);
  }
  send(msg: any, to?: string) {
    const targets = to ? [to] : this.isHost ? [...this.hub.nodes.keys()].filter((k) => k !== this.id) : ['host'];
    for (const t of targets) this.hub.queue.push({ from: this.id, to: t, msg });
    this.sentBytes += JSON.stringify(msg).length;
  }
  close() {
    this.hub.nodes.delete(this.id);
  }
}
