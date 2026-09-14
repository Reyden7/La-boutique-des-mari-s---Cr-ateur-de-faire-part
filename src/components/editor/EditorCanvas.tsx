import { useEffect, useMemo, useRef, useState } from "react";
import { Circle, Image as KonvaImage, Layer, Line, Rect, Stage, Text, Transformer } from "react-konva";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type { EditorElement, ImageElement, PageBackground } from "../../types/editor";
import { useEditorStore } from "../../stores/editorStore";
import { ParticleRenderer } from "../../features/particles/ParticleRenderer";

const CANVAS_WIDTH = 390;
const CANVAS_HEIGHT = 844;

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

function Background({ background }: { background: PageBackground }) {
  const image = useLoadedImage(background.imageUrl);
  const gradient = background.gradient;
  if (background.type === "image" && image) return <KonvaImage image={image} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} listening={false} />;
  if (background.type === "gradient" && gradient) {
    if (gradient.type === "radial") {
      return <Rect width={CANVAS_WIDTH} height={CANVAS_HEIGHT} fillRadialGradientStartPoint={{ x: 195, y: 422 }} fillRadialGradientEndPoint={{ x: 195, y: 422 }} fillRadialGradientStartRadius={0} fillRadialGradientEndRadius={500} fillRadialGradientColorStops={[0, gradient.color1, 1, gradient.color2]} listening={false} />;
    }
    const angle = ((gradient.angle ?? 135) * Math.PI) / 180;
    return <Rect width={CANVAS_WIDTH} height={CANVAS_HEIGHT} fillLinearGradientStartPoint={{ x: 195 - Math.cos(angle) * 260, y: 422 - Math.sin(angle) * 500 }} fillLinearGradientEndPoint={{ x: 195 + Math.cos(angle) * 260, y: 422 + Math.sin(angle) * 500 }} fillLinearGradientColorStops={[0, gradient.color1, 1, gradient.color2]} listening={false} />;
  }
  return <Rect width={CANVAS_WIDTH} height={CANVAS_HEIGHT} fill={background.color ?? "#fffdf9"} listening={false} />;
}

function CanvasElement({ element, selected, onSelect }: { element: EditorElement; selected: boolean; onSelect: () => void }) {
  const image = useLoadedImage(element.type === "image" ? element.src : undefined);
  const common = {
    id: element.id, x: element.x, y: element.y, width: element.width, height: element.height,
    rotation: element.rotation, opacity: element.opacity, visible: element.visible, draggable: !element.locked,
    onClick: (event: KonvaEventObject<MouseEvent>) => { event.cancelBubble = true; onSelect(); },
    onTap: (event: KonvaEventObject<TouchEvent>) => { event.cancelBubble = true; onSelect(); },
    onDragEnd: (event: KonvaEventObject<DragEvent>) => useEditorStore.getState().updateElement(element.id, { x: event.target.x(), y: event.target.y() }),
    onTransformEnd: (event: KonvaEventObject<Event>) => {
      const node = event.target;
      const scaleX = node.scaleX();
      const scaleY = node.scaleY();
      node.scaleX(1); node.scaleY(1);
      useEditorStore.getState().updateElement(element.id, {
        x: node.x(), y: node.y(), rotation: node.rotation(),
        width: Math.max(12, node.width() * scaleX), height: Math.max(12, node.height() * scaleY),
      });
    },
    shadowColor: selected ? "#b78d72" : undefined,
    shadowBlur: selected ? 8 : 0,
    shadowOpacity: selected ? 0.22 : 0,
  };

  if (element.type === "text") return <Text {...common} text={element.text} fontFamily={element.fontFamily} fontSize={element.fontSize} fontStyle={`${element.italic ? "italic" : "normal"} ${element.fontWeight >= 600 ? "bold" : "normal"}`} fill={element.color} align={element.textAlign} lineHeight={element.lineHeight} letterSpacing={element.letterSpacing} textDecoration={element.underline ? "underline" : ""} verticalAlign="middle" />;
  if (element.type === "image") return <KonvaImage {...common} image={image} alt={(element as ImageElement).alt} />;
  if (element.type === "icon") return <Text {...common} text={element.icon} fill={element.color} fontSize={element.fontSize} align="center" verticalAlign="middle" />;
  if (element.shape === "circle") return <Circle {...common} x={element.x + element.width / 2} y={element.y + element.height / 2} radius={Math.min(element.width, element.height) / 2} fill={element.fill} stroke={element.stroke} strokeWidth={element.strokeWidth} />;
  if (element.shape === "line") return <Line {...common} points={[0, 0, element.width, 0]} stroke={element.stroke} strokeWidth={element.strokeWidth || 2} hitStrokeWidth={18} />;
  return <Rect {...common} fill={element.fill} stroke={element.stroke} strokeWidth={element.strokeWidth} cornerRadius={element.cornerRadius} />;
}

