import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "../contexts/AuthContext";

export function RouteGuard({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="page-status" role="status">Checking your sign-in…</div>;
  }
  if (!user) {
    return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />;
  }
  return children;
}
