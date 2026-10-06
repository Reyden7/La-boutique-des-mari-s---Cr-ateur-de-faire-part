import { useEffect, useState } from "react";
import { Group, Image as KonvaImage, Rect, Shape } from "react-konva";
import type { SectionElement } from "../../types/editor";
import type { ResolvedElementLayout } from "../../utils/responsiveLayout";
import { getImageRenderLayout } from "../../utils/imageLayout";
import { getSectionBackgroundPaint, getSectionShape } from "../../utils/sectionEdges";
import { resolveSectionTexture } from "../../config/sectionTextures";

export function SectionCanvasSurface({ element, layout }: { element: SectionElement; layout: ResolvedElementLayout }) {
  const [loaded, setLoaded] = useState<{ src: string; image: HTMLImageElement }>();
  const texture = resolveSectionTexture(element, layout.width, layout.height);
  const [loadedTexture, setLoadedTexture] = useState<{ src: string; image: HTMLImageElement }>();
  const textureSrc = texture.materialSrc ?? texture.preset?.url;
  useEffect(() => {
    if (!textureSrc) return;
    const image = new Image();
    image.onload = () => setLoadedTexture({ src: textureSrc, image });
    image.onerror = () => setLoadedTexture(undefined);
    image.src = textureSrc;
    return () => { image.onload = null; image.onerror = null; };
  }, [textureSrc]);
  const textureImage = loadedTexture?.src === textureSrc ? loadedTexture?.image : undefined;
  const src = element.background.type === "image" ? element.background.imageUrl : undefined;
  useEffect(() => {
    if (!src) return;
    const image = new Image(); image.crossOrigin = "anonymous";
    image.onload = () => setLoaded({ src, image }); image.onerror = () => setLoaded(undefined);
    image.src = src;
    return () => { image.onload = null; image.onerror = null; };
  }, [src]);
  const image = loaded?.src === src ? loaded?.image : undefined;
  const shape = getSectionShape(layout.width, layout.height, layout.topEdge, layout.bottomEdge);
  const paint = getSectionBackgroundPaint(element.background, shape.width, shape.height);
  const gradient = element.background.gradient;
  const radius = Math.min(Math.max(0, element.cornerRadius || 0), shape.width / 2, shape.height / 2);
  const renderedImage = image ? getImageRenderLayout(image.naturalWidth, image.naturalHeight, shape.width, shape.height, "cover") : undefined;
  const imageScale = image && renderedImage ? renderedImage.width / image.naturalWidth : 1;
  const crop = renderedImage ? { x: -renderedImage.x / imageScale, y: -renderedImage.y / imageScale, width: shape.width / imageScale, height: shape.height / imageScale } : undefined;
  return <Group name="section-corner-clip" listening={false} clipFunc={(context) => {
    context.beginPath(); context.moveTo(radius, 0); context.lineTo(shape.width - radius, 0);
    context.arc(shape.width - radius, radius, radius, -Math.PI / 2, 0); context.lineTo(shape.width, shape.height - radius);
    context.arc(shape.width - radius, shape.height - radius, radius, 0, Math.PI / 2); context.lineTo(radius, shape.height);
    context.arc(radius, shape.height - radius, radius, Math.PI / 2, Math.PI); context.lineTo(0, radius);
    context.arc(radius, radius, radius, Math.PI, Math.PI * 1.5); context.closePath();
  }}><Group name="section-edge-clip" listening={false} clipFunc={(context) => {
    context.beginPath(); shape.points.forEach(([x, y], index) => index ? context.lineTo(x, y) : context.moveTo(x, y)); context.closePath();
  }}>
    {/* Even a texture-only/empty surface retains the logical selection box. */}
    {!texture.showBase && <Rect width={shape.width} height={shape.height} fill="transparent" />}
    {!(texture.materialSrc && textureImage) && texture.showBase && (element.background.type === "gradient" && gradient
      ? gradient.type === "radial"
        ? <Rect width={shape.width} height={shape.height} fillRadialGradientStartPoint={paint.center} fillRadialGradientEndPoint={paint.center} fillRadialGradientStartRadius={0} fillRadialGradientEndRadius={paint.radius} fillRadialGradientColorStops={[0, gradient.color1, 1, gradient.color2]} />
        : <Rect width={shape.width} height={shape.height} fillLinearGradientStartPoint={paint.start} fillLinearGradientEndPoint={paint.end} fillLinearGradientColorStops={[0, gradient.color1, 1, gradient.color2]} />
      : <Rect width={shape.width} height={shape.height} fill={element.background.type === "image" ? element.background.color ?? "transparent" : paint.color} />)}
    {/* Keep the node's logical bounds fixed: an oversized cover node would
        enlarge the Transformer even though its pixels are clipped. */}
    {!texture.materialSrc && texture.showBase && image && crop && <KonvaImage image={image} width={shape.width} height={shape.height} crop={crop} />}
    {textureImage && (texture.materialSrc ? <KonvaImage name="section-texture" image={textureImage} width={shape.width} height={shape.height} listening={false} /> : texture.fit === "repeat" ? <Rect name="section-texture" width={shape.width} height={shape.height}
      opacity={texture.opacity} listening={false} fillPatternImage={textureImage}
      fillPatternRepeat="repeat"
      fillPatternScale={{ x: texture.size / textureImage.naturalWidth, y: texture.size / textureImage.naturalHeight }} />
      : <Shape name="section-texture" width={shape.width} height={shape.height} fill="transparent" opacity={texture.opacity} listening={false}
        sceneFunc={(context) => context.drawImage(textureImage, texture.x, texture.y, texture.size, texture.size)} />)}
  </Group></Group>;
}
