import { XCircle } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

export function PaymentCancelPage() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get("projectId");
  return <main className="payment-result-page"><section className="payment-result-card cancelled"><XCircle size={42} /><p className="eyebrow">Paiement annulé</p><h1>Votre faire-part reste enregistré en brouillon.</h1><p>Aucun paiement n’a été validé et aucun lien public n’a été créé.</p><div className="payment-result-actions">{projectId && <Link to={`/studio/${projectId}`}>Retourner au Studio</Link>}<Link to="/">Mes projets</Link></div></section></main>;
}
