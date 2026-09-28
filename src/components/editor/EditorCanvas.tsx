import { useEffect, useMemo, useRef, useState } from "react";
import { Circle, Group, Image as KonvaImage, Layer, Line, Path, Rect, Stage, Text, Transformer } from "react-konva";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type { EditorElement, ImageElement, PageBackground } from "../../types/editor";
import { useEditorStore } from "../../stores/editorStore";
import { ParticleRenderer } from "../../features/particles/ParticleRenderer";
import {
  PREVIEW_DEVICES,
  type PreviewDevice,
} from "../../config/previewDevices";
import { getElementLayout } from "../../utils/responsiveLayout";
import { getDocumentHeight, getRsvpBlockHeight, getRsvpPositionY, setRsvpPositionForDevice } from "../../utils/documentLayout";
import { ProjectFontLoader } from "../../features/fonts/ProjectFontLoader";
import { resolveRsvpStyle } from "../../config/rsvpStyle";
import { getDecorativeHeart } from "../../features/hearts/heartRegistry";
import { WelcomePageRenderer } from "../../features/welcome/WelcomePageRenderer";
import { resolveWelcomePage } from "../../features/welcome/welcomeDefaults";
import { getScratchTextStyle } from "../../features/elements/scratchDefaults";
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

function useLoadedImage(src?: string) {
  const [image, setImage] = useState<HTMLImageElement>();
  useEffect(() => {
    if (!src) return setImage(undefined);
    const next = new Image();
    next.onload = () => setImage(next);
    next.src = src;
  }, [src]);
  return image;
}

const getCoverCrop = (image: HTMLImageElement, width: number, height: number) => {
  const targetRatio = width / Math.max(1, height);
  const imageRatio = image.naturalWidth / Math.max(1, image.naturalHeight);
  if (imageRatio > targetRatio) {
    const cropWidth = image.naturalHeight * targetRatio;
    return { x: (image.naturalWidth - cropWidth) / 2, y: 0, width: cropWidth, height: image.naturalHeight };
  }
  const cropHeight = image.naturalWidth / targetRatio;
  return { x: 0, y: (image.naturalHeight - cropHeight) / 2, width: image.naturalWidth, height: cropHeight };
};

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

