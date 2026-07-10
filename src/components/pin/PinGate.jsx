// src/components/pin/PinGate.jsx
import React, { useCallback, useEffect, useState, useMemo } from "react";
import { Delete, ShieldCheck, LogOut, RefreshCw } from "lucide-react";
import { useAppContext } from "../../context/AppContext";
import { backofficeSessionManager } from "../../services/backofficeSessionManager";
import { ROLE_LABELS } from "../../utils/permissions";
import "./PinGate.css";
import avyonLogo from "../../assets/avyonicon.png";

const PIN_LENGTH = 4;

export default function PinGate({ mode = "initial" }) {
  const { 
    completePinLogin, 
    switchActiveStaff, 
    activeStaff, 
    businessName, 
    logout,
  } = useAppContext();

  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [refreshingData, setRefreshingData] = useState(false);
  const [syncNotice, setSyncNotice] = useState("");

  const logoPositions = useMemo(() => {
    const positions = [];
    const count = 25 + Math.floor(Math.random() * 15);
    for (let i = 0; i < count; i++) {
      positions.push({
        top: Math.random() * 100,
        left: Math.random() * 100,
        size: 30 + Math.random() * 60,
        rotation: Math.random() * 360,
        opacity: 0.15 + Math.random() * 0.15,
        delay: Math.random() * 10,
      });
    }
    return positions;
  }, []);

  const refreshBackgroundData = useCallback(async (isManual = false) => {
    setRefreshingData(true);
    setSyncNotice("");
    try {
      await backofficeSessionManager.refreshAll();
      if (isManual) setSyncNotice("Staff & access data up to date");
    } catch (e) {
      console.warn("PinGate background refresh failed:", e.message);
      setSyncNotice("Offline — using last saved staff & access data");
    } finally {
      setRefreshingData(false);
      if (isManual) setTimeout(() => setSyncNotice(""), 2500);
    }
  }, []);

  useEffect(() => {
    refreshBackgroundData(false);
  }, []);

  useEffect(() => {
    if (pin.length === PIN_LENGTH) {
      const t = setTimeout(() => verify(pin), 60);
      return () => clearTimeout(t);
    }
  }, [pin]);

  const verify = useCallback(
    async (value) => {
      setVerifying(true);
      setError("");
      
      const result = await backofficeSessionManager.verifyPin(value);
      if (!result.success) {
        setError(result.error || "Invalid PIN");
        setPin("");
        setVerifying(false);
        return;
      }

      if (mode === "initial") completePinLogin(result.staff);
      else switchActiveStaff(result.staff);

      setPin("");
      setVerifying(false);
    },
    [mode, completePinLogin, switchActiveStaff]
  );

  const press = (digit) => {
    if (verifying || pin.length >= PIN_LENGTH) return;
    setError("");
    setPin((p) => p + digit);
  };

  const backspace = () => !verifying && setPin((p) => p.slice(0, -1));
  const clear = () => !verifying && setPin("");

  return (
    <div className="pingate-backdrop">
      <div className="pingate-bg-logos">
        {logoPositions.map((pos, index) => (
          <img
            key={index}
            src={avyonLogo}
            alt=""
            className="pingate-bg-logo"
            style={{
              position: "absolute",
              top: `${pos.top}%`,
              left: `${pos.left}%`,
              width: `${pos.size}px`,
              height: `${pos.size}px`,
              opacity: pos.opacity,
              transform: `rotate(${pos.rotation}deg)`,
              animationDelay: `${pos.delay}s`,
              pointerEvents: "none",
              userSelect: "none",
            }}
          />
        ))}
      </div>

      <div className="pingate-card">
        <button
          className="pingate-refresh-btn"
          onClick={() => refreshBackgroundData(true)}
          disabled={refreshingData}
          aria-label="Refresh staff & access data"
          title="Refresh staff & access data"
        >
          <RefreshCw size={13} className={refreshingData ? "pingate-spin" : ""} />
        </button>

        <div className="pingate-icon">
          <ShieldCheck size={20} color="#fff" strokeWidth={2.2} />
        </div>

        <h1 className="pingate-title">
          {mode === "initial" ? "Confirm identity" : "Switch user"}
        </h1>
        <p className="pingate-subtitle">
          {businessName ? `${businessName} · ` : ""}
          Enter your 4-digit PIN
        </p>

        {(refreshingData || syncNotice) && (
          <div className="pingate-sync-indicator">
            {refreshingData ? "Updating staff & access data…" : syncNotice}
          </div>
        )}

        {mode !== "initial" && activeStaff && (
          <div className="pingate-active">
            Signed in as <strong>{activeStaff.name}</strong>
            {activeStaff.role ? ` · ${ROLE_LABELS[activeStaff.role] || activeStaff.role}` : ""}
          </div>
        )}

        <div className="pingate-dots">
          {Array.from({ length: PIN_LENGTH }).map((_, i) => (
            <span
              key={i}
              className={`pingate-dot ${i < pin.length ? "filled" : ""} ${error ? "error" : ""}`}
            />
          ))}
        </div>

        {error && <p className="pingate-error">{error}</p>}
        {verifying && <p className="pingate-verifying">Verifying…</p>}

        <div className="pingate-keypad">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <button 
              key={n} 
              className="pingate-key" 
              onClick={() => press(String(n))} 
              disabled={verifying}
            >
              {n}
            </button>
          ))}
          <button className="pingate-key pingate-key-action" onClick={clear} disabled={verifying || !pin.length}>
            Clear
          </button>
          <button 
            className="pingate-key" 
            onClick={() => press("0")} 
            disabled={verifying}
          >
            0
          </button>
          <button
            className="pingate-key pingate-key-action"
            onClick={backspace}
            disabled={verifying || !pin.length}
            aria-label="Backspace"
          >
            <Delete size={16} />
          </button>
        </div>

        <button className="pingate-signout" onClick={logout}>
          <LogOut size={12} /> Sign out instead
        </button>
      </div>
    </div>
  );
}