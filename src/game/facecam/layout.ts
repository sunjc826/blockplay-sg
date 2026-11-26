interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
export function panelPosition(w: number, h: number, obstacles: Rect[]) {
  const gap = 6,
    preferred = Math.min(240, Math.round(w * 0.21), Math.round(h * 0.3));
  for (let size = preferred; size >= Math.min(80, preferred); size -= 12) {
    const height = Math.round(size * 0.75);
    const xs = [w - size - gap, gap, ...obstacles.flatMap((r) => [r.left - gap - size, r.right + gap])];
    const ys = [gap, h - height - gap, ...obstacles.flatMap((r) => [r.bottom + gap, r.top - gap - height])];
    for (const x of xs)
      for (const y of ys) {
        if (x < 0 || y < 0 || x + size > w || y + height > h) continue;
        if (
          obstacles.every(
            (r) => x + size <= r.left - gap || x >= r.right + gap || y + height <= r.top - gap || y >= r.bottom + gap
          )
        )
          return { x, y, width: size };
      }
  }
  return null;
}
const obstacles =
  '.fps-crosshair,.fps-vehicle-reticle,.merlion-reticle,.fps-vitals,.fps-ammo,.fps-health-line,.fps-minimap,.cast-caption,.streamer-poll,.streamer-chip,.streamer-usage[open]>div,.touch-fire,.touch-move';
export function placePanel(panel: HTMLElement, target: HTMLElement | null) {
  let nodes: Element[] = [];
  const resize = new ResizeObserver(position);
  function position() {
    const rects = nodes.map((node) => node.getBoundingClientRect()).filter((r) => r.width && r.height);
    const v = document.querySelector('.fps-viewport')?.getBoundingClientRect();
    if (v) rects.push(new DOMRect(v.x + v.width / 2 - 17, v.y + v.height / 2 - 17, 34, 34));
    const p = panelPosition(innerWidth, innerHeight, rects);
    panel.hidden = !p;
    if (p) Object.assign(panel.style, { left: p.x + 'px', top: p.y + 'px', width: p.width + 'px' });
  }
  const moved = new MutationObserver(position);
  function bind() {
    moved.disconnect();
    resize.disconnect();
    nodes = [...document.querySelectorAll(obstacles)];
    if (target?.isConnected) nodes.push(target);
    for (const n of nodes) resize.observe(n);
    for (const n of document.querySelectorAll('.streamer-poll,.streamer-usage'))
      moved.observe(n, { attributes: true, attributeFilter: ['style', 'open'] });
    position();
  }
  bind();
  // The game can mount a new HUD without rerendering the streamer overlay.
  const observer = new MutationObserver((records) => {
    for (const r of records) {
      for (const n of [...r.addedNodes, ...r.removedNodes]) {
        if (n instanceof Element && (n.matches(obstacles) || n.querySelector(obstacles))) {
          bind();
          return;
        }
      }
    }
  });
  observer.observe(document.fullscreenElement ?? document.body, { subtree: true, childList: true, attributes: false });
  window.addEventListener('resize', position);
  window.addEventListener('scroll', position, true);
  return () => {
    resize.disconnect();
    observer.disconnect();
    moved.disconnect();
    window.removeEventListener('resize', position);
    window.removeEventListener('scroll', position, true);
  };
}
