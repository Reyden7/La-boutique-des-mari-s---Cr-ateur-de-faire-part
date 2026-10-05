import { useEffect, useState, type DragEvent } from "react";
import { ChevronDown, ChevronRight, ChevronUp, ClipboardCheck, Eye, EyeOff, GripVertical, Heart, LockKeyhole, LockKeyholeOpen, Trash2 } from "lucide-react";
import { RSVP_EDITOR_ELEMENT_ID } from "../../features/rsvp/rsvpEditorElement";
import { useEditorStore } from "../../stores/editorStore";
import type { EditorElement } from "../../types/editor";
import { getVisibleHierarchyRows, type HierarchyPlacement } from "../../utils/hierarchyOrder";
import { getElementLayout, getElementSectionId, isElementVisibleOnDevice } from "../../utils/responsiveLayout";
import { getRsvpSectionId, isRsvpVisibleOnDevice } from "../../features/rsvp/rsvpEditorElement";
import { EditableElementName } from "../ui/EditableElementName";
import { getEditorElementLabel, getRsvpEditorLabel } from "../../utils/editorNames";
import { EMPTY_COLLAPSED_SECTIONS, useHierarchyUiStore } from "../../stores/hierarchyUiStore";

type DropTarget = { id: string | null; placement: HierarchyPlacement };

export function HierarchySectionActions({ elements }: { elements: EditorElement[] }) {
  const projectId = useEditorStore((state) => state.project?.id) ?? "__local__";
  const setAll = useHierarchyUiStore((state) => state.setAllSectionsCollapsed);
  const sectionIds = elements.filter((element) => element.type === "section").map((element) => element.id);
  return <div className="hierarchy-section-actions" aria-label="Affichage des sections dans les calques">
    <button type="button" disabled={!sectionIds.length} onClick={() => setAll(projectId, sectionIds, true)}><ChevronRight size={12} />Tout replier</button>
    <button type="button" disabled={!sectionIds.length} onClick={() => setAll(projectId, sectionIds, false)}><ChevronDown size={12} />Tout déplier</button>
  </div>;
}

