import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Circle, Group, Image as KonvaImage, Layer, Line, Path, Rect, Stage, Text, Transformer } from "react-konva";
import Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type { EditorElement, ImageElement, ImageFit, ImageTransformConfig, PageBackground } from "../../types/editor";
import { useEditorStore } from "../../stores/editorStore";
import { ParticleRenderer } from "../../features/particles/ParticleRenderer";
import {
  PREVIEW_DEVICES,
  type PreviewDevice,
} from "../../config/previewDevices";
import { getElementLayout, getElementSectionId, getElementZIndex, getImageRotationFrame, isElementVisibleOnDevice } from "../../utils/responsiveLayout";
import { getDocumentHeight, getRsvpPositionX, getRsvpPositionY, getRsvpWidth, setRsvpLayoutForDevice } from "../../utils/documentLayout";
import { useRsvpBlockLayout } from "../../features/rsvp/useRsvpBlockLayout";
import { ProjectFontLoader } from "../../features/fonts/ProjectFontLoader";
import { useProjectFontRevision } from "../../features/fonts/projectFontRuntime";
import { resolveRsvpStyle } from "../../config/rsvpStyle";
import { resolveElementVisualStyle, resolveRsvpTypography } from "../../utils/responsiveVisualStyle";
import { getDecorativeHeart } from "../../features/hearts/heartRegistry";
import { WelcomePageRenderer } from "../../features/welcome/WelcomePageRenderer";
import { resolveWelcomePage } from "../../features/welcome/welcomeDefaults";
import { getScratchSurfacePalette, getScratchTextStyle, resolveScratchIndicator } from "../../features/elements/scratchDefaults";
import { makeMaskedScratchCanvas, paintScratchModelSurface } from "../../features/elements/scratchMask";
import { useScratchMask } from "../../features/elements/useScratchMask";
import {
  ALIGNMENT_THRESHOLD,
  calculateSnap,
  clearEditorGuides,
  drawEditorGuides,
  getDistanceGuides,
  getNodeBounds,
  getSelectionBounds,
  getSpacingReferences,
  translateBounds,
  type AlignmentBounds,
  type AlignmentCandidate,
  type SpacingReferences,
} from "../../utils/alignmentGuides";
import {
  SelectionLockControl,
  positionSelectionLockControl,
} from "./SelectionLockControl";
import { isElementLocked, isLockableElement } from "../../utils/elementLocking";
import { ScheduleCanvasContent } from "../../features/elements/ScheduleCanvasContent";
import { CalendarCanvasContent } from "../../features/elements/CalendarCanvasContent";
import { SectionCanvasSurface } from "../../features/elements/SectionCanvasSurface";
import { getImageFrameMetrics, getImageFramePalette, resolveImageFrame } from "../../config/imageFrames";
import { RSVP_EDITOR_ELEMENT_ID, getRsvpLayerZIndex, getRsvpSectionId, isRsvpVisibleOnDevice } from "../../features/rsvp/rsvpEditorElement";
import { setRsvpSectionForDevice } from "../../utils/documentLayout";
import { getImageRenderLayout, resolveImageFit, resolveImageTransform } from "../../utils/imageLayout";
import { hasImageAppearance, resolveImageAppearance, type ResolvedImageAppearance } from "../../utils/imageAppearance";
import { useImageAppearance } from "../../features/images/useImageAppearance";
import { getLogicalCanvasPointer, getPointerDragDelta, type CanvasPoint } from "../../utils/selectionDrag";
import { PngEnvelopeOpening } from "../../features/openings/animations/PngEnvelopeOpening";

type DragNodeSnapshot = { node: Konva.Node; x: number; y: number; bounds: AlignmentBounds };

function useLoadedImage(src?: string, cors = false) {
  const [image, setImage] = useState<HTMLImageElement>();
  useEffect(() => {
    if (!src) return setImage(undefined);
    let disposed = false;
    setImage(undefined);
    const load = (anonymous: boolean) => {
      const next = new Image();
      if (anonymous) next.crossOrigin = "anonymous";
      next.onload = () => { if (!disposed) setImage(next); };
      // Keep legacy external images usable when their host does not offer CORS.
      next.onerror = () => { if (!disposed && anonymous) load(false); };
      next.src = src;
    };
    load(cors);
    return () => { disposed = true; };
  }, [src, cors]);
  return image;
}

const HAND_POINTER_PATH = "M12 22c-3 0-5-2-6-5l-2-4c-.4-1 .1-2 1-2 .6 0 1 .3 1.5 1l1 1V5c0-1.1.9-2 2-2s2 .9 2 2v5c.3-.6 1-1 1.8-1 1 0 1.8.8 1.8 1.8v.2c.3-.7 1-1.2 1.9-1.2 1 0 1.8.8 1.8 1.8v.3c.3-.7 1-1.1 1.8-1.1 1.1 0 2 .9 2 2v5c0 4-3 7-7 7Z";
const OPEN_HAND_PATH = "M6.5 13V8.5a1.7 1.7 0 0 1 3.4 0V12 6a1.7 1.7 0 0 1 3.4 0v6-4.5a1.7 1.7 0 0 1 3.4 0V12 9.5a1.7 1.7 0 0 1 3.4 0V15c0 4-2.8 7-7 7h-1c-3 0-5-1.5-6.5-4L3.8 15a1.8 1.8 0 0 1 .7-2.5c.7-.4 1.5-.2 2 .5Z";

function ScratchIndicatorCanvas({ element, width, height }: { element: Extract<EditorElement, { type: "scratch" }>; width: number; height: number }) {
  const indicator = resolveScratchIndicator(element.scratchIndicator);
  if (!indicator.enabled) return null;
  const showsText = indicator.type === "text" || indicator.type === "finger-text";
  const showsIcon = indicator.type !== "text";
  const iconSize = indicator.size;
  const textSize = Math.max(9, indicator.size * .38);
  const combined = showsText && showsIcon;

  return <Group x={width / 2 + indicator.x} y={height / 2 + indicator.y} opacity={indicator.opacity} listening={false}>
    {showsIcon && <Path
      x={-iconSize / 2}
      y={combined ? -iconSize * .82 : -iconSize / 2}
      data={indicator.type === "hand" ? OPEN_HAND_PATH : HAND_POINTER_PATH}
      scaleX={iconSize / 24}
      scaleY={iconSize / 24}
      stroke={indicator.color}
      strokeWidth={1.65}
      lineCap="round"
      lineJoin="round"
      listening={false}
    />}
    {showsText && <Text
      x={-width / 2}
      y={combined ? iconSize * .24 : -textSize * .58}
      width={width}
      text={indicator.text}
      fill={indicator.color}
      fontFamily={indicator.fontFamily ?? "Montserrat"}
      fontSize={textSize}
      fontStyle={(indicator.fontWeight ?? 600) >= 600 ? "bold" : "normal"}
      align="center"
      listening={false}
    />}
  </Group>;
}

