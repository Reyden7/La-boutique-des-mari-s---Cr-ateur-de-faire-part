import { useMemo, useState } from "react";
import type { RsvpField, RsvpFormConfig } from "../../types/editor";
import { submitRsvpResponse } from "../../services/rsvpRepository";

function RsvpInput({ field, value, onChange }: { field: RsvpField; value: unknown; onChange: (value: unknown) => void }) {
  const common = { required: field.required, name: field.id };
  if (field.type === "long_text") return <textarea {...common} rows={4} value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} />;
  if (field.type === "number") return <input {...common} type="number" min="0" value={String(value ?? "")} onChange={(event) => onChange(event.target.value === "" ? "" : Number(event.target.value))} />;
  if (field.type === "email") return <input {...common} type="email" value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} />;
  if (field.type === "boolean") return <div className="rsvp-choice-row"><label><input type="radio" name={field.id} checked={value === true} onChange={() => onChange(true)} required={field.required} /> Oui</label><label><input type="radio" name={field.id} checked={value === false} onChange={() => onChange(false)} /> Non</label></div>;
  if (field.type === "select") return <select {...common} value={String(value ?? "")} onChange={(event) => onChange(event.target.value)}><option value="">Choisir…</option>{field.options?.map((option) => <option key={option}>{option}</option>)}</select>;
  if (field.type === "single_choice") return <div className="rsvp-choice-row">{field.options?.map((option) => <label key={option}><input type="radio" name={field.id} value={option} checked={value === option} required={field.required} onChange={() => onChange(option)} /> {option}</label>)}</div>;
  if (field.type === "multiple_choice") {
    const selected = Array.isArray(value) ? value as string[] : [];
    return <div className="rsvp-choice-row">{field.options?.map((option) => <label key={option}><input type="checkbox" value={option} checked={selected.includes(option)} onChange={(event) => onChange(event.target.checked ? [...selected, option] : selected.filter((item) => item !== option))} /> {option}</label>)}</div>;
  }
  return <input {...common} type="text" value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} />;
}

export function RsvpFormRenderer({ config, publicId }: { config: RsvpFormConfig; publicId?: string }) {
  const startedAt = useMemo(() => Date.now(), []);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  if (!config.enabled || !config.purchased) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!publicId) return;
    setStatus("sending");
    try {
      const website = String(new FormData(event.currentTarget as HTMLFormElement).get("website") ?? "");
      await submitRsvpResponse(publicId, answers, startedAt, website);
      setStatus("sent");
    } catch {
      setStatus("error");
    }
  };

  return <section className="rsvp-public-section">
    <form className="rsvp-public-form" onSubmit={(event) => void submit(event)}>
      <p className="eyebrow">RSVP</p><h2>{config.title}</h2>{config.description && <p>{config.description}</p>}
      <input className="rsvp-honeypot" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      {config.fields.map((field) => <label className="rsvp-public-field" key={field.id}><span>{field.label}{field.required && <b> *</b>}</span><RsvpInput field={field} value={answers[field.id]} onChange={(value) => setAnswers((current) => ({ ...current, [field.id]: value }))} /></label>)}
      <button type="submit" disabled={!publicId || status === "sending" || status === "sent"}>{status === "sending" ? "Envoi…" : status === "sent" ? "Réponse envoyée ✓" : config.submitLabel}</button>
      {!publicId && <small>Le formulaire devient actif sur le lien public.</small>}{status === "error" && <small className="form-error">L’envoi a échoué. Merci de réessayer.</small>}
    </form>
  </section>;
}
