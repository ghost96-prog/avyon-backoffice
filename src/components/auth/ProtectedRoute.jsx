// src/components/auth/ProtectedRoute.jsx
import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAppContext } from "../../context/AppContext";
import FullScreenLoader from "../common/FullScreenLoader";
import PinGate from "../pin/PinGate";

export default function ProtectedRoute({ children }) {
  const { isLoading, firebaseUser, postLoginStage } = useAppContext();
  const location = useLocation();

  if (isLoading) return <FullScreenLoader />;

  if (!firebaseUser) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (postLoginStage === "checking" || postLoginStage === "idle") {
    return <FullScreenLoader label="Setting up your workspace…" />;
  }

  if (postLoginStage === "pin") {
    return <PinGate mode="initial" />;
  }

  return children;
}
