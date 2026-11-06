import { DEBUG_VIEWS, DebugView } from '../render/debugViews';

export interface PanelState {
  view: DebugView;
  topDown: boolean;
  god: boolean;
  breaches: boolean;
  bugs: number;
  intent: string;
}

/** Debug panel: field views, top-down camera, bug-count slider, god mode, breach switch. */
export class Panel {
  el: HTMLElement;
  state: PanelState;
  onChange: (s: PanelState) => void = () => {};
  private slider!: HTMLInputElement;
  private label!: HTMLElement;
  private viewBtns: HTMLButtonElement[] = [];
  constructor(initialBugs: number) {
    this.el = document.getElementById('debug-panel')!;
    this.state = { view: 'off', topDown: false, god: false, breaches: true, bugs: initialBugs, intent: '' };
    this.el.innerHTML = '';
    const title = document.createElement('div');
    title.className = 'dp-title';
    title.textContent = 'DEBUG  (` to hide)';
    this.el.appendChild(title);
    const views = document.createElement('div');
    for (const v of DEBUG_VIEWS) {
      const b = document.createElement('button');
      b.textContent = v;
      b.onclick = () => this.setView(v);
      views.appendChild(b);
      this.viewBtns.push(b);
    }
    this.el.appendChild(this.row('view [V]', views));
    this.slider = document.createElement('input');
    this.slider.type = 'range';
    this.slider.min = '0';
    this.slider.max = '3000';
    this.slider.step = '50';
    this.slider.value = String(initialBugs);
    this.slider.id = 'bug-slider';
    this.label = document.createElement('span');
    this.label.textContent = String(initialBugs);
    this.slider.oninput = () => {
      this.state.bugs = +this.slider.value;
      this.label.textContent = this.slider.value;
      this.onChange(this.state);
    };
    const sw = document.createElement('div');
    sw.append(this.slider, this.label);
    this.el.appendChild(this.row('bugs', sw));
    this.el.appendChild(this.toggle('top-down [T]', 'topDown'));
    this.el.appendChild(this.toggle('god mode [G]', 'god'));
    this.el.appendChild(this.toggle('breaches', 'breaches'));
    const sel = document.createElement('select');
    sel.id = 'intent-select';
    for (const v of ['', 'conceal', 'probe', 'sabotage', 'flank', 'undermine', 'reroute', 'siege', 'bait', 'assault', 'retreat']) {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = v || '(queen decides)';
      sel.appendChild(o);
    }
    sel.onchange = () => {
      this.state.intent = sel.value;
      this.onChange(this.state);
    };
    this.el.appendChild(this.row('force intent', sel));
    const help = document.createElement('div');
    help.className = 'dp-help';
    help.innerHTML =
      'Click to look. WASD move, Shift sprint, Ctrl/C crouch.<br>' +
      '1/2/3 or wheel: slot. LMB use (fire, light, zap). RMB place / aim.<br>' +
      'E interact (pick up, cable, revive, harvest). Q drop. R repair. Space stomp.<br>' +
      'Alternate LMB/RMB while laying cable to reel in. Tab war map. X dig (Enlite suit).<br>' +
      'V walkie-talkie (online). Esc/P pause. K save, Shift+K export.';
    this.el.appendChild(help);
    this.refresh();
  }
  private row(label: string, el: HTMLElement) {
    const r = document.createElement('div');
    r.className = 'dp-row';
    const l = document.createElement('label');
    l.textContent = label;
    r.append(l, el);
    return r;
  }
  private toggle(label: string, key: 'topDown' | 'god' | 'breaches') {
    const b = document.createElement('button');
    b.dataset.key = key;
    b.onclick = () => {
      (this.state as any)[key] = !(this.state as any)[key];
      this.refresh();
      this.onChange(this.state);
    };
    return this.row(label, b);
  }
  setView(v: DebugView) {
    this.state.view = v;
    this.refresh();
    this.onChange(this.state);
  }
  cycleView() {
    const i = DEBUG_VIEWS.indexOf(this.state.view);
    this.setView(DEBUG_VIEWS[(i + 1) % DEBUG_VIEWS.length]);
  }
  flip(key: 'topDown' | 'god' | 'breaches') {
    (this.state as any)[key] = !(this.state as any)[key];
    this.refresh();
    this.onChange(this.state);
  }
  setBugs(n: number) {
    this.state.bugs = n;
    this.slider.value = String(n);
    this.label.textContent = String(n);
    this.onChange(this.state);
  }
  refresh() {
    this.viewBtns.forEach((b) => b.classList.toggle('on', b.textContent === this.state.view));
    this.el.querySelectorAll('button[data-key]').forEach((b: any) => {
      const on = (this.state as any)[b.dataset.key];
      b.textContent = on ? 'on' : 'off';
      b.classList.toggle('on', on);
    });
  }
}
