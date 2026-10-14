import { useEditorStore } from "../../stores/editorStore";
import { usePropertyPanelStore } from "../../stores/propertyPanelStore";
import { isElementVisibleOnDevice } from "../../utils/responsiveLayout";
import type { TutorialStep } from "./tutorialConfig";

export function captureTutorialUi() {
  const { currentPageId, sidebarView, selectedElementId, selectedElementIds } = useEditorStore.getState();
  return { currentPageId, sidebarView, selectedElementId, selectedElementIds: [...selectedElementIds], sections: { ...usePropertyPanelStore.getState().propertySectionOpenState } };
}
/** Only session UI state changes: never call project mutations, save, upload or checkout. */
export function prepareTutorialStep(step: TutorialStep) {
  const state = useEditorStore.getState();
  if (step.tab) state.setSidebarView(step.tab);
  if (step.tab === "design" || step.tab === "introduction") state.selectElement(null);
  if (step.select) {
    const elements = state.project?.pages.find((page) => page.id === state.currentPageId)?.elements ?? [];
    const eligible = elements.filter((element) => element.type !== "section" && isElementVisibleOnDevice(element, elements, state.previewDevice) && (step.select !== "text" || element.type === "text"));
    const selected = eligible.find((element) => element.id === state.selectedElementId) ?? eligible.find((element) => !element.locked) ?? eligible[0];
    state.selectElement(selected?.id ?? null);
  }
  if (step.section) usePropertyPanelStore.getState().setPropertySectionOpen(step.section, true);
}
export function restoreTutorialUi(snapshot: ReturnType<typeof captureTutorialUi>) {
  const current = useEditorStore.getState();
  const page = current.project?.pages.find((item) => item.id === snapshot.currentPageId);
  if (page) {
    const ids = new Set([...page.elements, ...(current.project?.welcomePage?.elements ?? [])].map((element) => element.id));
    const selectedElementIds = snapshot.selectedElementIds.filter((id) => ids.has(id));
    useEditorStore.setState({ currentPageId: snapshot.currentPageId, sidebarView: snapshot.sidebarView, selectedElementIds, selectedElementId: snapshot.selectedElementId && ids.has(snapshot.selectedElementId) ? snapshot.selectedElementId : null });
  }
  usePropertyPanelStore.setState({ propertySectionOpenState: snapshot.sections });
}
