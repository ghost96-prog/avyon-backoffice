// src/components/common/IntelligenceFab.jsx
//
// The floating bottom-right button — now a one-tap shortcut to the Avyon
// Intelligence screen (same destination and same permission as the TopBar's
// Intelligence button). Replaces the old "Ask Avyon" quick-question panel
// (AskAvyonButton.jsx is still in the project, just no longer mounted).
// Reuses the .ask-avyon-fab look so the gradient bubble is unchanged.
import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { useAppContext } from "../../context/AppContext";
import { BACKOFFICE_PERMISSIONS as P } from "../../utils/permissions";
import "./AskAvyonButton.css";

export default function IntelligenceFab() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { hasBackofficePermission } = useAppContext();

  // Same gate as the route + TopBar button; no point showing it on the page itself.
  if (!hasBackofficePermission(P.VIEW_SALES_REPORTS)) return null;
  if (pathname === "/intelligence") return null;

  return (
    <button
      type="button"
      className="ask-avyon-fab"
      onClick={() => navigate("/intelligence")}
      aria-label="Avyon Intelligence"
      title="Avyon Intelligence"
    >
      <Sparkles size={22} />
    </button>
  );
}
