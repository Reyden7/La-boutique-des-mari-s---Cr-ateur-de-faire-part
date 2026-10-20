import { Monitor, MoreHorizontal, RotateCcw, Smartphone, Tablet, X } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import type { WeddingProject } from "../../types/editor";
import { InvitationExperience } from "../../features/music/InvitationExperience";
import { PREVIEW_DEVICES, type PreviewDevice } from "../../config/previewDevices";
import { AnimationViewportProvider } from "../renderer/AnimatedElement";
import { InvitationViewer } from "../../features/viewer/InvitationViewer";
import { useViewerViewport } from "../../features/viewer/useViewerViewport";
import { PreviewScrollControls, PreviewScrollProvider, usePreviewScrollSurface } from "./PreviewScroll";

const INTERACTIVE_SELECTOR = [
  "button", "a", "input", "textarea", "select", "label", "iframe", "audio", "video",
  "[role='button']", "[contenteditable]", "[draggable='true']", "[data-interactive]",
  ".photo-carousel", ".scratch-card", ".location-card", ".guest-audio-control",
].join(", ");

const isInteractiveTarget = (target: EventTarget | null) =>
  target instanceof Element && target.closest(INTERACTIVE_SELECTOR) !== null;

type DragStart = { pointerId: number; y: number; scrollTop: number; moved: boolean };

function PreviewDeviceViewport({ project, device, scale }: { project: WeddingProject; device: PreviewDevice; scale: number }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const onDocumentReady = usePreviewScrollSurface(viewportRef, device);
  const dragRef = useRef<DragStart | null>(null);
  const suppressClickRef = useRef(false);
  const [canDrag, setCanDrag] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const measure = () => setCanDrag(viewport.scrollHeight > viewport.clientHeight + 1);
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    if (viewport.firstElementChild) observer.observe(viewport.firstElementChild);
    measure();
    return () => observer.disconnect();
  }, []);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    suppressClickRef.current = false;
    const viewport = viewportRef.current;
    if (device === "desktop" || event.pointerType !== "mouse" || event.button !== 0 || !viewport ||
      !canDrag || viewport.querySelector(".welcome-page") || isInteractiveTarget(event.target)) return;
    dragRef.current = { pointerId: event.pointerId, y: event.clientY, scrollTop: viewport.scrollTop, moved: false };
    viewport.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const viewport = viewportRef.current;
    if (!drag || !viewport || drag.pointerId !== event.pointerId) return;
    const deltaY = event.clientY - drag.y;
    if (!drag.moved && Math.abs(deltaY) < 5) return;
    if (!drag.moved) {
      drag.moved = true;
      setIsDragging(true);
      window.getSelection()?.removeAllRanges();
    }
    event.preventDefault();
    viewport.scrollTop = drag.scrollTop - deltaY / scale;
  };

  const finishDrag = (event: ReactPointerEvent<HTMLDivElement>, cancelled = false) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    suppressClickRef.current = !cancelled && drag.moved;
    dragRef.current = null;
    setIsDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <div
      ref={viewportRef}
      className={`preview-device-viewport preview-scroll-surface${canDrag && device !== "desktop" ? " can-drag" : ""}${isDragging ? " is-dragging-scroll" : ""}`}
      aria-label={`Aperçu ${PREVIEW_DEVICES[device].label}`}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={(event) => finishDrag(event, true)}
      onClickCapture={(event) => {
        if (!suppressClickRef.current) return;
        suppressClickRef.current = false;
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <AnimationViewportProvider root={viewportRef}><InvitationExperience project={project} device={device} mode="preview" onDocumentReady={onDocumentReady} /></AnimationViewportProvider>
    </div>
  );
}

type PreviewModeProps = { project: WeddingProject; device: PreviewDevice; onClose: () => void; allowDeviceSwitching?: boolean; actions?: ReactNode };

export function PreviewMode(props: PreviewModeProps) {
  return <PreviewScrollProvider key={`${props.project.id}-${props.project.updatedAt}`}><PreviewModeContent {...props} /></PreviewScrollProvider>;
}

