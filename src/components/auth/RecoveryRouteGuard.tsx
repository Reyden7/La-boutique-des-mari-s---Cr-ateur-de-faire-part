import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { getRecoveryRedirect } from "../../lib/passwordRecovery";
import { incomingPasswordRecovery, passwordRecoveryState } from "../../lib/supabase";

/** Recovery takes precedence over ALL normal routes, including admin/login. */
export function RecoveryRouteGuard({ children }: { children: ReactNode }) {
  const { loading, recoveryReady } = useAuth();
  const location = useLocation();
  if (loading && (incomingPasswordRecovery || passwordRecoveryState.getSnapshot())) {
    return <div className="loading-screen">Vérification du lien…</div>;
  }
  const redirect = getRecoveryRedirect(location.pathname, recoveryReady);
  if (redirect) return <Navigate to={redirect} replace />;
  return children;
}
