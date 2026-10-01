import type { PreviewDevice } from "../config/previewDevices";
import type { EditorElement, ResponsiveElementLayout } from "../types/editor";
import { getElementComposition, isCompositionVisible } from "./hierarchyOrder.ts";

export interface ResolvedElementLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  visible: boolean;
  zIndex: number;
  sectionId: string | null;
  fontSize?: number;
  timeFontSize?: number;
  titleFontSize?: number;
  descriptionFontSize?: number;
}

export interface ElementRenderBox {
  left: string;
  top: string;
  width: string;
  height: string;
  transform: string;
  transformOrigin: "top left";
}

/** Image coordinates remain the unrotated top-left corner in project_data.
 * Konva positions the node at its centre and offsets its local drawing back;
 * DOM uses the same centre as its CSS transform origin.
 */
export const getImageRotationFrame = (layout: Pick<ResolvedElementLayout, "x" | "y" | "width" | "height">) => ({
  x: layout.x + layout.width / 2,
  y: layout.y + layout.height / 2,
  offsetX: layout.width / 2,
  offsetY: layout.height / 2,
  transformOrigin: "center center" as const,
});

const getOverride = (element: EditorElement, device: PreviewDevice) => {
  if (device === "mobile") return undefined;
  return element.responsive?.[device];
};

export const getElementLayout = (
  element: EditorElement,
  device: PreviewDevice,
): ResolvedElementLayout => {
  const override = getOverride(element, device);
  const composition = getElementComposition(element, device);

  return {
    x: override?.x ?? element.x,
    y: override?.y ?? element.y,
    width: override?.width ?? element.width,
    height: override?.height ?? element.height,
    rotation: override?.rotation ?? element.rotation,
    ...composition,
    fontSize: element.type === "text" ? override?.fontSize ?? element.fontSize : undefined,
    timeFontSize: element.type === "schedule" ? override?.timeFontSize ?? element.timeFontSize : undefined,
    titleFontSize: element.type === "schedule" ? override?.titleFontSize ?? element.titleFontSize : undefined,
    descriptionFontSize: element.type === "schedule" ? override?.descriptionFontSize ?? element.descriptionFontSize : undefined,
  };
};

export const getElementSectionId = (element: EditorElement, device: PreviewDevice) => getElementLayout(element, device).sectionId;
export const getElementZIndex = (element: EditorElement, device: PreviewDevice) => getElementLayout(element, device).zIndex;

export const isElementVisibleOnDevice = isCompositionVisible;

/** Freeze inherited legacy values so later edits to one device cannot leak into another. */
export const materializeElementLayouts = (element: EditorElement): EditorElement => {
  const snapshot = (device: "tablet" | "desktop"): ResponsiveElementLayout => ({
    ...getElementLayout(element, device),
  });
  return { ...element, responsive: { tablet: snapshot("tablet"), desktop: snapshot("desktop") } } as EditorElement;
};

/** Shared pixel-to-renderer conversion used by Preview and Public.
 * Editor uses the same resolved layout directly in the Konva reference space.
 */
export const getElementRenderBox = (
  layout: ResolvedElementLayout,
  viewportWidth: number,
  documentHeight: number,
): ElementRenderBox => ({
  left: `${layout.x / viewportWidth * 100}%`,
  top: `${layout.y / documentHeight * 100}%`,
  width: `${layout.width / viewportWidth * 100}%`,
  height: `${layout.height / documentHeight * 100}%`,
  transform: `rotate(${layout.rotation}deg)`,
  transformOrigin: "top left",
});

export const hasElementLayoutOverride = (
  element: EditorElement,
  device: PreviewDevice,
) => {
  if (device === "mobile") return false;
  const current = getElementLayout(element, device);
  const mobile = getElementLayout(element, "mobile");
  return (["x", "y", "width", "height", "rotation", "fontSize", "timeFontSize", "titleFontSize", "descriptionFontSize"] as const)
    .some((key) => current[key] !== mobile[key]);
};

export const setElementLayoutForDevice = (
  element: EditorElement,
  device: PreviewDevice,
  updates: ResponsiveElementLayout,
): EditorElement => {
  const geometry = {
    ...(updates.x !== undefined ? { x: updates.x } : {}),
    ...(updates.y !== undefined ? { y: updates.y } : {}),
    ...(updates.width !== undefined ? { width: updates.width } : {}),
    ...(updates.height !== undefined ? { height: updates.height } : {}),
    ...(updates.rotation !== undefined ? { rotation: updates.rotation } : {}),
    ...(updates.visible !== undefined ? { visible: updates.visible } : {}),
    ...(updates.zIndex !== undefined ? { zIndex: updates.zIndex } : {}),
    ...(updates.sectionId !== undefined ? { sectionId: updates.sectionId } : {}),
  };
  const typography = element.type === "text" && updates.fontSize !== undefined
    ? { fontSize: updates.fontSize }
    : element.type === "schedule"
      ? {
          ...(updates.timeFontSize !== undefined ? { timeFontSize: updates.timeFontSize } : {}),
          ...(updates.titleFontSize !== undefined ? { titleFontSize: updates.titleFontSize } : {}),
          ...(updates.descriptionFontSize !== undefined ? { descriptionFontSize: updates.descriptionFontSize } : {}),
        }
      : {};

  if (device === "mobile") {
    return { ...element, ...geometry, ...typography } as EditorElement;
  }

  const current = getElementLayout(element, device);
  const nextOverride: ResponsiveElementLayout = {
    x: current.x,
    y: current.y,
    width: current.width,
    height: current.height,
    rotation: current.rotation,
    visible: current.visible,
    zIndex: current.zIndex,
    sectionId: current.sectionId,
    ...(element.type === "text" ? { fontSize: current.fontSize } : {}),
    ...(element.type === "schedule" ? {
      timeFontSize: current.timeFontSize,
      titleFontSize: current.titleFontSize,
      descriptionFontSize: current.descriptionFontSize,
    } : {}),
    ...geometry,
    ...typography,
  };

  return {
    ...element,
    responsive: {
      ...element.responsive,
      [device]: nextOverride,
    },
  } as EditorElement;
};

export const resetElementLayoutForDevice = (
  element: EditorElement,
  device: PreviewDevice,
): EditorElement => {
  if (device === "mobile") return element;
  const mobile = getElementLayout(element, "mobile");
  return setElementLayoutForDevice(element, device, {
    x: mobile.x, y: mobile.y, width: mobile.width, height: mobile.height,
    rotation: mobile.rotation, fontSize: mobile.fontSize,
    timeFontSize: mobile.timeFontSize, titleFontSize: mobile.titleFontSize,
    descriptionFontSize: mobile.descriptionFontSize,
  });
};
