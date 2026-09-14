import { useEffect, useMemo, useRef, useState } from "react";
import { Circle, Image as KonvaImage, Layer, Line, Rect, Stage, Text, Transformer } from "react-konva";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type { EditorElement, ImageElement, PageBackground } from "../../types/editor";
import { useEditorStore } from "../../stores/editorStore";
import { ParticleRenderer } from "../../features/particles/ParticleRenderer";
import {
  calculatePreviewFitZoom,
  PREVIEW_DEVICES,
  type PreviewDevice,
} from "../../config/previewDevices";
import { getElementLayout } from "../../utils/responsiveLayout";

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

function Background({ background, width, height }: { background: PageBackground; width: number; height: number }) {
  const image = useLoadedImage(background.imageUrl);
  const gradient = background.gradient;
  if (background.type === "image" && image) {
    const imageRatio = image.width / image.height;
    const viewportRatio = width / height;
    const crop = imageRatio > viewportRatio
      ? { x: (image.width - image.height * viewportRatio) / 2, y: 0, width: image.height * viewportRatio, height: image.height }
      : { x: 0, y: (image.height - image.width / viewportRatio) / 2, width: image.width, height: image.width / viewportRatio };
    return <KonvaImage image={image} width={width} height={height} crop={crop} listening={false} />;
  }
  if (background.type === "gradient" && gradient) {
    if (gradient.type === "radial") {
      const center = { x: width / 2, y: height / 2 };
      return <Rect width={width} height={height} fillRadialGradientStartPoint={center} fillRadialGradientEndPoint={center} fillRadialGradientStartRadius={0} fillRadialGradientEndRadius={Math.hypot(width, height) / 2} fillRadialGradientColorStops={[0, gradient.color1, 1, gradient.color2]} listening={false} />;
    }
    const angle = ((gradient.angle ?? 135) * Math.PI) / 180;
    const gradientLength = Math.hypot(width, height) / 2;
    return <Rect width={width} height={height} fillLinearGradientStartPoint={{ x: width / 2 - Math.cos(angle) * gradientLength, y: height / 2 - Math.sin(angle) * gradientLength }} fillLinearGradientEndPoint={{ x: width / 2 + Math.cos(angle) * gradientLength, y: height / 2 + Math.sin(angle) * gradientLength }} fillLinearGradientColorStops={[0, gradient.color1, 1, gradient.color2]} listening={false} />;
  }
  return <Rect width={width} height={height} fill={background.color ?? "#fffdf9"} listening={false} />;
}

