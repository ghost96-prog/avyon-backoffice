// src/pages/Login.jsx
import React, { useState, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { signInWithEmailAndPassword } from "firebase/auth";
import { Mail, Lock, Eye, EyeOff, ArrowRight, Download } from "lucide-react";
import { auth } from "../firebase/firebase";
import Button from "../components/common/Button";
import { useInstallPrompt } from "../hooks/useInstallPrompt";
import "./Login.css";

// Import your logo
import avyonLogo from "../assets/avyonicon.png"; // Adjust path as needed

const FRIENDLY_ERRORS = {
  "auth/invalid-email": "That email address doesn't look right.",
  "auth/user-not-found": "No account found with this email address.",
  "auth/wrong-password": "Incorrect password. Please try again.",
  "auth/invalid-credential": "Incorrect email or password.",
  "auth/too-many-requests": "Too many attempts. Please wait a moment and try again.",
  "auth/network-request-failed": "Network error — check your connection.",
};

// Feature cards data
const FEATURE_CARDS = [
  {
    id: 1,
    eyebrow: "📊 Dashboard",
    figure: "Real-time insights",
    trend: "Sales, inventory, staff performance"
  },
  {
    id: 2,
    eyebrow: "📦 Inventory",
    figure: "Stock tracking",
    trend: "Real-time stock levels & alerts"
  },
  {
    id: 3,
    eyebrow: "📋 GRV",
    figure: "Goods Received",
    trend: "Voucher approval & reconciliation"
  },
  {
    id: 4,
    eyebrow: "📈 Stock Value",
    figure: "Inventory valuation",
    trend: "Cost tracking & margin analysis"
  },
  {
    id: 5,
    eyebrow: "📄 Receipts",
    figure: "Transaction history",
    trend: "Complete audit trail & export"
  },
  {
    id: 6,
    eyebrow: "📤 Export Data",
    figure: "Reports & analytics",
    trend: "CSV, Excel, PDF exports"
  },
  {
    id: 7,
    eyebrow: "👥 Staff Performance",
    figure: "Team analytics",
    trend: "Sales per staff & productivity"
  },
  {
    id: 8,
    eyebrow: "🔄 Stock Movement",
    figure: "Transfer tracking",
    trend: "Branch transfers & adjustments"
  },
  {
    id: 9,
    eyebrow: "📦 Product Import",
    figure: "Bulk upload",
    trend: "CSV import & product management"
  },
  {
    id: 10,
    eyebrow: "💰 Cash Management",
    figure: "Till reconciliation",
    trend: "Shift tracking & cash flow"
  },
  {
    id: 11,
    eyebrow: "🏢 Multi-branch",
    figure: "Branch management",
    trend: "Centralized control & reporting"
  },
  {
    id: 12,
    eyebrow: "🔔 Alerts",
    figure: "Smart notifications",
    trend: "Low stock, pending approvals"
  }
];

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { canInstall, promptInstall } = useInstallPrompt();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);

  // Generate random positions and animations for each card
  const cardPositions = useMemo(() => {
    return FEATURE_CARDS.map(() => ({
      top: Math.random() * 85 + 2,
      left: Math.random() * 85 + 2,
      width: Math.floor(Math.random() * 50 + 120),
      xOffset: (Math.random() - 0.5) * 80, // Random horizontal movement
      yOffset: (Math.random() - 0.5) * 80, // Random vertical movement
      duration: 15 + Math.random() * 20, // 15-35 seconds
      delay: Math.random() * 5,
    }));
  }, []);

  const validate = () => {
    const next = {};
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!email.trim()) next.email = "Email is required";
    else if (!emailOk) next.email = "Enter a valid email address";
    if (!password) next.password = "Password is required";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");
    if (!validate()) return;

    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      const redirectTo = location.state?.from?.pathname || "/";
      navigate(redirectTo, { replace: true });
    } catch (error) {
      const code = error.code || "";
      setFormError(FRIENDLY_ERRORS[code] || "Sign in failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-container">
        <div className="login-card">
          {/* Logo - 200x200 */}
          <div className="login-logo-wrapper">
            <div className="login-logo">
              <img 
                src={avyonLogo} 
                alt="Avyon" 
                className="login-logo-img"
              />
              <div className="logo-wave">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>

          <div className="login-brand">
            <span>Avyon BackOffice</span>
          </div>

          {canInstall && (
            <button
              type="button"
              className="login-install-btn"
              onClick={promptInstall}
            >
              <Download size={14} />
              Install app
            </button>
          )}

          <div className="login-form-wrap">
            <h1 className="login-title">Welcome back</h1>
            <p className="login-subtitle">Sign in to manage your business.</p>

            <form className="login-form" onSubmit={handleSubmit} noValidate>
              <label className="field">
                <span className="field-label">Email address</span>
                <div className={`field-control ${errors.email ? "has-error" : ""}`}>
                  <Mail size={17} className="field-icon" />
                  <input
                    type="email"
                    autoComplete="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                {errors.email && <span className="field-error">{errors.email}</span>}
              </label>

              <label className="field">
                <span className="field-label">Password</span>
                <div className={`field-control ${errors.password ? "has-error" : ""}`}>
                  <Lock size={17} className="field-icon" />
                  <input
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="field-icon-btn"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
                {errors.password && <span className="field-error">{errors.password}</span>}
              </label>

              <div className="login-row-between">
                <span />
                <a className="login-link" href="#forgot">
                  Forgot password?
                </a>
              </div>

              {formError && <div className="login-alert">{formError}</div>}

              <Button type="submit" variant="primary" size="lg" loading={loading} iconRight={ArrowRight} className="login-submit">
                Sign in
              </Button>
            </form>
          </div>

          <p className="login-footnote">
            BackOffice is for business owners, admins, and managers. Cashiers and stock
            controllers should use the POS app.
          </p>
        </div>
      </div>

      <div className="login-showcase" aria-hidden="true">
        <div className="showcase-glow" />
        
        {FEATURE_CARDS.map((card, index) => {
          const pos = cardPositions[index];
          return (
            <div 
              key={card.id}
              className="showcase-card"
              style={{
                top: `${pos.top}%`,
                left: `${pos.left}%`,
                width: `${pos.width}px`,
                transform: 'translate(-50%, -50%)',
                '--x-offset': `${pos.xOffset}px`,
                '--y-offset': `${pos.yOffset}px`,
                animationDuration: `${pos.duration}s`,
                animationDelay: `${pos.delay}s`,
              }}
            >
              <span className="showcase-eyebrow">{card.eyebrow}</span>
              <span className="showcase-figure">{card.figure}</span>
              <span className="showcase-trend">{card.trend}</span>
            </div>
          );
        })}

        <div className="showcase-copy">
          <p>Complete business management — Sales, Inventory, Staff, and more in one platform.</p>
        </div>
      </div>
    </div>
  );
}