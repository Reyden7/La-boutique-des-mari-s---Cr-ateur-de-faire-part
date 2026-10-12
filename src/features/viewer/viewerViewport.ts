import { getResponsiveDevice } from "../../hooks/useResponsiveDevice";

export const IMMERSIVE_VIEWER_QUERY = "(max-width: 1023px), (hover: none) and (pointer: coarse)";

export function getViewerViewport(win: Pick<Window, "innerWidth" | "innerHeight" | "visualViewport">) {
  const visual = win.visualViewport;
  // Follow browser bars/keyboard, but do not resize the artwork during pinch zoom.
  return { width: win.innerWidth, height: visual && visual.scale === 1 ? visual.height : win.innerHeight,
    top: visual && visual.scale === 1 ? visual.offsetTop ?? 0 : 0 };
}

export const getViewerDevice = (width: number, height: number, coarsePointer: boolean) =>
  getResponsiveDevice(coarsePointer ? Math.min(width, height) : width);

/** Shared/ref-counted lock; restores the previous page position on exit. */
export function createViewerPageLock(doc: Document, win: Pick<Window, "scrollX" | "scrollY" | "scrollTo">) {
  let count = 0, position = { x: 0, y: 0 };
  let siteRoot: HTMLElement | null = null, previousInert = false;
  return () => {
    if (count++ === 0) {
      position = { x: win.scrollX, y: win.scrollY };
      siteRoot = doc.getElementById("root");
      if (siteRoot) { previousInert = siteRoot.inert; siteRoot.inert = true; }
      doc.documentElement.classList.add("invitation-viewer-open");
      doc.body.classList.add("invitation-viewer-open");
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (--count === 0) {
        doc.documentElement.classList.remove("invitation-viewer-open");
        doc.body.classList.remove("invitation-viewer-open");
        if (siteRoot) siteRoot.inert = previousInert;
        win.scrollTo(position.x, position.y);
      }
    };
  };
}
