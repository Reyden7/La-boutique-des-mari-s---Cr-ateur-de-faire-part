// Local-only fixture. No EditorPage/autosave, no remote writes, no production projects.
import React, { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { ColorAlphaInput } from "../src/components/ui/ColorAlphaInput";
import { StableColorInput } from "../src/components/ui/StableColorInput";
import "../src/styles.css";

function Fixture() {
  const [value, setValue] = useState("#3e3e1d80");
  const [count, setCount] = useState(0);
  const [results, setResults] = useState<string[]>([]);
  const host = useRef<HTMLDivElement>(null);
  const update = (next: string) => { setValue(next); setCount((n) => n + 1); };
  // DOM-level regression: synthetic continuous moves across real React rerenders.
  // Only pointer capture is stubbed: browser automation cannot hold a real mouse here.
  const testDrag = async () => {
    const reports: string[] = [];
    const record = (name: string, passed: boolean) => reports.push(`${passed ? "PASS" : "FAIL"} ${name}`);
    const fire = (node: Element, event: Event) => flushSync(() => node.dispatchEvent(event));
    const trigger = host.current!.querySelector<HTMLButtonElement>("button")!;
    if (trigger.getAttribute("aria-expanded") === "true") fire(trigger, new MouseEvent("click", { bubbles: true }));
    fire(trigger, new MouseEvent("click", { bubbles: true }));
    const popup = document.querySelector(".color-picker-popover")!;
    const palette = popup.querySelector<HTMLDivElement>(".color-picker-palette")!;
    const originalCapture = palette.setPointerCapture;
    let captures = 0;
    palette.setPointerCapture = () => { captures++; };
    const pointer = (type: string, x: number, y: number) => {
      const rect = palette.getBoundingClientRect();
      return new PointerEvent(type, { bubbles: true, pointerId: 17, button: 0, buttons: type === "pointerup" ? 0 : 1, clientX: rect.left + x * rect.width, clientY: rect.top + y * rect.height });
    };
    fire(palette, pointer("pointerdown", .1, .1));
    for (let i = 1; i <= 25; i++) {
      fire(palette, pointer("pointermove", i / 25, i / 30));
      await Promise.resolve();
    }
    record("Capture pointeur demandée", captures === 1);
    record("Palette identique après 25 mouvements + rerenders", document.querySelector(".color-picker-palette") === palette);
    record("Popover reste ouvert pendant le glissement", document.querySelector(".color-picker-popover") === popup);
    fire(document.body, new PointerEvent("pointerdown", { bubbles: true, pointerId: 18 }));
    record("Pas de fermeture pendant le pointeur capturé", document.querySelector(".color-picker-popover") === popup);
    fire(palette, pointer("pointerup", .65, .45));
    palette.setPointerCapture = originalCapture;
    record("Reste ouvert au relâchement", document.querySelector(".color-picker-popover") === popup);
    fire(document.body, new PointerEvent("pointerdown", { bubbles: true, pointerId: 18 }));
    record("Clic extérieur ferme après relâchement", !document.querySelector(".color-picker-popover"));
    fire(trigger, new MouseEvent("click", { bubbles: true }));
    record("Réouverture sur HEX", document.querySelector<HTMLSelectElement>('select[aria-label="Format de couleur"]')?.value === "HEX");
    setResults(reports);
  };
  return <main style={{ padding: 24, maxWidth: 600 }}>
    <h1>Palette partagée</h1><p>Test local isolé — aucune sauvegarde distante.</p>
    <div ref={host} style={{ width: 280, margin: "24px 0" }}><label className="field"><span>Couleur avec transparence</span><ColorAlphaInput value={value} onChange={update} /></label></div>
    <div style={{ width: 280 }}><label className="field"><span>Couleur opaque (anciens contrôles)</span><StableColorInput value="#123456" onChange={update} /></label></div>
    <pre id="saved">{JSON.stringify({ value, changes: count })}</pre>
    <button type="button" onClick={() => void testDrag()}>Tester le glissement simulé</button>
    <button type="button" onClick={() => { setValue("#3e3e1d80"); setCount(0); }}>Réinitialiser</button>
    <button type="button" onClick={() => setValue("#123456ff")}>Mise à jour externe</button>
    <pre id="results">{results.join("\n")}</pre>
  </main>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
