import { useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { useEditorStore } from "../../stores/editorStore";
import { MAX_EDITOR_NAME_LENGTH } from "../../utils/editorNames";

/** Shared inline editor; draft changes stay local until Enter or a genuine blur. */
export function EditableElementName({ elementId, label, variant = "layer", onEditingChange }: {
  elementId: string;
  label: string;
  variant?: "layer" | "heading";
  onEditingChange?: (editing: boolean) => void;
}) {
  const renameElement = useEditorStore((state) => state.renameElement);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);
  const active = useRef(false);
  const notify = useRef(onEditingChange);
  notify.current = onEditingChange;
  useEffect(() => () => { if (active.current) notify.current?.(false); }, []);
  const begin = () => {
    active.current = true;
    setDraft(label);
    setEditing(true);
    onEditingChange?.(true);
  };
  const finish = (commit: boolean) => {
    if (!active.current) return;
    active.current = false; // Prevent Enter/Escape followed by blur from committing twice.
    if (commit) renameElement(elementId, draft);
    setEditing(false);
    onEditingChange?.(false);
  };

  return <span className={`editable-element-name ${variant === "layer" ? "layer-name" : "element-heading-name"}`}>
    {editing ? <input className="element-name-input" aria-label="Nom dans l’éditeur" autoFocus maxLength={MAX_EDITOR_NAME_LENGTH}
      value={draft} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setDraft(event.target.value)}
      onBlur={() => finish(true)} draggable={false}
      onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()} onDragStart={(event) => { event.preventDefault(); event.stopPropagation(); }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter" || event.key === "Escape") {
          event.preventDefault();
          finish(event.key === "Enter");
        }
      }} /> : <>
      <span className="editable-element-label" role="button" tabIndex={0} title={`${label} — double-cliquez pour renommer`}
        aria-label={`Renommer ${label}`} onDoubleClick={(event) => { event.stopPropagation(); begin(); }}
        onKeyDown={(event) => { if (["Enter", " ", "F2"].includes(event.key)) { event.preventDefault(); event.stopPropagation(); begin(); } }}>
        {label}
      </span>
      {variant === "heading" && <button type="button" className="element-rename-button" title="Renommer" aria-label={`Renommer ${label}`}
        onClick={(event) => { event.stopPropagation(); begin(); }}><Pencil size={14} /></button>}
    </>}
  </span>;
}