function CanvasElement({ element, device, selected, onSelect }: { element: EditorElement; device: PreviewDevice; selected: boolean; onSelect: () => void }) {
  const image = useLoadedImage(element.type === "image" ? element.src : undefined);
  const layout = getElementLayout(element, device);
  const isCircle = element.type === "shape" && element.shape === "circle";
  const common = {
    id: element.id, x: layout.x, y: layout.y, width: layout.width, height: layout.height,
    rotation: layout.rotation, opacity: element.opacity, visible: element.visible, draggable: !element.locked,
    onClick: (event: KonvaEventObject<MouseEvent>) => { event.cancelBubble = true; onSelect(); },
    onTap: (event: KonvaEventObject<TouchEvent>) => { event.cancelBubble = true; onSelect(); },
    onDragEnd: (event: KonvaEventObject<DragEvent>) => useEditorStore.getState().updateElementLayout(element.id, {
      x: event.target.x() - (isCircle ? layout.width / 2 : 0),
      y: event.target.y() - (isCircle ? layout.height / 2 : 0),
    }),
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
  if (element.type === "image") return <KonvaImage {...common} image={image} alt={(element as ImageElement).alt} />;
  if (element.type === "icon") return <Text {...common} text={element.icon} fill={element.color} fontSize={element.fontSize} align="center" verticalAlign="middle" />;
  if (element.shape === "circle") return <Circle {...common} x={layout.x + layout.width / 2} y={layout.y + layout.height / 2} radius={Math.min(layout.width, layout.height) / 2} fill={element.fill} stroke={element.stroke} strokeWidth={element.strokeWidth} />;
  if (element.shape === "line") return <Line {...common} points={[0, 0, layout.width, 0]} stroke={element.stroke} strokeWidth={element.strokeWidth || 2} hitStrokeWidth={18} />;
  return <Rect {...common} fill={element.fill} stroke={element.stroke} strokeWidth={element.strokeWidth} cornerRadius={element.cornerRadius} />;
}

export function EditorCanvas() {
  const { project, currentPageId, selectedElementId, selectElement, zoom, previewDevice, setFitZoom, setZoom } = useEditorStore();
  const canvasAreaRef = useRef<HTMLDivElement>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const previousFitRef = useRef<number | undefined>(undefined);
  const previousDeviceRef = useRef(previewDevice);
  const page = project?.pages.find((item) => item.id === currentPageId);
  const elements = useMemo(() => [...(page?.elements ?? [])].sort((a, b) => a.zIndex - b.zIndex), [page?.elements]);
  const viewport = PREVIEW_DEVICES[previewDevice];
  const selectedElement = elements.find((element) => element.id === selectedElementId);

  useEffect(() => {
    const canvasArea = canvasAreaRef.current;
    if (!canvasArea) return;

    const updateFitZoom = () => {
      const compact = window.matchMedia("(max-width: 760px)").matches;
      const availableWidth = canvasArea.clientWidth - (compact ? 36 : 96);
      const availableHeight = canvasArea.clientHeight - (compact ? 160 : 130);
      const nextFit = calculatePreviewFitZoom(previewDevice, availableWidth, availableHeight);
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
  }, [previewDevice, setFitZoom, setZoom]);

  useEffect(() => {
    const transformer = transformerRef.current;
    const stage = stageRef.current;
    if (!transformer || !stage) return;
    const selectedNode = selectedElementId ? stage.findOne(`#${selectedElementId}`) : undefined;
    transformer.nodes(selectedNode ? [selectedNode] : []);
    transformer.getLayer()?.batchDraw();
  }, [selectedElementId, elements, previewDevice]);

  if (!page) return null;

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
          height: viewport.height * zoom,
        }}
      >
        {project?.particles?.enabled && project.particles.layer === "behind" && <ParticleRenderer config={project.particles} />}

        <div className="preview-stage-layer">
          <Stage
            ref={stageRef}
            width={viewport.width * zoom}
            height={viewport.height * zoom}
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
              <Background background={page.background} width={viewport.width} height={viewport.height} />

              {elements.map((element) => (
                <CanvasElement
                  key={element.id}
                  element={element}
                  device={previewDevice}
                  selected={element.id === selectedElementId}
                  onSelect={() => selectElement(element.id)}
                />
              ))}

              <Transformer
                ref={transformerRef}
                rotateEnabled
                keepRatio={selectedElement?.type === "image"}
                enabledAnchors={selectedElement?.type === "image"
                  ? ["top-left", "top-right", "bottom-left", "bottom-right"]
                  : ["top-left", "top-right", "bottom-left", "bottom-right", "middle-left", "middle-right"]}
                anchorFill="#fff"
                anchorStroke="#9a6d51"
                borderStroke="#9a6d51"
                anchorSize={10 / zoom}
                borderStrokeWidth={1.5 / zoom}
                rotateAnchorOffset={28 / zoom}
                boundBoxFunc={(oldBox, newBox) => newBox.width < 12 || newBox.height < 12 ? oldBox : newBox}
              />
            </Layer>
          </Stage>
        </div>

        {project?.particles?.enabled && project.particles.layer === "front" && <ParticleRenderer config={project.particles} />}
      </div>
    </div>
  </div>
);
}
