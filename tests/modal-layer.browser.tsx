import React, { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { RecipientListModal, recipientListKey } from "../src/features/recipients/RecipientListModal";
import { setRecipientList } from "../src/features/recipients/recipientStore";
import { beginDiscoverySession } from "../src/features/discovery/discoverySession";
import { createBlankProject } from "../src/templates/templates";
import { normalizeProject } from "../src/utils/storage";
import { WeddingRenderer } from "../src/components/renderer/WeddingRenderer";
import { ModalLayer } from "../src/components/ui/ModalLayer";
import "../src/features/publication/publication.css";
import "../src/styles.css";

// Synthetic published shape, memory-only recipients: no auth, database or payment calls.
const project = normalizeProject(createBlankProject())!;
delete project.ownerId;
project.paymentStatus = "paid";
project.status = "published";
project.publicId = "modal-qa-synthetic";
project.activeVersionId = "synthetic-version";
project.purchasedGuestCapacity = 40;
project.rsvp!.enabled = false;
beginDiscoverySession(project.id);
project.pages[0].elements = [{ id: "high-text", name: "Calque haut", type: "text", text: "TEXTE ANIMÉ AU Z-INDEX MAXIMUM", x: 0, y: 200, width: 390, height: 120, zIndex: 2147483647, visible: true, locked: false, rotation: 0, opacity: 1, fontFamily: "serif", fontSize: 32, fontWeight: 700, color: "red", textAlign: "center", lineHeight: 1, letterSpacing: 0, italic: false, underline: false, animation: { type: "fade", duration: 1 } },
  { id: "long-document", name: "Bas", type: "text", text: "Fin du document très long", x: 0, y: 8000, width: 390, height: 60, zIndex: 2, visible: true, locked: false, rotation: 0, opacity: 1, fontFamily: "serif", fontSize: 20, fontWeight: 400, color: "black", textAlign: "center", lineHeight: 1, letterSpacing: 0, italic: false, underline: false }];
setRecipientList(recipientListKey(project), { revision: 1, recipients: [{ id: "synthetic-family", display_name: "Famille Contrôle", guest_count: 4, is_active: true, public_token: "synthetic-token", allocated_guest_count: 4 }] });

function Fixture() {
  const [open, setOpen] = useState(false), [guard, setGuard] = useState(false), [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const checkImport = async (format: "xlsx" | "csv") => {
    setRecipientList(recipientListKey(project), { revision: 1, recipients: [{ id: "synthetic-family", display_name: "Famille Contrôle", guest_count: 4, is_active: true, public_token: "synthetic-token", allocated_guest_count: 4 }] });
    setResult(""); setOpen(true);
    try {
      const until = async (check: () => boolean) => {
        for (let n = 0; n < 150; n++) { if (check()) return; await new Promise(resolve => setTimeout(resolve, 20)); }
        throw new Error("Délai dépassé");
      };
      await until(() => !!document.querySelector('dialog input[type="file"]'));
      const dialog = document.querySelector('dialog')!;
      if (!dialog.matches(':modal') || dialog.parentElement !== document.body) throw new Error("Portail / top layer absent");
      if (document.body.style.overflow !== "hidden" || !dialog.contains(document.activeElement)) throw new Error("Scroll / focus incorrect");
      const blob = await (await fetch(format === "xlsx" ? '/models/liste-invites.xlsx' : '/tests/modal-guests.csv')).blob();
      const input = dialog.querySelector<HTMLInputElement>('input[type="file"]')!;
      const data = new DataTransfer(); data.items.add(new File([blob], `liste-invites.${format}`));
      input.files = data.files; input.dispatchEvent(new Event('change', { bubbles: true }));
      await until(() => !!document.querySelector('.recipient-import-preview'));
      if (document.querySelector('.recipient-import-preview .form-error')) throw new Error("Import invalide");
      const confirm = [...dialog.querySelectorAll('button')].find(button => button.textContent === "Confirmer l’import")!;
      if (confirm.disabled) throw new Error("Confirmation désactivée");
      confirm.click();
      await until(() => !document.querySelector('.recipient-import-preview'));
      const guests = format === "xlsx" ? 12 : 7;
      if (!dialog.textContent?.includes(`Nombre total d’invités : ${guests}`)) throw new Error("Totaux incorrects après import");
      if (!dialog.textContent?.includes('Capacité achetée : 40')) throw new Error("Capacité modifiée");
      setOpen(false);
      await until(() => !document.querySelector(':modal'));
      if (document.body.style.overflow === 'hidden' || document.activeElement?.id !== `check-${format}`) throw new Error("Restauration scroll / focus incorrecte");
      setResult(`PASS — ${format.toUpperCase()} : aperçu, confirmation, ${guests} invités, capacité 40 ; portail, top layer, focus et scroll restaurés.`);
    } catch (error) { setResult(`FAIL — ${error}`); }
  };
  return <main className="published-design-view"><h1>Contrôle local des modales</h1>
    <button id="open-list" onClick={() => setOpen(true)}>Liste des invités et liens</button>
    <button id="check-xlsx" onClick={() => void checkImport("xlsx")}>Vérifier le parcours XLSX et la modale</button>
    <button id="check-csv" onClick={() => void checkImport("csv")}>Vérifier le parcours CSV et la modale</button><output>{result}</output>
    <button onClick={() => setGuard(true)}>Tester une opération bloquante</button>
    <div style={{ transform: "translateZ(0)", filter: "blur(0)", opacity: .99, contain: "layout paint" }}>
      <div className="published-design-paper"><WeddingRenderer project={project} device="mobile" mode="preview" /></div>
      {open && <RecipientListModal project={project} onClose={() => setOpen(false)} />}
    </div>
    {guard && <ModalLayer label="Test du verrouillage" busy={busy} onClose={() => setGuard(false)}><div className="modal-backdrop"><section role="dialog" aria-label="Opération simulée" className="publication-history">
      <label><input type="checkbox" checked={busy} onChange={e => setBusy(e.target.checked)} />Opération en cours</label><button disabled={busy} onClick={() => setGuard(false)}>Fermer le test</button>
    </section></div></ModalLayer>}
  </main>;
}
createRoot(document.getElementById("root")!).render(<StrictMode><Fixture /></StrictMode>);
