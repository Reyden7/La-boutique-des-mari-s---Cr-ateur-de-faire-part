import { Monitor, RotateCcw, Smartphone, Tablet, X } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import type { WeddingProject } from "../../types/editor";
import { InvitationExperience } from "../../features/music/InvitationExperience";
import { PREVIEW_DEVICES, type PreviewDevice } from "../../config/previewDevices";
import { AnimationViewportProvider } from "../renderer/AnimatedElement";

const INTERACTIVE_SELECTOR = [
  "button", "a", "input", "textarea", "select", "label", "iframe", "audio", "video", "img",
  "[role='button']", "[contenteditable]", "[draggable='true']", "[data-interactive]",
  ".photo-carousel", ".scratch-card", ".location-card", ".guest-audio-control",
].join(", ");

const isInteractiveTarget = (target: EventTarget | null) =>
  target instanceof Element && target.closest(INTERACTIVE_SELECTOR) !== null;

type DragStart = { pointerId: number; y: number; scrollTop: number; moved: boolean };

function PreviewDeviceViewport({ project, device, scale }: { project: WeddingProject; device: PreviewDevice; scale: number }) {
  const viewportRef = useRef<HTMLDivElement>(null);
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
      className={`preview-device-viewport${canDrag && device !== "desktop" ? " can-drag" : ""}${isDragging ? " is-dragging-scroll" : ""}`}
      aria-label={`Aperçu ${PREVIEW_DEVICES[device].label}`}
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
      <AnimationViewportProvider root={viewportRef}><InvitationExperience project={project} device={device} mode="preview" /></AnimationViewportProvider>
    </div>
  );
}

export function PreviewMode({ project, device, onClose, allowDeviceSwitching = false }: { project: WeddingProject; device: PreviewDevice; onClose: () => void; allowDeviceSwitching?: boolean }) {
  const [replayKey, setReplayKey] = useState(0);
  const [activeDevice, setActiveDevice] = useState(device);
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

  const viewport = PREVIEW_DEVICES[activeDevice];
  const scale = windowSize.width && windowSize.height
    ? Math.min(1, (windowSize.width - 32) / viewport.width, (windowSize.height - 88) / viewport.height)
    : 1;
  const visibleScale = Math.max(0.1, scale);
  const frameStyle = {
    "--preview-device-width": `${viewport.width}px`,
    "--preview-device-height": `${viewport.height}px`,
    "--preview-device-scale": visibleScale,
  } as CSSProperties;
  return (
    <div className={`preview-mode preview-mode-${activeDevice}`}>
      <div className="preview-controls"><button onClick={onClose}><X size={17} /> Retour</button>{allowDeviceSwitching && <div className="template-preview-devices"><button className={activeDevice === "mobile" ? "active" : ""} onClick={() => setActiveDevice("mobile")}><Smartphone size={15} /> Smartphone</button><button className={activeDevice === "tablet" ? "active" : ""} onClick={() => setActiveDevice("tablet")}><Tablet size={15} /> Tablette</button><button className={activeDevice === "desktop" ? "active" : ""} onClick={() => setActiveDevice("desktop")}><Monitor size={15} /> PC</button></div>}<button onClick={() => setReplayKey((key) => key + 1)}><RotateCcw size={17} /> Rejouer</button></div>
      <div className="preview-content">
        <div className="preview-device-shell" style={{ width: viewport.width * visibleScale, height: viewport.height * visibleScale }}>
          <div className="preview-device-frame" style={frameStyle}>
            <PreviewDeviceViewport key={`${replayKey}-${activeDevice}`} project={project} device={activeDevice} scale={visibleScale} />
          </div>
        </div>
      </div>
    </div>
  );
}
