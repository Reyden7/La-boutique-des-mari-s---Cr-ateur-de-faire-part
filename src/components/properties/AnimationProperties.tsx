import { useEffect, useState } from "react";
import type { AnimationConfig, AnimationType } from "../../types/editor";
import { parseAnimationSeconds } from "../../utils/elementAnimation";

function SecondsInput({ label, value, minimum, onChange }: { label: string; value: number; minimum: number; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value).replace(".", ","));
  useEffect(() => { setDraft(String(value).replace(".", ",")); }, [value]);
  const commit = () => {
    const parsed = Math.max(minimum, parseAnimationSeconds(draft, value));
    setDraft(String(parsed).replace(".", ","));
    onChange(parsed);
  };
  return <label className="field"><span>{label}</span><input type="text" inputMode="decimal" value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></label>;
}

export function AnimationProperties({ animation, onChange, text = false }: { animation?: AnimationConfig; text?: boolean; onChange: (animation: AnimationConfig) => void }) {
  const current: AnimationConfig = {
    type: animation?.type ?? "none",
    duration: parseAnimationSeconds(animation?.duration, 0.8),
    ...(animation?.showCursor !== undefined ? { showCursor: animation.showCursor } : {}),
  };
  return <>
    <label className="field"><span>Effet</span><select value={current.type} onChange={(event) => onChange({ ...current, type: event.target.value as AnimationType })}>
      <option value="none">Aucune</option><option value="fade">Fondu</option><option value="slide-left">Glisser à gauche</option><option value="slide-right">Glisser à droite</option><option value="slide-up">Glisser vers le haut</option><option value="slide-down">Glisser vers le bas</option><option value="zoom">Zoom doux</option><option value="rotate">Rotation</option>
      {text && <><option value="typewriter">Machine à écrire</option><option value="handwriting">Écriture manuscrite</option><option value="word-by-word">Mot par mot</option><option value="letter-by-letter">Lettre par lettre</option><option value="draw-underline">Soulignement dessiné</option></>}
    </select></label>
    <div className="field-row">
      <SecondsInput label="Durée (s)" value={current.duration} minimum={0.1} onChange={(duration) => onChange({ ...current, duration })} />
    </div>
    {text && current.type === "typewriter" && <label className="checkbox-field"><input type="checkbox" checked={current.showCursor !== false} onChange={(event) => onChange({ ...current, showCursor: event.target.checked })} />Afficher le curseur</label>}
    {text && current.type === "handwriting" && <small>Écriture simulée par une révélation fluide, compatible avec toutes les polices.</small>}
  </>;
}
