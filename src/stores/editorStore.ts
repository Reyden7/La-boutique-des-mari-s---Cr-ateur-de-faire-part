import { create } from "zustand";

import type {
  EditorElement,
  OpeningAnimationConfig,
  PageBackground,
  ParticleConfig,
  ProjectAudioConfig,
  CustomFontAsset,
  RsvpFormConfig,
  ResponsiveElementLayout,
  WeddingProject,
  WelcomePageConfig,
  IntroductionMode,
} from "../types/editor";
import type { PreviewDevice } from "../config/previewDevices";
import { PREVIEW_DEVICES } from "../config/previewDevices";

import { startProjectCheckout } from "../services/projectRepository";
import { getProject, remoteErrorSummary, syncProject, upsertProject } from "../utils/storage";
import {
  getElementLayout,
  resetElementLayoutForDevice,
  setElementLayoutForDevice,
} from "../utils/responsiveLayout";
import {
  findContainingSectionId,
  getSelectedTargetSection,
  insertElementInSection,
  normalizeSectionMembership,
  reorderSections,
} from "../utils/sectionLayout";
import { resolveWelcomePage } from "../features/welcome/welcomeDefaults";
import { isElementLocked, isLockableElement, normalizeElementLocks } from "../utils/elementLocking";
import { getRsvpPositionX, getRsvpPositionY, getRsvpWidth, setRsvpLayoutForDevice } from "../utils/documentLayout";
import { RSVP_EDITOR_ELEMENT_ID, selectionAfterRsvpUpdate } from "../features/rsvp/rsvpEditorElement";
import { moveHierarchyElement, type HierarchyPlacement } from "../utils/hierarchyOrder";

type SaveStatus = "idle" | "saving" | "saved";

export type SidebarView =
  | "design"
  | "introduction"
  | "elements"
  | "music"
  | "effects";

interface EditorState {
  project: WeddingProject | null;

  currentPageId: string | null;

  selectedElementId: string | null;

  selectedElementIds: string[];

  zoom: number;

  fitZoom: number;

  previewDevice: PreviewDevice;

  saveStatus: SaveStatus;

  past: WeddingProject[];

  future: WeddingProject[];

  clipboard: EditorElement | null;

  sidebarView: SidebarView;

  setProject: (project: WeddingProject) => void;

  loadProject: (id: string, ownerId: string) => WeddingProject | undefined;

  renameProject: (name: string) => void;

  setCurrentPage: (id: string) => void;

  selectElement: (id: string | null, additive?: boolean) => void;

  setZoom: (zoom: number) => void;

  setFitZoom: (zoom: number) => void;

  setPreviewDevice: (device: PreviewDevice) => void;

  addElement: (element: EditorElement) => void;

  updateElement: (
    id: string,
    updates: Partial<EditorElement>
  ) => void;

  setElementsLocked: (ids: string[], locked: boolean) => void;

  toggleElementLocked: (id: string) => void;

  updateElementLayout: (
    id: string,
    updates: ResponsiveElementLayout
  ) => void;

  moveElements: (ids: string[], deltaX: number, deltaY: number) => void;

  removeSelectedElements: () => void;

  resetElementLayout: (id: string) => void;

  removeElement: (id: string) => void;

  duplicateElement: (id: string) => void;

  copyElement: () => void;

  pasteElement: () => void;

  moveLayer: (
    id: string,
    direction: "forward" | "backward"
  ) => void;

  moveHierarchyItem: (sourceId: string, targetId: string | null, placement: HierarchyPlacement) => void;

  reorderSection: (id: string, direction: -1 | 1) => void;

  updateBackground: (
    background: PageBackground
  ) => void;

  updateOpening: (
    opening: OpeningAnimationConfig
  ) => void;

  updateAudio: (
    audio: ProjectAudioConfig
  ) => void;

  updateParticles: (
    particles: ParticleConfig
  ) => void;

  updateCustomFonts: (fonts: CustomFontAsset[]) => void;

  updateRsvp: (rsvp: RsvpFormConfig) => void;

  updateWelcomePage: (welcomePage: WelcomePageConfig) => void;

  updateIntroductionMode: (mode: IntroductionMode) => void;

