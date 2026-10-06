import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { parseColorWithAlpha, toHex8, type ColorWithAlpha } from "../../utils/color";
import { COLOR_FORMATS, formatColor, hexToHsv, hsvToHex, parseColorInput, type ColorFormat } from "../../utils/colorFormats";

type Props = { value: string; onChange: (value: string) => void; allowAlpha?: boolean; disabled?: boolean; id?: string; "aria-label"?: string };

/** Format/draft are UI-only; no keys or remounts dependent on the color value. */
export function ColorPicker({ value, onChange, allowAlpha = true, disabled, id, "aria-label": label = "Couleur" }: Props) {
  const parsed = parseColorWithAlpha(value);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const colorRef = useRef(parsed);
  const hsvRef = useRef(hexToHsv(parsed.hex));
  const lastEmitted = useRef<string | null>(null);
  const activePointer = useRef<number | null>(null);
  const dirtyDraft = useRef(false);
  const commitRef = useRef<() => void>(() => {});
  const [, redraw] = useState(0);
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<ColorFormat>("HEX");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 280 });
  const dialogId = useId();

  useEffect(() => {
    colorRef.current = parsed;
    // Keep the chosen hue when own palette edits pass through white/black.
    if (value !== lastEmitted.current) hsvRef.current = hexToHsv(parsed.hex);
    if (!dirtyDraft.current) { setDraft(formatColor(parsed, format)); setError(false); }
  }, [value, format]);

  const emit = (color: ColorWithAlpha) => {
    colorRef.current = color;
    const next = allowAlpha ? toHex8(color.hex, color.alpha) : color.hex;
    lastEmitted.current = next;
    dirtyDraft.current = false;
    setDraft(formatColor(color, format)); setError(false); redraw((n) => n + 1);
    if (next.toLowerCase() !== value.toLowerCase()) onChange(next);
  };
  const close = () => { activePointer.current = null; setOpen(false); };

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(280, window.innerWidth - 16);
      const height = Math.min(popupRef.current?.offsetHeight ?? 380, window.innerHeight - 16);
      setPosition({ width, left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)), top: Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - height - 8)) });
    };
    place();
    const outside = (event: PointerEvent) => {
      if (activePointer.current !== null) return;
      const path = event.composedPath();
      if (!path.includes(popupRef.current!) && !path.includes(triggerRef.current!)) { commitRef.current(); close(); }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); dirtyDraft.current = false; close(); triggerRef.current?.focus(); }
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape, true);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    const observer = new ResizeObserver(place);
    if (popupRef.current) observer.observe(popupRef.current);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", escape, true);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      observer.disconnect();
    };
  }, [open]);

  const commitDraft = () => {
    // Reading a rounded RGB/HSL representation must never normalize stored data.
    if (!dirtyDraft.current) return;
    const color = parseColorInput(draft, colorRef.current.alpha);
    if (!color || (!allowAlpha && color.alpha !== 1)) { setError(true); return; }
    hsvRef.current = hexToHsv(color.hex); emit(color);
  };
  commitRef.current = commitDraft;
  const paletteAt = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const s = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const v = 1 - Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    hsvRef.current = { ...hsvRef.current, s, v };
    emit({ ...colorRef.current, hex: hsvToHex(hsvRef.current) });
  };

  return <>
    <button type="button" id={id} ref={triggerRef} disabled={disabled} className="color-picker-trigger" aria-label={label} title={label} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? dialogId : undefined}
      onClick={(event) => {
        event.preventDefault(); event.stopPropagation();
        if (open) close();
        else { dirtyDraft.current = false; setFormat("HEX"); setDraft(formatColor(parsed, "HEX")); setError(false); setOpen(true); }
      }}><span style={{ backgroundColor: value }} /></button>
    {open && createPortal(<div id={dialogId} role="dialog" aria-label="Sélecteur de couleur" ref={popupRef} className="color-picker-popover" style={position}
      onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()}>
      <div className="color-picker-heading"><strong>{label}</strong><button type="button" aria-label="Fermer le sélecteur de couleur" onClick={() => { close(); triggerRef.current?.focus(); }}>×</button></div>
      <div className="color-picker-palette" role="group" aria-label="Palette saturation et luminosité" style={{ backgroundColor: hsvToHex({ h: hsvRef.current.h, s: 1, v: 1 }) }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault(); activePointer.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId); paletteAt(event);
        }}
        onPointerMove={(event) => { if (activePointer.current === event.pointerId) paletteAt(event); }}
        onPointerUp={(event) => { if (activePointer.current === event.pointerId) { paletteAt(event); activePointer.current = null; } }}
        onPointerCancel={() => { activePointer.current = null; }} onLostPointerCapture={() => { activePointer.current = null; }}>
        <span className="color-picker-cursor" style={{ left: `${hsvRef.current.s * 100}%`, top: `${(1 - hsvRef.current.v) * 100}%` }} />
      </div>
      <label className="color-picker-control">Teinte<input className="color-picker-hue" aria-label="Teinte" type="range" min="0" max="360" step="1" value={hsvRef.current.h} onChange={(event) => {
        hsvRef.current = { ...hsvRef.current, h: Number(event.target.value) };
        emit({ ...colorRef.current, hex: hsvToHex(hsvRef.current) });
      }} /></label>
      {allowAlpha && <label className="color-picker-control">Opacité · {Math.round(parsed.alpha * 100)}%<input aria-label="Opacité" type="range" min="0" max="1" step="0.01" value={parsed.alpha} onChange={(event) => emit({ ...colorRef.current, alpha: Number(event.target.value) })} /></label>}
      <label className="color-picker-control">Format<select aria-label="Format de couleur" value={format} onChange={(event) => {
        const next = event.target.value as ColorFormat;
        dirtyDraft.current = false; setFormat(next); setDraft(formatColor(colorRef.current, next)); setError(false);
      }}>{COLOR_FORMATS.map((option) => <option key={option}>{option}</option>)}</select></label>
      <label className="color-picker-control">{format}<input ref={inputRef} aria-label={`Valeur ${format}`} aria-invalid={error} aria-describedby={error ? `${dialogId}-error` : undefined} spellCheck={false} value={draft} onChange={(event) => { dirtyDraft.current = true; setDraft(event.target.value); setError(false); }} onBlur={commitDraft} onKeyDown={(event) => {
        event.stopPropagation(); if (event.key === "Enter") { event.preventDefault(); commitDraft(); }
      }} /></label>
      {error && <small role="alert" id={`${dialogId}-error`}>Couleur invalide. Utilisez un code HEX, RGB(A) ou HSL(A){!allowAlpha && " opaque"}.</small>}
      <small>La saisie est appliquée avec Entrée ou en quittant le champ.{allowAlpha && " RGB et HSL conservent l’opacité."}</small>
    </div>, document.body)}
  </>;
}
