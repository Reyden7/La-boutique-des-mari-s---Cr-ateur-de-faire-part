import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { getRecoveryRedirect } from "../../lib/passwordRecovery";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading, recoveryReady } = useAuth();
  const location = useLocation();
  if (loading) return <div className="loading-screen">Vérification de votre session…</div>;
  const recoveryRedirect = getRecoveryRedirect(location.pathname, recoveryReady);
  if (recoveryRedirect) return <Navigate to={recoveryRedirect} replace />;
  if (!user) return <Navigate to="/auth" replace state={{ from: location.pathname + location.search }} />;
  return children;
}
