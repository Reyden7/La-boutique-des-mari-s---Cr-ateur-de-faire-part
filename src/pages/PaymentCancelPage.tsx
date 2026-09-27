import { XCircle } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

export function PaymentCancelPage() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get("projectId");
  const purchaseKind = searchParams.get("kind");
  return <main className="payment-result-page"><section className="payment-result-card cancelled"><XCircle size={42} /><p className="eyebrow">Paiement annulé</p><h1>{purchaseKind ? "Votre commande reste enregistrée." : "Votre faire-part reste enregistré en brouillon."}</h1><p>Aucun paiement n’a été validé. Vous pourrez reprendre le parcours depuis votre espace.</p><div className="payment-result-actions">{projectId && <Link to={`/studio/${projectId}`}>Retourner au Studio</Link>}<Link to="/">Mes projets</Link></div></section></main>;
}
