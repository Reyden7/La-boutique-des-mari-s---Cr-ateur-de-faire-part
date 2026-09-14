import { motion } from "framer-motion";
import { useState, type CSSProperties } from "react";
import type { EditorElement, PageBackground, WeddingPage, WeddingProject } from "../../types/editor";

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

const motionProps = (element: EditorElement) => {
  const animation = element.animation;
  const transition = { duration: animation?.duration ?? 0.8, delay: animation?.delay ?? 0 };
  switch (animation?.type) {
    case "fade": return { initial: { opacity: 0 }, animate: { opacity: element.opacity }, transition };
    case "slide-left": return { initial: { opacity: 0, x: 42 }, animate: { opacity: element.opacity, x: 0 }, transition };
    case "slide-right": return { initial: { opacity: 0, x: -42 }, animate: { opacity: element.opacity, x: 0 }, transition };
    case "slide-up": return { initial: { opacity: 0, y: 42 }, animate: { opacity: element.opacity, y: 0 }, transition };
    case "slide-down": return { initial: { opacity: 0, y: -42 }, animate: { opacity: element.opacity, y: 0 }, transition };
    case "zoom": return { initial: { opacity: 0, scale: 0.72 }, animate: { opacity: element.opacity, scale: 1 }, transition };
    case "rotate": return { initial: { opacity: 0, rotate: element.rotation - 18 }, animate: { opacity: element.opacity, rotate: element.rotation }, transition };
    default: return { initial: false as const, animate: { opacity: element.opacity }, transition: { duration: 0 } };
  }
};

function RenderElement({ element }: { element: EditorElement }) {
  const style: CSSProperties = {
    position: "absolute", left: `${element.x / 3.9}%`, top: `${element.y / 8.44}%`,
    width: `${element.width / 3.9}%`, height: `${element.height / 8.44}%`,
    transform: `rotate(${element.rotation}deg)`, opacity: element.opacity, zIndex: element.zIndex,
    display: element.visible ? "flex" : "none", alignItems: "center",
  };
  const motionConfig = motionProps(element);
  if (element.type === "text") return <motion.div {...motionConfig} style={{ ...style, color: element.color, fontFamily: element.fontFamily, fontSize: `${element.fontSize / 390 * 100}cqw`, fontWeight: element.fontWeight, fontStyle: element.italic ? "italic" : "normal", textDecoration: element.underline ? "underline" : "none", textAlign: element.textAlign, lineHeight: element.lineHeight, letterSpacing: element.letterSpacing, whiteSpace: "pre-wrap", justifyContent: element.textAlign === "center" ? "center" : element.textAlign === "right" ? "flex-end" : "flex-start" }}>{element.text}</motion.div>;
  if (element.type === "image") return <motion.img {...motionConfig} style={{ ...style, objectFit: "cover" }} src={element.src} alt={element.alt} />;
  if (element.type === "icon") return <motion.div {...motionConfig} style={{ ...style, color: element.color, fontSize: `${element.fontSize / 390 * 100}cqw`, justifyContent: "center" }}>{element.icon}</motion.div>;
  const radius = element.shape === "circle" ? "50%" : element.shape === "rounded-rectangle" ? element.cornerRadius : 0;
  return <motion.div {...motionConfig} style={{ ...style, background: element.shape === "line" ? element.stroke : element.fill, border: element.shape === "line" ? "none" : `${element.strokeWidth}px solid ${element.stroke}`, borderRadius: radius, height: element.shape === "line" ? `${Math.max(1, element.strokeWidth)}px` : style.height }} />;
}

function RenderPage({ page, active }: { page: WeddingPage; active: boolean }) {
  return (
    <motion.section className="render-page" style={backgroundStyle(page.background)} initial={{ opacity: 0, x: 30 }} animate={{ opacity: active ? 1 : 0, x: active ? 0 : -30 }} transition={{ duration: 0.45 }} aria-hidden={!active}>
      {[...page.elements].sort((a, b) => a.zIndex - b.zIndex).map((element) => <RenderElement key={element.id} element={element} />)}
    </motion.section>
  );
}

export function WeddingRenderer({ project }: { project: WeddingProject }) {
  const [pageIndex, setPageIndex] = useState(0);
  const page = project.pages[pageIndex];
  return (
    <div className="renderer-wrap">
      <div className="renderer-phone">
        {page && <RenderPage key={`${page.id}-${pageIndex}`} page={page} active />}
      </div>
      {project.pages.length > 1 && (
        <nav className="renderer-nav" aria-label="Pages du faire-part">
          <button onClick={() => setPageIndex((index) => Math.max(0, index - 1))} disabled={pageIndex === 0}>Précédent</button>
          <span>{pageIndex + 1} / {project.pages.length}</span>
          <button onClick={() => setPageIndex((index) => Math.min(project.pages.length - 1, index + 1))} disabled={pageIndex === project.pages.length - 1}>Suivant</button>
        </nav>
      )}
    </div>
  );
}
