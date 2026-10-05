import { type CSSProperties } from "react";
import type { EditorElement, PageBackground, WeddingPage, WeddingProject } from "../../types/editor";
import { PREVIEW_DEVICES, type PreviewDevice } from "../../config/previewDevices";
import { useResponsiveDevice } from "../../hooks/useResponsiveDevice";
import { getElementLayout, getElementRenderBox, getElementZIndex, getImageRotationFrame, isElementVisibleOnDevice } from "../../utils/responsiveLayout";
import { getDocumentHeight, getRsvpPositionX, getRsvpPositionY, getRsvpWidth } from "../../utils/documentLayout";
import { useRsvpBlockLayout } from "../../features/rsvp/useRsvpBlockLayout";
import { ProjectFontLoader } from "../../features/fonts/ProjectFontLoader";
import { RsvpFormRenderer, shouldRenderRsvp, type RsvpRenderMode } from "../../features/rsvp/RsvpFormRenderer";
import { getRsvpLayerZIndex, getRsvpSectionId, isRsvpVisibleOnDevice } from "../../features/rsvp/rsvpEditorElement";
import { DecorativeHeartSvg } from "../../features/hearts/DecorativeHeartSvg";
import { RichElementRenderer } from "../../features/elements/RichElementRenderer";
import { ImageFrameRenderer } from "../../features/images/ImageFrameRenderer";
import { ImageContentRenderer } from "../../features/images/ImageContentRenderer";
import { resolveImageFrame } from "../../config/imageFrames";
import { resolveImageFit, resolveImageTransform } from "../../utils/imageLayout";
import { AnimatedElement } from "./AnimatedElement";
import { getSectionRenderGroups } from "../../utils/sectionRenderGroups";

const backgroundStyle = (background: PageBackground): CSSProperties => {
  if (background.type === "image") return { backgroundImage: `url(${background.imageUrl})`, backgroundSize: "cover", backgroundPosition: "center" };
  if (background.type === "gradient" && background.gradient) {
    const value = background.gradient.type === "radial"
      ? `radial-gradient(circle, ${background.gradient.color1}, ${background.gradient.color2})`
      : `linear-gradient(${background.gradient.angle ?? 135}deg, ${background.gradient.color1}, ${background.gradient.color2})`;
    return { backgroundImage: value };
  }
  return { backgroundColor: background.color ?? "#fffdf9" };
};

