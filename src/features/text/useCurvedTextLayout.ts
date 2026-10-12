import { useEffect, useMemo, useState } from "react";
import { useProjectFontRevision } from "../fonts/projectFontRuntime";
import { curvedCanvasFont, measureCurvedText, type CurvedTextOptions } from "./curvedTextLayout";

export function useCurvedTextLayout(options: CurvedTextOptions) {
  const revision = useProjectFontRevision();
  const [browserRevision, setBrowserRevision] = useState(0);
  const signature = JSON.stringify(options);
  const fontSignature = JSON.stringify([curvedCanvasFont(options), options.text]);
  useEffect(() => {
    let active = true;
    const refresh = () => { if (active) setBrowserRevision((value) => value + 1); };
    // Canvas-only text does not always cause a newly linked CSS font to load.
    // Request it generically from the existing FontFaceSet, including imported aliases.
    const loadFont = () => { void document.fonts.load(curvedCanvasFont(options), options.text || " ").then(() => document.fonts.ready).then(refresh).catch(refresh); };
    const stylesheetLoaded = (event: Event) => { if (event.target instanceof HTMLLinkElement && event.target.rel === "stylesheet") loadFont(); };
    loadFont();
    document.fonts.addEventListener("loadingdone", refresh);
    document.head.addEventListener("load", stylesheetLoaded, true);
    return () => { active = false; document.fonts.removeEventListener("loadingdone", refresh); document.head.removeEventListener("load", stylesheetLoaded, true); };
  }, [fontSignature]);
  return useMemo(() => measureCurvedText(options), [signature, revision, browserRevision]);
}