  setSidebarView: (
    view: SidebarView
  ) => void;

  undo: () => void;

  redo: () => void;

  save: () => void;

  checkoutAndPublish: () => Promise<string | null>;

  setSaveStatus: (
    status: SaveStatus
  ) => void;
}

const defaultParticles: ParticleConfig = {
  enabled: false,

  shape: "heart",

  direction: "down",

  speed: 30,

  quantity: 25,

  colors: [
    "#FFFFFF",
    "#F0CACA",
  ],

  minSize: 8,

  maxSize: 18,

  opacity: 0.8,

  layer: "front",
};

const clone = (
  project: WeddingProject
) => structuredClone(project);

const normalizeProject = (
  project: WeddingProject
): WeddingProject => ({
  ...project,

  pages: project.pages.map((page) => ({
    ...page,
    elements: normalizeElementLocks(normalizeSectionMembership(page.elements)),
  })),

  welcomePage: resolveWelcomePage(project.welcomePage),

  rsvp: project.rsvp ? { ...project.rsvp, locked: project.rsvp.locked ?? false } : undefined,

  particles:
    project.particles ??
    structuredClone(defaultParticles),
});

const uid = () =>
  crypto.randomUUID();

const isWelcomeContext = (project: WeddingProject, state: Pick<EditorState, "sidebarView">) =>
  state.sidebarView === "introduction" && project.introductionMode === "welcome" && Boolean(project.welcomePage);

const getEditableElements = (project: WeddingProject, state: Pick<EditorState, "sidebarView" | "currentPageId">) =>
  isWelcomeContext(project, state)
    ? project.welcomePage!.elements
    : project.pages.find((page) => page.id === state.currentPageId)?.elements;

const setEditableElements = (project: WeddingProject, state: Pick<EditorState, "sidebarView" | "currentPageId">, elements: EditorElement[]) => {
  if (isWelcomeContext(project, state)) project.welcomePage!.elements = elements;
  else {
    const page = project.pages.find((item) => item.id === state.currentPageId);
    if (page) page.elements = elements;
  }
};

const mutateProject = (
  state: EditorState,

  mutation: (
    project: WeddingProject
  ) => void,

  selectedElementId =
    state.selectedElementId,

  selectedElementIds = selectedElementId === state.selectedElementId
    ? state.selectedElementIds
    : selectedElementId ? [selectedElementId] : [],
) => {
  if (!state.project) {
    return {};
  }

  const previous =
    clone(state.project);

  const next =
    clone(state.project);

  mutation(next);

  next.updatedAt =
    new Date().toISOString();

  return {
    project: next,

    selectedElementId,

    selectedElementIds,

    past: [
      ...state.past,
      previous,
    ].slice(-50),

    future: [],

    saveStatus:
      "idle" as SaveStatus,
  };
};