export function RenderElement({ element, device, documentHeight, playAnimation = true, sectionChildren = [], sectionExtra, origin }: { element: EditorElement; device: PreviewDevice; documentHeight: number; playAnimation?: boolean; sectionChildren?: EditorElement[]; sectionExtra?: React.ReactNode; origin?: { x: number; y: number; width: number; height: number } }) {
  const layout = getElementLayout(element, device);
  const viewport = PREVIEW_DEVICES[device];
  const renderBox = getElementRenderBox({ ...layout, x: layout.x - (origin?.x ?? 0), y: layout.y - (origin?.y ?? 0) }, origin?.width ?? viewport.width, origin?.height ?? documentHeight);
  const style: CSSProperties = {
    position: "absolute", left: renderBox.left, top: renderBox.top, width: renderBox.width, height: renderBox.height, zIndex: layout.zIndex,
    display: layout.visible ? "flex" : "none", alignItems: "center",
  };
  const overlayChildren = element.type === "section" ? <>{[...sectionChildren].sort((a, b) => getElementZIndex(a, device) - getElementZIndex(b, device)).map((child) => <RenderElement key={child.id} element={child} device={device} documentHeight={documentHeight} playAnimation={playAnimation} origin={{ x: layout.x, y: layout.y, width: layout.width, height: layout.height }} />)}{sectionExtra}</> : undefined;
  const wrap = (content: React.ReactNode, className?: string) => <AnimatedElement animation={element.animation} opacity={element.opacity ?? 1} rotation={layout.rotation} rotationOrigin={element.type === "image" ? getImageRotationFrame(layout).transformOrigin : undefined} style={style} className={className} overlayChildren={overlayChildren} play={playAnimation}>{content}</AnimatedElement>;
  if (element.type === "text") return wrap(<div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", color: element.color, fontFamily: element.fontFamily, fontSize: `${(layout.fontSize ?? element.fontSize) / viewport.width * 100}cqw`, fontWeight: element.fontWeight, fontStyle: element.italic ? "italic" : "normal", textDecoration: element.underline ? "underline" : "none", textAlign: element.textAlign, lineHeight: element.lineHeight, letterSpacing: element.letterSpacing, whiteSpace: "pre-wrap", justifyContent: element.textAlign === "center" ? "center" : element.textAlign === "right" ? "flex-end" : "flex-start" }}>{element.text}</div>);
  if (element.type === "image") {
    const frame = resolveImageFrame(element.imageStyle?.frame);
    const fit = resolveImageFit(element.fit);
    if (!frame.enabled) return wrap(
      <ImageContentRenderer src={element.src} alt={element.alt} fit={fit} transform={resolveImageTransform(element, device)} boxWidth={layout.width} boxHeight={layout.height} />
    , "render-image-frame");
    return wrap(<ImageFrameRenderer element={element} device={device} layoutWidth={layout.width} layoutHeight={layout.height} />, "render-image-frame");
  }
  if (element.type === "icon" && element.heartStyle) return wrap(<div style={{ width: "100%", height: "100%", color: element.color, display: "flex", justifyContent: "center" }}><DecorativeHeartSvg variant={element.heartStyle} style={{ width: "100%", height: "100%" }} /></div>);
  if (element.type === "icon") return wrap(<div style={{ width: "100%", height: "100%", color: element.color, fontSize: `${element.fontSize / viewport.width * 100}cqw`, display: "flex", justifyContent: "center", alignItems: "center" }}>{element.icon}</div>);
  if (element.type === "scratch" || element.type === "carousel" || element.type === "location" || element.type === "schedule" || element.type === "button" || element.type === "section") return wrap(<RichElementRenderer element={element} device={device} />, `rich-render-element rich-render-${element.type}`);
  const radius = element.shape === "circle" ? "50%" : element.shape === "rounded-rectangle" ? element.cornerRadius : 0;
  return wrap(<div style={{ width: "100%", height: element.shape === "line" ? `${Math.max(1, element.strokeWidth)}px` : "100%", background: element.shape === "line" ? element.stroke : element.fill, border: element.shape === "line" ? "none" : `${element.strokeWidth}px solid ${element.stroke}`, borderRadius: radius }} />);
}

function RenderPage({ page, device, documentHeight, renderRsvp, rsvpSectionId, playAnimations }: { page: WeddingPage; device: PreviewDevice; documentHeight: number; renderRsvp?: (origin?: { x: number; y: number; width: number; height: number }) => React.ReactNode; rsvpSectionId?: string | null; playAnimations: boolean }) {
  const { roots, childrenBySection } = getSectionRenderGroups(page.elements, device);
  const rsvpSection = roots.find((element) => element.type === "section" && element.id === rsvpSectionId);
  return (
    <section className="render-page" style={backgroundStyle(page.background)}>
      {(page.backgroundSections ?? []).map((section) => <div key={section.id} className="render-background-section" style={{ ...backgroundStyle(section.background), top: `${section.y / documentHeight * 100}%`, height: `${section.height / documentHeight * 100}%` }} />)}
      {[...roots].sort((a, b) => getElementZIndex(a, device) - getElementZIndex(b, device)).map((element) => <RenderElement key={element.id} element={element} device={device} documentHeight={documentHeight} playAnimation={playAnimations} sectionChildren={childrenBySection.get(element.id)} sectionExtra={element.id === rsvpSection?.id ? renderRsvp?.(getElementLayout(element, device)) : undefined} />)}
      {!rsvpSection && renderRsvp?.()}
    </section>
  );
}

export function WeddingRenderer({ project, device: forcedDevice, mode = "public", playAnimations = true }: { project: WeddingProject; device?: PreviewDevice; mode?: RsvpRenderMode; playAnimations?: boolean }) {
  const device = useResponsiveDevice(forcedDevice);
  const viewport = PREVIEW_DEVICES[device];
  const page = project.pages[0];
  const rsvpParentId = getRsvpSectionId(project.rsvp, device);
  const rsvpParent = page?.elements.find((element) => element.type === "section" && element.id === rsvpParentId);
  const visibleRsvp = shouldRenderRsvp(project.rsvp, mode) && isRsvpVisibleOnDevice(project.rsvp, device) && (!rsvpParent || isElementVisibleOnDevice(rsvpParent, page?.elements ?? [], device)) ? project.rsvp : undefined;
  const { height: rsvpHeight, measurement } = useRsvpBlockLayout(visibleRsvp, device);
  const rsvpPositionX = visibleRsvp ? getRsvpPositionX(visibleRsvp, device) : 0;
  const rsvpPositionY = page && visibleRsvp ? getRsvpPositionY(page, visibleRsvp, device) : 0;
  const rsvpWidth = visibleRsvp ? Math.min(viewport.width, getRsvpWidth(visibleRsvp, device)) : viewport.width;
  const documentHeight = page ? getDocumentHeight(page, device, visibleRsvp, rsvpHeight) : viewport.height;
  const rendererStyle = {
    "--renderer-max-width": `${viewport.width}px`,
    "--renderer-document-ratio": documentHeight / viewport.width,
  } as CSSProperties;
  const renderRsvp = visibleRsvp ? (origin?: { x: number; y: number; width: number; height: number }) => <div className="render-rsvp-layer" style={{ left: `${(rsvpPositionX - (origin?.x ?? 0)) / (origin?.width ?? viewport.width) * 100}%`, width: `${rsvpWidth / (origin?.width ?? viewport.width) * 100}%`, top: `${(rsvpPositionY - (origin?.y ?? 0)) / (origin?.height ?? documentHeight) * 100}%`, height: `${rsvpHeight / (origin?.height ?? documentHeight) * 100}%`, zIndex: getRsvpLayerZIndex(visibleRsvp, page?.elements ?? [], device) }}><AnimatedElement animation={visibleRsvp.animation} opacity={1} style={{ width: "100%", height: "100%" }} play={playAnimations}><RsvpFormRenderer config={visibleRsvp} publicId={project.publicId} mode={mode} device={device} /></AnimatedElement></div> : undefined;
  return (
    <div className={`renderer-wrap renderer-device-${device}`}>
      <ProjectFontLoader project={project} />
      {measurement}
      <div className="renderer-document" style={rendererStyle}>
        {page && <RenderPage key={`${page.id}-${device}`} page={page} device={device} documentHeight={documentHeight} renderRsvp={renderRsvp} rsvpSectionId={getRsvpSectionId(visibleRsvp, device)} playAnimations={playAnimations} />}
      </div>
    </div>
  );
}
