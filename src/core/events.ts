// Tiny typed-ish event bus. Sim systems emit; render/audio/net listen.
type Fn = (data: any) => void;
export class Events {
  private map = new Map<string, Fn[]>();
  on(name: string, fn: Fn) {
    if (!this.map.has(name)) this.map.set(name, []);
    this.map.get(name)!.push(fn);
    return () => this.off(name, fn);
  }
  off(name: string, fn: Fn) {
    const l = this.map.get(name);
    if (l) this.map.set(name, l.filter((f) => f !== fn));
  }
  emit(name: string, data?: any) {
    const l = this.map.get(name);
    if (l) for (const f of l) f(data);
  }
}