export const useEditorStore =
  create<EditorState>(
    (set, get) => ({
      project: null,

      currentPageId: null,

      selectedElementId: null,

      selectedElementIds: [],

      zoom: 0.72,

      fitZoom: 0.72,

      previewDevice: "mobile",

      saveStatus: "idle",

      past: [],

      future: [],

      clipboard: null,

      sidebarView: "elements",

      setProject: (project) => {
        const normalized =
          normalizeProject(project);

        set({
          project:
            clone(normalized),

          currentPageId:
            normalized.pages[0]?.id ??
            null,

          selectedElementId: null,

          selectedElementIds: [],

          past: [],

          future: [],

          saveStatus: "idle",

          sidebarView: "elements",
        });
      },

      loadProject: (id, ownerId) => {
        const project =
          getProject(id, ownerId);

        if (project) {
          get().setProject(project);
        }

        return project;
      },

      renameProject: (name) =>
        set((state) =>
          mutateProject(
            state,

            (project) => {
              project.name = name;
            }
          )
        ),

      setCurrentPage: (id) =>
        set({
          currentPageId: id,

          selectedElementId: null,

          selectedElementIds: [],

        }),

      selectElement: (id, additive = false) =>
        set((state) => {
          if (!id) return { selectedElementId: null, selectedElementIds: [] };
          if (!additive) return { selectedElementId: id, selectedElementIds: [id] };
          const alreadySelected = state.selectedElementIds.includes(id);
          const selectedElementIds = alreadySelected
            ? state.selectedElementIds.filter((selectedId) => selectedId !== id)
            : [...state.selectedElementIds, id];
          return {
            selectedElementIds,
            selectedElementId: alreadySelected
              ? selectedElementIds.at(-1) ?? null
              : id,
          };
        }),

      setZoom: (zoom) =>
        set({
          zoom: Math.min(
            1.25,
            Math.max(
              0.1,
              zoom
            )
          ),
        }),

      setFitZoom: (fitZoom) =>
        set({ fitZoom }),

      setPreviewDevice: (previewDevice) =>
        set({ previewDevice }),

      addElement: (element) =>
        set((state) =>
          mutateProject(
            state,

            (project) => {
              const normalizedElement = { ...element, locked: element.locked ?? false } as EditorElement;
              if (isWelcomeContext(project, state)) {
                const layout = getElementLayout(normalizedElement, state.previewDevice);
                const viewport = PREVIEW_DEVICES[state.previewDevice];
                const placed = setElementLayoutForDevice(normalizedElement, state.previewDevice, {
                  x: Math.max(20, (viewport.width - layout.width) / 2),
                  y: Math.max(70, Math.min(layout.y, viewport.height - layout.height - 40)),
                });
                project.welcomePage!.elements.push({ ...placed, sectionId: undefined } as EditorElement);
                return;
              }
              const page =
                project.pages.find(
                  (item) =>
                    item.id ===
                    state.currentPageId
                );

              if (page) {
                if (normalizedElement.type === "section") {
                  page.elements.push(normalizedElement);
                  page.elements = page.elements.map((candidate) => {
                    if (candidate.type === "section" || candidate.sectionId) return candidate;
                    const sectionId = findContainingSectionId(page.elements, candidate, state.previewDevice);
                    return sectionId ? { ...candidate, sectionId } as EditorElement : candidate;
                  });
                } else {
                  const selectedSections = page.elements.filter(
                    (candidate) => candidate.type === "section" && state.selectedElementIds.includes(candidate.id),
                  );
                  const targetSection = getSelectedTargetSection(page.elements, state.selectedElementIds);
                  if (targetSection) {
                    const insertion = insertElementInSection(
                      page.elements,
                      normalizedElement,
                      targetSection,
                      state.previewDevice,
                    );
                    page.elements = page.elements.map((candidate) =>
                      candidate.id === targetSection.id ? insertion.section : candidate
                    );
                    page.elements.push(insertion.element);
                  } else if (selectedSections.length > 1) {
                    const ungroupedElement = { ...normalizedElement };
                    delete ungroupedElement.sectionId;
                    page.elements.push(ungroupedElement as EditorElement);
                  } else {
                    const sectionId = findContainingSectionId(page.elements, normalizedElement, state.previewDevice);
                    page.elements.push({ ...normalizedElement, sectionId } as EditorElement);
                  }
                }
              }
            },

            element.id
          )
        ),

      updateElement: (
        id,
        updates
      ) =>
        set((state) =>
          mutateProject(
            state,

            (project) => {
              const editableElements = getEditableElements(project, state);
              const index =
                editableElements?.findIndex(
                  (element) =>
                    element.id === id
                ) ?? -1;

              if (
                editableElements &&
                index >= 0
              ) {
                const current = editableElements[index];
                const safeUpdates = isElementLocked(current)
                  ? Object.fromEntries(Object.entries(updates).filter(([key]) => !["x", "y", "width", "height", "rotation", "responsive"].includes(key)))
                  : updates;
                editableElements[index] = {
                  ...current,
                  ...safeUpdates,
                } as EditorElement;
              }
            }
          )
        ),

      setElementsLocked: (ids, locked) =>
        set((state) => {
          if (ids.length === 0) return state;
          const selectedIds = new Set(ids);
          return mutateProject(state, (project) => {
            if (selectedIds.has(RSVP_EDITOR_ELEMENT_ID) && project.rsvp) {
              project.rsvp = { ...project.rsvp, locked };
            }
            const editableElements = getEditableElements(project, state);
            if (!editableElements) return;
            setEditableElements(project, state, editableElements.map((element) =>
              selectedIds.has(element.id) && isLockableElement(element)
                ? { ...element, locked } as EditorElement
                : element
            ));
          });
        }),

      toggleElementLocked: (id) =>
        set((state) => mutateProject(state, (project) => {
          if (id === RSVP_EDITOR_ELEMENT_ID) {
            if (project.rsvp) project.rsvp = { ...project.rsvp, locked: !(project.rsvp.locked ?? false) };
            return;
          }
          const editableElements = getEditableElements(project, state);
          if (!editableElements) return;
          setEditableElements(project, state, editableElements.map((element) =>
            element.id === id && isLockableElement(element)
              ? { ...element, locked: !(element.locked ?? false) } as EditorElement
              : element
          ));
        })),

      updateElementLayout: (
        id,
        updates
      ) =>
        set((state) =>
          mutateProject(
            state,
            (project) => {
              const editableElements = getEditableElements(project, state);
              const index = editableElements?.findIndex(
                (element) => element.id === id
              ) ?? -1;

              if (editableElements && index >= 0) {
                const previousElement = editableElements[index];
                if (isElementLocked(previousElement)) {
                  if (previousElement.type === "text" && updates.fontSize !== undefined) {
                    editableElements[index] = setElementLayoutForDevice(
                      previousElement,
                      state.previewDevice,
                      { fontSize: updates.fontSize },
                    );
                  }
                  if (previousElement.type === "schedule" && (
                    updates.timeFontSize !== undefined
                    || updates.titleFontSize !== undefined
                    || updates.descriptionFontSize !== undefined
                  )) {
                    editableElements[index] = setElementLayoutForDevice(
                      previousElement,
                      state.previewDevice,
                      {
                        timeFontSize: updates.timeFontSize,
                        titleFontSize: updates.titleFontSize,
                        descriptionFontSize: updates.descriptionFontSize,
                      },
                    );
                  }
                  return;
                }
                const previousLayout = getElementLayout(previousElement, state.previewDevice);
                const nextElement = setElementLayoutForDevice(
                  previousElement,
                  state.previewDevice,
                  updates,
                );
                editableElements[index] = nextElement;

                if (isWelcomeContext(project, state)) return;

                const page = project.pages.find((item) => item.id === state.currentPageId)!;

                if (previousElement.type === "section") {
                  const nextLayout = getElementLayout(nextElement, state.previewDevice);
                  const deltaX = nextLayout.x - previousLayout.x;
                  const deltaY = nextLayout.y - previousLayout.y;
                  if (deltaX || deltaY) {
                    page.elements = page.elements.map((element) => {
                      if (element.sectionId !== id) return element;
                      const layout = getElementLayout(element, state.previewDevice);
                      return setElementLayoutForDevice(element, state.previewDevice, {
                        x: layout.x + deltaX,
                        y: layout.y + deltaY,
                      });
                    });
                    if ((deltaX || deltaY) && project.rsvp?.enabled && project.rsvp.sectionId === id) {
                      project.rsvp = setRsvpLayoutForDevice(
                        project.rsvp,
                        state.previewDevice,
                        {
                          x: getRsvpPositionX(project.rsvp, state.previewDevice) + deltaX,
                          y: getRsvpPositionY(page, project.rsvp, state.previewDevice) + deltaY,
                        },
                      );
                    }
                  }
                } else if (updates.x !== undefined || updates.y !== undefined) {
                  const sectionId = findContainingSectionId(page.elements, nextElement, state.previewDevice);
                  page.elements[index] = { ...nextElement, sectionId } as EditorElement;
                }
              }
            }
          )
        ),

      moveElements: (ids, deltaX, deltaY) => {
        if ((!deltaX && !deltaY) || ids.length === 0) return;
        set((state) =>
          mutateProject(state, (project) => {
            let editableElements = getEditableElements(project, state);
            if (!editableElements) return;
            const welcomeContext = isWelcomeContext(project, state);

            const movedIds = new Set<string>();
            for (const id of ids) {
              const element = editableElements.find((item) => item.id === id);
              if (!element || isElementLocked(element)) continue;
              movedIds.add(id);
              if (!welcomeContext && element.type === "section") {
                editableElements.forEach((candidate) => {
                  if (candidate.sectionId === id) movedIds.add(candidate.id);
                });
              }
            }

            if (movedIds.size === 0) return;

            editableElements = editableElements.map((element) => {
              if (!movedIds.has(element.id)) return element;
              const layout = getElementLayout(element, state.previewDevice);
              return setElementLayoutForDevice(element, state.previewDevice, {
                x: layout.x + deltaX,
                y: layout.y + deltaY,
              });
            });

            if (!welcomeContext) editableElements = editableElements.map((element) => {
              if (!movedIds.has(element.id) || element.type === "section") return element;
              const parentMoved = element.sectionId ? movedIds.has(element.sectionId) : false;
              if (parentMoved) return element;
              const sectionId = findContainingSectionId(editableElements!, element, state.previewDevice);
              return { ...element, sectionId } as EditorElement;
            });
            if (!welcomeContext && project.rsvp?.enabled && project.rsvp.sectionId && movedIds.has(project.rsvp.sectionId)) {
              const page = project.pages.find((item) => item.id === state.currentPageId);
              if (page) project.rsvp = setRsvpLayoutForDevice(
                project.rsvp,
                state.previewDevice,
                {
                  x: getRsvpPositionX(project.rsvp, state.previewDevice) + deltaX,
                  y: getRsvpPositionY(page, project.rsvp, state.previewDevice) + deltaY,
                },
              );
            }
            setEditableElements(project, state, editableElements);
          })
        );
      },

      resetElementLayout: (id) =>
        set((state) =>
          mutateProject(
            state,
            (project) => {
              const editableElements = getEditableElements(project, state);
              const index = editableElements?.findIndex(
                (element) => element.id === id
              ) ?? -1;

              if (editableElements && index >= 0) {
                if (isElementLocked(editableElements[index])) return;
                editableElements[index] = resetElementLayoutForDevice(
                  editableElements[index],
                  state.previewDevice,
                );
              }
            }
          )
        ),

      removeElement: (id) =>
        set((state) =>
          mutateProject(
            state,

            (project) => {
              const editableElements = getEditableElements(project, state);
              if (editableElements) {
                setEditableElements(project, state, editableElements
                  .filter((element) => element.id !== id)
                  .map((element) => element.sectionId === id
                    ? { ...element, sectionId: undefined } as EditorElement
                    : element));
                if (project.rsvp?.sectionId === id) project.rsvp = { ...project.rsvp, sectionId: undefined };
              }
            },

            null
          )
        ),

      removeSelectedElements: () =>
        set((state) => {
          if (state.selectedElementIds.length === 0) return state;
          const removedIds = new Set(state.selectedElementIds);
          return mutateProject(state, (project) => {
            if (removedIds.has(RSVP_EDITOR_ELEMENT_ID) && project.rsvp) {
              project.rsvp = { ...project.rsvp, enabled: false };
            }
            const editableElements = getEditableElements(project, state);
            if (!editableElements) return;
            setEditableElements(project, state, editableElements
              .filter((element) => !removedIds.has(element.id))
              .map((element) => element.sectionId && removedIds.has(element.sectionId)
                ? { ...element, sectionId: undefined } as EditorElement
                : element));
            if (project.rsvp?.sectionId && removedIds.has(project.rsvp.sectionId)) {
              project.rsvp = { ...project.rsvp, sectionId: undefined };
            }
          }, null, []);
        }),

      duplicateElement: (id) =>
        set((state) => {
          let duplicatedId:
            | string
            | null = null;

          const result =
            mutateProject(
              state,

              (project) => {
                const editableElements = getEditableElements(project, state);
                const element =
                  editableElements?.find(
                    (item) =>
                      item.id === id
                  );

                if (
                  editableElements &&
                  element
                ) {
                  duplicatedId =
                    uid();

                  let duplicated = {
                    ...structuredClone(
                      element
                    ),

                    id:
                      duplicatedId,

                    name:
                      `${element.name} copie`,

                    zIndex:
                      editableElements.length +
                      1,
                  } as EditorElement;

                  const layout = getElementLayout(
                    duplicated,
                    state.previewDevice,
                  );
                  duplicated = setElementLayoutForDevice(
                    duplicated,
                    state.previewDevice,
                    { x: layout.x + 18, y: layout.y + 18 },
                  );

                  if (!isWelcomeContext(project, state) && duplicated.type !== "section") {
                    const sectionId = findContainingSectionId(editableElements, duplicated, state.previewDevice);
                    duplicated = { ...duplicated, sectionId } as EditorElement;
                  }

                  editableElements.push(duplicated);
                  if (!isWelcomeContext(project, state) && element.type === "section") {
                    // The form is unique project config, not an EditorElement: only
                    // actual section children are copied with the new section.
                    const children = editableElements.filter((child) => child.sectionId === element.id);
                    for (const child of children) {
                      const childLayout = getElementLayout(child, state.previewDevice);
                      const copy = setElementLayoutForDevice({
                        ...structuredClone(child),
                        id: uid(),
                        name: `${child.name} copie`,
                        sectionId: duplicatedId,
                        zIndex: editableElements.length + 1,
                      } as EditorElement, state.previewDevice, {
                        x: childLayout.x + 18,
                        y: childLayout.y + 18,
                      });
                      editableElements.push(copy);
                    }
                  }
                }
              },

              duplicatedId
            );

          return {
            ...result,

            selectedElementId:
              duplicatedId,

            selectedElementIds:
              duplicatedId ? [duplicatedId] : [],
          };
        }),

      copyElement: () => {
        const {
          project,
          currentPageId,
          selectedElementId,
        } = get();

        const element = project
          ? getEditableElements(project, { currentPageId, sidebarView: get().sidebarView })?.find(
              (item) =>
                item.id ===
                selectedElementId
            )
          : undefined;

        if (element) {
          set({
            clipboard:
              structuredClone(
                element
              ),
          });
        }
      },

      pasteElement: () => {
        const {
          clipboard,
          previewDevice,
        } = get();

        if (clipboard) {
          const copy = {
            ...structuredClone(
              clipboard
            ),

            id: uid(),

            name:
              `${clipboard.name} copie`,

          } as EditorElement;
          const layout = getElementLayout(copy, previewDevice);

          get().addElement(
            setElementLayoutForDevice(copy, previewDevice, {
              x: layout.x + 18,
              y: layout.y + 18,
            })
          );
        }
      },

      moveLayer: (
        id,
        direction
      ) =>
        set((state) =>
          mutateProject(
            state,

            (project) => {
              const editableElements = getEditableElements(project, state);
              if (!editableElements) {
                return;
              }

              const welcomeContext = isWelcomeContext(project, state);
              const selectedElement = editableElements.find((element) => element.id === id);
              if (!welcomeContext && selectedElement) {
                const siblings = editableElements
                  .filter((element) => (element.sectionId ?? null) === (selectedElement.sectionId ?? null))
                  .sort((a, b) => b.zIndex - a.zIndex);
                const index = siblings.findIndex((element) => element.id === id);
                const neighbor = siblings[index + (direction === "forward" ? -1 : 1)];
                if (neighbor) setEditableElements(project, state, moveHierarchyElement(editableElements, id, neighbor.id, direction === "forward" ? "before" : "after"));
                return;
              }
              const isInteractionElement = (element: EditorElement) =>
                element.type === "button" && element.welcomeAction === "enter";
              const selectedIsInteraction = selectedElement
                ? isInteractionElement(selectedElement)
                : false;
              const ordered = [
                ...editableElements,
              ].filter((element) =>
                !welcomeContext || isInteractionElement(element) === selectedIsInteraction
              ).sort(
                (a, b) =>
                  a.zIndex -
                  b.zIndex
              );

              const index =
                ordered.findIndex(
                  (item) =>
                    item.id === id
                );

              const target =
                direction ===
                "forward"
                  ? index + 1
                  : index - 1;

              if (
                index < 0 ||
                target < 0 ||
                target >=
                  ordered.length
              ) {
                return;
              }

              [
                ordered[index],
                ordered[target],
              ] = [
                ordered[target],
                ordered[index],
              ];

              ordered.forEach(
                (
                  element,
                  zIndex
                ) => {
                  element.zIndex =
                    zIndex;
                }
              );

              setEditableElements(
                project,
                state,
                welcomeContext ? editableElements : ordered
              );
            }
          )
        ),

      moveHierarchyItem: (sourceId, targetId, placement) =>
        set((state) => mutateProject(state, (project) => {
          if (isWelcomeContext(project, state)) return;
          const page = project.pages.find((item) => item.id === state.currentPageId);
          if (!page) return;
          if (sourceId === RSVP_EDITOR_ELEMENT_ID) {
            if (!project.rsvp?.enabled) return;
            const target = page.elements.find((element) => element.id === targetId);
            const sectionId = placement === "inside" && target?.type === "section"
              ? target.id
              : placement !== "inside" ? target?.sectionId ?? null : undefined;
            if (sectionId === undefined) return;
            // Materialize the current visual position before changing ownership;
            // an automatic form position otherwise changes when its section moves.
            let nextRsvp = project.rsvp;
            for (const device of ["mobile", "tablet", "desktop"] as const) {
              nextRsvp = setRsvpLayoutForDevice(nextRsvp, device, {
                x: getRsvpPositionX(project.rsvp, device),
                y: getRsvpPositionY(page, project.rsvp, device),
                width: getRsvpWidth(project.rsvp, device),
              });
            }
            project.rsvp = { ...nextRsvp, sectionId };
            return;
          }
          page.elements = moveHierarchyElement(page.elements, sourceId, targetId, placement);
        })),

      reorderSection: (id, direction) =>
        set((state) =>
          mutateProject(state, (project) => {
            if (isWelcomeContext(project, state)) return;
            const page = project.pages.find((item) => item.id === state.currentPageId);
            if (!page) return;
            const section = page.elements.find((element) => element.id === id);
            if (!section || isElementLocked(section)) return;
            page.elements = reorderSections(page.elements, id, direction, state.previewDevice);
          })
        ),

      updateBackground: (
        background
      ) =>
        set((state) =>
          mutateProject(
            state,

            (project) => {
              const page =
                project.pages.find(
                  (item) =>
                    item.id ===
                    state.currentPageId
                );

              if (page) {
                page.background = {
                  ...page.background,
                  ...background,
                };
                page.backgroundSections = undefined;
              }
            }
          )
        ),

      updateOpening: (
        opening
      ) =>
        set((state) =>
          mutateProject(
            state,

            (project) => {
              project.opening = opening;
              project.introductionMode = opening.type === "none" ? "none" : "classic";
              if (project.welcomePage) project.welcomePage.enabled = false;
            },

            null
          )
        ),

      updateAudio: (
        audio
      ) =>
        set((state) =>
          mutateProject(
            state,

            (project) => {
              project.audio =
                audio;
            },

            null
          )
        ),

      updateParticles: (
        particles
      ) =>
        set((state) =>
          mutateProject(
            state,

            (project) => {
              project.particles =
                particles;
            },

            null
          )
        ),

      updateCustomFonts: (customFonts) =>
        set((state) =>
          mutateProject(state, (project) => {
            project.customFonts = customFonts;
          }, null)
        ),

      updateRsvp: (rsvp) =>
        set((state) => {
          const selection = selectionAfterRsvpUpdate(rsvp.enabled, state.selectedElementId, state.selectedElementIds);
          return mutateProject(state, (project) => {
            project.rsvp = rsvp;
          }, selection.selectedId, selection.selectedIds);
        }),

      updateWelcomePage: (welcomePage) =>
        set((state) =>
          mutateProject(state, (project) => {
            project.welcomePage = { ...welcomePage, enabled: true };
            project.introductionMode = "welcome";
          }, null)
        ),

      updateIntroductionMode: (introductionMode) =>
        set((state) =>
          mutateProject(state, (project) => {
            project.introductionMode = introductionMode;
            if (project.welcomePage) {
              project.welcomePage.enabled = introductionMode === "welcome";
            }
          }, null)
        ),

      setSidebarView: (
        sidebarView
      ) =>
        set({
          sidebarView,

          selectedElementId: sidebarView === "elements" ? get().selectedElementId : null,

          selectedElementIds: sidebarView === "elements" ? get().selectedElementIds : [],

        }),

      undo: () =>
        set((state) => {
          const previous =
            state.past.at(-1);

          if (
            !previous ||
            !state.project
          ) {
            return state;
          }

          return {
            project:
              clone(previous),

            past:
              state.past.slice(
                0,
                -1
              ),

            future: [
              clone(
                state.project
              ),

              ...state.future,
            ].slice(0, 50),

            selectedElementId:
              null,

            selectedElementIds: [],

            saveStatus:
              "idle",
          };
        }),

      redo: () =>
        set((state) => {
          const next =
            state.future[0];

          if (
            !next ||
            !state.project
          ) {
            return state;
          }

          return {
            project:
              clone(next),

            past: [
              ...state.past,

              clone(
                state.project
              ),
            ].slice(-50),

            future:
              state.future.slice(
                1
              ),

            selectedElementId:
              null,

            selectedElementIds: [],

            saveStatus:
              "idle",
          };
        }),

      save: () => {
        const project =
          get().project;

        if (!project) {
          return;
        }

        set({
          saveStatus:
            "saving",
        });

        upsertProject(
          project
        );

        void syncProject(
          project
        )
          .then(
            () =>
              set({
                saveStatus:
                  "saved",
              })
          )
          .catch(
            (error) => {
              console.warn(
                "Sauvegarde distante différée",
                remoteErrorSummary(error)
              );

              set({
                saveStatus:
                  "saved",
              });
            }
          );
      },

      checkoutAndPublish: async () => {
        const state =
          get();

        if (!state.project) {
          return null;
        }

        set({
          saveStatus:
            "saving",
        });

        const project = {
          ...state.project,
          updatedAt: new Date().toISOString(),
        };

        upsertProject(project);
        const syncedProject = await syncProject(project);

        const normalized =
          normalizeProject(
            syncedProject
          );

        upsertProject(
          normalized
        );

        set({
          project:
            normalized,

          saveStatus:
            "saved",
        });

        if (
          normalized.paymentStatus === "paid" &&
          normalized.status === "published" &&
          normalized.publicId
        ) {
          return null;
        }

        return startProjectCheckout(normalized.id);
      },

      setSaveStatus: (
        saveStatus
      ) =>
        set({
          saveStatus,
        }),
    })
  );

