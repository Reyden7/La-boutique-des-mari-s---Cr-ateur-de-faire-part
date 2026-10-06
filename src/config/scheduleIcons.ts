/** Lucide v1.48.0 paths verified in the installed library; shared with Konva.
 * ISC License — Copyright (c) 2026 Lucide Icons and Contributors.
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 * Wedding rings are a local vector, the other drawings reuse Lucide.
 */
export type ScheduleIconPrimitive = { path: string } | { cx: number; cy: number; r: number };
export interface ScheduleIconDefinition { id: string; label: string; nodes: ScheduleIconPrimitive[] }

export const SCHEDULE_ICONS: ScheduleIconDefinition[] = [
  { id: "wedding-rings", label: "Alliances", nodes: [{ cx: 8, cy: 15, r: 6 }, { cx: 16, cy: 15, r: 6 }, { path: "M6 5l2-3 2 3-2 4Z M14 5l2-3 2 3-2 4Z" }] },
  { id: "church", label: "Cérémonie", nodes: [
    { path: "M10 9h4 M12 7v5 M14 21v-3a2 2 0 0 0-4 0v3" },
    { path: "m18 9 3.52 2.147a1 1 0 0 1 .48.854V19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6.999a1 1 0 0 1 .48-.854L6 9" },
    { path: "M6 21V7a1 1 0 0 1 .376-.782l5-3.999a1 1 0 0 1 1.249.001l5 4A1 1 0 0 1 18 7v14" },
  ] },
  { id: "wine", label: "Champagne / cocktail", nodes: [{ path: "M8 22h8 M7 10h10 M12 15v7 M12 15a5 5 0 0 0 5-5c0-2-.5-4-2-8H9c-1.5 4-2 6-2 8a5 5 0 0 0 5 5Z" }] },
  { id: "utensils", label: "Repas", nodes: [{ path: "M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2 M7 2v20 M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" }] },
  { id: "music", label: "Musique / soirée", nodes: [{ path: "M9 18V5l12-2v13" }, { cx: 6, cy: 18, r: 3 }, { cx: 18, cy: 16, r: 3 }] },
  { id: "heart", label: "Cœur", nodes: [{ path: "M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5" }] },
  { id: "camera", label: "Photos", nodes: [{ path: "M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z" }, { cx: 12, cy: 13, r: 3 }] },
  { id: "map-pin", label: "Lieu / accueil", nodes: [{ path: "M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" }, { cx: 12, cy: 10, r: 3 }] },
  { id: "cake", label: "Gâteau", nodes: [{ path: "M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8 M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1 M2 21h20 M7 8v3 M12 8v3 M17 8v3 M7 4h.01 M12 4h.01 M17 4h.01" }] },
  { id: "dance", label: "Fête / danse", nodes: [
    { path: "M5.8 11.3 2 22l10.7-3.79 M4 3h.01 M22 8h.01 M15 2h.01 M22 20h.01" },
    { path: "m22 2-2.24.75a2.9 2.9 0 0 0-1.96 3.12c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L14 10" },
    { path: "m22 13-.82-.33c-.86-.34-1.82.2-1.98 1.11c-.11.7-.72 1.22-1.43 1.22H17" },
    { path: "m11 2 .33.82c.34.86-.2 1.82-1.11 1.98C9.52 4.9 9 5.52 9 6.23V7" },
    { path: "M11 13c1.93 1.93 2.83 4.17 2 5-.83.83-3.07-.07-5-2-1.93-1.93-2.83-4.17-2-5 .83-.83 3.07.07 5 2Z" },
  ] },
  { id: "car", label: "Voiture", nodes: [{ path: "M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2 M9 17h6" }, { cx: 7, cy: 17, r: 2 }, { cx: 17, cy: 17, r: 2 }] },
  { id: "house", label: "Maison / lieu", nodes: [{ path: "M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8 M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" }] },
  { id: "gift", label: "Cadeau", nodes: [{ path: "M12 7v14 M20 11v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8 M7.5 7a1 1 0 0 1 0-5A4.8 8 0 0 1 12 7a4.8 8 0 0 1 4.5-5 1 1 0 0 1 0 5 M4 7h16a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z" }] },
  { id: "flower", label: "Fleur", nodes: [{ path: "M12 5a3 3 0 1 1 3 3m-3-3a3 3 0 1 0-3 3m3-3v1M9 8a3 3 0 1 0 3 3M9 8h1m5 0a3 3 0 1 1-3 3m3-3h-1m-2 3v-1 M12 10v12 M12 22c4.2 0 7-1.667 7-5-4.2 0-7 1.667-7 5Z M12 22c-4.2 0-7-1.667-7-5 4.2 0 7 1.667 7 5Z" }, { cx: 12, cy: 8, r: 2 }] },
  { id: "star", label: "Étoile", nodes: [{ path: "M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" }] },
  { id: "clock", label: "Horloge", nodes: [{ cx: 12, cy: 12, r: 10 }, { path: "M12 6v6l4 2" }] },
];

export const getScheduleIcon = (id?: string) => SCHEDULE_ICONS.find((icon) => icon.id === id);
