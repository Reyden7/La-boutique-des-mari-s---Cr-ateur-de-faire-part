import { ColorPicker } from "./ColorPicker";

/** Opaque controls keep #RRGGBB storage, using the same shared palette. */
export function StableColorInput(props: { value: string; onChange: (value: string) => void; disabled?: boolean; id?: string; "aria-label"?: string }) {
  return <ColorPicker {...props} allowAlpha={false} />;
}