export const makeTextElement =
  (): EditorElement => ({
    id: uid(),

    type: "text",

    name: "Nouveau texte",

    x: 70,

    y: 300,

    width: 250,

    height: 70,

    rotation: 0,

    opacity: 1,

    zIndex: Date.now(),

    visible: true,

    locked: false,

    text: "Votre texte",

    fontFamily:
      "Cormorant Garamond",

    fontSize: 38,

    fontWeight: 500,

    color: "#3f3935",

    textAlign: "center",

    lineHeight: 1.1,

    letterSpacing: 0,

    italic: false,

    underline: false,

    animation: {
      type: "none",

      duration: 0.8,

      delay: 0,
    },
  });

export const makeShapeElement = (
  shape:
    | "rectangle"
    | "rounded-rectangle"
    | "circle"
    | "line"
): EditorElement => ({
  id: uid(),

  type: "shape",

  name:
    shape === "circle"
      ? "Cercle"
      : shape === "line"
        ? "Ligne"
        : "Forme",

  x: 105,

  y: 330,

  width: 180,

  height:
    shape === "line"
      ? 4
      : 120,

  rotation: 0,

  opacity: 1,

  zIndex: Date.now(),

  visible: true,

  locked: false,

  shape,

  fill:
    shape === "line"
      ? "transparent"
      : "#d8c4b2",

  stroke:
    "#9d795f",

  strokeWidth:
    shape === "line"
      ? 2
      : 0,

  cornerRadius:
    shape ===
    "rounded-rectangle"
      ? 24
      : 0,

  animation: {
    type: "none",

    duration: 0.8,

    delay: 0,
  },
});
