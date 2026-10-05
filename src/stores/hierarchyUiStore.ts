import { create } from "zustand";

export type CollapsedSections = Readonly<Record<string, boolean>>;
export const EMPTY_COLLAPSED_SECTIONS: CollapsedSections = Object.freeze({});

interface HierarchyUiState {
  /** Scope by project as templates can reuse logical element IDs in another project. */
  collapsedSectionsByProject: Record<string, Record<string, boolean>>;
  setSectionCollapsed: (projectId: string, sectionId: string, collapsed: boolean) => void;
  setAllSectionsCollapsed: (projectId: string, sectionIds: string[], collapsed: boolean) => void;
  pruneSections: (projectId: string, existingSectionIds: string[]) => void;
}

/** Session memory only: no persistence middleware, project mutation, history or autosave. */
export const useHierarchyUiStore = create<HierarchyUiState>((set) => ({
  collapsedSectionsByProject: {},
  setSectionCollapsed: (projectId, sectionId, collapsed) => set((state) => {
    const current = state.collapsedSectionsByProject[projectId] ?? {};
    if ((current[sectionId] ?? false) === collapsed) return state;
    return { collapsedSectionsByProject: { ...state.collapsedSectionsByProject, [projectId]: { ...current, [sectionId]: collapsed } } };
  }),
  setAllSectionsCollapsed: (projectId, sectionIds, collapsed) => set((state) => {
    const current = state.collapsedSectionsByProject[projectId] ?? {};
    if (sectionIds.every((id) => (current[id] ?? false) === collapsed)) return state;
    return { collapsedSectionsByProject: { ...state.collapsedSectionsByProject, [projectId]: { ...current, ...Object.fromEntries(sectionIds.map((id) => [id, collapsed])) } } };
  }),
  pruneSections: (projectId, existingSectionIds) => set((state) => {
    const current = state.collapsedSectionsByProject[projectId];
    if (!current) return state;
    const existing = new Set(existingSectionIds);
    if (Object.keys(current).every((id) => existing.has(id))) return state;
    return { collapsedSectionsByProject: { ...state.collapsedSectionsByProject, [projectId]: Object.fromEntries(Object.entries(current).filter(([id]) => existing.has(id))) } };
  }),
}));
