export type PreviewDevice = "mobile" | "tablet" | "desktop";

export interface PreviewDeviceConfig {
  width: number;
  height: number;
  label: string;
  frameHorizontal: number;
  frameVertical: number;
}

export const PREVIEW_DEVICES: Record<PreviewDevice, PreviewDeviceConfig> = {
  mobile: {
    width: 390,
    height: 844,
    label: "Smartphone",
    frameHorizontal: 20,
    frameVertical: 20,
  },
  tablet: {
    width: 768,
    height: 1024,
    label: "Tablette",
    frameHorizontal: 24,
    frameVertical: 24,
  },
  desktop: {
    width: 1440,
    height: 900,
    label: "PC",
    frameHorizontal: 16,
    frameVertical: 38,
  },
};

export const PREVIEW_DEVICE_ORDER: PreviewDevice[] = [
  "mobile",
  "tablet",
  "desktop",
];

export const calculatePreviewFitZoom = (
  device: PreviewDevice,
  availableWidth: number,
  availableHeight: number,
) => {
  const config = PREVIEW_DEVICES[device];
  const widthZoom = (availableWidth - config.frameHorizontal) / config.width;
  const heightZoom = (availableHeight - config.frameVertical) / config.height;

  return Math.min(1, Math.max(0.1, widthZoom, 0), Math.max(0.1, heightZoom, 0));
};
