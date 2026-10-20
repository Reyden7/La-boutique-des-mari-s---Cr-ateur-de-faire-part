import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { PREVIEW_DEVICES, type PreviewDevice } from "../../config/previewDevices";
import { clampScrollSpeed, createPreviewScrollEngine, type ScrollState } from "./previewScrollEngine";
import "./previewScroll.css";

type Engine = ReturnType<typeof createPreviewScrollEngine>;
type PreviewScrollValue = {
  register: (root: HTMLDivElement, device: PreviewDevice) => () => void;
  setReady: (value: boolean) => void;
  ready: boolean; state: ScrollState; speed: number;
  setSpeed: (value: number) => void;
  start: () => void; pause: () => void; stop: () => void; top: () => void;
};
const Context = createContext<PreviewScrollValue | null>(null);

export function PreviewScrollProvider({ children }: { children: ReactNode }) {
  const engine = useRef<Engine | null>(null);
  const speedRef = useRef(35);
  const [speed, setSpeedValue] = useState(35);
  const [state, setState] = useState<ScrollState>("idle");
  const [ready, setReady] = useState(false);
  const register = useCallback((root: HTMLDivElement, device: PreviewDevice) => {
    engine.current?.dispose();
    setReady(false); setState("idle");
    const controller = createPreviewScrollEngine({
      position: () => root.scrollTop,
      maximum: () => root.scrollHeight - root.clientHeight,
      write: (position) => { root.scrollTop = position; },
      // offsetWidth ignores the outer CSS transform used by simulated frames.
      ratio: () => (root.querySelector<HTMLElement>(".renderer-document")?.offsetWidth ?? PREVIEW_DEVICES[device].width) / PREVIEW_DEVICES[device].width,
    }, { request: (callback) => requestAnimationFrame(callback), cancel: (id) => cancelAnimationFrame(id) }, setState);
    controller.speed(speedRef.current); engine.current = controller;
    const pause = () => controller.pause();
    const key = (event: KeyboardEvent) => { if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "].includes(event.key)) pause(); };
    const scroll = () => controller.externalScroll();
    const drag = (event: DragEvent) => {
      // Only decorative images: never suppress custom draggable widgets/controls.
      if (event.target instanceof Element && event.target.matches("img") && !event.target.closest("a,button,[draggable='true'],[data-interactive],.photo-carousel,.scratch-card")) event.preventDefault();
    };
    root.addEventListener("wheel", pause, { passive: true });
    root.addEventListener("touchstart", pause, { passive: true });
    root.addEventListener("pointerdown", pause, { passive: true });
    root.addEventListener("keydown", key);
    root.addEventListener("scroll", scroll, { passive: true });
    root.addEventListener("dragstart", drag);
    document.addEventListener("visibilitychange", pause);
    return () => {
      controller.dispose(); if (engine.current === controller) engine.current = null;
      root.removeEventListener("wheel", pause); root.removeEventListener("touchstart", pause); root.removeEventListener("pointerdown", pause);
      root.removeEventListener("keydown", key); root.removeEventListener("scroll", scroll); root.removeEventListener("dragstart", drag);
      document.removeEventListener("visibilitychange", pause);
    };
  }, []);
  useEffect(() => () => engine.current?.dispose(), []);
  return <Context.Provider value={{ register, ready, setReady, state, speed,
    setSpeed: (value) => { const next = clampScrollSpeed(value); speedRef.current = next; setSpeedValue(next); engine.current?.speed(next); },
    start: () => { if (ready) engine.current?.start(); }, pause: () => engine.current?.pause(), stop: () => engine.current?.stop(), top: () => { if (ready) engine.current?.top(); },
  }}>{children}</Context.Provider>;
}

/** Optional in the shared viewer: public sessions have no provider and no effects. */
export function usePreviewScrollSurface(ref: RefObject<HTMLDivElement | null>, device: PreviewDevice, enabled = true) {
  const context = useContext(Context);
  const register = context?.register;
  useLayoutEffect(() => { if (enabled && ref.current && register) return register(ref.current, device); }, [ref, device, enabled, register]);
  return enabled ? context?.setReady : undefined;
}

export function PreviewScrollControls({ onExpanded }: { onExpanded?: (open: boolean) => void }) {
  const context = useContext(Context)!;
  const [open, setOpen] = useState(false);
  const id = "preview-auto-scroll-panel";
  return <div className="preview-auto-scroll">
    <button type="button" aria-expanded={open} aria-controls={id} onClick={() => { setOpen(!open); onExpanded?.(!open); }}>Défilement automatique{context.state === "running" ? " · En cours" : ""}</button>
    {open && <section id={id} className="preview-auto-panel" aria-label="Défilement automatique">
      <label htmlFor="preview-scroll-speed">Vitesse (px/s)</label>
      <div className="preview-speed-fields"><input id="preview-scroll-speed" aria-label="Vitesse de défilement" type="range" min="10" max="150" step="1" value={context.speed} onChange={(event) => context.setSpeed(Number(event.target.value))} />
        <input aria-label="Vitesse précise en pixels par seconde" type="number" min="10" max="150" step="1" value={context.speed} onChange={(event) => context.setSpeed(Number(event.target.value))} /><span>px/s</span></div>
      {!context.ready && <p>Disponible après l’introduction.</p>}
      <div className="preview-auto-actions"><button type="button" disabled={!context.ready} onClick={context.state === "running" ? context.pause : context.start}>{context.state === "running" ? "Pause" : context.state === "paused" ? "Reprendre" : "Démarrer"}</button>
        <button type="button" disabled={context.state === "idle"} onClick={context.stop}>Arrêter</button>
        <button type="button" disabled={!context.ready} onClick={context.top}>Retour en haut</button></div>
    </section>}
  </div>;
}
