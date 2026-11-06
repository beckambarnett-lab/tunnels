// Uniform bucket grid for boids neighbour checks (never every-bug-against-every-bug).
// Rebuilt every frame with a linked list in flat typed arrays: O(n).
export class SpatialHash {
  head: Int32Array;
  next: Int32Array;
  bw: number;
  bh: number;
  constructor(public worldW: number, public worldH: number, public size: number, maxItems: number) {
    this.bw = Math.ceil(worldW / size) + 1;
    this.bh = Math.ceil(worldH / size) + 1;
    this.head = new Int32Array(this.bw * this.bh).fill(-1);
    this.next = new Int32Array(maxItems).fill(-1);
  }
  bucket(x: number, z: number) {
    let bx = Math.floor(x / this.size), bz = Math.floor(z / this.size);
    if (bx < 0) bx = 0;
    else if (bx >= this.bw) bx = this.bw - 1;
    if (bz < 0) bz = 0;
    else if (bz >= this.bh) bz = this.bh - 1;
    return bz * this.bw + bx;
  }
  clear() {
    this.head.fill(-1);
  }
  insert(i: number, x: number, z: number) {
    const b = this.bucket(x, z);
    this.next[i] = this.head[b];
    this.head[b] = i;
  }
  /** Calls fn(j) for every item in buckets overlapping the circle. Caller filters by distance. */
  forEachNear(x: number, z: number, r: number, fn: (j: number) => boolean | void) {
    const s = this.size;
    const bx0 = Math.max(0, Math.floor((x - r) / s)), bx1 = Math.min(this.bw - 1, Math.floor((x + r) / s));
    const bz0 = Math.max(0, Math.floor((z - r) / s)), bz1 = Math.min(this.bh - 1, Math.floor((z + r) / s));
    for (let bz = bz0; bz <= bz1; bz++)
      for (let bx = bx0; bx <= bx1; bx++) {
        let j = this.head[bz * this.bw + bx];
        while (j >= 0) {
          if (fn(j) === true) return;
          j = this.next[j];
        }
      }
  }
}