function CanvasElement({
  element,
  device,
  selected,
  onSelect,
  onElementDragStart,
  onElementDragMove,
  onElementDragEnd,
}: {
  element: EditorElement;
  device: PreviewDevice;
  selected: boolean;
  onSelect: (additive: boolean) => void;
  onElementDragStart: (event: KonvaEventObject<DragEvent>) => void;
  onElementDragMove: (event: KonvaEventObject<DragEvent>) => void;
  onElementDragEnd: (event: KonvaEventObject<DragEvent>) => void;
}) {
  const image = useLoadedImage(element.type === "image" ? element.src : element.type === "carousel" ? element.images[0]?.url : undefined);
  const layout = getElementLayout(element, device);
  const isCircle = element.type === "shape" && element.shape === "circle";
  const common = {
    id: element.id, x: layout.x, y: layout.y, width: layout.width, height: layout.height,
    rotation: layout.rotation, opacity: element.opacity, visible: element.visible,
    draggable: isLockableElement(element) && !isElementLocked(element),
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
        x: node.x() - (isCircle ? width / 2 : 0),
        y: node.y() - (isCircle ? height / 2 : 0),
        rotation: node.rotation(), width, height,
      });
    },
    shadowColor: selected ? "#b78d72" : undefined,
    shadowBlur: selected ? 8 : 0,
    shadowOpacity: selected ? 0.22 : 0,
  };

  if (element.type === "text") return <Text {...common} text={element.text} fontFamily={element.fontFamily} fontSize={layout.fontSize ?? element.fontSize} fontStyle={`${element.italic ? "italic" : "normal"} ${element.fontWeight >= 600 ? "bold" : "normal"}`} fill={element.color} align={element.textAlign} lineHeight={element.lineHeight} letterSpacing={element.letterSpacing} textDecoration={element.underline ? "underline" : ""} verticalAlign="middle" />;
  if (element.type === "image") return image
    ? <KonvaImage {...common} image={image} crop={getCoverCrop(image, layout.width, layout.height)} alt={(element as ImageElement).alt} />
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
    return <Group {...common}>
      <Rect width={layout.width} height={layout.height} fill={element.revealedBackgroundColor ?? "#fffaf5"} cornerRadius={element.shape === "circle" ? Math.min(layout.width, layout.height) / 2 : element.shape === "rounded-rectangle" ? 18 : 0} />
      <Text x={scratchText.textOffsetX} y={scratchText.textOffsetY} width={layout.width} height={layout.height} text={element.content} fill={scratchText.textColor} fontFamily={scratchText.fontFamily} fontSize={scratchText.fontSize} fontStyle={scratchText.fontWeight >= 600 ? "bold" : "normal"} align={scratchText.textAlign} verticalAlign="middle" padding={8} />
    </Group>;
  }
  if (element.type === "carousel") return <Group {...common}><Rect width={layout.width} height={layout.height} fill="#eee8e2" cornerRadius={element.cornerRadius} />{image ? <KonvaImage image={image} width={layout.width} height={layout.height} cornerRadius={element.cornerRadius} /> : <Text width={layout.width} height={layout.height} text="CARROUSEL\nAjoutez des photos" fill="#8a7c72" fontFamily="Montserrat" fontSize={12} align="center" verticalAlign="middle" lineHeight={1.6} />}</Group>;
  if (element.type === "location") return <Group {...common}><Rect width={layout.width} height={layout.height} fill={element.backgroundColor} cornerRadius={16} /><Rect x={12} y={12} width={layout.width - 24} height={layout.height * .48} fill="#e5ded6" cornerRadius={11} /><Text x={24} y={layout.height * .54} width={layout.width - 48} text={`${element.venueName}\n${element.address}`} fill={element.textColor} fontFamily="Cormorant Garamond" fontSize={20} lineHeight={1.4} /><Rect x={24} y={layout.height - 52} width={layout.width - 48} height={34} fill={element.accentColor} cornerRadius={8} /><Text x={24} y={layout.height - 43} width={layout.width - 48} text={element.buttonLabel} fill="#fff" fontFamily="Montserrat" fontSize={10} align="center" /></Group>;
  if (element.type === "schedule") {
    const step = Math.max(54, (layout.height - 42) / Math.max(1, element.items.length));
    return <Group {...common}><Rect width={layout.width} height={layout.height} fill={element.backgroundColor} cornerRadius={14} />
      {element.displayStyle !== "list" && <Line points={element.displayStyle === "elegant" ? [layout.width * .38, 24, layout.width * .38, layout.height - 24] : [30, 24, 30, layout.height - 24]} stroke={element.lineColor} strokeWidth={element.displayStyle === "elegant" ? 1 : 2} />}
      {element.items.map((item, index) => {
        const y = 24 + index * step;
        if (element.displayStyle === "list") return <Group key={item.id} x={24} y={y}><Text width={58} text={item.time} fill={element.timeColor} fontFamily="Montserrat" fontSize={11} fontStyle="bold" /><Text x={66} width={layout.width - 114} text={`${item.title}${item.description ? `\n${item.description}` : ""}`} fill={element.textColor} fontFamily="Cormorant Garamond" fontSize={16} lineHeight={1.25} /></Group>;
        if (element.displayStyle === "elegant") return <Group key={item.id} y={y}><Text x={20} width={layout.width * .28} text={item.time} fill={element.timeColor} fontFamily="Cormorant Garamond" fontSize={15} align="right" /><Rect x={layout.width * .38} y={7} width={10} height={10} rotation={45} offsetX={5} offsetY={5} fill={element.backgroundColor} stroke={element.accentColor} strokeWidth={1.5} /><Text x={layout.width * .44} width={layout.width * .48} text={`${item.title}${item.description ? `\n${item.description}` : ""}`} fill={element.textColor} fontFamily="Cormorant Garamond" fontSize={17} lineHeight={1.25} /></Group>;
        return <Group key={item.id} x={24} y={y}><Circle x={6} y={7} radius={5} fill={element.backgroundColor} stroke={element.accentColor} strokeWidth={2} /><Text x={22} width={54} text={item.time} fill={element.timeColor} fontFamily="Montserrat" fontSize={11} /><Text x={82} width={layout.width - 116} text={`${item.title}${item.description ? `\n${item.description}` : ""}`} fill={element.textColor} fontFamily="Cormorant Garamond" fontSize={15} lineHeight={1.2} /></Group>;
      })}
    </Group>;
  }
  if (element.type === "button") return <Group {...common}><Rect width={layout.width} height={layout.height} fill={element.backgroundColor} stroke={element.borderColor} strokeWidth={element.borderWidth} cornerRadius={element.borderRadius} /><Text width={layout.width} height={layout.height} text={element.label} fill={element.textColor} fontFamily={element.fontFamily ?? "Montserrat"} fontSize={element.fontSize ?? 13} fontStyle={(element.fontWeight ?? 700) >= 600 ? "bold" : "normal"} align={element.textAlign} padding={16} verticalAlign="middle" /></Group>;
  if (element.type === "section") return <Group {...common}><Background background={element.background} width={layout.width} height={layout.height} /><Rect width={layout.width} height={layout.height} fill="rgba(0,0,0,0.001)" stroke={selected ? "#9a6d51" : undefined} strokeWidth={selected ? 2 : 0} cornerRadius={element.cornerRadius} /></Group>;
  if (element.shape === "circle") return <Circle {...common} x={layout.x + layout.width / 2} y={layout.y + layout.height / 2} radius={Math.min(layout.width, layout.height) / 2} fill={element.fill} stroke={element.stroke} strokeWidth={element.strokeWidth} />;
  if (element.shape === "line") return <Line {...common} points={[0, 0, layout.width, 0]} stroke={element.stroke} strokeWidth={element.strokeWidth || 2} hitStrokeWidth={18} />;
  return <Rect {...common} fill={element.fill} stroke={element.stroke} strokeWidth={element.strokeWidth} cornerRadius={element.cornerRadius} />;
}

