// src/components/common/ZimraSettings.jsx
//
// "ZIMRA fiscalisation" setup, shown on the Taxes page. Replaces the credentials that used to be
// hard-coded in the POS app, so each business fiscalises with its OWN details:
//
//   Business-wide (same for every store):  Merchant ID · API token · TIN · VAT number
//   Per store:                             Fiscal device ID (issued by ZIMRA / the integrator)
//
// The token is write-only here: once saved the server only ever tells us its last 4 characters, so
// leaving the field blank keeps the saved token. POS terminals pick the values up on their next
// refresh (sign-in / pull-to-refresh) and cache them on the device.
import React, { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, Eye, EyeOff, CheckCircle2, AlertTriangle } from 'lucide-react';

const input = (extra) => ({
  width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #E2E8F0',
  fontSize: 14, boxSizing: 'border-box', ...extra,
});
const label = { fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 };
const hint = { fontSize: 12, color: '#94A3B8', marginTop: 4 };
const primaryBtn = (disabled) => ({
  padding: '10px 18px', borderRadius: 8, border: 'none', background: '#0891B2', color: '#fff',
  fontWeight: 700, fontSize: 13, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.6 : 1,
});

const Banner = ({ kind, children }) => (
  <div style={{
    display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontSize: 13,
    background: kind === 'ok' ? '#ECFDF5' : '#FEF2F2', border: `1px solid ${kind === 'ok' ? '#A7F3D0' : '#FEE2E2'}`,
    color: kind === 'ok' ? '#047857' : '#EF4444',
  }}>
    {kind === 'ok' ? <CheckCircle2 size={15} style={{ marginTop: 1, flexShrink: 0 }} /> : <AlertTriangle size={15} style={{ marginTop: 1, flexShrink: 0 }} />}
    <span>{children}</span>
  </div>
);

