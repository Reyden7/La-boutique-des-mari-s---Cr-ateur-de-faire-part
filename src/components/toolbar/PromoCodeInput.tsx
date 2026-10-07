import { useEffect, useRef, useState } from "react";
import { normalizePromoCode, type AppliedPromo } from "../../config/promo";
import { validatePromoCode } from "../../services/promoCodeRepository";

export function PromoCodeInput({ value, onChange, disabled, onBusyChange, validate = validatePromoCode }: {
  value: AppliedPromo | null; onChange: (promo: AppliedPromo | null) => void;
  disabled: boolean; onBusyChange: (busy: boolean) => void; validate?: typeof validatePromoCode;
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const revision = useRef(0);
  const lock = useRef(false);
  useEffect(() => () => { revision.current++; }, []);
  const apply = async () => {
    if (lock.current || disabled || !draft.trim()) return;
    lock.current = true; setBusy(true); onBusyChange(true); setError("");
    const request = ++revision.current;
    try {
      const promo = await validate(normalizePromoCode(draft));
      if (request !== revision.current) return;
      onChange(promo);
      if (!promo) setError("Code invalide ou indisponible.");
    } catch (cause) { if (request === revision.current) setError(cause instanceof Error ? cause.message : "Validation indisponible. Réessayez."); }
    finally { if (request === revision.current) { lock.current = false; setBusy(false); onBusyChange(false); } }
  };
  return <div className="publication-promo">
    <label className="field"><span>Code partenaire ou code promo</span><div className="promo-input-row"><input aria-label="Code partenaire ou code promo" maxLength={64} value={value?.code ?? draft} disabled={disabled || busy || Boolean(value)} onChange={(event) => { setDraft(event.target.value); setError(""); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void apply(); } }} placeholder="Votre code" />{!value && <button disabled={disabled || busy || !draft.trim()} onClick={() => void apply()}>{busy ? "Vérification…" : "Appliquer"}</button>}</div></label>
    {value && <div className="promo-applied" role="status"><span>✓ Code {value.code} appliqué · −{value.discountValue} %</span><button disabled={disabled} onClick={() => { onChange(null); setDraft(""); setError(""); }}>Retirer le code</button></div>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}
