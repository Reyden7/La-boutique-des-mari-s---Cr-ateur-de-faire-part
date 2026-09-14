import { useEffect, useState } from "react";
import type { PreviewDevice } from "../config/previewDevices";

export const getResponsiveDevice = (width: number): PreviewDevice => {
  if (width < 600) return "mobile";
  if (width < 1024) return "tablet";
  return "desktop";
};

const getWindowDevice = () => getResponsiveDevice(
  typeof window === "undefined" ? 390 : window.innerWidth,
);

export function useResponsiveDevice(forcedDevice?: PreviewDevice) {
  const [detectedDevice, setDetectedDevice] = useState<PreviewDevice>(getWindowDevice);

  useEffect(() => {
    if (forcedDevice) return;

    const tabletQuery = window.matchMedia("(min-width: 600px) and (max-width: 1023px)");
    const desktopQuery = window.matchMedia("(min-width: 1024px)");
    const updateDevice = () => setDetectedDevice(
      desktopQuery.matches ? "desktop" : tabletQuery.matches ? "tablet" : "mobile",
    );

    updateDevice();
    tabletQuery.addEventListener("change", updateDevice);
    desktopQuery.addEventListener("change", updateDevice);

    return () => {
      tabletQuery.removeEventListener("change", updateDevice);
      desktopQuery.removeEventListener("change", updateDevice);
    };
  }, [forcedDevice]);

  return forcedDevice ?? detectedDevice;
}