function PreviewModeContent({ project, device, onClose, allowDeviceSwitching = false, actions }: PreviewModeProps) {
  const [replayKey, setReplayKey] = useState(0);
  const [activeDevice, setActiveDevice] = useState(device);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [scrollPanelOpen, setScrollPanelOpen] = useState(false);
  const readerViewport = useViewerViewport();
  const [windowSize, setWindowSize] = useState(() => ({
    width: typeof window === "undefined" ? 0 : window.innerWidth,
    height: typeof window === "undefined" ? 0 : window.innerHeight,
  }));

  useEffect(() => {
    const measure = () => setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, []);

  if (readerViewport.immersive) return <InvitationViewer key={`${project.id}-${replayKey}-${allowDeviceSwitching ? activeDevice : readerViewport.device}`} project={project} device={allowDeviceSwitching ? activeDevice : readerViewport.device} mode="preview" controls={
    <div className="immersive-preview-controls">
      <button type="button" aria-label="Contrôles de l’aperçu" aria-expanded={controlsOpen} aria-controls="immersive-preview-menu" onClick={() => setControlsOpen((value) => !value)}><MoreHorizontal size={18} /></button>
      {controlsOpen && <div id="immersive-preview-menu" className="immersive-preview-menu">
        <button type="button" onClick={onClose}><X size={16} /> Retour</button>
        <button type="button" onClick={() => { setReplayKey((key) => key + 1); setControlsOpen(false); }}><RotateCcw size={16} /> Rejouer</button>
        {allowDeviceSwitching && <div className="template-preview-devices">{(["mobile", "tablet", "desktop"] as const).map((value) => <button type="button" key={value} className={activeDevice === value ? "active" : ""} onClick={() => setActiveDevice(value)}>{PREVIEW_DEVICES[value].label}</button>)}</div>}
        {actions}
        <PreviewScrollControls />
      </div>}
    </div>
  } />;

  const viewport = PREVIEW_DEVICES[activeDevice];
  const scale = windowSize.width && windowSize.height
    ? Math.min(1, (windowSize.width - 32) / viewport.width, (windowSize.height - (scrollPanelOpen ? 245 : 110)) / viewport.height)
    : 1;
  const visibleScale = Math.max(0.1, scale);
  const frameStyle = {
    "--preview-device-width": `${viewport.width}px`,
    "--preview-device-height": `${viewport.height}px`,
    "--preview-device-scale": visibleScale,
  } as CSSProperties;
  return (
    <div className={`preview-mode preview-mode-${activeDevice}`} style={scrollPanelOpen ? { "--preview-content-top": "225px" } as CSSProperties : undefined}>
      <div className="preview-controls"><button onClick={onClose}><X size={17} /> Retour</button>{allowDeviceSwitching && <div className="template-preview-devices"><button className={activeDevice === "mobile" ? "active" : ""} onClick={() => setActiveDevice("mobile")}><Smartphone size={15} /> Smartphone</button><button className={activeDevice === "tablet" ? "active" : ""} onClick={() => setActiveDevice("tablet")}><Tablet size={15} /> Tablette</button><button className={activeDevice === "desktop" ? "active" : ""} onClick={() => setActiveDevice("desktop")}><Monitor size={15} /> PC</button></div>}<button onClick={() => setReplayKey((key) => key + 1)}><RotateCcw size={17} /> Rejouer</button>{actions}</div>
      <div className="preview-scroll-toolbar"><PreviewScrollControls onExpanded={setScrollPanelOpen} /></div>
      <div className="preview-content" style={{ top: "var(--preview-content-top, 94px)" }}>
        <div className="preview-device-shell" style={{ width: viewport.width * visibleScale, height: viewport.height * visibleScale }}>
          <div className="preview-device-frame" style={frameStyle}>
            <PreviewDeviceViewport key={`${project.id}-${replayKey}-${activeDevice}`} project={project} device={activeDevice} scale={visibleScale} />
          </div>
        </div>
      </div>
    </div>
  );
}