function Background({ background, width, height, y = 0 }: { background: PageBackground; width: number; height: number; y?: number }) {
  const image = useLoadedImage(background.imageUrl);
  const gradient = background.gradient;
  if (background.type === "image" && image) {
    const imageRatio = image.width / image.height;
    const viewportRatio = width / height;
    const crop = imageRatio > viewportRatio
      ? { x: (image.width - image.height * viewportRatio) / 2, y: 0, width: image.height * viewportRatio, height: image.height }
      : { x: 0, y: (image.height - image.width / viewportRatio) / 2, width: image.width, height: image.width / viewportRatio };
    return <Group y={y} listening={false}><KonvaImage image={image} width={width} height={height} crop={crop} listening={false} /></Group>;
  }
  if (background.type === "gradient" && gradient) {
    if (gradient.type === "radial") {
      const center = { x: width / 2, y: height / 2 };
      return <Group y={y} listening={false}><Rect width={width} height={height} fillRadialGradientStartPoint={center} fillRadialGradientEndPoint={center} fillRadialGradientStartRadius={0} fillRadialGradientEndRadius={Math.hypot(width, height) / 2} fillRadialGradientColorStops={[0, gradient.color1, 1, gradient.color2]} listening={false} /></Group>;
    }
    const angle = ((gradient.angle ?? 135) * Math.PI) / 180;
    const gradientLength = Math.hypot(width, height) / 2;
    return <Group y={y} listening={false}><Rect width={width} height={height} fillLinearGradientStartPoint={{ x: width / 2 - Math.cos(angle) * gradientLength, y: height / 2 - Math.sin(angle) * gradientLength }} fillLinearGradientEndPoint={{ x: width / 2 + Math.cos(angle) * gradientLength, y: height / 2 + Math.sin(angle) * gradientLength }} fillLinearGradientColorStops={[0, gradient.color1, 1, gradient.color2]} listening={false} /></Group>;
  }
  return <Rect y={y} width={width} height={height} fill={background.color ?? "#fffdf9"} listening={false} />;
}

function CanvasImageContent({ image, width, height, fit, transform, appearance, radius = 0 }: {
  image: HTMLImageElement;
  width: number;
  height: number;
  fit: ImageFit;
  transform: ImageTransformConfig;
  radius?: number;
  appearance?: ResolvedImageAppearance;
}) {
  const composite = useImageAppearance(image, width, height, fit, transform, appearance);
  const rendered = getImageRenderLayout(image.naturalWidth, image.naturalHeight, width, height, fit, transform);
  const corner = Math.min(radius, width / 2, height / 2);
  return <Group clipFunc={(context) => {
    context.beginPath();
    context.moveTo(corner, 0);
    context.lineTo(width - corner, 0);
    context.quadraticCurveTo(width, 0, width, corner);
    context.lineTo(width, height - corner);
    context.quadraticCurveTo(width, height, width - corner, height);
    context.lineTo(corner, height);
    context.quadraticCurveTo(0, height, 0, height - corner);
    context.lineTo(0, corner);
    context.quadraticCurveTo(0, 0, corner, 0);
    context.closePath();
  }}>
    {composite ? <KonvaImage image={composite} width={width} height={height} /> : <KonvaImage
      image={image}
      x={rendered.x + (transform.flipX ? rendered.width : 0)}
      y={rendered.y + (transform.flipY ? rendered.height : 0)}
      width={rendered.width}
      height={rendered.height}
      scaleX={transform.flipX ? -1 : 1}
      scaleY={transform.flipY ? -1 : 1}
    />}
  </Group>;
}

