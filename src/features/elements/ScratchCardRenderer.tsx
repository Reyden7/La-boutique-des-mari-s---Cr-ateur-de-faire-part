import { useEffect, useRef, useState } from "react";
import type { ScratchElement } from "../../types/editor";
import type { PreviewDevice } from "../../config/previewDevices";
import { getElementLayout } from "../../utils/responsiveLayout";
import { getScratchSurfacePalette, getScratchTextStyle, paintScratchSurface, resolveScratchIndicator } from "./scratchDefaults";
import { ScratchIndicator } from "./ScratchIndicator";
import { applyScratchMask, isScratchMaskPointActive, paintScratchModelSurface } from "./scratchMask";
import { useScratchMask } from "./useScratchMask";

export function ScratchCardRenderer({ element, device }: { element: ScratchElement; device: PreviewDevice }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const scratchMoves = useRef(0);
  const scratching = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | undefined>(undefined);
  const initialActiveSamples = useRef<number[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [hasStartedScratching, setHasStartedScratching] = useState(false);
  const layout = getElementLayout(element, device);
  const mask = useScratchMask(element.shape === "custom" ? element.scratchModel?.url : undefined);
  const customShape = element.shape === "custom" && Boolean(mask);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(rect.width * ratio));
    canvas.height = Math.max(1, Math.round(rect.height * ratio));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    contextRef.current = context;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    if (customShape && mask) {
      paintScratchModelSurface(context, mask, rect.width, rect.height);
      applyScratchMask(context, mask, rect.width, rect.height);
    } else {
      paintScratchSurface(context, rect.width, rect.height, getScratchSurfacePalette(element));
    }
    const initialPixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    initialActiveSamples.current = [];
    for (let index = 3; index < initialPixels.length; index += 4 * 24) {
      if (initialPixels[index] > 40) initialActiveSamples.current.push(index);
    }
    setRevealed(false);
    setHasStartedScratching(false);
    scratchMoves.current = 0;
    scratching.current = false;
    lastPoint.current = undefined;
  }, [element.surfaceColor, element.surfaceStyle, element.shape, mask, customShape, layout.width, layout.height]);

  const scratch = (clientX: number, clientY: number) => {
    if (!scratching.current || revealed) return;
    const canvas = canvasRef.current;
    const context = contextRef.current ?? canvas?.getContext("2d", { willReadFrequently: true });
    if (!canvas || !context) return;
    const rect = canvas.getBoundingClientRect();
    const point = { x: clientX - rect.left, y: clientY - rect.top };
    const previous = lastPoint.current ?? point;
    const radius = Math.max(18, rect.width * .07);
    context.save();
    context.globalCompositeOperation = "destination-out";
    context.beginPath();
    context.lineWidth = radius * 2;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.moveTo(previous.x, previous.y);
    context.lineTo(point.x, point.y);
    context.stroke();
    context.restore();
    lastPoint.current = point;
    scratchMoves.current += 1;
    if (scratchMoves.current % 12 === 0) {
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let transparent = 0;
      for (const index of initialActiveSamples.current) if (pixels[index] < 40) transparent++;
      if (initialActiveSamples.current.length && transparent / initialActiveSamples.current.length > .52) setRevealed(true);
    }
  };

  const startScratch = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (customShape && mask) {
      const rect = event.currentTarget.getBoundingClientRect();
      if (!isScratchMaskPointActive(mask, event.clientX - rect.left, event.clientY - rect.top, rect.width, rect.height)) return;
    }
    setHasStartedScratching(true);
    scratching.current = true;
    lastPoint.current = undefined;
    event.currentTarget.setPointerCapture(event.pointerId);
    scratch(event.clientX, event.clientY);
  };
  const moveScratch = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!scratching.current) return;
    event.preventDefault();
    event.stopPropagation();
    const events = event.nativeEvent.getCoalescedEvents?.() ?? [event.nativeEvent];
    events.forEach((sample) => scratch(sample.clientX, sample.clientY));
  };
  const stopScratch = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    event.stopPropagation();
    scratching.current = false;
    lastPoint.current = undefined;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const text = getScratchTextStyle(element);
  const indicator = resolveScratchIndicator(element.scratchIndicator);

  const maskStyle = customShape && mask ? {
    maskImage: `url("${mask.url}")`, WebkitMaskImage: `url("${mask.url}")`,
    maskSize: "contain", WebkitMaskSize: "contain",
    maskPosition: "center", WebkitMaskPosition: "center",
    maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat",
  } : {};
  return <div className={`scratch-card scratch-${customShape ? "custom" : element.shape === "custom" ? "circle" : element.shape}`} style={{ backgroundColor: element.revealedBackgroundColor ?? "#fffaf5", ...maskStyle }} onDragStart={(event) => event.preventDefault()} onContextMenu={(event) => event.preventDefault()}>
    <strong style={{ color: text.textColor, fontFamily: text.fontFamily, fontSize: `${text.fontSize / Math.max(1, layout.width) * 100}cqw`, fontWeight: text.fontWeight, textAlign: text.textAlign, transform: `translate(calc(-50% + ${text.textOffsetX / Math.max(1, layout.width) * 100}cqw), calc(-50% + ${text.textOffsetY / Math.max(1, layout.width) * 100}cqw))` }}>{element.content}</strong>
    <canvas ref={canvasRef}
      draggable={false}
      aria-label="Surface à gratter"
      onPointerDown={startScratch}
      onPointerMove={moveScratch}
      onPointerUp={stopScratch}
      onPointerCancel={stopScratch}
      onLostPointerCapture={() => { scratching.current = false; lastPoint.current = undefined; }}
      onDragStart={(event) => event.preventDefault()}
      onContextMenu={(event) => event.preventDefault()}
      style={{ opacity: revealed ? 0 : 1 }}
    />
    {indicator.enabled && !hasStartedScratching && !revealed && <ScratchIndicator indicator={indicator} elementWidth={layout.width} />}
  </div>;
}
