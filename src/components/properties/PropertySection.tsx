import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export function PropertySection({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();

  return <section className={`property-section${open ? " is-open" : ""}`}>
    <button type="button" className="property-section-trigger" aria-expanded={open} aria-controls={contentId} onClick={() => setOpen((value) => !value)}>
      <span>{title}</span><ChevronDown size={16} aria-hidden="true" />
    </button>
    <div id={contentId} className="property-section-content" hidden={!open}>{children}</div>
  </section>;
}