export function EditorCanvas() {
  const { project, currentPageId, selectedElementId, selectElement, zoom } = useEditorStore();
  const transformerRef = useRef<Konva.Transformer>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const page = project?.pages.find((item) => item.id === currentPageId);
  const elements = useMemo(() => [...(page?.elements ?? [])].sort((a, b) => a.zIndex - b.zIndex), [page?.elements]);

  useEffect(() => {
    const transformer = transformerRef.current;
    const stage = stageRef.current;
    if (!transformer || !stage) return;
    const selectedNode = selectedElementId ? stage.findOne(`#${selectedElementId}`) : undefined;
    transformer.nodes(selectedNode ? [selectedNode] : []);
    transformer.getLayer()?.batchDraw();
  }, [selectedElementId, elements]);

  if (!page) return null;

  return (
  <div
    className="canvas-area"
    onMouseDown={(event) => {
      if (event.target === event.currentTarget) {
        selectElement(null);
      }
    }}
  >
    <div
      className="phone-shell"
      style={{
        width: CANVAS_WIDTH * zoom + 20,
        height: CANVAS_HEIGHT * zoom + 20,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {project?.particles?.enabled &&
        project.particles.layer === "behind" && (
          <ParticleRenderer
            config={project.particles}
          />
        )}

      <div
        style={{
          position: "relative",
          zIndex: 10,
        }}
      >
        <Stage
          ref={stageRef}
          width={CANVAS_WIDTH * zoom}
          height={CANVAS_HEIGHT * zoom}
          scaleX={zoom}
          scaleY={zoom}
          onMouseDown={(event) => {
            if (
              event.target ===
              event.target.getStage()
            ) {
              selectElement(null);
            }
          }}
          onTouchStart={(event) => {
            if (
              event.target ===
              event.target.getStage()
            ) {
              selectElement(null);
            }
          }}
        >
          <Layer>
            <Background
              background={page.background}
            />

            {elements.map((element) => (
              <CanvasElement
                key={element.id}
                element={element}
                selected={
                  element.id ===
                  selectedElementId
                }
                onSelect={() =>
                  selectElement(element.id)
                }
              />
            ))}

            <Transformer
              ref={transformerRef}
              rotateEnabled
              enabledAnchors={[
                "top-left",
                "top-right",
                "bottom-left",
                "bottom-right",
                "middle-left",
                "middle-right",
              ]}
              anchorFill="#fff"
              anchorStroke="#9a6d51"
              borderStroke="#9a6d51"
              anchorSize={10 / zoom}
              borderStrokeWidth={1.5 / zoom}
              rotateAnchorOffset={28 / zoom}
              boundBoxFunc={(
                oldBox,
                newBox
              ) =>
                newBox.width < 12 ||
                newBox.height < 12
                  ? oldBox
                  : newBox
              }
            />
          </Layer>
        </Stage>
      </div>

      {project?.particles?.enabled &&
        project.particles.layer === "front" && (
          <ParticleRenderer
            config={project.particles}
          />
        )}
    </div>
  </div>
);
}
