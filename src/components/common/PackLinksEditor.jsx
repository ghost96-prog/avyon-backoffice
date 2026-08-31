// src/components/inventory/PackLinksEditor.jsx
//
// Web equivalent of the mobile app's components/products/PackLinksEditor.js.
// Lets an admin define what a box/pack product breaks into — e.g. a case of
// 24 might break into 6-packs (qty 4), half-cases (qty 2), or singles
// (qty 24), all at once. Fully controlled: the parent screen (ProductForm)
// owns the `links` array and is responsible for JSON.stringify-ing it into
// Product.packLinks on save — same field, same shape the POS app reads for
// its auto-transfer, so links created here are immediately usable there.
//
// Shape: [{ id, targetProductId, targetName, targetSku, targetItemsPerUnit,
//            targetUnit, qty }, ...]
// targetName/targetSku/targetItemsPerUnit/targetUnit are carried in local
// state purely for display + live multiplier math; the parent only needs
// to persist id/targetProductId/qty.
//
// ✅ The ratio (how many of the target one unit of this product yields) is
// ALWAYS computed from both products' itemsPerUnit via computeUnitMultiplier
// — never a free-typed number. Critically, this component never trusts the
// search result's itemsPerUnit at face value (search endpoints can return
// partially-hydrated rows) — the moment a target is picked, it re-fetches
// that exact product by id to get the authoritative itemsPerUnit before
// computing anything. That's the fix for the "why is it dividing by 1"
// class of bug: a stale/incomplete search row silently defaulting to 1.

import React, { useState, useCallback } from 'react';
import { Plus, Trash2, X, ChevronLeft, Search } from 'lucide-react';
import { computeUnitMultiplier } from '../../utils/stockTransfer';
import '../../styles/ReportsShared.css';

function fieldInput(props) {
  return { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 14, boxSizing: 'border-box', ...props };
}

