import { create } from "zustand";

interface PropertyPanelState {
  propertySectionOpenState: Partial<Record<string, boolean>>;
  setPropertySectionOpen: (sectionKey: string, open: boolean) => void;
}

/** Session-only UI preferences, independent of project data and editor history. */
export const usePropertyPanelStore = create<PropertyPanelState>((set) => ({
  propertySectionOpenState: {},
  setPropertySectionOpen: (sectionKey, open) => set((state) => ({
    propertySectionOpenState: { ...state.propertySectionOpenState, [sectionKey]: open },
  })),
}));
