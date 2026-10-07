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
  WeddingPage,
  WelcomePageConfig,
  IntroductionMode,
} from "../types/editor";
import type { PreviewDevice } from "../config/previewDevices";
import { PREVIEW_DEVICES } from "../config/previewDevices";
import { isValidGuestCount } from "../config/pricing";

import { startProjectCheckout } from "../services/projectRepository";
import { getProject, remoteErrorSummary, syncProject, upsertProject } from "../utils/storage";
import {
  getElementLayout,
  getElementSectionId,
  getElementZIndex,
  isElementVisibleOnDevice,
  materializeElementLayouts,
  resetElementLayoutForDevice,
  setElementLayoutForDevice,
} from "../utils/responsiveLayout";
import {
  findContainingSectionId,
  getSelectedTargetSection,
  insertElementInSection,
  normalizeSectionMembership,
  reflowSectionsInOrder,
  reorderSections,
  setLastSectionForDevice,
  clearLastSectionFlags,
} from "../utils/sectionLayout";
import { resolveWelcomePage } from "../features/welcome/welcomeDefaults";
import { isElementLocked, isLockableElement, normalizeElementLocks } from "../utils/elementLocking";
import { getRsvpPositionX, getRsvpPositionY, getRsvpWidth, setRsvpLayoutForDevice, setRsvpSectionForDevice } from "../utils/documentLayout";
import { RSVP_EDITOR_ELEMENT_ID, getRsvpSectionId, materializeRsvpComposition, selectionAfterRsvpUpdate } from "../features/rsvp/rsvpEditorElement";
import { getHierarchyRows, moveHierarchyElement, type HierarchyPlacement } from "../utils/hierarchyOrder";
import type { CanvasPoint } from "../utils/selectionDrag";
import { getDuplicateEditorName, normalizeEditorName } from "../utils/editorNames";
import { getCustomizedTransferTargets, transferMobileLayouts, TRANSFER_TARGETS, type TransferTarget } from "../utils/responsiveTransfer";

interface ElementMoveOptions {
  device?: PreviewDevice;
  initialPositions?: Record<string, CanvasPoint>;
  preserveSectionMembership?: boolean;
}

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
  transferResponsiveLayouts: (targets: readonly TransferTarget[], confirmed?: boolean) => boolean;

  addElement: (element: EditorElement) => void;

  updateElement: (
    id: string,
    updates: Partial<EditorElement>
  ) => void;

  renameElement: (id: string, name: string) => void;

  setElementVisibility: (id: string, visible: boolean) => void;

  setElementsLocked: (ids: string[], locked: boolean) => void;

  toggleElementLocked: (id: string) => void;

  updateElementLayout: (
    id: string,
    updates: ResponsiveElementLayout
  ) => void;

  setLastSection: (id: string, enabled: boolean) => void;

  moveElements: (ids: string[], deltaX: number, deltaY: number, options?: ElementMoveOptions) => void;

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

  checkoutAndPublish: (guestCount: number, promoCode?: string) => Promise<string | null>;

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
    elements: normalizeElementLocks(normalizeSectionMembership(page.elements)).map(materializeElementLayouts),
  })),

  welcomePage: (() => { const welcome = resolveWelcomePage(project.welcomePage); return { ...welcome, elements: welcome.elements.map(materializeElementLayouts) }; })(),

  rsvp: project.rsvp ? materializeRsvpComposition({ ...project.rsvp, locked: project.rsvp.locked ?? false }) : undefined,

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

const detachDeletedSection = (element: EditorElement, deletedId: string): EditorElement => {
  let next = element;
  for (const device of ["mobile", "tablet", "desktop"] as const) {
    if (getElementSectionId(next, device) === deletedId) next = setElementLayoutForDevice(next, device, { sectionId: null });
  }
  return next;
};

const offsetAllDeviceLayouts = (element: EditorElement, amount = 18): EditorElement =>
  (["mobile", "tablet", "desktop"] as const).reduce((next, device) => {
    const layout = getElementLayout(next, device);
    return setElementLayoutForDevice(next, device, { x: layout.x + amount, y: layout.y + amount });
  }, element);