export function EditorCanvas() {
  const { project, currentPageId, selectedElementId, selectedElementIds, selectElement, moveElements, setElementsLocked, zoom, previewDevice, setFitZoom, setZoom, setSidebarView, sidebarView, updateRsvp } = useEditorStore();
  const canvasAreaRef = useRef<HTMLDivElement>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const guideLayerRef = useRef<Konva.Layer>(null);
  const lockControlRef = useRef<Konva.Group>(null);
  const [selectionBounds, setSelectionBounds] = useState<AlignmentBounds | null>(null);
  const previousFitRef = useRef<number | undefined>(undefined);
  const previousDeviceRef = useRef(previewDevice);
  const groupDragRef = useRef<{
    ids: string[];
    directIds: string[];
    startX: number;
    startY: number;
    nodes: Map<string, { node: Konva.Node; x: number; y: number }>;
    selectionBounds: AlignmentBounds;
    candidates: AlignmentCandidate[];
    spacingReferences: SpacingReferences;
    deltaX: number;
    deltaY: number;
  } | null>(null);
  const page = project?.pages.find((item) => item.id === currentPageId);
  const welcomeConfig = project ? resolveWelcomePage(project.welcomePage) : undefined;
  const isWelcomeEditing = sidebarView === "introduction" && project?.introductionMode === "welcome";
  const activeElements = isWelcomeEditing ? welcomeConfig?.elements : page?.elements;
  const elements = useMemo(() => [...(activeElements ?? [])].sort((a, b) => a.zIndex - b.zIndex), [activeElements]);
  const viewport = PREVIEW_DEVICES[previewDevice];
  const rsvpHeight = getRsvpBlockHeight(project?.rsvp, previewDevice);
  const rsvpStyle = resolveRsvpStyle(project?.rsvp?.style);
  const rsvpPositionY = page && project?.rsvp ? getRsvpPositionY(page, project.rsvp, previewDevice) : 0;
  const documentHeight = page ? getDocumentHeight(page, previewDevice, project?.rsvp) : viewport.height;
  const rsvpSelected = Boolean(project?.rsvp?.enabled && sidebarView === "rsvp");
  const rsvpLocked = project?.rsvp?.locked ?? false;
  const rsvpSelectionBounds = rsvpSelected
    ? { x: 0, y: rsvpPositionY, width: viewport.width, height: rsvpHeight }
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
    setElementsLocked(selectedElementIds, !selectionFullyLocked);
  };

  const expandSectionSelection = (ids: string[]) => {
    const expanded = new Set(ids);
    ids.forEach((id) => {
      if (elements.find((element) => element.id === id)?.type !== "section") return;
      elements.forEach((element) => {
        if (element.sectionId === id) expanded.add(element.id);
      });
    });
    return [...expanded];
  };

  const handleDragStart = (element: EditorElement, event: KonvaEventObject<DragEvent>) => {
    const selection = selectedElementIds.includes(element.id) ? selectedElementIds : [element.id];
    if (!selectedElementIds.includes(element.id)) selectElement(element.id);
    const directIds = selection.filter((id) => {
      const selected = elements.find((candidate) => candidate.id === id);
      return selected && !isElementLocked(selected);
    });
    const ids = expandSectionSelection(directIds);
    const stage = event.target.getStage();
    const nodes = new Map<string, { node: Konva.Node; x: number; y: number }>();
    ids.forEach((id) => {
      const node = stage?.findOne(`#${id}`);
      if (node) nodes.set(id, { node, x: node.x(), y: node.y() });
    });
    if (!stage || nodes.size === 0) return;
    const selectedBounds = element.type === "section"
      ? [getNodeBounds(event.target, stage)]
      : [...nodes.values()].map(({ node }) => getNodeBounds(node, stage));
    const sameSectionElements = element.type !== "section" && element.sectionId
      ? elements.filter((candidate) => candidate.sectionId === element.sectionId && !ids.includes(candidate.id) && candidate.visible)
      : [];
    const candidateElements = element.type === "section"
      ? elements.filter((candidate) => candidate.type === "section" && !ids.includes(candidate.id) && candidate.visible)
      : sameSectionElements.length > 0
        ? sameSectionElements
        : elements.filter((candidate) => !ids.includes(candidate.id) && candidate.visible);
    const candidates = candidateElements.flatMap((candidate) => {
      const node = stage.findOne(`#${candidate.id}`);
      return node ? [{ id: candidate.id, bounds: getNodeBounds(node, stage) }] : [];
    });
    groupDragRef.current = {
      ids,
      directIds,
      startX: event.target.x(),
      startY: event.target.y(),
      nodes,
      selectionBounds: getSelectionBounds(selectedBounds),
      candidates,
      spacingReferences: getSpacingReferences(candidates, ALIGNMENT_THRESHOLD / Math.max(.1, zoom)),
      deltaX: 0,
      deltaY: 0,
    };
  };

  const handleDragMove = (element: EditorElement, event: KonvaEventObject<DragEvent>) => {
    const drag = groupDragRef.current;
    if (!drag) return;
    const rawDeltaX = event.target.x() - drag.startX;
    const rawDeltaY = event.target.y() - drag.startY;
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
    event.target.position({ x: drag.startX + deltaX, y: drag.startY + deltaY });
    drag.nodes.forEach(({ node, x, y }, id) => {
      if (id !== element.id) node.position({ x: x + deltaX, y: y + deltaY });
    });
    const movedSelectionBounds = translateBounds(drag.selectionBounds, deltaX, deltaY);
    const currentBounds = getCurrentSelectionBounds();
    if (currentBounds) positionSelectionLockControl(lockControlRef.current, currentBounds, selectionFullyLocked, zoom);
    const canvasBounds = { x: 0, y: 0, width: viewport.width, height: isWelcomeEditing ? viewport.height : documentHeight };
    const distances = getDistanceGuides(
      movedSelectionBounds,
      drag.candidates,
      canvasBounds,
      ALIGNMENT_THRESHOLD / Math.max(.1, zoom),
      12 / Math.max(.1, zoom),
    );
    drawEditorGuides(guideLayerRef.current, snap.guides, distances, zoom, previewDevice);
    event.target.getLayer()?.batchDraw();
  };

  const handleDragEnd = (event: KonvaEventObject<DragEvent>) => {
    const drag = groupDragRef.current;
    groupDragRef.current = null;
    clearEditorGuides(guideLayerRef.current);
    if (!drag) return;
    moveElements(drag.directIds, drag.deltaX, drag.deltaY);
  };

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
    const selectedNodes = selectedElementIds.map((id) => stage.findOne(`#${id}`)).filter((node): node is Konva.Node => Boolean(node));
    transformer.nodes(selectedNodes);
    transformer.getLayer()?.batchDraw();
    const bounds = selectedNodes.length > 0
      ? getSelectionBounds(selectedNodes.map((node) => getNodeBounds(node, stage)))
      : null;
    setSelectionBounds(bounds);
  }, [selectedElementIds, elements, previewDevice, sidebarView, zoom]);

  if (!page) return null;

  if (isWelcomeEditing && welcomeConfig) {
    const welcomeContentElements = elements.filter((element) => !(element.type === "button" && element.welcomeAction === "enter"));
    const welcomeInteractionElements = elements.filter((element) => element.type === "button" && element.welcomeAction === "enter");
    return <div ref={canvasAreaRef} className="canvas-area welcome-canvas-area">
    <div className={`device-preview-frame device-preview-frame-${previewDevice}`}>
      <div className="preview-device-screen" style={{ width: viewport.width * zoom, height: viewport.height * zoom }}>
        <div className="welcome-editor-scale" style={{ width: viewport.width, height: viewport.height, transform: `scale(${zoom})` }}>
          <WelcomePageRenderer config={welcomeConfig} device={previewDevice} interactive={false} showElements={false} />
          <div className="welcome-editor-content-layer">
          <Stage ref={stageRef} width={viewport.width} height={viewport.height} onMouseDown={(event) => { if (event.target === event.target.getStage()) selectElement(null); }}>
            <Layer>
              {welcomeContentElements.map((element) => <CanvasElement key={element.id} element={element} device={previewDevice} selected={selectedElementIds.includes(element.id)} onSelect={(additive) => { if (!additive && selectedElementIds.includes(element.id)) return; selectElement(element.id, additive); }} onElementDragStart={(event) => handleDragStart(element, event)} onElementDragMove={(event) => handleDragMove(element, event)} onElementDragEnd={handleDragEnd} />)}
            </Layer>
            <Layer>
              {welcomeInteractionElements.map((element) => <CanvasElement key={element.id} element={element} device={previewDevice} selected={selectedElementIds.includes(element.id)} onSelect={(additive) => { if (!additive && selectedElementIds.includes(element.id)) return; selectElement(element.id, additive); }} onElementDragStart={(event) => handleDragStart(element, event)} onElementDragMove={(event) => handleDragMove(element, event)} onElementDragEnd={handleDragEnd} />)}
            </Layer>
            <Layer ref={guideLayerRef} listening={false} />
            <Layer>
              <Transformer ref={transformerRef} rotateEnabled={!selectionContainsLocked && selectedElementIds.length <= 1} resizeEnabled={!selectionContainsLocked} enabledAnchors={selectionContainsLocked || selectedElementIds.length > 1 ? [] : ["top-left", "top-right", "bottom-left", "bottom-right", "middle-left", "middle-right"]} anchorFill="#fff" anchorStroke="#9a6d51" borderStroke="#9a6d51" anchorSize={10 / zoom} borderStrokeWidth={1.5 / zoom} rotateAnchorOffset={28 / zoom} onTransform={syncSelectionControl} onTransformEnd={syncSelectionControl} boundBoxFunc={(oldBox, newBox) => newBox.width < 12 || newBox.height < 12 ? oldBox : newBox} />
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
          height: documentHeight * zoom,
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
              if (event.target === event.target.getStage()) selectElement(null);
            }}
            onTouchStart={(event) => {
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
                  selected={selectedElementIds.includes(element.id)}
                  onSelect={(additive) => {
                    if (!additive && selectedElementIds.includes(element.id)) return;
                    selectElement(element.id, additive);
                  }}
                  onElementDragStart={(event) => handleDragStart(element, event)}
                  onElementDragMove={(event) => handleDragMove(element, event)}
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
              {project?.rsvp?.enabled && <Group
                y={rsvpPositionY}
                draggable={!rsvpLocked}
                dragBoundFunc={(position) => ({ x: 0, y: Math.max(0, position.y) })}
                onClick={(event) => { event.cancelBubble = true; selectElement(null); setSidebarView("rsvp"); }}
                onTap={(event) => { event.cancelBubble = true; selectElement(null); setSidebarView("rsvp"); }}
                onDragEnd={(event) => { if (!rsvpLocked) updateRsvp(setRsvpPositionForDevice(project.rsvp!, previewDevice, event.target.y())); }}
                onMouseEnter={(event) => { event.target.getStage()!.container().style.cursor = "ns-resize"; }}
                onMouseLeave={(event) => { event.target.getStage()!.container().style.cursor = "default"; }}
              >
                <Rect width={viewport.width} height={rsvpHeight} fill={rsvpStyle.backgroundColor} stroke={sidebarView === "rsvp" ? rsvpStyle.selectionColor : undefined} strokeWidth={sidebarView === "rsvp" ? 3 / zoom : 0} />
                <Text x={44} y={18} width={viewport.width - 88} text="↕ GLISSER POUR DÉPLACER" fontFamily="Montserrat" fontSize={9} letterSpacing={1.2} align="center" fill={rsvpStyle.labelColor} opacity={0.7} />
                <Text x={44} y={58} width={viewport.width - 88} height={76} text={project.rsvp.title} fontFamily="Cormorant Garamond" fontSize={34} lineHeight={1.05} align="center" verticalAlign="top" fill={rsvpStyle.textColor} />
                {project.rsvp.description && <Text x={44} y={146} width={viewport.width - 88} height={44} text={project.rsvp.description} fontFamily="Lora" fontSize={13} lineHeight={1.5} align="center" verticalAlign="top" fill={rsvpStyle.textColor} opacity={0.8} />}
                {project.rsvp.fields.map((field, index) => <Group key={field.id} y={205 + index * 82}>
                  <Text x={44} width={viewport.width - 88} text={`${field.label}${field.required ? " *" : ""}`} fontFamily="Montserrat" fontSize={11} fill={rsvpStyle.labelColor} />
                  <Rect x={44} y={24} width={viewport.width - 88} height={42} cornerRadius={8} fill={rsvpStyle.fieldBackgroundColor} stroke={rsvpStyle.fieldBorderColor} />
                </Group>)}
                <Rect x={44} y={rsvpHeight - 86} width={viewport.width - 88} height={44} cornerRadius={9} fill={rsvpStyle.buttonBackgroundColor} />
                <Text x={44} y={rsvpHeight - 72} width={viewport.width - 88} text={project.rsvp.submitLabel.toUpperCase()} fontFamily="Montserrat" fontSize={10} fontStyle="bold" letterSpacing={1} align="center" fill={rsvpStyle.buttonTextColor} />
              </Group>}
            </Layer>
            <Layer ref={guideLayerRef} listening={false} />
            <Layer>
              {selectionBounds && <SelectionLockControl ref={lockControlRef} bounds={selectionBounds} locked={selectionFullyLocked} zoom={zoom} onToggle={toggleSelectionLock} />}
              {rsvpSelectionBounds && <SelectionLockControl bounds={rsvpSelectionBounds} locked={rsvpLocked} zoom={zoom} onToggle={() => updateRsvp({ ...project!.rsvp!, locked: !rsvpLocked })} />}
            </Layer>
          </Stage>
        </div>

        {project?.particles?.enabled && project.particles.layer === "front" && <ParticleRenderer config={project.particles} />}
      </div>
    </div>
  </div>
);
}
