import type { PreviewDevice } from "../config/previewDevices";
import type { EditorElement, SectionElement } from "../types/editor";
import { getElementLayout, setElementLayoutForDevice } from "./responsiveLayout";
import { isElementLocked } from "./elementLocking";

export const SECTION_INSERT_GAP = 24;
export const SECTION_PADDING_TOP = 30;
export const SECTION_PADDING_BOTTOM = 30;
export const SECTION_GAP = 40;

const isInside = (element: EditorElement, section: EditorElement, device: PreviewDevice) => {
  const elementLayout = getElementLayout(element, device);
  const sectionLayout = getElementLayout(section, device);
  const centerX = elementLayout.x + elementLayout.width / 2;
  const centerY = elementLayout.y + elementLayout.height / 2;

  return centerX >= sectionLayout.x
    && centerX <= sectionLayout.x + sectionLayout.width
    && centerY >= sectionLayout.y
    && centerY <= sectionLayout.y + sectionLayout.height;
};

export const findContainingSectionId = (
  elements: EditorElement[],
  element: EditorElement,
  device: PreviewDevice,
) => elements
  .filter((candidate) => candidate.type === "section" && candidate.id !== element.id && isInside(element, candidate, device))
  .sort((left, right) => {
    const leftLayout = getElementLayout(left, device);
    const rightLayout = getElementLayout(right, device);
    const areaDifference = leftLayout.width * leftLayout.height - rightLayout.width * rightLayout.height;
    return areaDifference || right.zIndex - left.zIndex;
  })[0]?.id;

/** Adds explicit ownership to projects created before sections had parent links. */
export const normalizeSectionMembership = (elements: EditorElement[]) => {
  const sectionIds = new Set(elements.filter((element) => element.type === "section").map((element) => element.id));
  return elements.map((element) => {
    if (element.type === "section") return element;
    if (element.sectionId === null || (element.sectionId && sectionIds.has(element.sectionId))) return element;
    const sectionId = findContainingSectionId(elements, element, "mobile");
    if (!sectionId) {
      const next = { ...element };
      delete next.sectionId;
      return next;
    }
    return { ...element, sectionId } as EditorElement;
  });
};

export const getSelectedTargetSection = (
  elements: EditorElement[],
  selectedElementIds: string[],
) => {
  const selectedSections = elements.filter(
    (element): element is SectionElement => element.type === "section" && selectedElementIds.includes(element.id),
  );
  return selectedSections.length === 1 ? selectedSections[0] : undefined;
};

export const insertElementInSection = (
  elements: EditorElement[],
  element: EditorElement,
  section: SectionElement,
  device: PreviewDevice,
) => {
  const sectionLayout = getElementLayout(section, device);
  const elementLayout = getElementLayout(element, device);
  const children = elements.filter((candidate) => candidate.sectionId === section.id);
  const childrenBottom = children.reduce((bottom, child) => {
    const layout = getElementLayout(child, device);
    return Math.max(bottom, layout.y + layout.height);
  }, sectionLayout.y);
  const y = children.length > 0
    ? childrenBottom + SECTION_INSERT_GAP
    : sectionLayout.y + SECTION_PADDING_TOP;
  const horizontalPadding = Math.max(0, section.padding ?? SECTION_PADDING_TOP);
  const centeredX = sectionLayout.x + (sectionLayout.width - elementLayout.width) / 2;
  const x = Math.max(sectionLayout.x + horizontalPadding, centeredX);
  const positionedElement = {
    ...setElementLayoutForDevice(element, device, { x, y }),
    sectionId: section.id,
  } as EditorElement;
  const requiredSectionBottom = y + elementLayout.height + SECTION_PADDING_BOTTOM;
  const sectionBottom = sectionLayout.y + sectionLayout.height;
  const resizedSection = requiredSectionBottom > sectionBottom && !isElementLocked(section)
    ? setElementLayoutForDevice(section, device, {
        height: requiredSectionBottom - sectionLayout.y,
      }) as SectionElement
    : section;

  return { element: positionedElement, section: resizedSection };
};

export const reorderSections = (
  elements: EditorElement[],
  sectionId: string,
  direction: -1 | 1,
  currentDevice: PreviewDevice,
) => {
  const devices: PreviewDevice[] = ["mobile", "tablet", "desktop"];
  const layouts = new Map(devices.map((device) => [
    device,
    new Map(elements.map((element) => [element.id, getElementLayout(element, device)])),
  ]));
  const sections = elements
    .filter((element): element is SectionElement => element.type === "section")
    .sort((left, right) => layouts.get(currentDevice)!.get(left.id)!.y - layouts.get(currentDevice)!.get(right.id)!.y);
  const index = sections.findIndex((section) => section.id === sectionId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= sections.length) return elements;
  [sections[index], sections[target]] = [sections[target], sections[index]];

  let next = [...elements];
  for (const device of devices) {
    const deviceLayouts = layouts.get(device)!;
    let cursor = Math.min(...sections.map((section) => deviceLayouts.get(section.id)!.y));
    const deltas = new Map<string, number>();
    const nextSectionY = new Map<string, number>();
    for (const section of sections) {
      const layout = deviceLayouts.get(section.id)!;
      nextSectionY.set(section.id, cursor);
      deltas.set(section.id, cursor - layout.y);
      cursor += layout.height + SECTION_GAP;
    }
    next = next.map((element) => {
      const original = deviceLayouts.get(element.id)!;
      if (element.type === "section") {
        return setElementLayoutForDevice(element, device, { y: nextSectionY.get(element.id)! });
      }
      const delta = element.sectionId ? deltas.get(element.sectionId) : undefined;
      return delta === undefined
        ? element
        : setElementLayoutForDevice(element, device, { y: original.y + delta });
    });
  }
  return next;
};
