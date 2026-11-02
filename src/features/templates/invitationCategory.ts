import { resolveInvitationCategory, type InvitationCategory } from "../../../supabase/functions/_shared/invitationCategory.ts";
import type { TemplateRecord } from "../../types/templates";
export { resolveInvitationCategory, type InvitationCategory };
export const INVITATION_CATEGORIES = [
  { value: "wedding", label: "Mariage" },
  { value: "birth", label: "Naissance" },
] as const;
export const publishedTemplatesForCategory = (templates: TemplateRecord[], category: InvitationCategory) =>
  templates.filter(template => template.isPublished && resolveInvitationCategory(template.invitationCategory) === category);
