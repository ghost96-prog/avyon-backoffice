// src/components/common/ModuleSubscriptionModal.jsx
//
// Rich "you're not subscribed to this yet" modal. Opens when a gated
// action (create/edit product, import stock, open GRV/transfer/stock
// take, open analytics) is attempted without an active module
// subscription. Shows what the module unlocks, its price, and lets the
// person reach support directly to pay — no in-app payment flow, matches
// the existing SubscriptionsScreen "contact support to pay" pattern.

import React, { useState } from 'react';
import { X, Lock, Clock, AlertTriangle, Check, MessageCircle, Phone, Mail } from 'lucide-react';
import { getModuleInfo } from '../../utils/moduleCatalog';
import { useAppContext } from '../../context/AppContext';
import './ModuleSubscriptionModal.css';

const SUPPORT_WHATSAPP_NUMBER = '263783556354';
const SUPPORT_PHONE = '+263783556354';
const SUPPORT_EMAIL = 'gkmangezi09@gmail.com';

export default function ModuleSubscriptionModal({ moduleId, moduleState, onClose }) {
  const { businessId, businessName, branchId, selectedBranchId, branches } = useAppContext();
  const [copied, setCopied] = useState(false);

  const info = getModuleInfo(moduleId);
  if (!info) return null;

  const Icon = info.icon;
  // ✅ Show the branch this gate actually fired for (whatever's currently
  // selected in Products/Dashboard), not the static login branch — otherwise
  // this modal names the wrong branch even when moduleState itself is
  // correct for the branch the user is really on.
  const branchName = branches?.find((b) => b.branchId === (selectedBranchId || branchId))?.name || '';

  const status = moduleState?.status || 'inactive';
  const isExpired = status === 'expired';
  const isSuspended = status === 'suspended';

  const supportMessage = `Hi, I'd like to subscribe to the "${info.label}" module${
    branchName ? ` for ${branchName}` : ''
  }${businessName ? ` (${businessName})` : ''}. Business ID: ${businessId || ''}`;

  const whatsappUrl = `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${encodeURIComponent(supportMessage)}`;
  const emailUrl = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
    `${info.label} Subscription Request`
  )}&body=${encodeURIComponent(supportMessage)}`;
  const telUrl = `tel:${SUPPORT_PHONE}`;

  const handleCopyId = () => {
    navigator.clipboard?.writeText(businessId || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="msm-overlay" onClick={onClose}>
      <div className="msm-modal" onClick={(e) => e.stopPropagation()}>
        <button className="msm-close" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>

        {/* Header */}
        <div className="msm-header" style={{ background: `linear-gradient(135deg, ${info.color}15, ${info.bg})` }}>
          <div className="msm-icon-wrap" style={{ background: info.color }}>
            <Icon size={26} color="#fff" />
          </div>
          <div className="msm-header-text">
            <div className="msm-header-title">{info.label}</div>
            <div className="msm-header-price">
              <span className="msm-price-amount">${info.price}</span>
              <span className="msm-price-period">{info.period}</span>
            </div>
          </div>
        </div>

        {/* Status banner — only shown if this WAS active before (expired/suspended), not for a plain "never purchased" */}
        {(isExpired || isSuspended) && (
          <div className={`msm-status-banner msm-status-banner--${isSuspended ? 'suspended' : 'expired'}`}>
            {isSuspended ? <AlertTriangle size={15} /> : <Clock size={15} />}
            <span>
              {isSuspended
                ? 'This module was suspended. Contact support to resolve it.'
                : 'This module\u2019s subscription has expired. Renew to regain access.'}
            </span>
          </div>
        )}

        {/* Body */}
        <div className="msm-body">
          <div className="msm-lock-note">
            <Lock size={13} />
            <span>
              {branchName ? <><strong>{branchName}</strong> isn't</> : 'This branch isn\u2019t'} subscribed to this module yet.
            </span>
          </div>

          <p className="msm-description">{info.description}</p>

          <div className="msm-features">
            <div className="msm-features-title">What you'll unlock</div>
            {info.features.map((f, i) => (
              <div className="msm-feature-row" key={i}>
                <Check size={15} color={info.color} />
                <span>{f}</span>
              </div>
            ))}
          </div>

          <div className="msm-business-id" onClick={handleCopyId} title="Click to copy">
            <span className="msm-business-id-label">Business ID</span>
            <span className="msm-business-id-value">{businessId}</span>
            <span className="msm-business-id-copy">{copied ? 'Copied!' : 'Copy'}</span>
          </div>
        </div>

        {/* Footer — support actions */}
        <div className="msm-footer">
          <div className="msm-footer-label">Ready to subscribe? Contact support to activate:</div>
          <div className="msm-support-actions">
            <a className="msm-support-btn msm-support-btn--whatsapp" href={whatsappUrl} target="_blank" rel="noopener noreferrer">
              <MessageCircle size={16} /> WhatsApp
            </a>
            <a className="msm-support-btn msm-support-btn--call" href={telUrl}>
              <Phone size={16} /> Call
            </a>
            <a className="msm-support-btn msm-support-btn--email" href={emailUrl}>
              <Mail size={16} /> Email
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}