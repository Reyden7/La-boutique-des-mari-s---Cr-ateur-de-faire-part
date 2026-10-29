import type { WeddingProject } from "../../types/editor";
export interface PublicationCheckoutOptions {
  kind: "initial_publication" | "guest_capacity_upgrade" | "paid_version";
  termsAccepted: boolean;
  expectedAmount: number;
}
export const isPublishedDesignLocked = (project: WeddingProject | null | undefined) => Boolean(
  project?.publicationPolicy === "paid_versions" && project.activeVersionId && !project.hasVersionDraft,
);
const authorityKeys = ["publicationPolicy","activeVersionId","activeVersionNumber","hasVersionDraft","paymentStatus","status","publicId","purchasedGuestCapacity","purchasedExtraBlocks","publicationLicenseId"] as const;
export function applyPublicationAuthority(local: WeddingProject, remote: WeddingProject): WeddingProject {
  const sameForm=local.rsvp?.purchased===remote.rsvp?.purchased;
  if(sameForm&&authorityKeys.every(key=>local[key]===remote[key]))return local;
  return Object.assign({...local,rsvp:local.rsvp?{...local.rsvp,purchased:Boolean(remote.rsvp?.purchased)}:local.rsvp},Object.fromEntries(authorityKeys.map(key=>[key,remote[key]])));
}
export function applySavedPublicationAuthority(current: WeddingProject, remote: WeddingProject, started: WeddingProject) {
  // An older save response must not undo a revision or payment completed while
  // the request was in flight. Keep concurrent local content edits as well.
  if(current.id!==remote.id||!authorityKeys.every(key=>current[key]===started[key])||current.rsvp?.purchased!==started.rsvp?.purchased)return current;
  return applyPublicationAuthority(current,remote);
}
export const publicationVersionLabel = (project: WeddingProject) => project.publicationPolicy === "legacy" ? "Publication historique — Modifications illimitées conservées" : project.activeVersionId
  ? `Version ${project.activeVersionNumber ?? 1} en ligne${project.hasVersionDraft ? " · Nouvelle version en préparation — Non publiée" : " — Modification payante"}`
  : "Brouillon — Non publié";
