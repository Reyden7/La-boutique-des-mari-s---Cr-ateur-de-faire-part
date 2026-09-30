import { Check, Globe2, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { publishGlobalAsset } from "../../services/globalAssetRepository";
import type { PublishGlobalAssetInput } from "../../types/globalAssets";

export function PublishGlobalAssetButton({ input, compact = false }: { input?: PublishGlobalAssetInput; compact?: boolean }) {
  const { isAdmin } = useAuth();
  const [state, setState] = useState<"idle" | "publishing" | "published" | "error">("idle");
  if (!isAdmin || !input) return null;
  const label = state === "publishing" ? "Ajout à la bibliothèque générale" : state === "published" ? "Ajouté à la bibliothèque générale" : state === "error" ? "Échec de la publication — réessayer" : "Ajouter à la bibliothèque générale";
  return <button
    type="button"
    className={`publish-global-asset ${compact ? "compact" : ""} ${state}`}
    disabled={state === "publishing" || state === "published"}
    title={label}
    aria-label={label}
    onClick={async (event) => {
      event.stopPropagation();
      setState("publishing");
      try { await publishGlobalAsset(input); setState("published"); }
      catch { setState("error"); }
    }}
  >
    {state === "publishing" ? <LoaderCircle size={12} className="spin" /> : state === "published" ? <Check size={12} /> : <Globe2 size={12} />}
    {!compact && (state === "published" ? "Ajouté à la bibliothèque générale" : state === "error" ? "Réessayer" : "Ajouter à la bibliothèque générale")}
  </button>;
}

