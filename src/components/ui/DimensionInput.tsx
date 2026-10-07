import { useEffect, useState, type InputHTMLAttributes } from "react";
import { resolveDimensionDraft } from "../../utils/dimensionInput";

type DimensionInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "defaultValue" | "onChange" | "onBlur" | "onKeyDown" | "min" | "max"> & {
  value: number;
  min: number;
  max?: number;
  onCommit: (value: number) => void;
  /** Optional live preview of complete, in-range numbers; empty/partial drafts
   * stay editable and are never clamped while typing. */
  onLiveChange?: (value: number) => void;
};

/** By default commit once on blur/Enter. Optional live updates accept only
 * complete in-range numbers, so clearing or typing a first digit never clamps.
 */
export function DimensionInput({ value, min, max, onCommit, onLiveChange, disabled, ...props }: DimensionInputProps) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  const commit = () => {
    const next = disabled ? value : resolveDimensionDraft(draft, value, min, max);
    setDraft(String(next));
    if (next !== value) onCommit(next);
  };

  return <input {...props} type="number" step={props.step ?? "any"} min={min} max={max} disabled={disabled} value={draft}
    onChange={(event) => {
      const text = event.currentTarget.value;
      setDraft(text);
      const next = Number(text);
      if (!disabled && text.trim() && Number.isFinite(next) && next >= min && (max === undefined || next <= max) && next !== value) onLiveChange?.(next);
    }}
    onBlur={commit}
    onKeyDown={(event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        event.currentTarget.blur();
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setDraft(String(value));
      }
    }} />;
}