function CanvasElement({
  element,
  device,
  visible,
  selected,
  onSelect,
  onElementDragStart,
  onElementDragMove,
  onElementDragEnd,
}: {
  element: EditorElement;
  device: PreviewDevice;
  visible: boolean;
  selected: boolean;
  onSelect: (additive: boolean) => void;
  onElementDragStart: (event: KonvaEventObject<DragEvent>) => void;
  onElementDragMove: (event: KonvaEventObject<DragEvent>) => void;
  onElementDragEnd: (event: KonvaEventObject<DragEvent>) => void;
}) {
  element = resolveElementVisualStyle(element, device);
  const image = useLoadedImage(element.type === "image" ? element.src : element.type === "carousel" ? element.images[0]?.url : undefined, element.type === "image" && hasImageAppearance(resolveImageAppearance(element, device)));
  const layout = getElementLayout(element, device);
  const scratchMask = useScratchMask(element.type === "scratch" && element.shape === "custom" ? element.scratchModel?.url : undefined);
  const scratchElement = element.type === "scratch" ? element : null;
  const maskedScratchSurface = useMemo(() => {
    if (scratchElement?.shape !== "custom" || !scratchMask) return null;
    return makeMaskedScratchCanvas(scratchMask, layout.width, layout.height, (context) => paintScratchModelSurface(context, scratchMask, layout.width, layout.height));
  }, [scratchElement?.shape, scratchMask, layout.width, layout.height]);
  const maskedScratchReveal = useMemo(() => {
    if (scratchElement?.shape !== "custom" || !scratchMask) return null;
    return makeMaskedScratchCanvas(scratchMask, layout.width, layout.height, (context) => {
      context.fillStyle = scratchElement.revealedBackgroundColor ?? "#fffaf5";
      context.fillRect(0, 0, layout.width, layout.height);
    });
  }, [scratchElement?.shape, scratchElement?.revealedBackgroundColor, scratchMask, layout.width, layout.height]);
  const isCircle = element.type === "shape" && element.shape === "circle";
  const imageRotationFrame = element.type === "image" ? getImageRotationFrame(layout) : null;
  const common = {
    id: element.id, x: imageRotationFrame?.x ?? layout.x, y: imageRotationFrame?.y ?? layout.y,
    offsetX: imageRotationFrame?.offsetX ?? 0, offsetY: imageRotationFrame?.offsetY ?? 0,
    width: layout.width, height: layout.height,
    rotation: layout.rotation, opacity: element.opacity, visible,
    draggable: isLockableElement(element) && !isElementLocked(element),
    dragDistance: 1,
    onClick: (event: KonvaEventObject<MouseEvent>) => { event.cancelBubble = true; onSelect(event.evt.ctrlKey || event.evt.metaKey); },
    onTap: (event: KonvaEventObject<TouchEvent>) => { event.cancelBubble = true; onSelect(false); },
    onDragStart: onElementDragStart,
    onDragMove: onElementDragMove,
    onDragEnd: onElementDragEnd,
    onTransformEnd: (event: KonvaEventObject<Event>) => {
      const node = event.target;
      const scaleX = node.scaleX();
      const scaleY = node.scaleY();
      const width = Math.max(12, node.width() * scaleX);
      const height = Math.max(12, node.height() * scaleY);
      node.scaleX(1); node.scaleY(1);
      useEditorStore.getState().updateElementLayout(element.id, {
        x: node.x() - (isCircle || imageRotationFrame ? width / 2 : 0),
        y: node.y() - (isCircle || imageRotationFrame ? height / 2 : 0),
        rotation: node.rotation(), width, height,
      });
    },
    shadowColor: selected ? "#b78d72" : undefined,
    shadowBlur: selected ? 8 : 0,
    shadowOpacity: selected ? 0.22 : 0,
  };

  if (element.type === "text") return <Text {...common} text={element.text} fontFamily={element.fontFamily} fontSize={layout.fontSize ?? element.fontSize} fontStyle={`${element.italic ? "italic" : "normal"} ${element.fontWeight >= 600 ? "bold" : "normal"}`} fill={element.color} align={element.textAlign} lineHeight={element.lineHeight} letterSpacing={element.letterSpacing} textDecoration={element.underline ? "underline" : ""} verticalAlign="middle" />;
  if (element.type === "image") return image
    ? (() => {
        const imageElement = element as ImageElement;
        const frame = resolveImageFrame(imageElement.imageStyle?.frame);
        const fit = resolveImageFit(imageElement.fit);
        const transform = resolveImageTransform(imageElement, device);
        const appearance = resolveImageAppearance(imageElement, device);
        if (!frame.enabled) return <Group {...common}>
          <Rect width={layout.width} height={layout.height} fill="rgba(0,0,0,0.001)" />
          <CanvasImageContent image={image} width={layout.width} height={layout.height} fit={fit} transform={transform} appearance={appearance} />
        </Group>;
        const metrics = getImageFrameMetrics(frame, layout.width, layout.height);
        const innerWidth = Math.max(1, layout.width - metrics.left - metrics.right);
        const innerHeight = Math.max(1, layout.height - metrics.top - metrics.bottom);
        const palette = getImageFramePalette(frame);
        const gradientStops = palette.stops.flatMap(([position, color]) => [position, color]);
        const angle = palette.angle * Math.PI / 180;
        const gradientLength = Math.hypot(layout.width, layout.height) / 2;
        const outlineWidth = Math.max(1, Math.min(frame.width, 6));
        const dash = frame.borderStyle === "dotted" ? [outlineWidth, outlineWidth * 1.5] : frame.borderStyle === "dashed" ? [outlineWidth * 3, outlineWidth * 2] : undefined;
        return <Group {...common}>
          <Rect
            width={layout.width}
            height={layout.height}
            cornerRadius={metrics.outerRadius}
            fillLinearGradientStartPoint={{ x: layout.width / 2 - Math.cos(angle) * gradientLength, y: layout.height / 2 - Math.sin(angle) * gradientLength }}
            fillLinearGradientEndPoint={{ x: layout.width / 2 + Math.cos(angle) * gradientLength, y: layout.height / 2 + Math.sin(angle) * gradientLength }}
            fillLinearGradientColorStops={gradientStops}
            opacity={frame.opacity}
            shadowEnabled={frame.shadowEnabled}
            shadowColor="#2d221b"
            shadowBlur={frame.shadowBlur}
            shadowOpacity={frame.shadowOpacity}
            shadowOffsetY={frame.shadowDistance}
          />
          <Group x={metrics.left} y={metrics.top}><CanvasImageContent image={image} width={innerWidth} height={innerHeight} fit={fit} transform={transform} appearance={appearance} radius={metrics.innerRadius} /></Group>
          {(frame.borderStyle === "dotted" || frame.borderStyle === "dashed") && <Rect width={layout.width} height={layout.height} cornerRadius={metrics.outerRadius} stroke={frame.color} strokeWidth={outlineWidth} dash={dash} opacity={frame.opacity} listening={false} />}
          {(frame.type === "double" || frame.borderStyle === "double" || frame.type === "vintage") && <><Rect x={outlineWidth} y={outlineWidth} width={layout.width - outlineWidth * 2} height={layout.height - outlineWidth * 2} cornerRadius={Math.max(0, metrics.outerRadius - outlineWidth)} stroke={frame.color} strokeWidth={Math.max(1, outlineWidth * .45)} opacity={frame.opacity} listening={false} /><Rect x={metrics.left - outlineWidth * .7} y={metrics.top - outlineWidth * .7} width={innerWidth + outlineWidth * 1.4} height={innerHeight + outlineWidth * 1.4} cornerRadius={metrics.innerRadius} stroke={frame.color} strokeWidth={Math.max(1, outlineWidth * .35)} opacity={frame.opacity} listening={false} /></>}
          {frame.type === "wedding-floral" && <Group opacity={frame.opacity} listening={false}><Line points={[4, metrics.top + 8, 8, 10, metrics.left + 14, 4]} stroke="#7d9a72" strokeWidth={1.5} tension={.45} /><Circle x={8} y={12} radius={3} fill="#d8a3a2" /><Circle x={16} y={7} radius={2.5} fill="#f2d4c8" /><Group x={layout.width} y={layout.height} rotation={180}><Line points={[4, metrics.top + 8, 8, 10, metrics.left + 14, 4]} stroke="#7d9a72" strokeWidth={1.5} tension={.45} /><Circle x={8} y={12} radius={3} fill="#d8a3a2" /><Circle x={16} y={7} radius={2.5} fill="#f2d4c8" /></Group></Group>}
        </Group>;
      })()
    : <Rect {...common} fill="#eee8e2" />;
  if (element.type === "icon" && element.heartStyle) {
    const heart = getDecorativeHeart(element.heartStyle);
    return <Group {...common} width={100} height={100} scaleX={layout.width / 100} scaleY={layout.height / 100}>
      <Rect width={100} height={100} fill="rgba(0,0,0,0.001)" />
      <Path data={heart.path} fill={heart.filled ? element.color : undefined} stroke={heart.filled ? undefined : element.color} strokeWidth={heart.strokeWidth} lineCap="round" lineJoin="round" />
    </Group>;
  }
  if (element.type === "icon") return <Text {...common} text={element.icon} fill={element.color} fontSize={element.fontSize} align="center" verticalAlign="middle" />;
  if (element.type === "scratch") {
    const scratchText = getScratchTextStyle(element);
    const surface = getScratchSurfacePalette(element);
    const cornerRadius = element.shape === "circle" || (element.shape === "custom" && !scratchMask) ? Math.min(layout.width, layout.height) / 2 : element.shape === "rounded-rectangle" ? 18 : 0;
    return <Group {...common}>
      {scratchMask && element.shape === "custom" && <Rect width={layout.width} height={layout.height} fill="rgba(0,0,0,0.001)" />}
      {maskedScratchReveal
        ? <KonvaImage image={maskedScratchReveal} width={layout.width} height={layout.height} listening={false} />
        : <Rect width={layout.width} height={layout.height} fill={element.revealedBackgroundColor ?? "#fffaf5"} cornerRadius={cornerRadius} />}
      {element.shape !== "custom" || !scratchMask ? <Text x={scratchText.textOffsetX} y={scratchText.textOffsetY} width={layout.width} height={layout.height} text={element.content} fill={scratchText.textColor} fontFamily={scratchText.fontFamily} fontSize={scratchText.fontSize} fontStyle={scratchText.fontWeight >= 600 ? "bold" : "normal"} align={scratchText.textAlign} verticalAlign="middle" padding={8} /> : null}
      {maskedScratchSurface ? <KonvaImage image={maskedScratchSurface} width={layout.width} height={layout.height} listening={false} /> : <Rect
        width={layout.width}
        height={layout.height}
        cornerRadius={cornerRadius}
        fillRadialGradientStartPoint={{ x: layout.width * .3, y: layout.height * .24 }}
        fillRadialGradientEndPoint={{ x: layout.width * .52, y: layout.height * .55 }}
        fillRadialGradientStartRadius={0}
        fillRadialGradientEndRadius={Math.max(layout.width, layout.height) * .82}
        fillRadialGradientColorStops={[0, surface.light, .48, surface.base, 1, surface.dark]}
        listening={false}
      />}
      <ScratchIndicatorCanvas element={element} width={layout.width} height={layout.height} />
    </Group>;
  }
  if (element.type === "carousel") return <Group {...common}><Rect width={layout.width} height={layout.height} fill="#eee8e2" cornerRadius={element.cornerRadius} />{image ? <KonvaImage image={image} width={layout.width} height={layout.height} cornerRadius={element.cornerRadius} /> : <Text width={layout.width} height={layout.height} text="CARROUSEL\nAjoutez des photos" fill="#8a7c72" fontFamily="Montserrat" fontSize={12} align="center" verticalAlign="middle" lineHeight={1.6} />}</Group>;
  if (element.type === "location") {
    const scale = layout.visualStyle?.locationScale ?? 1;
    return <Group {...common}><Rect width={layout.width} height={layout.height} fill={element.backgroundColor} cornerRadius={16 * scale} /><Rect x={12 * scale} y={12 * scale} width={layout.width - 24 * scale} height={layout.height * .48} fill="#e5ded6" cornerRadius={11 * scale} /><Text x={24 * scale} y={layout.height * .54} width={layout.width - 48 * scale} text={`${element.venueName}\n${element.address}`} fill={element.textColor} fontFamily="Cormorant Garamond" fontSize={20 * scale} lineHeight={1.4} /><Rect x={24 * scale} y={layout.height - 52 * scale} width={layout.width - 48 * scale} height={34 * scale} fill={element.accentColor} cornerRadius={8 * scale} /><Text x={24 * scale} y={layout.height - 43 * scale} width={layout.width - 48 * scale} text={element.buttonLabel} fill="#fff" fontFamily="Montserrat" fontSize={10 * scale} align="center" /></Group>;
  }
  if (element.type === "schedule") {
    return <Group {...common}><ScheduleCanvasContent element={element} layout={layout} /></Group>;
  }
  if (element.type === "calendar") return <Group {...common}><CalendarCanvasContent element={element} layout={layout} /></Group>;
  if (element.type === "button") return <Group {...common}><Rect width={layout.width} height={layout.height} fill={element.backgroundColor} stroke={element.borderColor} strokeWidth={element.borderWidth} cornerRadius={element.borderRadius} /><Text width={layout.width} height={layout.height} text={element.label} fill={element.textColor} fontFamily={element.fontFamily ?? "Montserrat"} fontSize={element.fontSize ?? 13} fontStyle={(element.fontWeight ?? 700) >= 600 ? "bold" : "normal"} align={element.textAlign} padding={16} verticalAlign="middle" /></Group>;
  if (element.type === "section") return <Group {...common}><SectionCanvasSurface element={element} layout={layout} /><Rect width={layout.width} height={layout.height} fill="rgba(0,0,0,0.001)" stroke={selected ? "#9a6d51" : undefined} strokeWidth={selected ? 2 : 0} cornerRadius={element.cornerRadius} /></Group>;
  if (element.shape === "circle") return <Circle {...common} x={layout.x + layout.width / 2} y={layout.y + layout.height / 2} radius={Math.min(layout.width, layout.height) / 2} fill={element.fill} stroke={element.stroke} strokeWidth={element.strokeWidth} />;
  if (element.shape === "line") return <Line {...common} points={[0, 0, layout.width, 0]} stroke={element.stroke} strokeWidth={element.strokeWidth || 2} hitStrokeWidth={18} />;
  return <Rect {...common} fill={element.fill} stroke={element.stroke} strokeWidth={element.strokeWidth} cornerRadius={element.cornerRadius} />;
}

