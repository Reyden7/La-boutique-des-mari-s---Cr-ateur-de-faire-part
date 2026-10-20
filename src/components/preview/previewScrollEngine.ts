export type ScrollState = "idle" | "running" | "paused";
export type ScrollSurface = {
  position: () => number;
  maximum: () => number;
  write: (position: number) => void;
  /** CSS scroll pixels per logical document pixel (not the outer frame transform). */
  ratio: () => number;
};

export const clampScrollSpeed = (value: number) => Number.isFinite(value) ? Math.min(150, Math.max(10, value)) : 35;

/** One cancellable clock; fractional accumulation avoids rounding at low speeds. */
export function createPreviewScrollEngine(surface: ScrollSurface, clock: {
  request: (callback: (timestamp: number) => void) => number;
  cancel: (id: number) => void;
}, changed: (state: ScrollState) => void) {
  let frame: number | undefined;
  let previous: number | undefined;
  let position = 0;
  let speed = 35;
  let state: ScrollState = "idle";
  let lastWritten = surface.position();
  const cancel = () => { if (frame !== undefined) clock.cancel(frame); frame = undefined; previous = undefined; };
  const transition = (next: ScrollState) => { cancel(); state = next; changed(next); };
  const tick = (timestamp: number) => {
    frame = undefined;
    if (state !== "running") return;
    const elapsed = previous === undefined ? 0 : Math.max(0, Math.min(50, timestamp - previous)) / 1000;
    previous = timestamp;
    const maximum = Math.max(0, surface.maximum());
    position = Math.min(maximum, position + speed * elapsed * surface.ratio());
    surface.write(position);
    lastWritten = surface.position();
    if (position >= maximum) { transition("idle"); return; }
    frame = clock.request(tick);
  };
  return {
    start() { if (state === "running") return; position = surface.position(); lastWritten = position; state = "running"; previous = undefined; changed(state); frame = clock.request(tick); },
    pause() { if (state === "running") transition("paused"); },
    stop() { transition("idle"); },
    top() { transition("idle"); surface.write(0); lastWritten = surface.position(); },
    speed(value: number) { speed = clampScrollSpeed(value); },
    externalScroll() { if (state === "running" && Math.abs(surface.position() - lastWritten) > 1) transition("paused"); },
    dispose() { cancel(); state = "idle"; },
  };
}
