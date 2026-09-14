import { Monitor, Smartphone, Tablet } from "lucide-react";
import type { ComponentType } from "react";
import {
  PREVIEW_DEVICE_ORDER,
  PREVIEW_DEVICES,
  type PreviewDevice,
} from "../../config/previewDevices";
import { useEditorStore } from "../../stores/editorStore";

const deviceIcons: Record<PreviewDevice, ComponentType<{ size?: number }>> = {
  mobile: Smartphone,
  tablet: Tablet,
  desktop: Monitor,
};

export function PreviewDeviceSwitcher() {
  const previewDevice = useEditorStore((state) => state.previewDevice);
  const setPreviewDevice = useEditorStore((state) => state.setPreviewDevice);

  return (
    <div className="preview-device-switcher" role="group" aria-label="Support de prévisualisation">
      {PREVIEW_DEVICE_ORDER.map((device) => {
        const Icon = deviceIcons[device];
        const { label } = PREVIEW_DEVICES[device];

        return (
          <button
            key={device}
            type="button"
            className={previewDevice === device ? "active" : ""}
            aria-pressed={previewDevice === device}
            aria-label={`Prévisualiser sur ${label}`}
            title={label}
            onClick={() => setPreviewDevice(device)}
          >
            <Icon size={15} />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