export function EditorCanvas() {
  const { project, currentPageId, selectedElementId, selectedElementIds, selectElement, moveElements, setElementsLocked, toggleElementLocked, zoom, previewDevice, setFitZoom, setZoom, setSidebarView, sidebarView, updateRsvp } = useEditorStore();
  const canvasAreaRef = useRef<HTMLDivElement>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const guideLayerRef = useRef<Konva.Layer>(null);
  const lockControlRef = useRef<Konva.Group>(null);
  const multiSelectionHitRef = useRef<Konva.Rect>(null);
  const multiSelectionOutlineRef = useRef<Konva.Rect>(null);
  const dragPointerStartRef = useRef<{
    stage: Konva.Stage;
    pointer: CanvasPoint;
    nodes: Map<string, DragNodeSnapshot>;
    initialPositions: Record<string, CanvasPoint>;
  } | null>(null);
  const [selectionBounds, setSelectionBounds] = useState<AlignmentBounds | null>(null);
  const [additiveSelectionHeld, setAdditiveSelectionHeld] = useState(false);
  const fontRevision = useProjectFontRevision();
  const previousFitRef = useRef<number | undefined>(undefined);
  const previousDeviceRef = useRef(previewDevice);
  const groupDragRef = useRef<{
    directIds: string[];
    pointerStart: CanvasPoint;
    device: PreviewDevice;
    preserveSectionMembership: boolean;
    initialPositions: Record<string, CanvasPoint>;
    nodes: Map<string, DragNodeSnapshot>;
    selectionBounds: AlignmentBounds;
    candidates: AlignmentCandidate[];
    spacingReferences: SpacingReferences;
    deltaX: number;
    deltaY: number;
  } | null>(null);
  const page = project?.pages.find((item) => item.id === currentPageId);
  const welcomeConfig = useMemo(() => project ? resolveWelcomePage(project.welcomePage) : undefined, [project?.welcomePage]);
  const isWelcomeEditing = sidebarView === "introduction" && project?.introductionMode === "welcome";
  const isEnvelopeEditing = sidebarView === "introduction" && project?.introductionMode === "classic" && project.opening.type === "envelope" && previewDevice === "mobile";
  const activeElements = isWelcomeEditing ? welcomeConfig?.elements : page?.elements;
  const elements = useMemo(() => [...(activeElements ?? [])].sort((a, b) => getElementZIndex(a, previewDevice) - getElementZIndex(b, previewDevice)), [activeElements, previewDevice]);
  const viewport = PREVIEW_DEVICES[previewDevice];
  const { height: rsvpHeight, measurement: rsvpMeasurement, editorText: rsvpTextLayout } = useRsvpBlockLayout(isWelcomeEditing ? undefined : project?.rsvp, previewDevice);
  const rsvpStyle = resolveRsvpStyle(project?.rsvp?.style);
  const rsvpTypography = resolveRsvpTypography(project?.rsvp, previewDevice);
  const rsvpLayerZIndex = getRsvpLayerZIndex(project?.rsvp, page?.elements ?? [], previewDevice);
  const rsvpParentId = getRsvpSectionId(project?.rsvp, previewDevice);
  const rsvpParent = elements.find((element) => element.type === "section" && element.id === rsvpParentId);
  const rsvpVisible = isRsvpVisibleOnDevice(project?.rsvp, previewDevice) && (!rsvpParent || isElementVisibleOnDevice(rsvpParent, elements, previewDevice));
  const rsvpPositionX = project?.rsvp ? getRsvpPositionX(project.rsvp, previewDevice) : 0;
  const rsvpPositionY = page && project?.rsvp ? getRsvpPositionY(page, project.rsvp, previewDevice) : 0;
  const rsvpWidth = project?.rsvp ? Math.min(viewport.width, getRsvpWidth(project.rsvp, previewDevice)) : viewport.width;
  const { inset: rsvpInset, spacing: rsvpSpacing, titleY: rsvpTitleY, textWidth: rsvpTextWidth, titleSize: rsvpTitleSize, fieldSize: rsvpFieldSize, labelSize: rsvpLabelSize, titleHeight: rsvpTitleHeight, descriptionY: rsvpDescriptionY, descriptionHeight: rsvpDescriptionHeight, fieldsY: rsvpFieldsY, fieldStep: rsvpFieldStep } = rsvpTextLayout;
  const documentHeight = page ? getDocumentHeight(page, previewDevice, rsvpVisible ? project?.rsvp : undefined, rsvpVisible ? rsvpHeight : 0) : viewport.height;
  const rsvpSelected = Boolean(rsvpVisible && selectedElementId === RSVP_EDITOR_ELEMENT_ID);
  const rsvpLocked = project?.rsvp?.locked ?? false;
  const rsvpSelectionBounds = rsvpSelected
    ? { x: rsvpPositionX, y: rsvpPositionY, width: rsvpWidth, height: rsvpHeight }
    : null;
  const selectedElement = elements.find((element) => element.id === selectedElementId);
  const selectedElements = elements.filter((element) => selectedElementIds.includes(element.id));
  const selectionContainsLocked = selectedElements.some(isElementLocked);
  const selectionFullyLocked = selectedElements.length > 0 && selectedElements.every(isElementLocked);

  const getCurrentSelectionBounds = () => {
    const stage = stageRef.current;
    if (!stage || selectedElementIds.length === 0) return null;
    const bounds = selectedElementIds.flatMap((id) => {
      const node = stage.findOne(`#${id}`);
      return node ? [getNodeBounds(node, stage)] : [];
    });
    return bounds.length > 0 ? getSelectionBounds(bounds) : null;
  };

  const syncSelectionControl = () => {
    const bounds = getCurrentSelectionBounds();
    if (bounds) positionSelectionLockControl(lockControlRef.current, bounds, selectionFullyLocked, zoom);
  };

  const toggleSelectionLock = () => {
    if (selectedElementIds.length === 0) return;
    if (selectedElementIds.length === 1) {
      toggleElementLocked(selectedElementIds[0]);
      return;
    }
    setElementsLocked(selectedElementIds, !selectionFullyLocked);
  };

  const expandSectionSelection = (ids: string[]) => {
    const expanded = new Set(ids);
    ids.forEach((id) => {
      if (elements.find((element) => element.id === id)?.type !== "section") return;
      elements.forEach((element) => {
        if (getElementSectionId(element, previewDevice) === id) expanded.add(element.id);
      });
    });
    return [...expanded];
  };

  const captureDragPointer = (event: KonvaEventObject<MouseEvent | TouchEvent>) => {
    const stage = event.target.getStage();
    if (!stage || groupDragRef.current) return;
    const pointer = getLogicalCanvasPointer(stage);
    if (!pointer) return;
    const nodes = new Map<string, DragNodeSnapshot>();
    const initialPositions: Record<string, CanvasPoint> = {};
    elements.forEach((element) => {
      const node = stage.findOne(`#${element.id}`);
      if (!node) return;
      nodes.set(element.id, { node, x: node.x(), y: node.y(), bounds: getNodeBounds(node, stage) });
      const layout = getElementLayout(element, previewDevice);
      initialPositions[element.id] = { x: layout.x, y: layout.y };
    });
    const formNode = !isWelcomeEditing && rsvpVisible ? stage.findOne(`#${RSVP_EDITOR_ELEMENT_ID}`) : undefined;
    if (formNode) {
      nodes.set(RSVP_EDITOR_ELEMENT_ID, { node: formNode, x: formNode.x(), y: formNode.y(), bounds: getNodeBounds(formNode, stage) });
      initialPositions[RSVP_EDITOR_ELEMENT_ID] = { x: rsvpPositionX, y: rsvpPositionY };
    }
    dragPointerStartRef.current = { stage, pointer, nodes, initialPositions };
  };

  const handleDragStart = (element: EditorElement | undefined, event: KonvaEventObject<DragEvent>) => {
    // Only one node drives a drag; secondary Konva drag events must never replace
    // the pointer-down snapshot of an already moving selection.
    if (groupDragRef.current) return;
    const selection = !element || selectedElementIds.includes(element.id) ? selectedElementIds : [element.id];
    if (element && !selectedElementIds.includes(element.id)) selectElement(element.id);
    const directIds = selection.filter((id) => {
      const selected = elements.find((candidate) => candidate.id === id);
      return selected && !isElementLocked(selected);
    });
    const ids = expandSectionSelection(directIds);
    if (rsvpVisible && rsvpParentId && directIds.includes(rsvpParentId)) ids.push(RSVP_EDITOR_ELEMENT_ID);
    const stage = event.target.getStage();
    const snapshot = dragPointerStartRef.current?.stage === stage ? dragPointerStartRef.current : null;
    const pointerStart = snapshot?.pointer ?? (stage ? getLogicalCanvasPointer(stage) : null);
    const nodes = new Map<string, DragNodeSnapshot>();
    const initialPositions: Record<string, CanvasPoint> = {};
    ids.forEach((id) => {
      const node = stage?.findOne(`#${id}`);
      if (!node || !stage) return;
      const initial = snapshot?.nodes.get(id);
      nodes.set(id, initial ?? { node, x: node.x(), y: node.y(), bounds: getNodeBounds(node, stage) });
      const layout = elements.find((candidate) => candidate.id === id);
      initialPositions[id] = snapshot?.initialPositions[id] ?? (layout ? getElementLayout(layout, previewDevice) : { x: rsvpPositionX, y: rsvpPositionY });
    });
    if (!stage || !pointerStart || nodes.size === 0) return;
    const singleSection = selection.length === 1 && element?.type === "section";
    const selectedBounds = singleSection
      ? [nodes.get(element.id)!.bounds]
      : [...nodes.values()].map(({ bounds }) => bounds);
    const sectionId = element ? getElementSectionId(element, previewDevice) : null;
    const sameSectionElements = selection.length === 1 && element?.type !== "section" && sectionId
      ? elements.filter((candidate) => getElementSectionId(candidate, previewDevice) === sectionId && !ids.includes(candidate.id) && isElementVisibleOnDevice(candidate, elements, previewDevice))
      : [];
    const candidateElements = singleSection
      ? elements.filter((candidate) => candidate.type === "section" && !ids.includes(candidate.id) && isElementVisibleOnDevice(candidate, elements, previewDevice))
      : sameSectionElements.length > 0
        ? sameSectionElements
        : elements.filter((candidate) => !ids.includes(candidate.id) && isElementVisibleOnDevice(candidate, elements, previewDevice));
    const candidates = candidateElements.flatMap((candidate) => {
      const node = stage.findOne(`#${candidate.id}`);
      return node ? [{ id: candidate.id, bounds: getNodeBounds(node, stage) }] : [];
    });
    groupDragRef.current = {
      directIds,
      pointerStart,
      device: previewDevice,
      preserveSectionMembership: selection.length > 1,
      initialPositions,
      nodes,
      selectionBounds: getSelectionBounds(selectedBounds),
      candidates,
      spacingReferences: getSpacingReferences(candidates, ALIGNMENT_THRESHOLD / Math.max(.1, zoom)),
      deltaX: 0,
      deltaY: 0,
    };
  };

  const handleDragMove = (event: KonvaEventObject<DragEvent>) => {
    const drag = groupDragRef.current;
    if (!drag) return;
    const stage = event.target.getStage();
    const pointer = stage ? getLogicalCanvasPointer(stage) : null;
    if (!pointer) return;
    const { deltaX: rawDeltaX, deltaY: rawDeltaY } = getPointerDragDelta(drag.pointerStart, pointer);
    const snapDisabled = Boolean(event.evt.altKey);
    const snap = snapDisabled
      ? { deltaX: 0, deltaY: 0, guides: [] }
      : calculateSnap(
          translateBounds(drag.selectionBounds, rawDeltaX, rawDeltaY),
          drag.candidates,
          { x: 0, y: 0, width: viewport.width, height: isWelcomeEditing ? viewport.height : documentHeight },
          ALIGNMENT_THRESHOLD / Math.max(.1, zoom),
          drag.spacingReferences,
        );
    const deltaX = rawDeltaX + snap.deltaX;
    const deltaY = rawDeltaY + snap.deltaY;
    drag.deltaX = deltaX;
    drag.deltaY = deltaY;
    drag.nodes.forEach(({ node, x, y }) => node.position({ x: x + deltaX, y: y + deltaY }));
    const movedSelectionBounds = translateBounds(drag.selectionBounds, deltaX, deltaY);
    const currentBounds = getCurrentSelectionBounds();
    if (currentBounds) {
      positionSelectionLockControl(lockControlRef.current, currentBounds, selectionFullyLocked, zoom);
      multiSelectionHitRef.current?.setAttrs(currentBounds);
      multiSelectionOutlineRef.current?.setAttrs(currentBounds);
    }
    const canvasBounds = { x: 0, y: 0, width: viewport.width, height: isWelcomeEditing ? viewport.height : documentHeight };
    const distances = getDistanceGuides(
      movedSelectionBounds,
      drag.candidates,
      canvasBounds,
      ALIGNMENT_THRESHOLD / Math.max(.1, zoom),
      12 / Math.max(.1, zoom),
    );
    drawEditorGuides(guideLayerRef.current, snap.guides, distances, zoom, previewDevice);
    stage?.batchDraw();
  };

  const handleDragEnd = () => {
    const drag = groupDragRef.current;
    groupDragRef.current = null;
    dragPointerStartRef.current = null;
    clearEditorGuides(guideLayerRef.current);
    if (!drag) return;
    moveElements(drag.directIds, drag.deltaX, drag.deltaY, {
      device: drag.device,
      initialPositions: drag.initialPositions,
      preserveSectionMembership: drag.preserveSectionMembership,
    });
  };

  useEffect(() => {
    const updateModifier = (event: KeyboardEvent) => setAdditiveSelectionHeld(event.ctrlKey || event.metaKey);
    const clearModifier = () => setAdditiveSelectionHeld(false);
    window.addEventListener("keydown", updateModifier);
    window.addEventListener("keyup", updateModifier);
    window.addEventListener("blur", clearModifier);
    return () => {
      window.removeEventListener("keydown", updateModifier);
      window.removeEventListener("keyup", updateModifier);
      window.removeEventListener("blur", clearModifier);
    };
  }, []);

  useEffect(() => {
    const canvasArea = canvasAreaRef.current;
    if (!canvasArea) return;

    const updateFitZoom = () => {
      const compact = window.matchMedia("(max-width: 760px)").matches;
      const availableWidth = canvasArea.clientWidth - (compact ? 36 : 96);
      const nextFit = Math.min(1, Math.max(0.1, (availableWidth - viewport.frameHorizontal) / viewport.width));
      const state = useEditorStore.getState();
      const deviceChanged = previousDeviceRef.current !== previewDevice;
      const wasFitted = previousFitRef.current === undefined || Math.abs(state.zoom - previousFitRef.current) < 0.011;

      setFitZoom(nextFit);
      if (deviceChanged || wasFitted) setZoom(nextFit);
      previousFitRef.current = nextFit;
      previousDeviceRef.current = previewDevice;
    };

    const frame = window.requestAnimationFrame(updateFitZoom);
    window.addEventListener("resize", updateFitZoom);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateFitZoom);
    };
  }, [previewDevice, setFitZoom, setZoom, viewport.frameHorizontal, viewport.width]);

  useEffect(() => {
    const transformer = transformerRef.current;
    const stage = stageRef.current;
    if (!transformer || !stage) return;
    const selectedNodes = selectedElementIds.filter((id) => id !== RSVP_EDITOR_ELEMENT_ID).map((id) => stage.findOne(`#${id}`)).filter((node): node is Konva.Node => Boolean(node));
    // Konva's Transformer proxies drag events to every attached node. Our
    // selection controller moves all nodes itself, so only single selections
    // attach to the Transformer; multi-selection uses its own visual frame.
    transformer.nodes(selectedNodes.length === 1 ? selectedNodes : []);
    transformer.getLayer()?.batchDraw();
    const bounds = selectedNodes.length > 0
      ? getSelectionBounds(selectedNodes.map((node) => getNodeBounds(node, stage)))
      : null;
    setSelectionBounds(bounds);
  }, [selectedElementIds, elements, previewDevice, sidebarView, zoom, fontRevision]);

  useEffect(() => {
    let cancelled = false;
    let frame = 0;
    const reflowText = async () => {
      if (typeof document !== "undefined") await document.fonts.ready;
      frame = window.requestAnimationFrame(() => {
        if (cancelled) return;
        const stage = stageRef.current;
        if (!stage) return;
        stage.find("Text").forEach((node) => {
          const textNode = node as Konva.Text;
          const width = textNode.width();
          // Konva caches wrapping/line metrics. A reversible width invalidation
          // recomputes them without changing the persisted element geometry.
          if (Number.isFinite(width)) {
            textNode.width(width + 0.001);
            textNode.width(width);
          }
          textNode.clearCache();
        });
        transformerRef.current?.forceUpdate();
        stage.batchDraw();
      });
    };
    void reflowText();
    return () => { cancelled = true; window.cancelAnimationFrame(frame); };
  }, [fontRevision, previewDevice, sidebarView, project?.id]);

  useEffect(() => {
    if (isWelcomeEditing || !project?.rsvp?.enabled) return;
    const node = stageRef.current?.findOne(`#${RSVP_EDITOR_ELEMENT_ID}`);
    const layer = node?.getLayer();
    if (!node || !layer) return;
    const backgroundNodes = 1 + (page?.backgroundSections?.length ?? 0);
    node.zIndex(backgroundNodes + elements.filter((element) => getElementZIndex(element, previewDevice) < rsvpLayerZIndex).length);
    transformerRef.current?.moveToTop();
    layer.batchDraw();
  }, [elements, isWelcomeEditing, page?.backgroundSections?.length, project?.rsvp?.enabled, rsvpLayerZIndex]);

  if (!page) return null;

  const multiSelectionHit = selectionBounds && selectedElementIds.length > 1 ? <Rect
    ref={multiSelectionHitRef}
    {...selectionBounds}
    fill="rgba(0,0,0,0.001)"
    listening={!additiveSelectionHeld}
    draggable={!selectionFullyLocked}
    dragDistance={1}
    onClick={(event) => { event.cancelBubble = true; }}
    onTap={(event) => { event.cancelBubble = true; }}
    onDragStart={(event) => handleDragStart(undefined, event)}
    onDragMove={handleDragMove}
    onDragEnd={handleDragEnd}
  /> : null;
  const multiSelectionOutline = selectionBounds && selectedElementIds.length > 1 ? <Rect
    ref={multiSelectionOutlineRef}
    {...selectionBounds}
    stroke="#9a6d51"
    strokeWidth={1.5 / zoom}
    listening={false}
  /> : null;

  if (isWelcomeEditing && welcomeConfig) {
    const welcomeContentElements = elements.filter((element) => !(element.type === "button" && element.welcomeAction === "enter"));
    const welcomeInteractionElements = elements.filter((element) => element.type === "button" && element.welcomeAction === "enter");
    return <div ref={canvasAreaRef} className="canvas-area welcome-canvas-area">
    <ProjectFontLoader project={project} />
    <div className={`device-preview-frame device-preview-frame-${previewDevice}`}>
      <div className="preview-device-screen" style={{ width: viewport.width * zoom, height: viewport.height * zoom }}>
        <div className="welcome-editor-scale" style={{ width: viewport.width, height: viewport.height, transform: `scale(${zoom})` }}>
          <WelcomePageRenderer config={welcomeConfig} device={previewDevice} interactive={false} showElements={false} />
          <div className="welcome-editor-content-layer">
          <Stage ref={stageRef} width={viewport.width} height={viewport.height} onMouseDown={(event) => { captureDragPointer(event); if (event.target === event.target.getStage()) selectElement(null); }} onTouchStart={(event) => { captureDragPointer(event); if (event.target === event.target.getStage()) selectElement(null); }}>
            <Layer>
              {welcomeContentElements.map((element) => <CanvasElement key={element.id} element={element} device={previewDevice} visible={getElementLayout(element, previewDevice).visible} selected={selectedElementIds.includes(element.id)} onSelect={(additive) => { if (!additive && selectedElementIds.includes(element.id)) return; selectElement(element.id, additive); }} onElementDragStart={(event) => handleDragStart(element, event)} onElementDragMove={handleDragMove} onElementDragEnd={handleDragEnd} />)}
            </Layer>
            <Layer>
              {welcomeInteractionElements.map((element) => <CanvasElement key={element.id} element={element} device={previewDevice} visible={getElementLayout(element, previewDevice).visible} selected={selectedElementIds.includes(element.id)} onSelect={(additive) => { if (!additive && selectedElementIds.includes(element.id)) return; selectElement(element.id, additive); }} onElementDragStart={(event) => handleDragStart(element, event)} onElementDragMove={handleDragMove} onElementDragEnd={handleDragEnd} />)}
            </Layer>
            <Layer ref={guideLayerRef} listening={false} />
            <Layer>
              {multiSelectionHit}
              <Transformer ref={transformerRef} rotateEnabled={!selectionContainsLocked && selectedElementIds.length <= 1} resizeEnabled={!selectionContainsLocked} enabledAnchors={selectionContainsLocked || selectedElementIds.length > 1 ? [] : ["top-left", "top-right", "bottom-left", "bottom-right", "middle-left", "middle-right"]} anchorFill="#fff" anchorStroke="#9a6d51" borderStroke="#9a6d51" anchorSize={10 / zoom} borderStrokeWidth={1.5 / zoom} rotateAnchorOffset={28 / zoom} onTransform={syncSelectionControl} onTransformEnd={syncSelectionControl} boundBoxFunc={(oldBox, newBox) => newBox.width < 12 || newBox.height < 12 ? oldBox : newBox} />
              {multiSelectionOutline}
              {selectionBounds && <SelectionLockControl ref={lockControlRef} bounds={selectionBounds} locked={selectionFullyLocked} zoom={zoom} onToggle={toggleSelectionLock} />}
            </Layer>
          </Stage>
          </div>
        </div>
      </div>
    </div>
  </div>;
  }

  return (
  <div
    ref={canvasAreaRef}
    className="canvas-area"
    onMouseDown={(event) => {
      if (event.target === event.currentTarget) {
        selectElement(null);
      }
    }}
  >
    <div
      className={`device-preview-frame device-preview-frame-${previewDevice}`}
    >
      <div
        className="preview-device-screen"
        style={{
          width: viewport.width * zoom,
          height: (isEnvelopeEditing ? viewport.height : documentHeight) * zoom,
        }}
      >
        {project && <ProjectFontLoader project={project} />}
        {project?.particles?.enabled && project.particles.layer === "behind" && <ParticleRenderer config={project.particles} />}

        <div className="preview-stage-layer">
          <Stage
            ref={stageRef}
            width={viewport.width * zoom}
            height={documentHeight * zoom}
            scaleX={zoom}
            scaleY={zoom}
            onMouseDown={(event) => {
              captureDragPointer(event);
              if (event.target === event.target.getStage()) selectElement(null);
            }}
            onTouchStart={(event) => {
              captureDragPointer(event);
              if (event.target === event.target.getStage()) selectElement(null);
            }}
          >
            <Layer>
              <Background background={page.background} width={viewport.width} height={documentHeight} />
              {(page.backgroundSections ?? []).map((section) => <Background key={section.id} background={section.background} width={viewport.width} height={section.height} y={section.y} />)}

              {elements.map((element) => (
                <CanvasElement
                  key={element.id}
                  element={element}
                  device={previewDevice}
                  visible={isElementVisibleOnDevice(element, elements, previewDevice)}
                  selected={selectedElementIds.includes(element.id)}
                  onSelect={(additive) => {
                    if (!additive && selectedElementIds.includes(element.id)) return;
                    selectElement(element.id, additive);
                  }}
                  onElementDragStart={(event) => handleDragStart(element, event)}
                  onElementDragMove={handleDragMove}
                  onElementDragEnd={handleDragEnd}
                />
              ))}

              <Transformer
                ref={transformerRef}
                rotateEnabled={!selectionContainsLocked && selectedElementIds.length <= 1}
                resizeEnabled={!selectionContainsLocked}
                keepRatio={selectedElement?.type === "image"}
                enabledAnchors={selectionContainsLocked || selectedElementIds.length > 1 ? [] : selectedElement?.type === "image"
                  ? ["top-left", "top-right", "bottom-left", "bottom-right"]
                  : ["top-left", "top-right", "bottom-left", "bottom-right", "middle-left", "middle-right"]}
                anchorFill="#fff"
                anchorStroke="#9a6d51"
                borderStroke="#9a6d51"
                anchorSize={10 / zoom}
                borderStrokeWidth={1.5 / zoom}
                rotateAnchorOffset={28 / zoom}
                onTransform={syncSelectionControl}
                onTransformEnd={syncSelectionControl}
                boundBoxFunc={(oldBox, newBox) => newBox.width < 12 || newBox.height < 12 ? oldBox : newBox}
              />
              {rsvpVisible && project?.rsvp && <Group
                id={RSVP_EDITOR_ELEMENT_ID}
                x={rsvpPositionX}
                y={rsvpPositionY}
                draggable={!rsvpLocked}
                dragBoundFunc={(position) => ({ x: Math.max(0, Math.min(viewport.width - rsvpWidth, position.x)), y: Math.max(0, position.y) })}
                onClick={(event) => { event.cancelBubble = true; setSidebarView("elements"); selectElement(RSVP_EDITOR_ELEMENT_ID); }}
                onTap={(event) => { event.cancelBubble = true; setSidebarView("elements"); selectElement(RSVP_EDITOR_ELEMENT_ID); }}
                onDragEnd={(event) => {
                  if (rsvpLocked) return;
                  const x = Math.max(0, event.target.x());
                  const y = Math.max(0, event.target.y());
                  const centerX = x + rsvpWidth / 2;
                  const centerY = y + rsvpHeight / 2;
                  const section = elements.find((candidate) => {
                    if (candidate.type !== "section") return false;
                    const layout = getElementLayout(candidate, previewDevice);
                    return centerX >= layout.x && centerX <= layout.x + layout.width && centerY >= layout.y && centerY <= layout.y + layout.height;
                  });
                  updateRsvp(setRsvpSectionForDevice(setRsvpLayoutForDevice(project.rsvp!, previewDevice, { x, y, width: rsvpWidth }), previewDevice, section?.id ?? null));
                }}
                onMouseEnter={(event) => { event.target.getStage()!.container().style.cursor = "move"; }}
                onMouseLeave={(event) => { event.target.getStage()!.container().style.cursor = "default"; }}
              >
                <Rect width={rsvpWidth} height={rsvpHeight} fill={rsvpStyle.backgroundColor} stroke={rsvpSelected ? rsvpStyle.selectionColor : undefined} strokeWidth={rsvpSelected ? 3 / zoom : 0} />
                <Text x={rsvpInset} y={18 * rsvpSpacing} width={rsvpTextWidth} text="↕ GLISSER POUR DÉPLACER" fontFamily="Montserrat" fontSize={9 * rsvpSpacing} letterSpacing={1.2} align="center" fill={rsvpStyle.labelColor} opacity={0.7} />
                <Text x={rsvpInset} y={rsvpTitleY} width={rsvpTextWidth} height={rsvpTitleHeight} text={project.rsvp.title} fontFamily={rsvpTypography?.fontFamily ?? "Cormorant Garamond"} fontSize={rsvpTitleSize} lineHeight={1.05} align="center" verticalAlign="top" fill={rsvpStyle.textColor} />
                {project.rsvp.description && <Text x={rsvpInset} y={rsvpDescriptionY} width={rsvpTextWidth} height={rsvpDescriptionHeight} text={project.rsvp.description} fontFamily={rsvpTypography?.fontFamily ?? "Lora"} fontSize={rsvpFieldSize} lineHeight={1.5} align="center" verticalAlign="top" fill={rsvpStyle.textColor} />}
                {project.rsvp.fields.map((field, index) => <Group key={field.id} y={rsvpFieldsY + index * rsvpFieldStep}>
                  <Text x={rsvpInset} width={rsvpTextWidth} text={`${field.label}${field.required ? " *" : ""}`} fontFamily={rsvpTypography?.fontFamily ?? "Montserrat"} fontSize={rsvpLabelSize} fill={rsvpStyle.labelColor} />
                  <Rect x={rsvpInset} y={24 * rsvpSpacing} width={rsvpTextWidth} height={42 * rsvpSpacing} cornerRadius={8 * rsvpSpacing} fill={rsvpStyle.fieldBackgroundColor} stroke={rsvpStyle.fieldBorderColor} />
                </Group>)}
                <Rect x={rsvpInset} y={rsvpHeight - 86 * rsvpSpacing} width={rsvpTextWidth} height={44 * rsvpSpacing} cornerRadius={9 * rsvpSpacing} fill={rsvpStyle.buttonBackgroundColor} />
                <Text x={rsvpInset} y={rsvpHeight - 72 * rsvpSpacing} width={rsvpTextWidth} text={project.rsvp.submitLabel.toUpperCase()} fontFamily={rsvpTypography?.fontFamily ?? "Montserrat"} fontSize={10 * rsvpSpacing} fontStyle="bold" letterSpacing={1} align="center" fill={rsvpStyle.buttonTextColor} />
              </Group>}
            </Layer>
            <Layer ref={guideLayerRef} listening={false} />
            <Layer>
              {multiSelectionHit}
              {multiSelectionOutline}
              {selectionBounds && <SelectionLockControl ref={lockControlRef} bounds={selectionBounds} locked={selectionFullyLocked} zoom={zoom} onToggle={toggleSelectionLock} />}
              {rsvpSelectionBounds && <SelectionLockControl bounds={rsvpSelectionBounds} locked={rsvpLocked} zoom={zoom} onToggle={() => toggleElementLocked(RSVP_EDITOR_ELEMENT_ID)} />}
            </Layer>
          </Stage>
        </div>

        {rsvpMeasurement}
        {project?.particles?.enabled && project.particles.layer === "front" && <ParticleRenderer config={project.particles} />}
        {isEnvelopeEditing && <div className="envelope-editor-closed-preview" style={{ width: viewport.width, height: viewport.height, transform: `scale(${zoom})`, "--preview-device-height": `${viewport.height}px` } as CSSProperties}>
          <PngEnvelopeOpening config={project.opening} couple={project.name} closedPreview>{null}</PngEnvelopeOpening>
        </div>}
      </div>
    </div>
  </div>
);
}
