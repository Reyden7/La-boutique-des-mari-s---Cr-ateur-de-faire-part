import type { PreviewDevice } from "../config/previewDevices";
import type { EditorElement, ResponsiveElementLayout } from "../types/editor";

export interface ResolvedElementLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  fontSize?: number;
}

const getOverride = (element: EditorElement, device: PreviewDevice) => {
  if (device === "mobile") return undefined;
  return element.responsive?.[device];
};

export const getElementLayout = (
  element: EditorElement,
  device: PreviewDevice,
): ResolvedElementLayout => {
  const override = getOverride(element, device);

  return {
    x: override?.x ?? element.x,
    y: override?.y ?? element.y,
    width: override?.width ?? element.width,
    height: override?.height ?? element.height,
    rotation: override?.rotation ?? element.rotation,
    fontSize: element.type === "text" ? override?.fontSize ?? element.fontSize : undefined,
  };
};

export const hasElementLayoutOverride = (
  element: EditorElement,
  device: PreviewDevice,
) => device !== "mobile" && Boolean(element.responsive?.[device]);

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
  };
  const typography = element.type === "text" && updates.fontSize !== undefined
    ? { fontSize: updates.fontSize }
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
    ...(element.type === "text" ? { fontSize: current.fontSize } : {}),
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
  if (device === "mobile" || !element.responsive) return element;

  const responsive = { ...element.responsive };
  delete responsive[device];

  if (!responsive.tablet && !responsive.desktop) {
    const next = { ...element };
    delete next.responsive;
    return next;
  }

  return { ...element, responsive } as EditorElement;
};
