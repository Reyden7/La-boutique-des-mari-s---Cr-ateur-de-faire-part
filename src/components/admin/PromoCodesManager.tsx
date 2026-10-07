import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { deactivatePromoCode, listPromoCodes, savePromoCode, type PromoCodeRecord } from "../../services/promoCodeRepository";
import { isValidDiscountValue, normalizePromoCode } from "../../config/promo";

const productionApi = { list: listPromoCodes, save: savePromoCode, deactivate: deactivatePromoCode };
export function PromoCodesManager({ api = productionApi }: { api?: typeof productionApi }) {
  const [codes, setCodes] = useState<PromoCodeRecord[]>([]);
  const [code, setCode] = useState("");
  const [rate, setRate] = useState("");
  const [editing, setEditing] = useState<PromoCodeRecord | null>(null);
  const [deleting, setDeleting] = useState<PromoCodeRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const lock = useRef(false);
  useEffect(() => {
    let active = true;
    void api.list().then((rows) => { if (active) setCodes(rows); }).catch(() => { if (active) setError("Impossible de charger les codes promos."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api]);
  const clear = () => { setEditing(null); setCode(""); setRate(""); };
  const save = async () => {
    if (lock.current) return;
    setError(""); setMessage("");
    if (!normalizePromoCode(code) || code.trim().length > 64) { setError("Indiquez un code de 1 à 64 caractères."); return; }
    if (!rate.trim() || !isValidDiscountValue(Number(rate))) { setError("La réduction doit être comprise entre 1 et 90 %, avec deux décimales maximum."); return; }
    lock.current = true; setBusy(true);
    try {
      const saved = await api.save(editing?.id ?? null, code, Number(rate));
      setCodes((rows) => [saved, ...rows.filter((row) => row.id !== saved.id)].sort((a, b) => b.created_at.localeCompare(a.created_at)));
      setMessage(editing ? "Code promo modifié." : "Code promo ajouté."); clear();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Enregistrement impossible."); }
    finally { lock.current = false; setBusy(false); }
  };
  const remove = async () => {
    if (lock.current || !deleting) return;
    lock.current = true; setBusy(true); setError(""); setMessage("");
    try {
      await api.deactivate(deleting.id);
      setCodes((rows) => rows.filter((row) => row.id !== deleting.id));
      if (editing?.id === deleting.id) clear();
      setDeleting(null); setMessage("Code promo désactivé.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Suppression impossible."); }
    finally { lock.current = false; setBusy(false); }
  };
  const select = (row: PromoCodeRecord) => { if (busy || deleting) return; setEditing(row); setCode(row.code); setRate(String(row.discount_value)); setError(""); setMessage(""); };
  return <>
    <form className="promo-admin-form" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <h2>{editing ? `Modification du code : ${editing.code}` : "Nouveau code promo"}</h2>
      <label className="field"><span>Code promo</span><input maxLength={64} value={code} disabled={busy || loading} onChange={(event) => setCode(event.target.value)} placeholder="INFLUENCEUR10" /></label>
      <label className="field"><span>Réduction (%)</span><input type="number" step="0.01" value={rate} disabled={busy || loading} onChange={(event) => setRate(event.target.value)} placeholder="10" /></label>
      <div className="promo-actions"><button className="primary" disabled={busy || loading} type="submit">{busy ? "Enregistrement…" : editing ? "Modifier le code" : "Ajouter le code"}</button>{editing && <button disabled={busy} type="button" onClick={() => { clear(); setError(""); setMessage(""); }}>Annuler</button>}</div>
    </form>
    {message && <p className="template-admin-message" role="status">{message}</p>}
    {error && <p className="template-admin-message error" role="alert">{error}</p>}
    <h2>Codes promos actuels</h2>
    {loading ? <p>Chargement…</p> : <div className="promo-table-scroll"><table className="promo-table"><thead><tr><th>Code</th><th>Réduction</th><th>Actions</th></tr></thead><tbody>{codes.map((row) => <tr key={row.id} onClick={() => select(row)} className={editing?.id === row.id ? "selected" : ""}>
      <td><button disabled={busy || Boolean(deleting)} onClick={() => select(row)}>{row.code}</button></td><td><button disabled={busy || Boolean(deleting)} aria-label={`Modifier ${row.code}`} onClick={() => select(row)}>{row.discount_value} %</button></td>
      <td><button disabled={busy} aria-label={`Supprimer ${row.code}`} onClick={(event) => { event.stopPropagation(); setDeleting(row); }}><Trash2 size={17} /></button></td>
    </tr>)}</tbody></table>{!codes.length && <p>Aucun code promo actif.</p>}</div>}
    {deleting && <div className="modal-backdrop" onMouseDown={() => { if (!busy) setDeleting(null); }}><section className="promo-delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="promo-delete-title" onMouseDown={(event) => event.stopPropagation()}>
      <h2 id="promo-delete-title">Supprimer le code promo « {deleting.code} » ?</h2><p>Le code sera désactivé. L’historique des paiements restera intact.</p>
      <div className="promo-actions"><button autoFocus disabled={busy} onClick={() => setDeleting(null)}>Annuler</button><button className="primary" disabled={busy} onClick={() => void remove()}>{busy ? "Suppression…" : "Supprimer"}</button></div>
    </section></div>}
  </>;
}
