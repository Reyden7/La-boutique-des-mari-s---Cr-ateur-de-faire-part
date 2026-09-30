import { parseColorWithAlpha, toHex8 } from "../../utils/color";
import { StableColorInput } from "./StableColorInput";

export function ColorAlphaInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const color = parseColorWithAlpha(value);
  return <div className="color-alpha-input">
    <StableColorInput
      value={color.hex}
      onChange={(hex) => onChange(toHex8(hex, color.alpha))}
      aria-label="Couleur"
    />
    <input
      type="range"
      min="0"
      max="1"
      step="0.01"
      value={color.alpha}
      onChange={(event) => onChange(toHex8(color.hex, Number(event.target.value)))}
      aria-label="Transparence de la couleur"
    />
    <output>{Math.round(color.alpha * 100)}%</output>
  </div>;
}
