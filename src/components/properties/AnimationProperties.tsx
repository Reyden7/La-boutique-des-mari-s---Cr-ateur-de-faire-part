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

export function AnimationProperties({ animation, onChange }: { animation?: AnimationConfig; onChange: (animation: AnimationConfig) => void }) {
  const current: AnimationConfig = {
    type: animation?.type ?? "none",
    duration: parseAnimationSeconds(animation?.duration, 0.8),
    delay: parseAnimationSeconds(animation?.delay, 0),
  };
  return <>
    <label className="field"><span>Effet</span><select value={current.type} onChange={(event) => onChange({ ...current, type: event.target.value as AnimationType })}>
      <option value="none">Aucune</option><option value="fade">Fondu</option><option value="slide-left">Glisser à gauche</option><option value="slide-right">Glisser à droite</option><option value="slide-up">Glisser vers le haut</option><option value="slide-down">Glisser vers le bas</option><option value="zoom">Zoom doux</option><option value="rotate">Rotation</option>
    </select></label>
    <div className="field-row">
      <SecondsInput label="Durée (s)" value={current.duration} minimum={0.1} onChange={(duration) => onChange({ ...current, duration })} />
      <SecondsInput label="Délai (s)" value={current.delay} minimum={0} onChange={(delay) => onChange({ ...current, delay })} />
    </div>
  </>;
}
