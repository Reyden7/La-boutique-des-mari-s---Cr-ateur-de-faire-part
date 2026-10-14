/** 18% of the element, capped to its viewport-sized footprint for tall sections. */
export function entranceVisibilityThreshold(target: { width: number; height: number }, viewport: { width: number; height: number }) {
  const area = target.width * target.height;
  if (area <= 0 || viewport.width <= 0 || viewport.height <= 0) return .18;
  return Math.min(.18, .18 * Math.min(target.width, viewport.width) * Math.min(target.height, viewport.height) / area);
}

/** Observe the stationary layout box, not the animated/transparent inner surface.
 * observe() delivers an initial entry even without scrolling. Rebinding after
 * resize delivers another initial entry with the newly adapted threshold. */
export function observeEntrance(node: HTMLElement, root: HTMLElement | null, onVisible: () => void) {
  let observer: IntersectionObserver | undefined, resize: ResizeObserver | undefined, finished = false, generation = 0;
  const cleanup = () => { observer?.disconnect(); resize?.disconnect(); window.removeEventListener("resize", bind); };
  const reveal = () => { if (finished) return; finished = true; cleanup(); onVisible(); };
  const bind = () => {
    if (finished) return;
    observer?.disconnect();
    const request = ++generation;
    if (typeof IntersectionObserver === "undefined") { reveal(); return; }
    const viewport = root?.getBoundingClientRect() ?? { width: window.innerWidth, height: window.innerHeight };
    const threshold = entranceVisibilityThreshold(node.getBoundingClientRect(), viewport);
    observer = new IntersectionObserver(entries => {
      if (request === generation && entries.some(entry => entry.target === node && entry.isIntersecting && entry.intersectionRatio >= threshold)) reveal();
    }, { root, threshold });
    observer.observe(node);
  };
  bind();
  if (!finished) {
    if (typeof ResizeObserver !== "undefined") { resize = new ResizeObserver(bind); resize.observe(node); if (root) resize.observe(root); }
    window.addEventListener("resize", bind);
  }
  return () => { finished = true; cleanup(); };
}
