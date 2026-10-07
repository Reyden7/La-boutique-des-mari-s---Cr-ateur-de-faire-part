import type { EditorElement, RsvpFormConfig } from "../types/editor";

export const MAX_EDITOR_NAME_LENGTH = 80;

export const normalizeEditorName = (value: string | undefined): string | undefined =>
  value?.trim().slice(0, MAX_EDITOR_NAME_LENGTH).trim() || undefined;

const defaultLabels: Record<EditorElement["type"], string> = {
  text: "Texte", image: "Image", shape: "Forme", icon: "Décoration", scratch: "Zone à gratter",
  carousel: "Carrousel photos", location: "Lieu / Carte", schedule: "Programme", calendar: "Calendrier", countdown: "Compte à rebours", button: "Bouton", section: "Section",
};

/** Keep the existing generated name as fallback, including legacy projects. */
export const getEditorElementLabel = (element: EditorElement) =>
  normalizeEditorName(element.editorName) || element.name?.trim() || defaultLabels[element.type];

export const getRsvpEditorLabel = (config?: RsvpFormConfig) =>
  normalizeEditorName(config?.editorName) || "Formulaire invité";

/** Only custom labels need a unique copy suffix; automatic labels keep their old workflow. */
export function getDuplicateEditorName(element: EditorElement, siblings: EditorElement[]): string | undefined {
  const original = normalizeEditorName(element.editorName);
  if (!original) return undefined;
  const base = original.replace(/ copie(?: \d+)?$/, "") || original;
  const used = new Set(siblings.map(getEditorElementLabel));
  let index = 1;
  let candidate: string;
  do {
    const suffix = index === 1 ? " copie" : ` copie ${index}`;
    candidate = base.slice(0, MAX_EDITOR_NAME_LENGTH - suffix.length).trimEnd() + suffix;
    index += 1;
  } while (used.has(candidate));
  return candidate;
}