export function HierarchyList({ elements }: { elements: EditorElement[] }) {
  const { project, previewDevice, selectedElementIds, selectElement, toggleElementLocked, setElementVisibility, updateRsvp, removeElement, moveLayer, moveHierarchyItem } = useEditorStore();
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [target, setTarget] = useState<DropTarget | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingName = (id: string) => (editing: boolean) => { setEditingId(editing ? id : null); if (editing) finish(); };
  const projectId = project?.id ?? "__local__";
  const collapsedSections = useHierarchyUiStore((state) => state.collapsedSectionsByProject[projectId] ?? EMPTY_COLLAPSED_SECTIONS);
  const setSectionCollapsed = useHierarchyUiStore((state) => state.setSectionCollapsed);
  const pruneSections = useHierarchyUiStore((state) => state.pruneSections);
  const rows = getVisibleHierarchyRows(elements, previewDevice, collapsedSections);
  useEffect(() => {
    // Include all pages, not just the active device/page, to retain session choices.
    const allElements = project ? [...project.pages.flatMap((page) => page.elements), ...(project.welcomePage?.elements ?? [])] : elements;
    pruneSections(projectId, allElements.filter((element) => element.type === "section").map((element) => element.id));
  }, [project, projectId, elements, pruneSections]);
  const validSectionIds = new Set(elements.filter((item) => item.type === "section").map((item) => item.id));
  const rsvp = project?.rsvp?.enabled ? project.rsvp : undefined;
  const rsvpSectionId = getRsvpSectionId(rsvp, previewDevice);
  const rsvpParent = rsvpSectionId && validSectionIds.has(rsvpSectionId) ? rsvpSectionId : null;
  const source = elements.find((item) => item.id === sourceId);

  const finish = () => { setSourceId(null); setTarget(null); };
  const start = (event: DragEvent, id: string) => {
    if (editingId) { event.preventDefault(); return; }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
    setSourceId(id);
    setTarget(null);
  };
  const autoScroll = (event: DragEvent) => {
    const scrollPanel = event.currentTarget.closest(".left-sidebar") as HTMLElement | null;
    if (!scrollPanel) return;
    const bounds = scrollPanel.getBoundingClientRect();
    if (event.clientY < bounds.top + 52) scrollPanel.scrollBy(0, -18);
    if (event.clientY > bounds.bottom - 52) scrollPanel.scrollBy(0, 18);
  };
  const propose = (event: DragEvent, candidate: DropTarget) => {
    if (!sourceId) return;
    const destination = candidate.id ? elements.find((item) => item.id === candidate.id) : undefined;
    if (candidate.id === sourceId) return;
    if (candidate.placement === "inside" && (destination?.type !== "section" || source?.type === "section")) return;
    if (source?.type === "section" && destination && getElementSectionId(destination, previewDevice)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setTarget((current) => current?.id === candidate.id && current.placement === candidate.placement ? current : candidate);
    autoScroll(event);
  };
  const drop = (event: DragEvent, candidate: DropTarget) => {
    event.preventDefault();
    event.stopPropagation();
    if (sourceId) {
      const before = useEditorStore.getState().project;
      moveHierarchyItem(sourceId, candidate.id, candidate.placement);
      const after = useEditorStore.getState().project;
      if (after && after !== before && candidate.id && candidate.placement === "inside") {
        const moved = after.pages.flatMap((page) => page.elements).find((element) => element.id === sourceId);
        const parentId = sourceId === RSVP_EDITOR_ELEMENT_ID ? getRsvpSectionId(after.rsvp, previewDevice)
          : moved ? getElementSectionId(moved, previewDevice) : null;
        if (parentId === candidate.id) setSectionCollapsed(projectId, candidate.id, false);
      }
    }
    finish();
  };
  const rowTarget = (event: DragEvent<HTMLDivElement>, element: EditorElement): DropTarget => {
    if (element.type === "section" && source?.type !== "section") return { id: element.id, placement: "inside" };
    const bounds = event.currentTarget.getBoundingClientRect();
    return { id: element.id, placement: event.clientY < bounds.top + bounds.height / 2 ? "before" : "after" };
  };
  const rsvpVisible = isRsvpVisibleOnDevice(rsvp, previewDevice);
  const rsvpParentElement = elements.find((element) => element.id === rsvpParent);
  const rsvpEffectiveVisible = rsvpVisible && (!rsvpParentElement || isElementVisibleOnDevice(rsvpParentElement, elements, previewDevice));
  const rsvpRow = rsvp && <div key={RSVP_EDITOR_ELEMENT_ID} data-element-id={RSVP_EDITOR_ELEMENT_ID} className={`layer-row ${rsvpParent ? "section-child" : ""} ${selectedElementIds.includes(RSVP_EDITOR_ELEMENT_ID) ? "active" : ""} ${rsvp.locked ? "locked" : ""} ${rsvpEffectiveVisible ? "" : "is-hidden"}`} onClick={() => selectElement(RSVP_EDITOR_ELEMENT_ID)}>
    <span className="layer-drag-handle" draggable={!editingId} onDragStart={(event) => start(event, RSVP_EDITOR_ELEMENT_ID)} onDragEnd={finish} title="Déplacer le formulaire dans la hiérarchie"><GripVertical size={13} /></span>
    <span className="layer-kind"><ClipboardCheck size={12} /></span><EditableElementName key={RSVP_EDITOR_ELEMENT_ID} elementId={RSVP_EDITOR_ELEMENT_ID} label={getRsvpEditorLabel(rsvp)} onEditingChange={editingName(RSVP_EDITOR_ELEMENT_ID)} />
    <button className="layer-lock-button" title={rsvp.locked ? "Déverrouiller le formulaire" : "Verrouiller le formulaire"} onClick={(event) => { event.stopPropagation(); toggleElementLocked(RSVP_EDITOR_ELEMENT_ID); }}>{rsvp.locked ? <LockKeyhole size={14} /> : <LockKeyholeOpen size={14} />}</button>
    <button className="layer-visibility-button" disabled={rsvpVisible && !rsvpEffectiveVisible} title={rsvpVisible && !rsvpEffectiveVisible ? "Section masquée sur ce format" : rsvpVisible ? `Masquer sur ${previewDevice}` : `Afficher sur ${previewDevice}`} onClick={(event) => { event.stopPropagation(); setElementVisibility(RSVP_EDITOR_ELEMENT_ID, !rsvpVisible); }}>{rsvpEffectiveVisible ? <Eye size={14} /> : <EyeOff size={14} />}</button>
    <button title="Retirer le formulaire de tous les formats" onClick={(event) => { event.stopPropagation(); if (window.confirm("Retirer le formulaire de tous les formats ?")) { updateRsvp({ ...rsvp, enabled: false }); selectElement(null); } }}><Trash2 size={14} /></button>
  </div>;

  return <div className="layers-list" onDragEnd={finish}>
    <div className={`layer-root-drop ${target?.id === null ? "drop-active" : ""}`} onDragOver={(event) => propose(event, { id: null, placement: "after" })} onDrop={(event) => drop(event, { id: null, placement: "after" })}>Hors section — déposer ici</div>
    {rsvp && !rsvpParent && rsvpRow}
    {rows.map((element) => {
      const dropClass = target?.id === element.id ? target.placement === "inside" ? "drop-inside" : target.placement === "after" ? "drop-after" : "drop-before" : "";
      const ownVisible = getElementLayout(element, previewDevice).visible;
      const effectiveVisible = isElementVisibleOnDevice(element, elements, previewDevice);
      const hiddenBySection = ownVisible && !effectiveVisible;
      return <div key={element.id}>
        <div data-element-id={element.id} className={`layer-row ${element.type === "section" ? "section-row" : ""} ${selectedElementIds.includes(element.id) ? "active" : ""} ${element.locked ? "locked" : ""} ${getElementSectionId(element, previewDevice) ? "section-child" : ""} ${effectiveVisible ? "" : "is-hidden"} ${dropClass}`} onClick={(event) => selectElement(element.id, event.ctrlKey || event.metaKey)}
          onDragOver={(event) => propose(event, rowTarget(event, element))}
          onDrop={(event) => { if (sourceId) drop(event, rowTarget(event, element)); }}>
          <span className="layer-drag-handle" draggable={!editingId} onDragStart={(event) => start(event, element.id)} onDragEnd={finish} title={`Déplacer ${getEditorElementLabel(element)}`}><GripVertical size={13} /></span>
          {element.type === "section" && <button type="button" className="layer-collapse-button"
            aria-expanded={!collapsedSections[element.id]} aria-label={`${collapsedSections[element.id] ? "Déplier" : "Replier"} ${getEditorElementLabel(element)}`}
            title={collapsedSections[element.id] ? "Déplier la section" : "Replier la section"} draggable={false}
            onPointerDown={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}
            onClick={(event) => { event.stopPropagation(); setSectionCollapsed(projectId, element.id, !collapsedSections[element.id]); }}>
            {collapsedSections[element.id] ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          </button>}
          <span className="layer-kind">{element.type === "text" ? "T" : element.type === "image" ? "▧" : element.type === "icon" && element.heartStyle ? <Heart size={12} /> : element.type === "icon" ? "❦" : "▱"}</span>
          <EditableElementName elementId={element.id} label={getEditorElementLabel(element)} onEditingChange={editingName(element.id)} />
          {element.type === "section" && getElementLayout(element, previewDevice).isLastSection && <small title="Dernière section sur ce support">Dernière</small>}
          <button className="layer-lock-button" title={element.locked ? "Déverrouiller" : "Verrouiller"} onClick={(event) => { event.stopPropagation(); toggleElementLocked(element.id); }}>{element.locked ? <LockKeyhole size={14} /> : <LockKeyholeOpen size={14} />}</button>
          <button className="layer-visibility-button" disabled={hiddenBySection} title={hiddenBySection ? "Section masquée sur ce format" : ownVisible ? `Masquer sur ${previewDevice}` : `Afficher sur ${previewDevice}`} onClick={(event) => { event.stopPropagation(); setElementVisibility(element.id, !ownVisible); }}>{effectiveVisible ? <Eye size={14} /> : <EyeOff size={14} />}</button>
          <button title="Avancer" onClick={(event) => { event.stopPropagation(); moveLayer(element.id, "forward"); }}><ChevronUp size={14} /></button>
          <button title="Reculer" onClick={(event) => { event.stopPropagation(); moveLayer(element.id, "backward"); }}><ChevronDown size={14} /></button>
          <button title="Supprimer de tous les formats" onClick={(event) => { event.stopPropagation(); if (window.confirm("Supprimer cet élément de tous les formats ?")) removeElement(element.id); }}><Trash2 size={14} /></button>
        </div>
        {element.type === "section" && !collapsedSections[element.id] && rsvpParent === element.id && rsvpRow}
      </div>;
    })}
  </div>;
}
