import type { WeddingProject } from "../types/editor";
import type { TemplateRecord } from "../types/templates";
import { normalizeProject } from "./storage";

const runtimeKeys = [
  "id", "ownerId", "owner_id", "name", "createdAt", "created_at", "updatedAt", "updated_at",
  "status", "paymentStatus", "payment_status", "publicId", "public_id", "publishedAt", "published_at",
  "expiresAt", "expires_at", "stripe_checkout_session_id", "stripe_payment_intent_id", "responses", "orders",
] as const;

/** Client-side mirror for previews/tests. The RPC remains authoritative when publishing. */
export const sanitizeProjectForTemplate = (project: WeddingProject): Partial<WeddingProject> => {
  const snapshot = structuredClone(project) as Partial<WeddingProject> & Record<string, unknown>;
  for (const key of runtimeKeys) delete snapshot[key];
  if (snapshot.rsvp) snapshot.rsvp = { ...snapshot.rsvp, purchased: false };
  return snapshot;
};

export const instantiateProjectFromTemplate = (
  template: Pick<TemplateRecord, "name" | "templateData">,
  ownerId: string,
): WeddingProject => {
  const timestamp = new Date().toISOString();
  const candidate = {
    ...structuredClone(template.templateData),
    id: crypto.randomUUID(),
    ownerId,
    name: template.name,
    createdAt: timestamp,
    updatedAt: timestamp,
    status: "draft",
    paymentStatus: "unpaid",
    publicId: undefined,
    publishedAt: undefined,
    expiresAt: undefined,
    rsvp: template.templateData.rsvp
      ? { ...structuredClone(template.templateData.rsvp), purchased: false }
      : undefined,
  } as WeddingProject;
  const normalized = normalizeProject(candidate);
  if (!normalized) throw new Error("Le snapshot de ce modèle est invalide.");
  return normalized;
};

export const slugifyTemplateName = (value: string) => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 100);
