import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import type { OpeningAnimationProps } from "../openingTypes";
import { PREVIEW_DEVICES } from "../../../config/previewDevices";
import { DOOR_PARTS, DOOR_PRESETS, resolveDoorAsset, resolveDoorOffset, resolveDoorDeviceScale } from "../doorAssets";
import { getDoorRenderBox, getScaledDoorTravel, getGeneratedDoorPng, measureDoorImage, type DoorImageMetrics } from "../doorLayout";

export function DoorsOpening({ children, config, device = "mobile", onInteract, onComplete, closedPreview = false }: OpeningAnimationProps & { closedPreview?: boolean }) {
  const [phase, setPhase] = useState<"closed" | "opening" | "complete">("closed");
  const reducedMotion = useReducedMotion();
  const measure = useRef<HTMLDivElement>(null), started = useRef(false), completed = useRef(false);
  const [viewport, setViewport] = useState({ width: PREVIEW_DEVICES[device].width, height: PREVIEW_DEVICES[device].height });
  const [loaded, setLoaded] = useState<Record<string, DoorImageMetrics>>({});
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const [primary, accent] = config.colors ?? ["#f4efe7", "#b2905d"];
  const sources = useMemo(() => Object.fromEntries(DOOR_PARTS.map((part) => {
    const asset = resolveDoorAsset(config.doors, part);
    return [part, asset.url || getGeneratedDoorPng(part, primary, accent, config.variant)];
  })) as Record<typeof DOOR_PARTS[number], string>, [config.doors, primary, accent, config.variant]);
  const effective = Object.fromEntries(DOOR_PARTS.map((part) => [part, failed[sources[part]] ? DOOR_PRESETS[part][1].url : sources[part]])) as typeof sources;
  const settled = DOOR_PARTS.every((part) => loaded[effective[part]] || failed[effective[part]]);
  const doorScale = resolveDoorDeviceScale(config.doors, device);
  useEffect(() => {
    const node = measure.current; if (!node) return;
    const resize = (width: number, height: number) => { if (width > 0 && height > 0) setViewport((old) => old.width === width && old.height === height ? old : { width, height }); };
    resize(node.clientWidth, node.clientHeight);
    const observer = new ResizeObserver(([entry]) => { if (entry) resize(entry.contentRect.width, entry.contentRect.height); });
    observer.observe(node); return () => observer.disconnect();
  }, []);
  const open = () => {
    if (started.current || !settled || closedPreview) return;
    started.current = true; setPhase("opening"); onInteract?.();
  };
  const finish = () => {
    if (!started.current || completed.current) return;
    completed.current = true; setPhase("complete"); onComplete?.();
  };
  const duration = reducedMotion ? .18 : Math.max(.1, Number.isFinite(config.duration) ? config.duration : 2);
  return <div className="png-doors-stage" data-door-phase={phase} data-door-device={device}>
    <div ref={measure} className="png-envelope-measure" aria-hidden="true" />
    <div className="png-envelope-content" inert={phase !== "complete"} aria-hidden={phase !== "complete"}>{children}</div>
    {phase !== "complete" && <div className="png-doors-overlay" aria-busy={!settled}>
      <div className="png-door-group" style={{ transform: `scale(${doorScale})` }} data-door-scale={doorScale}>
      {DOOR_PARTS.map((part) => {
        const src = effective[part];
        const metrics = loaded[src] ?? { width: 400, height: 1000, bounds: { x: 0, y: 0, width: 400, height: 1000 }, bodyLeft: 0, bodyRight: 400 };
        const box = getDoorRenderBox(viewport.width, viewport.height, metrics, part, resolveDoorOffset(config.doors, part, device));
        return <motion.div key={part} data-door-part={part} className="png-door-panel" style={{ left: box.x, top: box.y, width: box.width, height: box.height, visibility: settled ? "visible" : "hidden" }}
          initial={false} animate={{ x: phase === "opening" ? getScaledDoorTravel(box, viewport.width, part, doorScale) : 0 }} transition={{ duration, ease: "easeInOut" }} onAnimationComplete={() => { if (part === "right" && phase === "opening") finish(); }}>
          <img src={src} alt="" draggable={false} crossOrigin="anonymous" onLoad={(event) => {
            const metrics = measureDoorImage(event.currentTarget);
            setLoaded((old) => ({ ...old, [src]: metrics }));
          }} onError={() => setFailed((old) => ({ ...old, [src]: true }))} />
        </motion.div>;
      })}</div>
      <motion.div className="png-doors-intro" initial={false} animate={{ opacity: phase === "closed" && settled ? 1 : 0 }} transition={{ duration: .2 }}>
        <span>Cliquer pour ouvrir les portes</span>
      </motion.div>
      {!closedPreview && <button className="png-envelope-trigger" type="button" aria-label="Ouvrir les portes" disabled={phase !== "closed" || !settled} onClick={open} />}
    </div>}
    {phase === "complete" && <span className="sr-only" aria-live="polite">Faire-part ouvert</span>}
  </div>;
}
