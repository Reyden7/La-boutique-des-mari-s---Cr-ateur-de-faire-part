import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { WeddingProject } from "../../types/editor";
import type { PreviewDevice } from "../../config/previewDevices";
import type { RsvpRenderMode } from "../rsvp/RsvpFormRenderer";
import { AnimationViewportProvider } from "../../components/renderer/AnimatedElement";
import { backgroundStyle } from "../../components/renderer/WeddingRenderer";
import { InvitationExperience } from "../music/InvitationExperience";
import { createViewerPageLock } from "./viewerViewport";
import { useViewerViewport } from "./useViewerViewport";
import "./invitationViewer.css";

let lockPage: ReturnType<typeof createViewerPageLock> | undefined;

/** Full-bleed reader, outside the site shell; one scroll owner in both modes. */
export function InvitationViewer({ project, device, mode = "public", controls, children }: {
  project?: WeddingProject; device?: PreviewDevice; mode?: RsvpRenderMode; controls?: ReactNode; children?: ReactNode;
}) {
  const viewport = useViewerViewport();
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    lockPage ??= createViewerPageLock(document, window);
    return lockPage();
  }, []);
  const background = project?.pages[0]?.background;
  const style = {
    ...(background ? backgroundStyle(background) : { background: "#fffdf9" }),
    "--viewer-height": `${viewport.height}px`,
    "--viewer-top": `${viewport.top}px`,
    "--preview-device-height": `${viewport.height}px`,
    "--preview-device-width": `${viewport.width}px`,
  } as CSSProperties;
  const viewer = <main className={`invitation-viewer invitation-viewer-${mode}`} style={style} aria-label={mode === "preview" ? "Aperçu immersif du faire-part" : "Faire-part"}>
    <div ref={scrollRef} className="invitation-viewer-scroll" tabIndex={0} aria-label="Contenu du faire-part">
      <AnimationViewportProvider root={scrollRef}>
        {project ? <InvitationExperience project={project} device={device ?? viewport.device} mode={mode} /> : children}
      </AnimationViewportProvider>
    </div>
    {controls}
  </main>;
  return typeof document === "undefined" ? viewer : createPortal(viewer, document.body);
}
