import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Copy } from "lucide-react";
import { useEditorStore } from "../../stores/editorStore";
import { PREVIEW_DEVICES } from "../../config/previewDevices";
import { getCustomizedTransferTargets, TRANSFER_TARGETS, type TransferTarget } from "../../utils/responsiveTransfer";

export function ResponsiveTransferButton() {
  const project = useEditorStore((state) => state.project);
  const transfer = useEditorStore((state) => state.transferResponsiveLayouts);
  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState<TransferTarget[]>([...TRANSFER_TARGETS]);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState("");
  const [position, setPosition] = useState<{ left: number; top: number; width: number }>();
  const ref = useRef<HTMLDivElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !ref.current?.contains(event.target) && !popover.current?.contains(event.target)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    const place = () => {
      const anchor = ref.current?.getBoundingClientRect();
      const area = ref.current?.closest(".editor-workspace")?.getBoundingClientRect();
      if (!anchor) return;
      const minimum = (area?.left ?? 0) + 12, right = (area?.right ?? window.innerWidth) - 12;
      const width = Math.min(292, Math.max(140, right - minimum));
      setPosition({ left: Math.max(minimum, Math.min(anchor.left, right - width)), top: anchor.bottom + 12, width });
    };
    place(); window.addEventListener("resize", place);
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape);
    return () => { window.removeEventListener("resize", place); document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  useEffect(() => { if (confirming) dialog.current?.showModal(); }, [confirming]);
  useEffect(() => { if (!message) return; const timer = window.setTimeout(() => setMessage(""), 6000); return () => window.clearTimeout(timer); }, [message]);
  useEffect(() => { setOpen(false); setConfirming(false); setMessage(""); }, [project?.id]);
  const run = (confirmed = false) => {
    if (transfer(targets, confirmed)) {
      setMessage(`Design Smartphone adapté vers ${targets.map((target) => PREVIEW_DEVICES[target].label).join(" et ")}.`);
      setOpen(false); setConfirming(false);
    } else if (targets.length && useEditorStore.getState().project) { setOpen(false); setConfirming(true); }
  };
  const customized = project ? getCustomizedTransferTargets(project, targets) : [];
  return <div className="responsive-transfer" ref={ref}>
    <button type="button" className="responsive-transfer-trigger" disabled={!project} aria-expanded={open} aria-label="Adapter depuis Smartphone" title="Adapter le design Smartphone vers Tablette et PC" onClick={() => { setTargets([...TRANSFER_TARGETS]); setOpen(!open); }}><Copy size={14} /><span>Transférer</span></button>
    {open && position && createPortal(<div className="responsive-transfer-popover" ref={popover} role="dialog" aria-label="Adapter depuis Smartphone" style={position}>
      <strong>Adapter depuis Smartphone</strong><p>Créer une base pour les autres formats. Smartphone reste inchangé.</p>
      {TRANSFER_TARGETS.map((target) => <label key={target}><input type="checkbox" checked={targets.includes(target)} onChange={(event) => setTargets((current) => event.target.checked ? TRANSFER_TARGETS.filter((item) => item === target || current.includes(item)) : current.filter((item) => item !== target))} />{PREVIEW_DEVICES[target].label}</label>)}
      <small>Document, formulaire et éléments libres de la Page d’accueil. Ajustez ensuite les détails sur chaque support.</small>
      <div className="responsive-transfer-actions"><button type="button" onClick={() => setOpen(false)}>Annuler</button><button type="button" disabled={!targets.length} onClick={() => run()}>Transférer</button></div>
    </div>, document.body)}
    {confirming && createPortal(<dialog className="responsive-transfer-dialog" ref={dialog} onCancel={() => setConfirming(false)} aria-labelledby="transfer-confirm-title">
      <h2 id="transfer-confirm-title">Remplacer les mises en page ?</h2><p>Les mises en page {customized.map((target) => PREVIEW_DEVICES[target].label).join(" et ")} contiennent déjà des personnalisations. Le transfert depuis Smartphone va les remplacer. Continuer ?</p><p>Smartphone ne sera pas modifié. Vous pourrez annuler le transfert avec Annuler / Ctrl+Z.</p>
      <div className="responsive-transfer-actions"><button type="button" autoFocus onClick={() => setConfirming(false)}>Annuler</button><button type="button" onClick={() => run(true)}>Transférer</button></div>
    </dialog>, document.body)}
    {message && createPortal(<div className="responsive-transfer-toast" role="status">{message}</div>, document.body)}
  </div>;
}
