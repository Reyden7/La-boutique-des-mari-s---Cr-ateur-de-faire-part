import { useEffect, useState } from "react";
import { getViewerDevice, getViewerViewport, IMMERSIVE_VIEWER_QUERY } from "./viewerViewport";

const measure = () => {
  if (typeof window === "undefined") return { width: 390, height: 844, top: 0, immersive: false, device: "mobile" as const };
  const viewport = getViewerViewport(window);
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  return { ...viewport, immersive: window.matchMedia(IMMERSIVE_VIEWER_QUERY).matches,
    device: getViewerDevice(window.innerWidth, window.innerHeight, coarse) };
};

export function useViewerViewport() {
  const [viewport, setViewport] = useState(measure);
  useEffect(() => {
    const update = () => setViewport(measure());
    const query = window.matchMedia(IMMERSIVE_VIEWER_QUERY);
    const pointer = window.matchMedia("(pointer: coarse)");
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    query.addEventListener("change", update);
    pointer.addEventListener("change", update);
    update();
    return () => {
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
      query.removeEventListener("change", update);
      pointer.removeEventListener("change", update);
    };
  }, []);
  return viewport;
}
