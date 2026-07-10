// src/components/pos/SubscriptionExpiredModal.jsx
import React from 'react';
import { ShieldAlert, AlertCircle, Phone, MessageCircle, LogOut, SwitchCamera, X } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import './SubscriptionExpiredModal.css';

const SUPPORT_WHATSAPP = '263783556354';
const SUPPORT_PHONE = '+263783556354';

export default function SubscriptionExpiredModal({ 
  visible, 
  subscriptionStatus, 
  suspendedReason, 
  branchName, 
  onDismiss 
}) {
  const { logout, availableBranches, returnToBranchSelection } = useAppContext();

  if (!visible) return null;

  const isSuspended = subscriptionStatus === 'suspended';
  const canSwitchBranch = (availableBranches?.length || 0) > 1;

  const handleWhatsApp = () => {
    const branchContext = branchName ? ` (${branchName})` : '';
    const message = isSuspended
      ? `Hi, my Avyon POS branch${branchContext} has been suspended. I would like to resolve this.`
      : `Hi, my Avyon POS branch${branchContext} subscription has expired. I would like to make a payment to reactivate.`;
    const url = `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  const handleCall = () => {
    window.location.href = `tel:${SUPPORT_PHONE}`;
  };

  const handleSwitchBranch = () => {
    if (returnToBranchSelection) {
      returnToBranchSelection();
    }
  };

  const handleLogout = () => {
    if (window.confirm('Are you sure you want to sign out?')) {
      logout();
    }
  };

  const handleUnderstood = () => {
    if (onDismiss) {
      onDismiss();
    }
  };

  return (
    <div className="expired-modal-backdrop" onClick={onDismiss}>
      <div className="expired-modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="expired-modal-close" onClick={onDismiss}>
          <X size={20} />
        </button>

        <div className={`expired-modal-icon ${isSuspended ? 'suspended' : ''}`}>
          {isSuspended ? (
            <ShieldAlert size={36} color="#FFFFFF" />
          ) : (
            <AlertCircle size={36} color="#FFFFFF" />
          )}
        </div>

        <h2 className="expired-modal-title">
          {isSuspended ? 'Branch Suspended' : 'Branch Subscription Expired'}
        </h2>

        {branchName && (
          <div className="expired-modal-branch">
            <span>{branchName}</span>
          </div>
        )}

        <p className="expired-modal-message">
          {isSuspended
            ? suspendedReason || 'This branch has been suspended. Please contact support to resolve this.'
            : 'This branch\'s trial or subscription period has ended. Please make a payment to continue using the POS at this branch.'}
        </p>

        {canSwitchBranch && (
          <p className="expired-modal-hint">
            Other branches on your account are not affected.
          </p>
        )}

        <hr className="expired-modal-divider" />

        <p className="expired-modal-contact-label">
          Contact us to {isSuspended ? 'resolve this' : 'reactivate'}:
        </p>

        <button className="expired-modal-action-btn" onClick={handleWhatsApp}>
          <MessageCircle size={18} color="#25D366" />
          <span>Chat on WhatsApp</span>
        </button>

        <button className="expired-modal-action-btn" onClick={handleCall}>
          <Phone size={18} color="#0F172A" />
          <span>{SUPPORT_PHONE}</span>
        </button>

        {canSwitchBranch && (
          <button className="expired-modal-action-btn switch-branch" onClick={handleSwitchBranch}>
            <SwitchCamera size={18} color="#FFFFFF" />
            <span>Switch to a Different Branch</span>
          </button>
        )}

        <button className="expired-modal-understood" onClick={handleUnderstood}>
          UNDERSTOOD
        </button>

        <button className="expired-modal-signout" onClick={handleLogout}>
          <LogOut size={14} />
          <span>Sign out instead</span>
        </button>
      </div>
    </div>
  );
}