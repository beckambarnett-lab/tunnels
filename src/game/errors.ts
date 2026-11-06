// Errors the player can see. A browser game that fails silently just looks frozen; this puts the
// message on screen (once per distinct error) so it can be reported, and the game keeps running.

let box: HTMLElement | null = null;
const seen = new Set<string>();

export function showError(e: unknown) {
  const err = e instanceof Error ? e : new Error(String((e as any)?.message ?? e));
  const key = err.message;
  console.error(err);
  if (seen.has(key) || seen.size >= 4) return;
  seen.add(key);
  if (!box) {
    box = document.createElement('div');
    box.id = 'errors';
    const head = document.createElement('div');
    head.className = 'eh';
    head.textContent = 'Something went wrong. Please send this text to the developer:';
    const close = document.createElement('button');
    close.textContent = 'close';
    close.onclick = () => box && (box.style.display = 'none');
    head.appendChild(close);
    box.appendChild(head);
    document.body.appendChild(box);
  }
  box.style.display = 'block';
  const pre = document.createElement('pre');
  pre.textContent = `${err.message}\n${(err.stack || '').split('\n').slice(0, 6).join('\n')}\n${navigator.userAgent}`;
  box.appendChild(pre);
}

export function installErrorHandlers() {
  addEventListener('error', (e) => showError(e.error ?? e.message));
  addEventListener('unhandledrejection', (e) => showError(e.reason));
}
