import type { EditorElement } from "../types/editor";

/** Every EditorElement is positionable and therefore uses the shared editor lock. */
export const isLockableElement = (_element: EditorElement): boolean => true;

/** Missing values from legacy projects are deliberately treated as unlocked. */
export const isElementLocked = (element: EditorElement): boolean => element.locked ?? false;

export const normalizeElementLocks = (elements: EditorElement[]): EditorElement[] =>
  elements.map((element) => ({ ...element, locked: element.locked ?? false } as EditorElement));