export default function ZimraSettings({ apiFetch, businessId, selectedBranchId, staffId }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [saved, setSaved] = useState(null);       // masked credentials from the server
  const [stores, setStores] = useState([]);       // [{ branchId, name, deviceId }]

  // credentials form
  const [merchantId, setMerchantId] = useState('');
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [tin, setTin] = useState('');
  const [vat, setVat] = useState('');
  const [credBusy, setCredBusy] = useState(false);
  const [credMsg, setCredMsg] = useState(null);   // { kind: 'ok' | 'err', text }

  // device form (selected store)
  const [deviceId, setDeviceId] = useState('');
  const [devBusy, setDevBusy] = useState(false);
  const [devMsg, setDevMsg] = useState(null);

  const base = `/business/${businessId}`;
  const store = stores.find((s) => s.branchId === selectedBranchId);

  const load = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const r = await apiFetch(`${base}/zimra`);
      const c = r?.credentials || {};
      setSaved(c);
      setStores(Array.isArray(r?.branches) ? r.branches : []);
      setMerchantId(c.merchantId || '');
      setTin(c.tinNumber || '');
      setVat(c.vatNumber || '');
      setToken('');
    } catch (e) {
      console.error('Load ZIMRA settings error:', e);
      setLoadError('Failed to load ZIMRA settings');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, base, businessId]);

  useEffect(() => { load(); }, [load]);

  // switching store in the Taxes header switches the device field
  useEffect(() => { setDeviceId(store?.deviceId || ''); setDevMsg(null); }, [store?.branchId, store?.deviceId]);

  const saveCredentials = async () => {
    setCredMsg(null);
    if (!merchantId.trim()) return setCredMsg({ kind: 'err', text: 'Enter the merchant ID' });
    if (!saved?.hasToken && !token.trim()) return setCredMsg({ kind: 'err', text: 'Enter the API token' });
    if (!/^\d{10}$/.test(tin.trim())) return setCredMsg({ kind: 'err', text: 'TIN must be exactly 10 digits' });
    if (vat.trim() && !/^\d{6,12}$/.test(vat.trim())) return setCredMsg({ kind: 'err', text: 'VAT number must be digits only (or left blank)' });

    setCredBusy(true);
    try {
      const r = await apiFetch(`${base}/zimra/credentials`, {
        method: 'PUT',
        body: JSON.stringify({
          staffId,
          merchantId: merchantId.trim(),
          tinNumber: tin.trim(),
          vatNumber: vat.trim(),
          ...(token.trim() ? { token: token.trim() } : {}), // blank = keep the saved token
        }),
      });
      setSaved(r?.credentials || saved);
      setToken('');
      setShowToken(false);
      setCredMsg({ kind: 'ok', text: 'ZIMRA credentials saved. Tills pick them up the next time they refresh.' });
    } catch (e) {
      setCredMsg({ kind: 'err', text: e.message || 'Failed to save credentials' });
    } finally {
      setCredBusy(false);
    }
  };

  const saveDevice = async () => {
    setDevMsg(null);
    if (!selectedBranchId) return setDevMsg({ kind: 'err', text: 'Select a store first' });
    const v = deviceId.trim();
    if (v && !/^\d{1,10}$/.test(v)) return setDevMsg({ kind: 'err', text: 'Device ID must be a number' });

    setDevBusy(true);
    try {
      const r = await apiFetch(`${base}/branches/${selectedBranchId}/zimra/device`, {
        method: 'PUT',
        body: JSON.stringify({ staffId, deviceId: v }),
      });
      setStores((list) => list.map((s) => (s.branchId === selectedBranchId ? { ...s, deviceId: r?.deviceId || '' } : s)));
      setDevMsg({ kind: 'ok', text: v ? 'Device ID saved for this store.' : 'Device ID removed for this store.' });
    } catch (e) {
      setDevMsg({ kind: 'err', text: e.message || 'Failed to save device ID' });
    } finally {
      setDevBusy(false);
    }
  };

  const credsDone = !!(saved?.merchantId && saved?.hasToken && saved?.tinNumber);
  const missingDevices = stores.filter((s) => !s.deviceId).length;

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <ShieldCheck size={18} color="#0891B2" />
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0F172A' }}>ZIMRA fiscalisation</h2>
      </div>
      <div style={{ fontSize: 13, color: '#94A3B8', marginBottom: 14 }}>
        The details your tills use to send receipts to ZIMRA. Merchant ID, token, TIN and VAT are the same for every store; each store has its own device ID.
      </div>

      {loadError && <Banner kind="err">{loadError}</Banner>}

      {/* ── Business-wide credentials ── */}
      <div className="reports-list-card" style={{ padding: 16, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#0F172A' }}>Business credentials <span style={{ color: '#94A3B8', fontWeight: 400 }}>· all stores</span></div>
          {!loading && (
            <span style={{ fontSize: 12, fontWeight: 600, color: credsDone ? '#047857' : '#B45309' }}>
              {credsDone ? 'Saved' : 'Not set up'}
            </span>
          )}
        </div>

        {credMsg && <Banner kind={credMsg.kind}>{credMsg.text}</Banner>}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
          <div>
            <label style={label}>Merchant ID</label>
            <input style={input()} value={merchantId} onChange={(e) => setMerchantId(e.target.value)} disabled={loading || credBusy}
              placeholder="e.g. 1bd1e939-66df-4924-…" autoComplete="off" spellCheck={false} />
          </div>
          <div>
            <label style={label}>API token</label>
            <div style={{ position: 'relative' }}>
              <input style={input({ paddingRight: 40 })} type={showToken ? 'text' : 'password'} value={token}
                onChange={(e) => setToken(e.target.value)} disabled={loading || credBusy} autoComplete="new-password" spellCheck={false}
                placeholder={saved?.hasToken ? `Saved (ends …${saved.tokenLast4}) - leave blank to keep` : 'Paste the token you were issued'} />
              <button type="button" onClick={() => setShowToken((v) => !v)} title={showToken ? 'Hide' : 'Show'}
                style={{ position: 'absolute', right: 8, top: 8, border: 'none', background: 'none', cursor: 'pointer', color: '#64748B', display: 'flex', padding: 2 }}>
                {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <div style={hint}>Stored securely on the server. It is never shown again after saving.</div>
          </div>
          <div>
            <label style={label}>TIN</label>
            <input style={input()} inputMode="numeric" value={tin} maxLength={10} onChange={(e) => setTin(e.target.value.replace(/\D/g, ''))}
              disabled={loading || credBusy} placeholder="10 digits" />
          </div>
          <div>
            <label style={label}>VAT number</label>
            <input style={input()} inputMode="numeric" value={vat} maxLength={12} onChange={(e) => setVat(e.target.value.replace(/\D/g, ''))}
              disabled={loading || credBusy} placeholder="e.g. 220234498" />
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <button onClick={saveCredentials} disabled={loading || credBusy} style={primaryBtn(loading || credBusy)}>
            {credBusy ? 'Saving...' : 'Save credentials'}
          </button>
        </div>
      </div>

      {/* ── Per-store device ── */}
      <div className="reports-list-card" style={{ padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#0F172A', marginBottom: 2 }}>
          Fiscal device <span style={{ color: '#94A3B8', fontWeight: 400 }}>· {store?.name || 'select a store above'}</span>
        </div>
        <div style={{ fontSize: 12, color: '#94A3B8', marginBottom: 12 }}>
          The ZIMRA device registered for this store. Every till in the store uses it. Use the store button at the top of the page to switch stores.
        </div>

        {devMsg && <Banner kind={devMsg.kind}>{devMsg.text}</Banner>}

        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 220px', maxWidth: 320 }}>
            <label style={label}>Device ID</label>
            <input style={input()} inputMode="numeric" value={deviceId} maxLength={10}
              onChange={(e) => setDeviceId(e.target.value.replace(/\D/g, ''))} disabled={loading || devBusy || !selectedBranchId}
              placeholder="e.g. 37422" />
          </div>
          <button onClick={saveDevice} disabled={loading || devBusy || !selectedBranchId} style={primaryBtn(loading || devBusy || !selectedBranchId)}>
            {devBusy ? 'Saving...' : 'Save device'}
          </button>
        </div>

        {stores.length > 1 && (
          <div style={{ marginTop: 16, borderTop: '1px solid #F1F5F9', paddingTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>
              All stores{missingDevices ? ` · ${missingDevices} without a device` : ''}
            </div>
            {stores.map((s) => (
              <div key={s.branchId} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, padding: '4px 0', color: '#0F172A' }}>
                <span>{s.name}</span>
                <span style={{ color: s.deviceId ? '#047857' : '#B45309', fontWeight: 600 }}>{s.deviceId || 'Not set'}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
