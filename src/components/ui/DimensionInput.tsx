import { useEffect, useState, type InputHTMLAttributes } from "react";
import { resolveDimensionDraft } from "../../utils/dimensionInput";

type DimensionInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "defaultValue" | "onChange" | "onBlur" | "onKeyDown" | "min" | "max"> & {
  value: number;
  min: number;
  max?: number;
  onCommit: (value: number) => void;
};

/** Commit once on blur/Enter, so clearing or typing a first digit never clamps
 * the field, shrinks the canvas element or creates intermediate undo entries.
 */
export function DimensionInput({ value, min, max, onCommit, disabled, ...props }: DimensionInputProps) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  const commit = () => {
    const next = disabled ? value : resolveDimensionDraft(draft, value, min, max);
    setDraft(String(next));
    if (next !== value) onCommit(next);
  };

  return <input {...props} type="number" step={props.step ?? "any"} min={min} max={max} disabled={disabled} value={draft}
    onChange={(event) => setDraft(event.currentTarget.value)}
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
