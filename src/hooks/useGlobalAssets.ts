import { useEffect, useState } from "react";
import { GLOBAL_ASSET_CACHE_INVALIDATED, listPublishedGlobalAssets } from "../services/globalAssetRepository";
import type { GlobalAssetRecord, GlobalAssetType } from "../types/globalAssets";

export function useGlobalAssets(type?: GlobalAssetType) {
  const [assets, setAssets] = useState<GlobalAssetRecord[]>([]);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void listPublishedGlobalAssets(type).then((items) => { if (active) setAssets(items); }).catch(() => { if (active) setAssets([]); });
    };
    refresh();
    window.addEventListener(GLOBAL_ASSET_CACHE_INVALIDATED, refresh);
    return () => {
      active = false;
      window.removeEventListener(GLOBAL_ASSET_CACHE_INVALIDATED, refresh);
    };
  }, [type]);
  return assets;
}

