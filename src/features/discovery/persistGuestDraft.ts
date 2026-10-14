import { passwordRecoveryState, requireSupabaseSession } from "../../lib/supabase";
import { uploadProjectAsset } from "../../services/assetRepository";
import { saveRemoteProject } from "../../services/projectRepository";
import { normalizeProject } from "../../utils/storage";
import { instantiateProjectFromTemplate } from "../../utils/templateSnapshot";
import type { WeddingProject } from "../../types/editor";
import { hasTemporaryReferences, isDiscoveryProject, mapDiscoveryReferences, temporaryDiscoveryAssets, useDiscoverySession } from "./discoverySession";

let target: { draftId: string; ownerId: string; project: WeddingProject; created: boolean; references: Map<string, string> } | null = null;
let inFlight: Promise<{ project: WeddingProject; references: Map<string, string> }> | null = null;
useDiscoverySession.subscribe((state, previous) => { if (state.draftId !== previous.draftId) target = null; });

/** One stable new ID per draft/account; retries resume uploads, never overwrite a former project. */
export function persistGuestDraftAfterAuth(draft: WeddingProject, userId: string) {
  if (inFlight) return inFlight;
  const operation = async () => {
    const verify = async () => {
      const user = await requireSupabaseSession();
      if (user.id !== userId || passwordRecoveryState.getSnapshot()) throw new Error("Connectez-vous normalement pour sauvegarder cette création.");
      if (!isDiscoveryProject(draft)) throw new Error("Ce brouillon n’est plus actif.");
    };
    await verify();
    if (!normalizeProject(draft) || !draft.pages.length) throw new Error("Le brouillon est invalide.");
    if (!target || target.draftId !== draft.id || target.ownerId !== userId) {
      target = { draftId: draft.id, ownerId: userId, project: instantiateProjectFromTemplate({ name: draft.name, templateData: draft }, userId), created: false, references: new Map() };
    }
    const current = target;
    // A parent row is needed by assets RLS. Never write Blob URLs, even into this pending draft.
    if (!current.created) {
      const skeleton = mapDiscoveryReferences(current.project, new Map(), true);
      await saveRemoteProject(skeleton, { createOnly: true });
      current.created = true;
    }
    const candidate = { ...instantiateProjectFromTemplate({ name: draft.name, templateData: draft }, userId), id: current.project.id, createdAt: current.project.createdAt };
    for (const asset of temporaryDiscoveryAssets()) {
      if (current.references.has(asset.url)) continue;
      await verify();
      const uploaded = await uploadProjectAsset(mapDiscoveryReferences(candidate, current.references, true), asset.file, asset.kind, asset.options);
      current.references.set(asset.url, uploaded.url);
      current.references.set(asset.id, uploaded.id);
    }
    await verify();
    const complete = mapDiscoveryReferences(candidate, current.references);
    if (hasTemporaryReferences(complete)) throw new Error("Un fichier temporaire n’a pas pu être transféré. Réessayez sans quitter l’éditeur.");
    const saved = await saveRemoteProject(complete);
    await verify();
    return { project: saved, references: current.references };
  };
  inFlight = operation().finally(() => { inFlight = null; });
  return inFlight;
}
