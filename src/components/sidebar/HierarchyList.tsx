import { useState, type DragEvent } from "react";
import { ChevronDown, ChevronUp, ClipboardCheck, Eye, EyeOff, GripVertical, Heart, LockKeyhole, LockKeyholeOpen, Trash2 } from "lucide-react";
import { RSVP_EDITOR_ELEMENT_ID } from "../../features/rsvp/rsvpEditorElement";
import { useEditorStore } from "../../stores/editorStore";
import type { EditorElement } from "../../types/editor";
import { getHierarchyRows, type HierarchyPlacement } from "../../utils/hierarchyOrder";

type DropTarget = { id: string | null; placement: HierarchyPlacement };

export function HierarchyList({ elements }: { elements: EditorElement[] }) {
  const { project, selectedElementIds, selectElement, toggleElementLocked, updateElement, updateRsvp, removeElement, moveLayer, moveHierarchyItem } = useEditorStore();
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [target, setTarget] = useState<DropTarget | null>(null);
  const rows = getHierarchyRows(elements);
  const validSectionIds = new Set(elements.filter((item) => item.type === "section").map((item) => item.id));
  const rsvp = project?.rsvp?.enabled ? project.rsvp : undefined;
  const rsvpParent = rsvp?.sectionId && validSectionIds.has(rsvp.sectionId) ? rsvp.sectionId : null;
  const source = elements.find((item) => item.id === sourceId);

  const finish = () => { setSourceId(null); setTarget(null); };
  const start = (event: DragEvent, id: string) => {
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
    if (source?.type === "section" && destination?.sectionId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setTarget((current) => current?.id === candidate.id && current.placement === candidate.placement ? current : candidate);
    autoScroll(event);
  };
  const drop = (event: DragEvent, candidate: DropTarget) => {
    event.preventDefault();
    event.stopPropagation();
    if (sourceId) moveHierarchyItem(sourceId, candidate.id, candidate.placement);
    finish();
  };
  const rowTarget = (event: DragEvent<HTMLDivElement>, element: EditorElement): DropTarget => {
    if (element.type === "section" && source?.type !== "section") return { id: element.id, placement: "inside" };
    const bounds = event.currentTarget.getBoundingClientRect();
    return { id: element.id, placement: event.clientY < bounds.top + bounds.height / 2 ? "before" : "after" };
  };
  const rsvpRow = rsvp && <div key={RSVP_EDITOR_ELEMENT_ID} className={`layer-row ${rsvpParent ? "section-child" : ""} ${selectedElementIds.includes(RSVP_EDITOR_ELEMENT_ID) ? "active" : ""} ${rsvp.locked ? "locked" : ""}`} onClick={() => selectElement(RSVP_EDITOR_ELEMENT_ID)}>
    <span className="layer-drag-handle" draggable onDragStart={(event) => start(event, RSVP_EDITOR_ELEMENT_ID)} onDragEnd={finish} title="Déplacer le formulaire dans la hiérarchie"><GripVertical size={13} /></span>
    <span className="layer-kind"><ClipboardCheck size={12} /></span><span className="layer-name">Formulaire invité</span>
    <button className="layer-lock-button" title={rsvp.locked ? "Déverrouiller le formulaire" : "Verrouiller le formulaire"} onClick={(event) => { event.stopPropagation(); toggleElementLocked(RSVP_EDITOR_ELEMENT_ID); }}>{rsvp.locked ? <LockKeyhole size={14} /> : <LockKeyholeOpen size={14} />}</button>
    <button title="Retirer du document" onClick={(event) => { event.stopPropagation(); updateRsvp({ ...rsvp, enabled: false }); selectElement(null); }}><Trash2 size={14} /></button>
  </div>;

  return <div className="layers-list" onDragEnd={finish}>
    <div className={`layer-root-drop ${target?.id === null ? "drop-active" : ""}`} onDragOver={(event) => propose(event, { id: null, placement: "after" })} onDrop={(event) => drop(event, { id: null, placement: "after" })}>Hors section — déposer ici</div>
    {rsvp && !rsvpParent && rsvpRow}
    {rows.map((element) => {
      const dropClass = target?.id === element.id ? target.placement === "inside" ? "drop-inside" : target.placement === "after" ? "drop-after" : "drop-before" : "";
      return <div key={element.id}>
        <div className={`layer-row ${selectedElementIds.includes(element.id) ? "active" : ""} ${element.locked ? "locked" : ""} ${element.sectionId ? "section-child" : ""} ${dropClass}`} onClick={(event) => selectElement(element.id, event.ctrlKey || event.metaKey)}
          onDragOver={(event) => propose(event, rowTarget(event, element))}
          onDrop={(event) => { if (sourceId) drop(event, rowTarget(event, element)); }}>
          <span className="layer-drag-handle" draggable onDragStart={(event) => start(event, element.id)} onDragEnd={finish} title={`Déplacer ${element.name}`}><GripVertical size={13} /></span>
          <span className="layer-kind">{element.type === "text" ? "T" : element.type === "image" ? "▧" : element.type === "icon" && element.heartStyle ? <Heart size={12} /> : element.type === "icon" ? "❦" : "▱"}</span>
          <span className="layer-name">{element.name}</span>
          <button className="layer-lock-button" title={element.locked ? "Déverrouiller" : "Verrouiller"} onClick={(event) => { event.stopPropagation(); toggleElementLocked(element.id); }}>{element.locked ? <LockKeyhole size={14} /> : <LockKeyholeOpen size={14} />}</button>
          <button title={element.visible ? "Masquer" : "Afficher"} onClick={(event) => { event.stopPropagation(); updateElement(element.id, { visible: !element.visible }); }}>{element.visible ? <Eye size={14} /> : <EyeOff size={14} />}</button>
          <button title="Avancer" onClick={(event) => { event.stopPropagation(); moveLayer(element.id, "forward"); }}><ChevronUp size={14} /></button>
          <button title="Reculer" onClick={(event) => { event.stopPropagation(); moveLayer(element.id, "backward"); }}><ChevronDown size={14} /></button>
          <button title="Supprimer" onClick={(event) => { event.stopPropagation(); removeElement(element.id); }}><Trash2 size={14} /></button>
        </div>
        {element.type === "section" && rsvpParent === element.id && rsvpRow}
      </div>;
    })}
  </div>;
}
