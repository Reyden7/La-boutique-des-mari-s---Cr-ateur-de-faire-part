import { motion, useReducedMotion } from "framer-motion";
import { useLayoutEffect, useRef, useState } from "react";
import type { OpeningAnimationProps } from "../openingTypes";
import { getPngEnvelopeDuration, getPngEnvelopeDeviceLayout, getLandscapePaperStyle, PNG_ENVELOPE_ASSETS } from "../pngEnvelopeLayout";
import { PREVIEW_DEVICES } from "../../../config/previewDevices";
import { ENVELOPE_PARTS, resolveEnvelopeAsset } from "../envelopeAssets";

export function PngEnvelopeOpening({ children, config, device = "mobile", onInteract, onComplete, closedPreview = false }: OpeningAnimationProps & { closedPreview?: boolean }) {
  const [phase, setPhase] = useState<"closed" | "opening" | "complete">("closed");
  const [ready, setReady] = useState<Record<string, boolean>>({});
  const [failedUrls, setFailedUrls] = useState<Record<string, boolean>>({});
  const [viewport, setViewport] = useState(() => ({ width: PREVIEW_DEVICES[device].width, height: PREVIEW_DEVICES[device].height }));
  const measureRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);
  const completedRef = useRef(false);
  const reducedMotion = Boolean(useReducedMotion());
  useLayoutEffect(() => {
    const node = measureRef.current;
    if (!node) return;
    const resize = (width: number, height: number) => setViewport((old) => old.width === width && old.height === height ? old : { width, height });
    resize(node.clientWidth, node.clientHeight);
    const observer = new ResizeObserver(([entry]) => { if (entry) resize(entry.contentRect.width, entry.contentRect.height); });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const layout = getPngEnvelopeDeviceLayout(viewport.width, viewport.height, config.envelope, device);
  const duration = reducedMotion ? .18 : getPngEnvelopeDuration(device === "mobile" ? config.customSettings?.mobilePngDuration : config.customSettings?.landscapePngDuration);
  const delay = reducedMotion ? 0 : .08;
  const opening = phase === "opening";
  const sources = Object.fromEntries(ENVELOPE_PARTS.map((part) => {
    const selected = resolveEnvelopeAsset(config.envelope, part).url;
    return [part, failedUrls[selected] ? PNG_ENVELOPE_ASSETS[part] : selected];
  })) as Record<typeof ENVELOPE_PARTS[number], string>;
  const assetsReady = Object.values(sources).every((src) => ready[src]);
  // Wait for all three selected images OR their fallback attempts. A broken default
  // must not prevent opening, but never start while another image is still loading.
  const assetsSettled = Object.values(sources).every((src) => ready[src] || failedUrls[src]);
  const failed = Object.values(sources).some((src) => failedUrls[src]);
  const open = () => {
    if (startedRef.current || !assetsSettled || closedPreview) return;
    startedRef.current = true;
    setPhase("opening");
    onInteract?.();
  };
  const finish = () => {
    if (!startedRef.current || completedRef.current) return;
    completedRef.current = true;
    setPhase("complete");
    onComplete?.();
  };
  const imageProps = (src: string) => ({ src, alt: "", draggable: false, onLoad: () => setReady((old) => ({ ...old, [src]: true })), onError: () => setFailedUrls((old) => ({ ...old, [src]: true })) });
  const hint = closedPreview ? "Position fermée · Voir l’ouverture pour l’animer" : typeof config.customSettings?.hintText === "string" ? config.customSettings.hintText : "Touchez pour ouvrir";
  const box = (rect: {x:number;y:number;width:number;height:number}) => ({ left: rect.x, top: rect.y, width: rect.width, height: rect.height });
  const artwork = <>
    <motion.div className="png-envelope-base" style={box(layout.base)} initial={false} animate={opening ? layout.baseMotion : { x: 0, y: 0 }} transition={{ duration: duration - delay, ease: "easeInOut" }} aria-hidden="true">
      <img {...imageProps(sources.base)} style={layout.landscape ? getLandscapePaperStyle({ ...layout.base, x: 0, y: 0 }) : undefined} />
    </motion.div>
    <motion.div className="png-envelope-right-group" style={box(layout.flap)} initial={false} animate={opening ? layout.flapMotion : { x: 0, y: 0 }} transition={{ duration: duration - delay, delay: opening ? delay : 0, ease: "easeInOut" }} onAnimationComplete={() => { if (opening) finish(); }} aria-hidden="true">
      <img className="png-envelope-flap" {...imageProps(sources.flap)} style={layout.landscape ? getLandscapePaperStyle(layout.flapImage) : { ...box(layout.flapImage), position: "absolute" }} />
      <img className="png-envelope-seal" {...imageProps(sources.seal)} style={box(layout.seal)} />
    </motion.div>
  </>;
  return <div className={`png-envelope-stage${layout.landscape ? " png-envelope-landscape" : ""}${phase === "complete" ? " is-opened" : ""}`} data-envelope-phase={phase} data-envelope-device={device}>
    <div ref={measureRef} className="png-envelope-measure" aria-hidden="true" />
    {/* One stationary real document, never remounted or animated by this opening. */}
    <div className="png-envelope-content" inert={phase !== "complete"} aria-hidden={phase !== "complete"}>{children}</div>
    {phase !== "complete" && <div className="png-envelope-overlay" aria-busy={!assetsSettled}>
      {!assetsSettled && <div className="png-envelope-loading" />}
      {layout.landscape ? <div className="png-envelope-frame" style={box(layout.frame)}><div className="png-envelope-composition" style={box(layout.composition!)}>{artwork}</div></div> : artwork}
      {phase === "closed" && <span className="png-envelope-hint">{failed ? "Image indisponible · touchez pour ouvrir" : assetsReady ? hint : "Chargement de l’enveloppe…"}</span>}
      {!closedPreview && <button className="png-envelope-trigger" aria-label="Ouvrir le faire-part" onClick={open} disabled={phase !== "closed" || !assetsSettled} />}
    </div>}
    {phase === "complete" && <span className="sr-only" aria-live="polite">Faire-part ouvert</span>}
  </div>;
}