const moveRsvpWithReorderedSection = (project: WeddingProject, page: WeddingPage, nextElements: EditorElement[], device: PreviewDevice) => {
  if (!project.rsvp?.enabled) return;
  const parentId = getRsvpSectionId(project.rsvp, device);
  if (!parentId) return;
  const previous = page.elements.find((element) => element.id === parentId);
  const next = nextElements.find((element) => element.id === parentId);
  if (!previous || !next) return;
  const deltaY = getElementLayout(next, device).y - getElementLayout(previous, device).y;
  if (!deltaY) return;
  project.rsvp = setRsvpLayoutForDevice(project.rsvp, device, {
    y: getRsvpPositionY(page, project.rsvp, device) + deltaY,
  });
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

      transferResponsiveLayouts: (requested, confirmed = false) => {
        const targets = [...new Set(requested.filter((target) => TRANSFER_TARGETS.includes(target)))];
        let transferred = false;
        set((state) => {
          if (!state.project || !targets.length || (!confirmed && getCustomizedTransferTargets(state.project, targets).length)) return state;
          const adapted = transferMobileLayouts(state.project, targets);
          transferred = true;
          return mutateProject(state, (project) => Object.assign(project, adapted));
        });
        return transferred;
      },

      addElement: (element) =>
        set((state) =>
          mutateProject(
            state,

            (project) => {
              const normalizedElement = materializeElementLayouts({ ...element, sectionId: element.sectionId ?? null, locked: element.locked ?? false } as EditorElement);
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
                    if (candidate.type === "section" || getElementSectionId(candidate, state.previewDevice) || !isElementVisibleOnDevice(candidate, page.elements, state.previewDevice)) return candidate;
                    const sectionId = findContainingSectionId(page.elements, candidate, state.previewDevice);
                    return sectionId ? setElementLayoutForDevice(candidate, state.previewDevice, { sectionId }) : candidate;
                  });
                } else {
                  const selectedSections = page.elements.filter(
                    (candidate) => candidate.type === "section" && state.selectedElementIds.includes(candidate.id),
                  );
                  const targetSection = getSelectedTargetSection(page.elements, state.selectedElementIds, state.previewDevice);
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
                    page.elements.push(setElementLayoutForDevice(normalizedElement, state.previewDevice, { sectionId: null }));
                  } else {
                    const sectionId = findContainingSectionId(page.elements, normalizedElement, state.previewDevice);
                    page.elements.push(setElementLayoutForDevice(normalizedElement, state.previewDevice, { sectionId: sectionId ?? null }));
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
                // Generated pixel styles become ordinary independent device
                // overrides: manual corrections must not edit Smartphone.
                const device = state.previewDevice;
                const visual = device === "mobile" ? undefined : current.responsive?.[device]?.visualStyle;
                const nextUpdates = { ...safeUpdates };
                const nextVisual = { ...visual };
                if (visual) for (const key of Object.keys(visual)) {
                  if (key in nextUpdates && key !== "locationScale") {
                    Object.assign(nextVisual, { [key]: (nextUpdates as Record<string, unknown>)[key] });
                    delete (nextUpdates as Record<string, unknown>)[key];
                  }
                }
                if (visual && "imageStyle" in nextUpdates && current.type === "image") {
                  const imageStyle = (nextUpdates as Partial<typeof current>).imageStyle;
                  if (imageStyle?.frame && visual.frame) {
                    nextVisual.frame = imageStyle.frame;
                    Object.assign(nextUpdates, { imageStyle: { ...imageStyle, frame: current.imageStyle?.frame } });
                  }
                }
                editableElements[index] = {
                  ...current,
                  ...nextUpdates,
                  ...(visual && device !== "mobile" ? { responsive: { ...current.responsive, ...("responsive" in nextUpdates ? nextUpdates.responsive : {}),
                    [device]: { ...current.responsive?.[device], ...("responsive" in nextUpdates ? nextUpdates.responsive?.[device] : {}), visualStyle: nextVisual } } } : {}),
                } as EditorElement;
              }
            }
          )
        ),

      renameElement: (id, name) => set((state) => {
        const editorName = normalizeEditorName(name);
        const target = id === RSVP_EDITOR_ELEMENT_ID ? state.project?.rsvp
          : state.project?.pages.flatMap((page) => page.elements).find((element) => element.id === id)
            ?? state.project?.welcomePage?.elements.find((element) => element.id === id);
        if (!target || target.editorName === editorName) return state;
        return mutateProject(state, (project) => {
          const destination = id === RSVP_EDITOR_ELEMENT_ID ? project.rsvp
            : project.pages.flatMap((page) => page.elements).find((element) => element.id === id)
              ?? project.welcomePage?.elements.find((element) => element.id === id);
          if (destination) {
            if (editorName) destination.editorName = editorName;
            else delete destination.editorName;
          }
        });
      }),

      setElementVisibility: (id, visible) => set((state) => mutateProject(state, (project) => {
        if (id === RSVP_EDITOR_ELEMENT_ID) {
          if (project.rsvp) project.rsvp = { ...project.rsvp, visibilityByDevice: { ...project.rsvp.visibilityByDevice, [state.previewDevice]: visible } };
          return;
        }
        const editableElements = getEditableElements(project, state);
        if (!editableElements) return;
        setEditableElements(project, state, editableElements.map((element) => element.id === id
          ? setElementLayoutForDevice(element, state.previewDevice, { visible }) : element));
      })),

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

      setLastSection: (id, enabled) => set((state) => mutateProject(state, (project) => {
        if (isWelcomeContext(project, state)) return;
        const page = project.pages.find((item) => item.id === state.currentPageId);
        if (page) page.elements = setLastSectionForDevice(page.elements, id, state.previewDevice, enabled);
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
                  if (previousElement.type === "section" && (updates.topEdge !== undefined || updates.bottomEdge !== undefined)) {
                    editableElements[index] = setElementLayoutForDevice(previousElement, state.previewDevice, { topEdge: updates.topEdge, bottomEdge: updates.bottomEdge });
                  }
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
                    || updates.stepGap !== undefined
                  )) {
                    editableElements[index] = setElementLayoutForDevice(
                      previousElement,
                      state.previewDevice,
                      {
                        timeFontSize: updates.timeFontSize,
                        titleFontSize: updates.titleFontSize,
                        descriptionFontSize: updates.descriptionFontSize,
                        stepGap: updates.stepGap,
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
                      if (getElementSectionId(element, state.previewDevice) !== id) return element;
                      const layout = getElementLayout(element, state.previewDevice);
                      return setElementLayoutForDevice(element, state.previewDevice, {
                        x: layout.x + deltaX,
                        y: layout.y + deltaY,
                      });
                    });
                    if ((deltaX || deltaY) && project.rsvp?.enabled && getRsvpSectionId(project.rsvp, state.previewDevice) === id) {
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
                  page.elements[index] = setElementLayoutForDevice(nextElement, state.previewDevice, { sectionId: sectionId ?? null });
                }
              }
            }
          )
        ),

      moveElements: (ids, deltaX, deltaY, options = {}) => {
        if ((!deltaX && !deltaY) || ids.length === 0) return;
        set((state) =>
          mutateProject(state, (project) => {
            let editableElements = getEditableElements(project, state);
            if (!editableElements) return;
            const welcomeContext = isWelcomeContext(project, state);
            const device = options.device ?? state.previewDevice;

            const movedIds = new Set<string>();
            for (const id of ids) {
              const element = editableElements.find((item) => item.id === id);
              if (!element || isElementLocked(element)) continue;
              movedIds.add(id);
              if (element.type === "section") {
                editableElements.forEach((candidate) => {
                  if (getElementSectionId(candidate, device) === id) movedIds.add(candidate.id);
                });
              }
            }

            if (movedIds.size === 0) return;

            editableElements = editableElements.map((element) => {
              if (!movedIds.has(element.id)) return element;
              const initial = options.initialPositions?.[element.id] ?? getElementLayout(element, device);
              return setElementLayoutForDevice(element, device, {
                x: initial.x + deltaX,
                y: initial.y + deltaY,
              });
            });

            if (!welcomeContext && !options.preserveSectionMembership) editableElements = editableElements.map((element) => {
              if (!movedIds.has(element.id) || element.type === "section") return element;
              const parentId = getElementSectionId(element, device);
              const parentMoved = parentId ? movedIds.has(parentId) : false;
              if (parentMoved) return element;
              const sectionId = findContainingSectionId(editableElements!, element, device);
              return setElementLayoutForDevice(element, device, { sectionId: sectionId ?? null });
            });
            if (!welcomeContext && project.rsvp?.enabled && getRsvpSectionId(project.rsvp, device) && movedIds.has(getRsvpSectionId(project.rsvp, device)!)) {
              const page = project.pages.find((item) => item.id === state.currentPageId);
              if (page) project.rsvp = setRsvpLayoutForDevice(
                project.rsvp,
                device,
                {
                  x: (options.initialPositions?.[RSVP_EDITOR_ELEMENT_ID]?.x ?? getRsvpPositionX(project.rsvp, device)) + deltaX,
                  y: (options.initialPositions?.[RSVP_EDITOR_ELEMENT_ID]?.y ?? getRsvpPositionY(page, project.rsvp, device)) + deltaY,
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
                  .map((element) => detachDeletedSection(element, id)));
                if (project.rsvp) for (const device of ["mobile", "tablet", "desktop"] as const) {
                  if (getRsvpSectionId(project.rsvp, device) === id) project.rsvp = setRsvpSectionForDevice(project.rsvp, device, null);
                }
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
              .map((element) => [...removedIds].reduce((candidate, deletedId) => detachDeletedSection(candidate, deletedId), element)));
            if (project.rsvp) for (const device of ["mobile", "tablet", "desktop"] as const) {
              const parentId = getRsvpSectionId(project.rsvp, device);
              if (parentId && removedIds.has(parentId)) project.rsvp = setRsvpSectionForDevice(project.rsvp, device, null);
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

                  let duplicated = materializeElementLayouts({
                    ...structuredClone(
                      element
                    ),

                    id:
                      duplicatedId,

                    name:
                      `${element.name} copie`,
                    editorName: getDuplicateEditorName(element, editableElements),

                  } as EditorElement);
                  duplicated = clearLastSectionFlags(offsetAllDeviceLayouts(duplicated));
                  for (const device of ["mobile", "tablet", "desktop"] as const) {
                    const top = Math.max(0, ...editableElements.map((candidate) => getElementZIndex(candidate, device))) + 1;
                    duplicated = setElementLayoutForDevice(duplicated, device, { zIndex: top });
                  }

                  editableElements.push(duplicated);
                  if (!isWelcomeContext(project, state) && element.type === "section") {
                    // The form is unique project config, not an EditorElement: only
                    // actual section children are copied with the new section.
                    const children = editableElements.filter((child) => (["mobile", "tablet", "desktop"] as const).some((device) => getElementSectionId(child, device) === element.id));
                    for (const child of children) {
                      let copy = offsetAllDeviceLayouts(materializeElementLayouts({
                        ...structuredClone(child),
                        id: uid(),
                        name: `${child.name} copie`,
                        editorName: getDuplicateEditorName(child, editableElements),
                      } as EditorElement));
                      for (const device of ["mobile", "tablet", "desktop"] as const) {
                        const top = Math.max(0, ...editableElements.map((candidate) => getElementZIndex(candidate, device))) + 1;
                        copy = setElementLayoutForDevice(copy, device, {
                          zIndex: top,
                          ...(getElementSectionId(copy, device) === element.id ? { sectionId: duplicatedId } : {}),
                        });
                      }
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
          const copy = clearLastSectionFlags({
            ...structuredClone(
              clipboard
            ),

            id: uid(),

            name:
              `${clipboard.name} copie`,
            editorName: getDuplicateEditorName(clipboard, get().project ? getEditableElements(get().project!, get()) ?? [] : []),

          } as EditorElement);
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
                  .filter((element) => getElementSectionId(element, state.previewDevice) === getElementSectionId(selectedElement, state.previewDevice))
                  .sort((a, b) => getElementZIndex(b, state.previewDevice) - getElementZIndex(a, state.previewDevice));
                const index = siblings.findIndex((element) => element.id === id);
                const neighbor = siblings[index + (direction === "forward" ? -1 : 1)];
                if (neighbor) setEditableElements(project, state, moveHierarchyElement(editableElements, id, neighbor.id, direction === "forward" ? "before" : "after", state.previewDevice));
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
                  getElementZIndex(a, state.previewDevice) -
                  getElementZIndex(b, state.previewDevice)
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

              const order = new Map(ordered.map((element, zIndex) => [element.id, zIndex]));

              setEditableElements(
                project,
                state,
                editableElements.map((element) => order.has(element.id)
                  ? setElementLayoutForDevice(element, state.previewDevice, { zIndex: order.get(element.id)! })
                  : element)
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
              : placement !== "inside" ? target ? getElementSectionId(target, state.previewDevice) : null : undefined;
            if (sectionId === undefined) return;
            // Materialize the current visual position before changing ownership;
            // an automatic form position otherwise changes when its section moves.
            let nextRsvp = project.rsvp;
            nextRsvp = setRsvpLayoutForDevice(nextRsvp, state.previewDevice, {
              x: getRsvpPositionX(project.rsvp, state.previewDevice),
              y: getRsvpPositionY(page, project.rsvp, state.previewDevice),
              width: getRsvpWidth(project.rsvp, state.previewDevice),
            });
            project.rsvp = setRsvpSectionForDevice(nextRsvp, state.previewDevice, sectionId);
            return;
          }
          const moved = moveHierarchyElement(page.elements, sourceId, targetId, placement, state.previewDevice);
          const nextElements = page.elements.find((element) => element.id === sourceId)?.type === "section" && moved !== page.elements
            ? reflowSectionsInOrder(moved, getHierarchyRows(moved, state.previewDevice).filter((element) => element.type === "section").map((element) => element.id), state.previewDevice)
            : moved;
          moveRsvpWithReorderedSection(project, page, nextElements, state.previewDevice);
          page.elements = nextElements;
        })),

      reorderSection: (id, direction) =>
        set((state) =>
          mutateProject(state, (project) => {
            if (isWelcomeContext(project, state)) return;
            const page = project.pages.find((item) => item.id === state.currentPageId);
            if (!page) return;
            const section = page.elements.find((element) => element.id === id);
            if (!section || isElementLocked(section)) return;
            const sections = page.elements.filter((element) => element.type === "section")
              .sort((left, right) => getElementLayout(left, state.previewDevice).y - getElementLayout(right, state.previewDevice).y);
            const index = sections.findIndex((element) => element.id === id);
            const neighbor = sections[index + direction];
            if (!neighbor) return;
            const verticallyReordered = reorderSections(page.elements, id, direction, state.previewDevice);
            const nextElements = moveHierarchyElement(verticallyReordered, id, neighbor.id, direction === -1 ? "before" : "after", state.previewDevice);
            moveRsvpWithReorderedSection(project, page, nextElements, state.previewDevice);
            page.elements = nextElements;
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

      checkoutAndPublish: async (guestCount, promoCode) => {
        if (!isValidGuestCount(guestCount)) throw new Error("Nombre d’invités invalide.");
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
          requestedGuestCount: guestCount,
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
          normalized.publicId &&
          (normalized.purchasedGuestCapacity == null || guestCount <= normalized.purchasedGuestCapacity)
        ) {
          return null;
        }

        return startProjectCheckout(normalized.id, guestCount, promoCode);
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
