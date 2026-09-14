import { CheckCircle2, Clock3, ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { refreshRemoteProject } from "../services/projectRepository";
import type { WeddingProject } from "../types/editor";
import { upsertProject } from "../utils/storage";

const MAX_ATTEMPTS = 15;

export function PaymentSuccessPage() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get("projectId");
  const [project, setProject] = useState<WeddingProject | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!projectId) {
      setTimedOut(true);
      return;
    }

    let active = true;
    let timer: number | undefined;
    let attempts = 0;

    const poll = async () => {
      attempts += 1;
      try {
        const remoteProject = await refreshRemoteProject(projectId);
        if (!active) return;
        if (
          remoteProject?.paymentStatus === "paid" &&
          remoteProject.status === "published" &&
          remoteProject.publicId
        ) {
          upsertProject(remoteProject);
          setProject(remoteProject);
          return;
        }
      } catch (error) {
        console.warn("Confirmation du paiement encore indisponible", error);
      }

      if (!active) return;
      if (attempts >= MAX_ATTEMPTS) {
        setTimedOut(true);
        return;
      }
      timer = window.setTimeout(() => void poll(), 1500);
    };

    void poll();
    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [projectId]);

  if (project?.publicId) {
    return <main className="payment-result-page"><section className="payment-result-card success"><CheckCircle2 size={42} /><p className="eyebrow">Paiement confirmé</p><h1>Votre faire-part est publié</h1><p>Votre lien est actif et restera identique après vos prochaines modifications.</p><div className="payment-result-actions"><a href={`/i/${project.publicId}`} target="_blank" rel="noreferrer">Voir le faire-part <ExternalLink size={15} /></a><Link to={`/studio/${project.id}`}>Retourner au Studio</Link></div></section></main>;
  }

  return <main className="payment-result-page"><section className="payment-result-card"><Clock3 className={timedOut ? "" : "payment-spinner"} size={42} /><p className="eyebrow">Vérification sécurisée</p><h1>{timedOut ? "Confirmation toujours en cours" : "Paiement en cours de confirmation…"}</h1><p>{timedOut ? "Stripe peut parfois prendre un peu plus de temps. Votre projet est enregistré : revenez au Studio et actualisez dans quelques instants." : "Nous attendons la confirmation signée de Stripe. Ne fermez pas cette page."}</p><div className="payment-result-actions">{timedOut && projectId && <Link to={`/studio/${projectId}`}>Retourner au Studio</Link>}<Link to="/">Mes projets</Link></div></section></main>;
}
