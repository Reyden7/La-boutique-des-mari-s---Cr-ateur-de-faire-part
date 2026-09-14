import { create } from "zustand";

import type {
  EditorElement,
  OpeningAnimationConfig,
  PageBackground,
  ParticleConfig,
  ProjectAudioConfig,
  ResponsiveElementLayout,
  WeddingProject,
} from "../types/editor";
import type { PreviewDevice } from "../config/previewDevices";

import { publishRemoteProject } from "../services/projectRepository";
import { getProject, syncProject, upsertProject } from "../utils/storage";
import {
  getElementLayout,
  resetElementLayoutForDevice,
  setElementLayoutForDevice,
} from "../utils/responsiveLayout";

type SaveStatus = "idle" | "saving" | "saved";

export type SidebarView =
  | "design"
  | "elements"
  | "opening"
  | "music"
  | "effects";

interface EditorState {
  project: WeddingProject | null;

  currentPageId: string | null;

  selectedElementId: string | null;

  zoom: number;

  fitZoom: number;

  previewDevice: PreviewDevice;

  saveStatus: SaveStatus;

  past: WeddingProject[];

  future: WeddingProject[];

  clipboard: EditorElement | null;

  sidebarView: SidebarView;

  setProject: (project: WeddingProject) => void;

  loadProject: (id: string) => WeddingProject | undefined;

  renameProject: (name: string) => void;

  setCurrentPage: (id: string) => void;

  selectElement: (id: string | null) => void;

  setZoom: (zoom: number) => void;

  setFitZoom: (zoom: number) => void;

  setPreviewDevice: (device: PreviewDevice) => void;

  addElement: (element: EditorElement) => void;

  updateElement: (
    id: string,
    updates: Partial<EditorElement>
  ) => void;

  updateElementLayout: (
    id: string,
    updates: ResponsiveElementLayout
  ) => void;

  resetElementLayout: (id: string) => void;

  removeElement: (id: string) => void;

  duplicateElement: (id: string) => void;

  copyElement: () => void;

  pasteElement: () => void;

  moveLayer: (
    id: string,
    direction: "forward" | "backward"
  ) => void;

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

  setSidebarView: (
    view: SidebarView
  ) => void;

  undo: () => void;

  redo: () => void;

  save: () => void;

  publish: () => Promise<WeddingProject | null>;

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

  particles:
    project.particles ??
    structuredClone(defaultParticles),
});

const uid = () =>
  crypto.randomUUID();

const mutateProject = (
  state: EditorState,

  mutation: (
    project: WeddingProject
  ) => void,

  selectedElementId =
    state.selectedElementId,
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

          past: [],

          future: [],

          saveStatus: "idle",

          sidebarView: "elements",
        });
      },

      loadProject: (id) => {
        const project =
          getProject(id);

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
        }),

      selectElement: (id) =>
        set({
          selectedElementId: id,
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
              const page =
                project.pages.find(
                  (item) =>
                    item.id ===
                    state.currentPageId
                );

              page?.elements.push(
                element
              );
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
              const page =
                project.pages.find(
                  (item) =>
                    item.id ===
                    state.currentPageId
                );

              const index =
                page?.elements.findIndex(
                  (element) =>
                    element.id === id
                ) ?? -1;

              if (
                page &&
                index >= 0
              ) {
                page.elements[index] = {
                  ...page.elements[
                    index
                  ],

                  ...updates,
                } as EditorElement;
              }
            }
          )
        ),

      updateElementLayout: (
        id,
        updates
      ) =>
        set((state) =>
          mutateProject(
            state,
            (project) => {
              const page = project.pages.find(
                (item) => item.id === state.currentPageId
              );
              const index = page?.elements.findIndex(
                (element) => element.id === id
              ) ?? -1;

              if (page && index >= 0) {
                page.elements[index] = setElementLayoutForDevice(
                  page.elements[index],
                  state.previewDevice,
                  updates,
                );
              }
            }
          )
        ),

      resetElementLayout: (id) =>
        set((state) =>
          mutateProject(
            state,
            (project) => {
              const page = project.pages.find(
                (item) => item.id === state.currentPageId
              );
              const index = page?.elements.findIndex(
                (element) => element.id === id
              ) ?? -1;

              if (page && index >= 0) {
                page.elements[index] = resetElementLayoutForDevice(
                  page.elements[index],
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
              const page =
                project.pages.find(
                  (item) =>
                    item.id ===
                    state.currentPageId
                );

              if (page) {
                page.elements =
                  page.elements.filter(
                    (element) =>
                      element.id !== id
                  );
              }
            },

            null
          )
        ),

      duplicateElement: (id) =>
        set((state) => {
          let duplicatedId:
            | string
            | null = null;

          const result =
            mutateProject(
              state,

              (project) => {
                const page =
                  project.pages.find(
                    (item) =>
                      item.id ===
                      state.currentPageId
                  );

                const element =
                  page?.elements.find(
                    (item) =>
                      item.id === id
                  );

                if (
                  page &&
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
                      page.elements.length +
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

                  page.elements.push(duplicated);
                }
              },

              duplicatedId
            );

          return {
            ...result,

            selectedElementId:
              duplicatedId,
          };
        }),

      copyElement: () => {
        const {
          project,
          currentPageId,
          selectedElementId,
        } = get();

        const element =
          project?.pages
            .find(
              (page) =>
                page.id ===
                currentPageId
            )
            ?.elements.find(
              (item) =>
                item.id ===
                selectedElementId
            );

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
              const page =
                project.pages.find(
                  (item) =>
                    item.id ===
                    state.currentPageId
                );

              if (!page) {
                return;
              }

              const ordered = [
                ...page.elements,
              ].sort(
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

              page.elements =
                ordered;
            }
          )
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
                page.background =
                  background;
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
              project.opening =
                opening;
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

      setSidebarView: (
        sidebarView
      ) =>
        set({
          sidebarView,

          selectedElementId:
            sidebarView ===
            "elements"
              ? get()
                  .selectedElementId
              : null,
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
            (
              syncedProject
            ) =>
              set({
                project:
                  normalizeProject(
                    syncedProject
                  ),

                saveStatus:
                  "saved",
              })
          )
          .catch(
            (error) => {
              console.warn(
                "Sauvegarde distante différée",
                error
              );

              set({
                saveStatus:
                  "saved",
              });
            }
          );
      },

      publish: async () => {
        const state =
          get();

        if (!state.project) {
          return null;
        }

        set({
          saveStatus:
            "saving",
        });

        const project =
          await publishRemoteProject(
            {
              ...state.project,

              updatedAt:
                new Date().toISOString(),
            }
          );

        const normalized =
          normalizeProject(
            project
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

        return normalized;
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
      type: "fade",

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