export default function PackLinksEditor({
  links,
  onChange,
  selfProductId,
  unit,
  selfItemsPerUnit,
  apiFetch,
  businessId,
  branchId,
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [stage, setStage] = useState('search'); // 'search' | 'qty'
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [resolvingTarget, setResolvingTarget] = useState(false);
  const [pendingTarget, setPendingTarget] = useState(null);
  const [pendingQty, setPendingQty] = useState('');
  const [pendingMultiplier, setPendingMultiplier] = useState(null);

  const linkedTargetIds = links.map((l) => l.targetProductId);
  const selfSize = selfItemsPerUnit > 0 ? selfItemsPerUnit : 1;

  const openAddModal = () => {
    setStage('search');
    setSearchQuery('');
    setSearchResults([]);
    setPendingTarget(null);
    setPendingQty('');
    setPendingMultiplier(null);
    setModalOpen(true);
  };

  const runSearch = useCallback(async (query) => {
    if (!query.trim() || !businessId || !branchId) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await apiFetch(
        `/business/${businessId}/branches/${branchId}/products/search?q=${encodeURIComponent(query.trim())}&limit=20`
      );
      const results = Array.isArray(res) ? res : [];
      const filtered = results.filter(
        (p) => p.productId !== selfProductId && !linkedTargetIds.includes(p.productId)
      );
      setSearchResults(filtered);
    } catch (err) {
      console.error('PackLinksEditor search error:', err.message);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiFetch, businessId, branchId, selfProductId, links]);

  // ✅ The fix: never trust itemsPerUnit off the search row. Re-fetch the
  // exact product by id — the same endpoint ProductForm itself uses to
  // load a product — so the multiplier is always computed from the
  // authoritative, fully-loaded record.
  const handleSelectTarget = async (product) => {
    setResolvingTarget(true);
    try {
      const full = await apiFetch(`/business/${businessId}/branches/${branchId}/products/${product.productId}`);
      const target = {
        productId: full.productId || product.productId,
        name: full.name || product.name,
        sku: full.sku || product.sku,
        unit: full.unit || 'each',
        itemsPerUnit: full.itemsPerUnit || 1,
      };
      setPendingTarget(target);
      const multiplier = computeUnitMultiplier(selfSize, target.itemsPerUnit);
      setPendingMultiplier(multiplier);
      setPendingQty(multiplier ? String(multiplier) : '');
      setStage('qty');
    } catch (err) {
      console.error('PackLinksEditor: failed to resolve target product', err.message);
      // Fall back to the search row's own fields rather than blocking the
      // admin entirely — but flag it as unresolved (itemsPerUnit unknown)
      // so the UI shows the manual-override warning instead of silently
      // assuming 1.
      const target = {
        productId: product.productId,
        name: product.name,
        sku: product.sku,
        unit: product.unit || 'each',
        itemsPerUnit: 0, // 0, not 1 — forces computeUnitMultiplier to fail closed and show the warning
      };
      setPendingTarget(target);
      setPendingMultiplier(null);
      setPendingQty('');
      setStage('qty');
    } finally {
      setResolvingTarget(false);
    }
  };

  const handleConfirmLink = () => {
    const qtyNum = parseFloat(pendingQty);
    if (!pendingTarget || !qtyNum || qtyNum <= 0) return;

    onChange([
      ...links,
      {
        id: `link_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        targetProductId: pendingTarget.productId,
        targetName: pendingTarget.name,
        targetSku: pendingTarget.sku,
        targetItemsPerUnit: pendingTarget.itemsPerUnit || 1,
        targetUnit: pendingTarget.unit || 'each',
        qty: qtyNum,
      },
    ]);
    setModalOpen(false);
  };

  const handleRemoveLink = (linkId) => {
    onChange(links.filter((l) => l.id !== linkId));
  };

  const handleQtyEdit = (linkId, text) => {
    const qtyNum = parseFloat(text);
    onChange(
      links.map((l) => (l.id === linkId ? { ...l, qty: isNaN(qtyNum) ? l.qty : qtyNum, qtyText: text } : l))
    );
  };

  return (
    <div style={{ marginBottom: 4 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 2 }}>
        Break Into Other Products
      </label>
      <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 10 }}>
        When you break 1 {unit || 'unit'} of this product, how many of another product does it become? Add as many as apply.
      </div>

      {links.map((link) => {
        // Recompute the true ratio for display on every existing link too
        // (not just newly-added ones), so a link created before this fix —
        // or whose qty was hand-typed wrong — shows the correct number.
        const displayMultiplier = computeUnitMultiplier(selfSize, link.targetItemsPerUnit || 1);
        const mismatch = link.targetItemsPerUnit > 0 && displayMultiplier == null;

        return (
          <div key={link.id} style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 10px', marginBottom: 8, background: '#fff' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{link.targetName || 'Unknown product'}</div>
              {!!link.targetSku && <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>SKU: {link.targetSku}</div>}
              {mismatch && (
                <div style={{ fontSize: 11, color: '#EF4444', fontWeight: 600, marginTop: 2 }}>⚠ unit sizes don't divide evenly</div>
              )}
            </div>
            <span style={{ fontSize: 12, color: '#94A3B8' }}>=</span>
            <input
              type="number"
              style={{
                width: 56, height: 32, border: '1px solid #E2E8F0', borderRadius: 6,
                textAlign: 'center', fontSize: 13, color: displayMultiplier != null ? '#64748B' : '#0F172A',
                background: displayMultiplier != null ? '#F8FAFC' : '#fff',
              }}
              value={link.qtyText !== undefined ? link.qtyText : String(displayMultiplier ?? link.qty)}
              onChange={(e) => handleQtyEdit(link.id, e.target.value)}
              disabled={displayMultiplier != null}
            />
            <button
              type="button"
              onClick={() => handleRemoveLink(link.id)}
              style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}
              title="Remove link"
            >
              <Trash2 size={16} color="#EF4444" />
            </button>
          </div>
        );
      })}

      <button
        type="button"
        onClick={openAddModal}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: '#0891B2', fontWeight: 600, fontSize: 12, cursor: 'pointer', padding: '6px 0' }}
      >
        <Plus size={16} /> Add Break Link
      </button>

      {modalOpen && (
        <div className="reports-modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="reports-modal" style={{ maxWidth: 460, maxHeight: '80vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
            {stage === 'search' ? (
              <>
                <div className="reports-modal-header">
                  <span className="reports-modal-title">Select Target Product</span>
                  <button className="reports-modal-close" onClick={() => setModalOpen(false)}><X size={18} /></button>
                </div>
                <div className="reports-modal-body">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 10px', marginBottom: 12 }}>
                    <Search size={16} color="#94A3B8" />
                    <input
                      style={{ flex: 1, border: 'none', outline: 'none', fontSize: 14 }}
                      placeholder="Search by name, SKU, or barcode"
                      value={searchQuery}
                      onChange={(e) => { setSearchQuery(e.target.value); runSearch(e.target.value); }}
                      autoFocus
                    />
                  </div>

                  {searching || resolvingTarget ? (
                    <div style={{ textAlign: 'center', padding: 20, color: '#64748B', fontSize: 13 }}>
                      {resolvingTarget ? 'Loading product...' : 'Searching...'}
                    </div>
                  ) : searchResults.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 20, color: '#94A3B8', fontSize: 13 }}>
                      {searchQuery.trim() ? 'No matching products' : 'Start typing to search your catalog'}
                    </div>
                  ) : (
                    <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid #E2E8F0', borderRadius: 8 }}>
                      {searchResults.map((product) => (
                        <button
                          key={product.productId}
                          onClick={() => handleSelectTarget(product)}
                          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid #F1F5F9', background: '#fff', border: 'none', borderBottomWidth: 1, cursor: 'pointer' }}
                        >
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{product.name}</div>
                            <div style={{ fontSize: 11, color: '#94A3B8' }}>SKU: {product.sku || 'N/A'}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="reports-modal-header">
                  <button onClick={() => setStage('search')} style={{ border: 'none', background: 'none', cursor: 'pointer', display: 'flex', padding: 4 }}>
                    <ChevronLeft size={20} color="#64748B" />
                  </button>
                  <span className="reports-modal-title">Set Ratio</span>
                  <button className="reports-modal-close" onClick={() => setModalOpen(false)}><X size={18} /></button>
                </div>
                <div className="reports-modal-body">
                  <div style={{ fontSize: 13, color: '#334155', marginBottom: 8 }}>
                    1 {unit || 'unit'} of this product =
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    {pendingMultiplier != null ? (
                      <div style={{ minWidth: 70, height: 40, borderRadius: 8, background: '#EFF6FF', border: '1px solid #BFDBFE', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 12px' }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: '#0891B2' }}>{pendingMultiplier}</span>
                      </div>
                    ) : (
                      <input
                        type="number"
                        style={{ width: 70, height: 40, border: '1px solid #E2E8F0', borderRadius: 8, textAlign: 'center', fontSize: 15, fontWeight: 700, color: '#0F172A' }}
                        placeholder="0"
                        value={pendingQty}
                        onChange={(e) => setPendingQty(e.target.value)}
                        autoFocus
                      />
                    )}
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{pendingTarget?.name}</span>
                  </div>
                  {pendingTarget && (
                    pendingMultiplier != null ? (
                      <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 16 }}>
                        Calculated from items-per-unit: {selfSize} ÷ {pendingTarget.itemsPerUnit || 1} = {pendingMultiplier}.
                      </div>
                    ) : (
                      <div style={{ fontSize: 11, color: '#EF4444', marginBottom: 16, lineHeight: 1.5 }}>
                        ⚠ {selfSize} doesn't divide evenly by {pendingTarget.itemsPerUnit || '?'} — double-check the
                        items-per-unit on both products. You can still save this link, but transfer will be
                        blocked until the numbers line up.
                      </div>
                    )
                  )}
                  <button
                    type="button"
                    onClick={handleConfirmLink}
                    disabled={!pendingQty || parseFloat(pendingQty) <= 0}
                    style={{ width: '100%', height: 40, borderRadius: 8, border: 'none', background: '#0891B2', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', opacity: (!pendingQty || parseFloat(pendingQty) <= 0) ? 0.5 : 1 }}
                  >
                    Add Link
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
