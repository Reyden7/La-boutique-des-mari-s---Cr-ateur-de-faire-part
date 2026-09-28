import { useEffect, useRef, useState } from "react";
import type { ScratchElement } from "../../types/editor";
import { getScratchTextStyle } from "./scratchDefaults";

type SurfacePalette = { light: string; base: string; dark: string };

const SURFACES: Record<Exclude<ScratchElement["surfaceStyle"], "custom">, SurfacePalette> = {
  gold: { light: "#ead58e", base: "#c5a452", dark: "#98752f" },
  silver: { light: "#f0f2f3", base: "#bfc3c8", dark: "#888e95" },
  champagne: { light: "#ead9c2", base: "#c8aa8d", dark: "#9f7f64" },
  beige: { light: "#e9e0d5", base: "#cbbba8", dark: "#a08f7b" },
  rose: { light: "#eac8cc", base: "#c99398", dark: "#a56d75" },
};

const blendHex = (source: string, target: "#ffffff" | "#000000", amount: number) => {
  const normalized = /^#[0-9a-f]{6}$/i.test(source) ? source : "#c8aa8d";
  const from = [1, 3, 5].map((index) => Number.parseInt(normalized.slice(index, index + 2), 16));
  const to = target === "#ffffff" ? 255 : 0;
  return `#${from.map((channel) => Math.round(channel + (to - channel) * amount).toString(16).padStart(2, "0")).join("")}`;
};

const getSurfacePalette = (element: ScratchElement): SurfacePalette => element.surfaceStyle === "custom"
  ? { light: blendHex(element.surfaceColor, "#ffffff", .28), base: element.surfaceColor, dark: blendHex(element.surfaceColor, "#000000", .22) }
  : SURFACES[element.surfaceStyle];

export function ScratchCardRenderer({ element }: { element: ScratchElement }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scratchMoves = useRef(0);
  const scratching = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | undefined>(undefined);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(rect.width * ratio));
    canvas.height = Math.max(1, Math.round(rect.height * ratio));
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const palette = getSurfacePalette(element);
    const surface = context.createRadialGradient(
      rect.width * .3,
      rect.height * .24,
      0,
      rect.width * .52,
      rect.height * .55,
      Math.max(rect.width, rect.height) * .82,
    );
    surface.addColorStop(0, palette.light);
    surface.addColorStop(.48, palette.base);
    surface.addColorStop(1, palette.dark);
    context.fillStyle = surface;
    context.fillRect(0, 0, rect.width, rect.height);
    setRevealed(false);
    scratchMoves.current = 0;
    scratching.current = false;
    lastPoint.current = undefined;
  }, [element.surfaceColor, element.surfaceStyle]);

  const scratch = (clientX: number, clientY: number) => {
    if (!scratching.current || revealed) return;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
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
      let sampled = 0;
      for (let index = 3; index < pixels.length; index += 4 * 24) {
        sampled += 1;
        if (pixels[index] < 40) transparent += 1;
      }
      if (sampled && transparent / sampled > .52) setRevealed(true);
    }
  };

  const startScratch = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    event.stopPropagation();
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

  return <div className={`scratch-card scratch-${element.shape}`} style={{ backgroundColor: element.revealedBackgroundColor ?? "#fffaf5" }} onDragStart={(event) => event.preventDefault()} onContextMenu={(event) => event.preventDefault()}>
    <strong style={{ color: text.textColor, fontFamily: text.fontFamily, fontSize: `${text.fontSize / Math.max(1, element.width) * 100}cqw`, fontWeight: text.fontWeight, textAlign: text.textAlign, transform: `translate(calc(-50% + ${text.textOffsetX / Math.max(1, element.width) * 100}cqw), calc(-50% + ${text.textOffsetY / Math.max(1, element.width) * 100}cqw))` }}>{element.content}</strong>
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
  </div>;
}
