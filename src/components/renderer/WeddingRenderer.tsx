import { motion } from "framer-motion";
import { type CSSProperties } from "react";
import type { EditorElement, PageBackground, WeddingPage, WeddingProject } from "../../types/editor";
import { PREVIEW_DEVICES, type PreviewDevice } from "../../config/previewDevices";
import { useResponsiveDevice } from "../../hooks/useResponsiveDevice";
import { getElementLayout, getElementRenderBox, type ResolvedElementLayout } from "../../utils/responsiveLayout";
import { getDocumentHeight, getRsvpBlockHeight, getRsvpPositionX, getRsvpPositionY, getRsvpWidth } from "../../utils/documentLayout";
import { ProjectFontLoader } from "../../features/fonts/ProjectFontLoader";
import { RsvpFormRenderer, shouldRenderRsvp, type RsvpRenderMode } from "../../features/rsvp/RsvpFormRenderer";
import { DecorativeHeartSvg } from "../../features/hearts/DecorativeHeartSvg";
import { RichElementRenderer } from "../../features/elements/RichElementRenderer";
import { ImageFrameRenderer } from "../../features/images/ImageFrameRenderer";
import { ImageContentRenderer } from "../../features/images/ImageContentRenderer";
import { resolveImageFrame } from "../../config/imageFrames";
import { resolveImageFit, resolveImageTransform } from "../../utils/imageLayout";

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

const motionProps = (element: EditorElement, layout: ResolvedElementLayout) => {
  const animation = element.animation;
  const transition = { duration: animation?.duration ?? 0.8, delay: animation?.delay ?? 0 };
  switch (animation?.type) {
    case "fade": return { initial: { opacity: 0 }, animate: { opacity: element.opacity }, transition };
    case "slide-left": return { initial: { opacity: 0, x: 42 }, animate: { opacity: element.opacity, x: 0 }, transition };
    case "slide-right": return { initial: { opacity: 0, x: -42 }, animate: { opacity: element.opacity, x: 0 }, transition };
    case "slide-up": return { initial: { opacity: 0, y: 42 }, animate: { opacity: element.opacity, y: 0 }, transition };
    case "slide-down": return { initial: { opacity: 0, y: -42 }, animate: { opacity: element.opacity, y: 0 }, transition };
    case "zoom": return { initial: { opacity: 0, scale: 0.72 }, animate: { opacity: element.opacity, scale: 1 }, transition };
    case "rotate": return { initial: { opacity: 0, rotate: layout.rotation - 18 }, animate: { opacity: element.opacity, rotate: layout.rotation }, transition };
    default: return { initial: false as const, animate: { opacity: element.opacity }, transition: { duration: 0 } };
  }
};

