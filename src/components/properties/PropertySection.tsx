import { useId, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { usePropertyPanelStore } from "../../stores/propertyPanelStore";

export function PropertySection({ sectionKey, title, defaultOpen = false, children }: { sectionKey: string; title: string; defaultOpen?: boolean; children: ReactNode }) {
  const savedOpen = usePropertyPanelStore((state) => state.propertySectionOpenState[sectionKey]);
  const setOpen = usePropertyPanelStore((state) => state.setPropertySectionOpen);
  const open = savedOpen ?? defaultOpen;
  const contentId = useId();

  return <section className={`property-section${open ? " is-open" : ""}`}>
    <button type="button" className="property-section-trigger" aria-expanded={open} aria-controls={contentId} onClick={() => setOpen(sectionKey, !open)}>
      <span>{title}</span><ChevronDown size={16} aria-hidden="true" />
    </button>
    <div id={contentId} className="property-section-content" hidden={!open}>{children}</div>
  </section>;
}
