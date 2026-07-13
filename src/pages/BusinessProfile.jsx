// src/pages/BusinessProfile.jsx
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft, Building2, Mail, Phone, Flag, Coins, Pencil, Save, X,
  Clock, AlertTriangle, CheckCircle2, MessageCircle, GitBranch, RotateCcw,
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import Button from '../components/common/Button';
import '../styles/ReportsShared.css';

const SUPPORT_WHATSAPP_NUMBER = '263783556354';
const SUPPORT_EMAIL = 'gkmangezi09@gmail.com';

const STATUS_META = {
  trial: { label: 'Free Trial', color: '#357abd', bg: '#e6eef9', icon: Clock },
  active: { label: 'Active', color: '#16a34a', bg: '#dcfce7', icon: CheckCircle2 },
  expired: { label: 'Expired', color: '#ef4444', bg: '#fee2e2', icon: AlertTriangle },
  suspended: { label: 'Suspended', color: '#d97706', bg: '#fef3c7', icon: AlertTriangle },
};

function statusMeta(status) {
  return STATUS_META[status] || { label: status || 'Unknown', color: '#8b97a7', bg: '#f0f2f5', icon: Clock };
}

function formatCountdown(ms) {
  if (ms == null) return '—';
  if (ms <= 0) return 'Expired';
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (days > 0 || hours > 0) parts.push(`${hours}h`);
  if (days > 0 || hours > 0 || minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(' ');
}

function formatExpiryDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

export default function BusinessProfile() {
  const navigate = useNavigate();
  const { apiFetch, businessId } = useAppContext();

  const [business, setBusiness] = useState(null);
  const [branches, setBranches] = useState([]);
  const [nowTick, setNowTick] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ businessName: '', email: '', phoneNumber: '', country: '', baseCurrency: '' });
  const [saving, setSaving] = useState(false);

  const [supportModalBranch, setSupportModalBranch] = useState(null); // branch object or null

  const tickRef = useRef(null);
  const pollRef = useRef(null);

  const load = useCallback(async (isRefresh = false) => {
    if (!businessId) return;
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const [biz, branchList] = await Promise.all([
        apiFetch(`/business/${businessId}`),
        apiFetch(`/business/${businessId}/branches`),
      ]);
      setBusiness(biz);
      setForm({
        businessName: biz.businessName || '',
        email: biz.email || '',
        phoneNumber: biz.phoneNumber || '',
        country: biz.country || '',
        baseCurrency: biz.baseCurrency || '',
      });
      setBranches((branchList || []).sort((a, b) => (b.isMain ? 1 : 0) - (a.isMain ? 1 : 0)));
    } catch (e) {
      console.error('BusinessProfile load error:', e);
      setError('Failed to load business profile');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [apiFetch, businessId]);

  useEffect(() => { load(); }, [load]);

  // Live tick for every branch's countdown, plus a periodic refetch so
  // status changes made elsewhere (e.g. by an admin) show up without a
  // manual reload.
  useEffect(() => {
    tickRef.current = setInterval(() => setNowTick(Date.now()), 1000);
    pollRef.current = setInterval(() => load(true), 5 * 60 * 1000);
    return () => { clearInterval(tickRef.current); clearInterval(pollRef.current); };
  }, [load]);

  const attentionCount = useMemo(() => {
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    return branches.filter((b) => {
      if (b.subscriptionStatus === 'suspended' || b.subscriptionStatus === 'expired') return true;
      const remaining = (b.accessExpiresAt || 0) - nowTick;
      return remaining <= SEVEN_DAYS;
    }).length;
  }, [branches, nowTick]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await apiFetch(`/business/${businessId}`, { method: 'PUT', body: JSON.stringify(form) });
      setBusiness((prev) => ({ ...prev, ...form }));
      setEditing(false);
    } catch (e) {
      console.error('Save business error:', e);
      setError('Could not save business details');
    } finally {
      setSaving(false);
    }
  }, [apiFetch, businessId, form]);

  const supportMessage = useCallback((branch) => {
    return `Hi, I'd like to subscribe / renew POS access for ${business?.businessName || 'my business'}${branch ? ` (branch: ${branch.name})` : ''}. Business ID: ${businessId || ''}`;
  }, [business, businessId]);

  const renderSupportModal = () => {
    if (!supportModalBranch) return null;
    const msg = supportMessage(supportModalBranch);
    return (
      <div className="reports-modal-overlay" onClick={() => setSupportModalBranch(null)}>
        <div className="reports-modal" style={{ maxWidth: 340 }} onClick={(e) => e.stopPropagation()}>
          <div className="reports-modal-header">
            <span className="reports-modal-title">Contact Support</span>
          </div>
          <div className="reports-modal-body" style={{ padding: '12px 16px 16px' }}>
            <div style={{ fontSize: 12.5, color: '#5e6f8a', marginBottom: 14, lineHeight: 1.5 }}>
              Reach out to renew or activate a plan for <strong>{supportModalBranch.name}</strong>.
            </div>
            <a
              href={`https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 8,
                border: '1px solid #e6eaf0', marginBottom: 8, fontSize: 13, fontWeight: 600, color: '#16a34a', textDecoration: 'none',
              }}
            >
              <MessageCircle size={16} /> Message on WhatsApp
            </a>
            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('POS Subscription Request')}&body=${encodeURIComponent(msg)}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 8,
                border: '1px solid #e6eaf0', fontSize: 13, fontWeight: 600, color: '#357abd', textDecoration: 'none',
              }}
            >
              <Mail size={16} /> Email {SUPPORT_EMAIL}
            </a>
            <button
              onClick={() => setSupportModalBranch(null)}
              style={{ marginTop: 14, width: '100%', padding: '8px 0', border: 'none', background: 'transparent', color: '#8b97a7', fontSize: 12.5, cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="reports-page">
      <div className="reports-header">
        <div className="reports-header-left">
          <button className="reports-header-back" onClick={() => navigate('/')}><ChevronLeft size={18} /></button>
          <div>
            <div className="reports-header-title">Business Profile</div>
            <div className="reports-header-sub">Business details, branch subscriptions & support</div>
          </div>
        </div>
        <div className="reports-header-right">
          <Button variant="secondary" size="sm" icon={RotateCcw} onClick={() => load(true)} loading={refreshing}>Refresh</Button>
        </div>
      </div>

      {error && <div className="dashboard-error" style={{ marginBottom: 12 }}>{error}</div>}

      {/* ─── Business details ────────────────────────────────────────── */}
      <div className="reports-list-card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12, background: '#e6eef9',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Building2 size={22} color="#357abd" />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#1a2332' }}>
                {loading ? <span className="skeleton" style={{ display: 'inline-block', width: 160, height: 16, borderRadius: 4 }} /> : (business?.businessName || 'Your Business')}
              </div>
              <div style={{ fontSize: 12, color: '#8b97a7', marginTop: 2 }}>Business ID: {businessId}</div>
            </div>
          </div>
          {!editing ? (
            <Button variant="secondary" size="sm" icon={Pencil} onClick={() => setEditing(true)} disabled={loading}>Edit</Button>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="secondary" size="sm" icon={X} onClick={() => { setEditing(false); setForm({ businessName: business.businessName || '', email: business.email || '', phoneNumber: business.phoneNumber || '', country: business.country || '', baseCurrency: business.baseCurrency || '' }); }}>Cancel</Button>
              <Button variant="primary" size="sm" icon={Save} onClick={handleSave} loading={saving}>Save</Button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="skeleton" style={{ height: 120, borderRadius: 10 }} />
        ) : (
          <div className="category-panel">
            <div className="category-list">
              <FieldRow icon={Building2} label="Business Name" editing={editing} value={form.businessName} onChange={(v) => setForm((f) => ({ ...f, businessName: v }))} display={business?.businessName} />
              <FieldRow icon={Mail} label="Email" editing={editing} value={form.email} onChange={(v) => setForm((f) => ({ ...f, email: v }))} display={business?.email} />
              <FieldRow icon={Phone} label="Phone" editing={editing} value={form.phoneNumber} onChange={(v) => setForm((f) => ({ ...f, phoneNumber: v }))} display={business?.phoneNumber} />
              <FieldRow icon={Flag} label="Country" editing={editing} value={form.country} onChange={(v) => setForm((f) => ({ ...f, country: v }))} display={business?.country} />
              <FieldRow icon={Coins} label="Base Currency" editing={editing} value={form.baseCurrency} onChange={(v) => setForm((f) => ({ ...f, baseCurrency: v }))} display={business?.baseCurrency} />
            </div>
          </div>
        )}
      </div>

      {/* ─── Subscriptions overview ─────────────────────────────────── */}
      <div className="reports-stats-row" style={{ marginBottom: 16 }}>
        <div className="reports-stat-card">
          <span className="reports-stat-label"><GitBranch size={11} style={{ marginRight: 4, verticalAlign: -1 }} />Branches</span>
          {loading ? <div className="skeleton" style={{ height: 18, borderRadius: 4, marginTop: 4 }} /> : <span className="reports-stat-value">{branches.length}</span>}
        </div>
        <div className="reports-stat-card">
          <span className="reports-stat-label"><AlertTriangle size={11} style={{ marginRight: 4, verticalAlign: -1, color: attentionCount ? '#ef4444' : '#8b97a7' }} />Needs Attention</span>
          {loading ? <div className="skeleton" style={{ height: 18, borderRadius: 4, marginTop: 4 }} /> : (
            <span className="reports-stat-value" style={{ color: attentionCount ? '#ef4444' : '#1a2332' }}>{attentionCount}</span>
          )}
        </div>
      </div>

      {/* ─── Branch subscriptions ──────────────────────────────────────── */}
      <div className="reports-list-card" style={{ padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#1a2332', marginBottom: 2 }}>Branch subscriptions</div>
        <div style={{ fontSize: 12, color: '#8b97a7', marginBottom: 12 }}>Live POS access status for every branch</div>

        {loading ? (
          <div className="skeleton" style={{ height: 220, borderRadius: 10 }} />
        ) : !branches.length ? (
          <div className="dashboard-empty" style={{ height: 100 }}>No branches found.</div>
        ) : (
          branches.map((b) => {
            const meta = statusMeta(b.subscriptionStatus);
            const StatusIcon = meta.icon;
            const remaining = Math.max(0, (b.accessExpiresAt || 0) - nowTick);
            const isUrgent = b.subscriptionStatus === 'suspended' || b.subscriptionStatus === 'expired' || remaining <= 7 * 24 * 60 * 60 * 1000;

            return (
              <div key={b.branchId} className="reports-list-item" style={{ alignItems: 'flex-start' }}>
                <div className="reports-list-item-info">
                  <div className="reports-list-item-title">
                    {b.name}
                    {b.isMain && (
                      <span style={{ marginLeft: 8, padding: '2px 7px', borderRadius: 5, background: '#f0f2f5', color: '#8b97a7', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', verticalAlign: 1 }}>
                        Main
                      </span>
                    )}
                  </div>
                  <div className="reports-list-item-sub">
                    <span>{b.subscriptionPlan ? `Plan: ${b.subscriptionPlan}` : 'No plan on file'}</span>
                    <span>Expires {formatExpiryDate(b.accessExpiresAt)}</span>
                    {b.suspendedReason && <span style={{ color: '#d97706' }}>{b.suspendedReason}</span>}
                  </div>
                </div>
                <div className="reports-list-item-right" style={{ alignItems: 'flex-end' }}>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 20,
                    background: meta.bg, color: meta.color, fontSize: 11, fontWeight: 700, marginBottom: 6,
                  }}>
                    <StatusIcon size={11} /> {meta.label}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: remaining <= 0 ? '#ef4444' : '#1a2332' }}>
                    {formatCountdown(remaining)}
                  </div>
                  <div style={{ fontSize: 10.5, color: '#8b97a7', marginBottom: 8 }}>remaining</div>
                  <button
                    onClick={() => setSupportModalBranch(b)}
                    style={{
                      padding: '5px 12px', borderRadius: 6, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                      border: isUrgent ? 'none' : '1.5px solid #357abd',
                      background: isUrgent ? 'linear-gradient(90deg, #d97706, #ef4444)' : 'transparent',
                      color: isUrgent ? '#fff' : '#357abd',
                    }}
                  >
                    {isUrgent ? 'Contact Support to Subscribe' : 'Contact Support'}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {renderSupportModal()}
    </div>
  );
}

function FieldRow({ icon: Icon, label, editing, value, onChange, display }) {
  return (
    <div className="category-row" style={{ padding: '9px 2px', alignItems: 'center' }}>
      <div className="category-row-label" style={{ minWidth: 0 }}>
        <Icon size={14} color="#8b97a7" style={{ marginRight: 8, flexShrink: 0 }} />
        <div style={{ fontSize: 12.5, color: '#8b97a7' }}>{label}</div>
      </div>
      <div className="category-row-value">
        {editing ? (
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            style={{ fontSize: 13, padding: '5px 8px', borderRadius: 6, border: '1px solid #e6eaf0', width: 200, textAlign: 'right' }}
          />
        ) : (
          <span style={{ fontWeight: 600, color: '#1a2332' }}>{display || '—'}</span>
        )}
      </div>
    </div>
  );
}