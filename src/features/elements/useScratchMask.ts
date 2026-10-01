import { useEffect, useState } from "react";
import { loadScratchMask, type ScratchMask } from "./scratchMask";

export function useScratchMask(url?: string) {
  const [loaded, setLoaded] = useState<{ url: string; mask: ScratchMask } | null>(null);
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    void loadScratchMask(url).then((mask) => {
      if (!cancelled) setLoaded({ url, mask });
    }).catch(() => {
      if (!cancelled) setLoaded(null);
    });
    return () => { cancelled = true; };
  }, [url]);
  return loaded?.url === url ? loaded.mask : null;
}
