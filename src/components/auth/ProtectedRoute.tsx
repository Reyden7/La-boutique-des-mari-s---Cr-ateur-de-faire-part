import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="loading-screen">Vérification de votre session…</div>;
  if (!user) return <Navigate to="/auth" replace state={{ from: location.pathname + location.search }} />;
  return children;
}
