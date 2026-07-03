import React from "react";
import { Navigate } from "react-router-dom";
import { useGame } from "../hooks/useGame";

interface RequirePremiumProps {
  children: React.ReactNode;
}

export default function RequirePremium({ children }: RequirePremiumProps) {
  const { player, loading } = useGame();

  if (loading || !player) {
    return (
      <div role="status" aria-live="polite" aria-busy="true">
        <span className="sr-only">Loading...</span>
      </div>
    );
  }

  return player?.is_premium
    ? <>{children}</>
    : <Navigate to="/upgrade" replace />;
}