export function RenderElement({ element, device, documentHeight }: { element: EditorElement; device: PreviewDevice; documentHeight: number }) {
  const layout = getElementLayout(element, device);
  const viewport = PREVIEW_DEVICES[device];
  const renderBox = getElementRenderBox(layout, viewport.width, documentHeight);
  const style: CSSProperties = {
    position: "absolute", ...renderBox, opacity: element.opacity, zIndex: element.zIndex,
    display: element.visible ? "flex" : "none", alignItems: "center",
  };
  const motionConfig = motionProps(element, layout);
  if (element.type === "text") return <motion.div {...motionConfig} style={{ ...style, color: element.color, fontFamily: element.fontFamily, fontSize: `${(layout.fontSize ?? element.fontSize) / viewport.width * 100}cqw`, fontWeight: element.fontWeight, fontStyle: element.italic ? "italic" : "normal", textDecoration: element.underline ? "underline" : "none", textAlign: element.textAlign, lineHeight: element.lineHeight, letterSpacing: element.letterSpacing, whiteSpace: "pre-wrap", justifyContent: element.textAlign === "center" ? "center" : element.textAlign === "right" ? "flex-end" : "flex-start" }}>{element.text}</motion.div>;
  if (element.type === "image") {
    const frame = resolveImageFrame(element.imageStyle?.frame);
    const fit = resolveImageFit(element.fit);
    if (!frame.enabled) return <motion.div {...motionConfig} className="render-image-frame" style={style}>
      <ImageContentRenderer src={element.src} alt={element.alt} fit={fit} transform={resolveImageTransform(element, device)} boxWidth={layout.width} boxHeight={layout.height} />
    </motion.div>;
    return <motion.div {...motionConfig} className="render-image-frame" style={style}><ImageFrameRenderer element={element} device={device} layoutWidth={layout.width} layoutHeight={layout.height} /></motion.div>;
  }
  if (element.type === "icon" && element.heartStyle) return <motion.div {...motionConfig} style={{ ...style, color: element.color, justifyContent: "center" }}><DecorativeHeartSvg variant={element.heartStyle} style={{ width: "100%", height: "100%" }} /></motion.div>;
  if (element.type === "icon") return <motion.div {...motionConfig} style={{ ...style, color: element.color, fontSize: `${element.fontSize / viewport.width * 100}cqw`, justifyContent: "center" }}>{element.icon}</motion.div>;
  if (element.type === "scratch" || element.type === "carousel" || element.type === "location" || element.type === "schedule" || element.type === "button" || element.type === "section") return <motion.div {...motionConfig} className={`rich-render-element rich-render-${element.type}`} style={style}><RichElementRenderer element={element} device={device} /></motion.div>;
  const radius = element.shape === "circle" ? "50%" : element.shape === "rounded-rectangle" ? element.cornerRadius : 0;
  return <motion.div {...motionConfig} style={{ ...style, background: element.shape === "line" ? element.stroke : element.fill, border: element.shape === "line" ? "none" : `${element.strokeWidth}px solid ${element.stroke}`, borderRadius: radius, height: element.shape === "line" ? `${Math.max(1, element.strokeWidth)}px` : style.height }} />;
}

function RenderPage({ page, device, documentHeight }: { page: WeddingPage; device: PreviewDevice; documentHeight: number }) {
  return (
    <motion.section className="render-page" style={backgroundStyle(page.background)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.45 }}>
      {(page.backgroundSections ?? []).map((section) => <div key={section.id} className="render-background-section" style={{ ...backgroundStyle(section.background), top: `${section.y / documentHeight * 100}%`, height: `${section.height / documentHeight * 100}%` }} />)}
      {[...page.elements].sort((a, b) => a.zIndex - b.zIndex).map((element) => <RenderElement key={element.id} element={element} device={device} documentHeight={documentHeight} />)}
    </motion.section>
  );
}

export function WeddingRenderer({ project, device: forcedDevice, mode = "public" }: { project: WeddingProject; device?: PreviewDevice; mode?: RsvpRenderMode }) {
  const device = useResponsiveDevice(forcedDevice);
  const viewport = PREVIEW_DEVICES[device];
  const page = project.pages[0];
  const visibleRsvp = shouldRenderRsvp(project.rsvp, mode) ? project.rsvp : undefined;
  const rsvpHeight = getRsvpBlockHeight(visibleRsvp, device);
  const rsvpPositionX = visibleRsvp ? getRsvpPositionX(visibleRsvp, device) : 0;
  const rsvpPositionY = page && visibleRsvp ? getRsvpPositionY(page, visibleRsvp, device) : 0;
  const rsvpWidth = visibleRsvp ? Math.min(viewport.width, getRsvpWidth(visibleRsvp, device)) : viewport.width;
  const documentHeight = page ? getDocumentHeight(page, device, visibleRsvp) : viewport.height;
  const rendererStyle = {
    "--renderer-max-width": `${viewport.width}px`,
    "--renderer-document-ratio": documentHeight / viewport.width,
  } as CSSProperties;
  return (
    <div className={`renderer-wrap renderer-device-${device}`}>
      <ProjectFontLoader project={project} />
      <div className="renderer-document" style={rendererStyle}>
        {page && <RenderPage key={`${page.id}-${device}`} page={page} device={device} documentHeight={documentHeight} />}
        {visibleRsvp && <div className="render-rsvp-layer" style={{ left: `${rsvpPositionX / viewport.width * 100}%`, width: `${rsvpWidth / viewport.width * 100}%`, top: `${rsvpPositionY / documentHeight * 100}%`, height: `${rsvpHeight / documentHeight * 100}%` }}><RsvpFormRenderer config={visibleRsvp} publicId={project.publicId} mode={mode} /></div>}
      </div>
    </div>
  );
}
