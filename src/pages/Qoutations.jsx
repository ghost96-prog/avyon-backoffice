// src/pages/Quotations.jsx
//
// Quotations — a Sales document, deliberately standalone from stock and
// revenue (see quotationController.js on the backend for the full
// rationale). Flow:
//   1. Create a quotation: pick a customer, add catalog items and/or
//      "New Item Not In Catalog" line items, set a discount/tax/validity,
//      save as 'draft'. A not-in-catalog item is NOT a free-text line —
//      same pattern as GRV.jsx's "New Item Not In Catalog": the item gets
//      a real SKU (checked for availability live), category, unit and
//      pricing, and is submitted with isNewProduct/newProduct so the
//      backend creates it as an actual catalog product when the
//      quotation is saved — not just decoration on this one document.
//   2. "Send" flips it to 'sent' and opens a WhatsApp click-to-chat link
//      pre-filled with a summary, using the customer's saved number.
//   3. "Download PDF" generates a polished, branded quotation document
//      client-side (jsPDF + autoTable) that can be attached anywhere.
//   4. The owner marks it Accepted/Declined themselves as the customer
//      responds — this is informational only. There is intentionally NO
//      "convert to sale" step: when the customer actually buys, the
//      cashier just rings it up normally through the POS.
//   5. Quotations past their valid-until date are lazily flipped to
//      'expired' by the backend. History is never deleted — "Duplicate"
//      creates a fresh quote number from an old one instead of editing it.
//
// UI patterns (Toast, StatusPill, ModalSection, FieldLabel, IconInput,
// fieldInput, product pagination/search) are intentionally mirrored from
// PurchaseOrders.jsx so the two screens feel like the same product.

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  FileText, Plus, X, Search, ChevronLeft, Users, Send, Trash2, MessageCircle,
  Ban, Store, Package, Tag, DollarSign, Percent, Copy, Download, CheckCircle2,
  XCircle, Clock, User, Mail, Phone, MapPin, StickyNote, CalendarClock, Sparkles,
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useSelectedBranch } from '../hooks/useSelectedBranch';
import { formatMoney } from '../utils/exportUtils';
import ConfirmDialog from '../components/community/ConfirmDialog';
import '../styles/ReportsShared.css';

function fieldInput(props) {
  return { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 14, boxSizing: 'border-box', ...props };
}

function getCurrentStock(product) {
  return Number(product?.currentStock ?? product?.stock ?? product?.quantityOnHand ?? product?.qty ?? 0);
}

const RENDER_PAGE_SIZE = 60;
const SCROLL_LOAD_THRESHOLD_PX = 160;
const PRODUCTS_PAGE_SIZE = 250;

const formatPriceInput = (text) => {
  if (!text || text === '') return '0.00';
  const numericOnly = text.replace(/[^0-9]/g, '');
  if (!numericOnly) return '0.00';
  const cents = parseInt(numericOnly, 10);
  const dollars = Math.floor(cents / 100);
  const remainingCents = cents % 100;
  return `${dollars}.${remainingCents.toString().padStart(2, '0')}`;
};

const emptyCustomerDraft = { name: '', email: '', phone: '', address: '', notes: '' };
// ✅ Matches GRV.jsx's emptyNewItemDraft shape — a not-in-catalog item is a
// real product draft (name/sku/category/unit/pricing), not just a
// description + price. `quantity` is quote-only and isn't sent as part of
// the product creation payload.
const emptyCustomItemDraft = {
  name: '', sku: '', barcode: '', category: 'No Category', categoryId: 'no-category',
  unit: 'each', itemsPerUnit: '', description: '', lowStockThreshold: '0',
  sellingPrice: '0.00', costPrice: '0.00', quantity: '1',
};

// ── Small shared UI pieces (same look as PurchaseOrders.jsx) ────────────────

const ModalSection = ({ icon: Icon, title, children }) => (
  <div style={{ marginBottom: 20 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
      <div style={{ width: 22, height: 22, borderRadius: 6, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={12} color="#0891B2" />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{title}</span>
    </div>
    {children}
  </div>
);

const FieldLabel = ({ children, required }) => (
  <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>
    {children}{required && <span style={{ color: '#EF4444' }}> *</span>}
  </label>
);

const IconInput = ({ icon: Icon, ...props }) => (
  <div style={{ position: 'relative' }}>
    <Icon size={14} color="#94A3B8" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
    <input {...props} style={{ ...fieldInput(), paddingLeft: 34, ...(props.style || {}) }} />
  </div>
);

const Toast = ({ message, type, onClose }) => {
  const styles = {
    error: { bg: '#FEF2F2', border: '#FEE2E2', text: '#EF4444' },
    success: { bg: '#F0FDF4', border: '#DCFCE7', text: '#16A34A' },
    warning: { bg: '#FFFBEB', border: '#FDE68A', text: '#D97706' },
  };
  const style = styles[type] || styles.error;
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, [onClose]);
  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 1000, background: style.bg, border: `1px solid ${style.border}`, borderRadius: 8, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 8px 20px rgba(0,0,0,0.12)', maxWidth: 380 }}>
      <span style={{ color: style.text, fontSize: 14, fontWeight: 500 }}>{message}</span>
      <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: style.text, fontSize: 18, marginLeft: 'auto' }}>×</button>
    </div>
  );
};

const STATUS_CONFIG = {
  draft: { label: 'Draft', bg: '#F1F5F9', color: '#475569' },
  sent: { label: 'Sent', bg: '#EFF6FF', color: '#0891B2' },
  accepted: { label: 'Accepted', bg: '#F0FDF4', color: '#16A34A' },
  declined: { label: 'Declined', bg: '#FEF2F2', color: '#EF4444' },
  expired: { label: 'Expired', bg: '#FFF7ED', color: '#C2410C' },
  cancelled: { label: 'Cancelled', bg: '#F1F5F9', color: '#94A3B8' },
};

function StatusPill({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
  return (
    <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: cfg.bg, color: cfg.color }}>
      {cfg.label}
    </span>
  );
}

function BranchTag({ name }) {
  if (!name) return null;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#475569', background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 999, padding: '2px 8px' }}>
      <Store size={10} /> {name}
    </span>
  );
}

// Small inline "New Customer" modal — same visual language as PO's SupplierModal.
const CustomerModal = ({ draft, setDraft, saving, onCancel, onSave }) => (
  <div className="reports-modal-overlay" onClick={onCancel} style={{ background: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(2px)' }}>
    <div className="reports-modal" style={{ maxWidth: 460, borderRadius: 16, overflow: 'hidden', boxShadow: '0 24px 48px rgba(15,23,42,0.28)', border: '1px solid #EEF2F7' }} onClick={(e) => e.stopPropagation()}>
      <div style={{ padding: '20px 24px', background: 'linear-gradient(135deg, #0891B2 0%, #234C6A 100%)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Users size={18} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>New Customer</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.78)', marginTop: 2 }}>Save them so this quote is attached to their history</div>
          </div>
        </div>
        <button onClick={onCancel} style={{ width: 30, height: 30, borderRadius: 8, border: 'none', flexShrink: 0, background: 'rgba(255,255,255,0.16)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <X size={16} />
        </button>
      </div>
      <div className="reports-modal-body" style={{ padding: '22px 24px 24px' }}>
        <div style={{ marginBottom: 12 }}>
          <FieldLabel required>Name</FieldLabel>
          <IconInput icon={User} value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="e.g. ABC Hardware" autoFocus />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <div>
            <FieldLabel>Phone</FieldLabel>
            <IconInput icon={Phone} value={draft.phone} onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))} placeholder="e.g. 077..." />
          </div>
          <div>
            <FieldLabel>Email</FieldLabel>
            <IconInput icon={Mail} value={draft.email} onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))} placeholder="Optional" />
          </div>
        </div>
        <div style={{ marginBottom: 20 }}>
          <FieldLabel>Address</FieldLabel>
          <IconInput icon={MapPin} value={draft.address} onChange={(e) => setDraft((d) => ({ ...d, address: e.target.value }))} placeholder="Optional" />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} style={{ padding: '11px 18px', borderRadius: 10, border: '1px solid #E2E8F0', background: '#fff', color: '#64748B', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
          <button onClick={onSave} disabled={saving || !draft.name.trim()} style={{
            flex: 1, padding: '11px 18px', borderRadius: 10, border: 'none',
            background: draft.name.trim() ? 'linear-gradient(135deg, #0891B2 0%, #0E7490 100%)' : '#CBD5E1',
            color: '#fff', fontWeight: 700, fontSize: 13, cursor: draft.name.trim() ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            <Plus size={15} /> {saving ? 'Saving…' : 'Save Customer'}
          </button>
        </div>
      </div>
    </div>
  </div>
);

// "New Item Not In Catalog" modal — mirrors GRV.jsx's NewItemModal exactly:
// name, SKU (live availability check), barcode, category, unit, selling +
// cost price, low stock alert. The only addition is a Quantity field for
// this quote line. Adding this creates a real catalog product on save
// (via isNewProduct/newProduct in the payload), not a throwaway text line.
const CustomItemModal = ({ draft, setDraft, categories, currencySymbol, skuCheck, onCancel, onAdd }) => {
  const trimmedSku = draft.sku.trim();
  const skuIsCheckedValue = skuCheck.sku === trimmedSku;
  const skuTaken = skuIsCheckedValue && skuCheck.exists;
  const skuChecking = skuIsCheckedValue && skuCheck.checking;
  const canAdd = draft.name.trim().length > 0 && trimmedSku.length > 0 && !skuTaken && !skuChecking && Number(draft.quantity) > 0;

  return (
    <div className="reports-modal-overlay" onClick={onCancel} style={{ background: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(2px)' }}>
      <div className="reports-modal" style={{ maxWidth: 520, borderRadius: 16, overflow: 'hidden', boxShadow: '0 24px 48px rgba(15,23,42,0.28)', border: '1px solid #EEF2F7' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '20px 24px', background: 'linear-gradient(135deg, #0891B2 0%, #234C6A 100%)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Sparkles size={18} color="#fff" />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>New Item</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.78)', marginTop: 2 }}>Not in your catalog yet — this adds it to the quote</div>
            </div>
          </div>
          <button onClick={onCancel} style={{ width: 30, height: 30, borderRadius: 8, border: 'none', flexShrink: 0, background: 'rgba(255,255,255,0.16)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={16} />
          </button>
        </div>
        <div className="reports-modal-body" style={{ padding: '22px 24px 24px' }}>
          <ModalSection icon={Tag} title="Basic Info">
            <div style={{ marginBottom: 10 }}>
              <FieldLabel required>Product Name</FieldLabel>
              <IconInput icon={Package} value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="e.g. Installation Labour" autoFocus />
            </div>
          
          </ModalSection>

          <ModalSection icon={Package} title="Organization">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <FieldLabel>Category</FieldLabel>
                <select
                  style={fieldInput()}
                  value={draft.categoryId}
                  onChange={(e) => {
                    const cat = categories.find((c) => c.categoryId === e.target.value);
                    setDraft((d) => ({ ...d, categoryId: e.target.value, category: cat?.name || 'No Category' }));
                  }}
                >
                  <option value="no-category">No Category</option>
                  {categories.filter((c) => c.categoryId !== 'no-category').map((c) => (
                    <option key={c.categoryId} value={c.categoryId}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <FieldLabel>Unit</FieldLabel>
                <select style={fieldInput()} value={draft.unit} onChange={(e) => setDraft((d) => ({ ...d, unit: e.target.value }))}>
                  <option value="each">Each</option>
                  <option value="kg">Kilogram (kg)</option>
                  <option value="meter">Meter (m)</option>
                  <option value="box">Box</option>
                  <option value="pack">Pack</option>
                </select>
              </div>
            </div>
          </ModalSection>

          <ModalSection icon={DollarSign} title="Pricing">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <FieldLabel required>Selling Price</FieldLabel>
                <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'hidden' }}>
                  <span style={{ padding: '8px 12px', background: '#F8FAFC', borderRight: '1px solid #E2E8F0', fontSize: 14, fontWeight: 600, color: '#475569', minWidth: 30, textAlign: 'center' }}>{currencySymbol}</span>
                  <input style={{ ...fieldInput(), border: 'none', borderRadius: 0, flex: 1 }} value={draft.sellingPrice} onChange={(e) => setDraft((d) => ({ ...d, sellingPrice: formatPriceInput(e.target.value) }))} placeholder="0.00" />
                </div>
              </div>
              <div>
                <FieldLabel>Cost Price</FieldLabel>
                <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'hidden' }}>
                  <span style={{ padding: '8px 12px', background: '#F8FAFC', borderRight: '1px solid #E2E8F0', fontSize: 14, fontWeight: 600, color: '#475569', minWidth: 30, textAlign: 'center' }}>{currencySymbol}</span>
                  <input style={{ ...fieldInput(), border: 'none', borderRadius: 0, flex: 1 }} value={draft.costPrice} onChange={(e) => setDraft((d) => ({ ...d, costPrice: formatPriceInput(e.target.value) }))} placeholder="0.00" />
                </div>
              </div>
            </div>
          </ModalSection>
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <FieldLabel required>SKU</FieldLabel>
                <IconInput
                  icon={Tag}
                  value={draft.sku}
                  onChange={(e) => setDraft((d) => ({ ...d, sku: e.target.value }))}
                  placeholder="Auto-generated"
                  style={skuTaken ? { borderColor: '#EF4444' } : undefined}
                />
                {trimmedSku && (
                  <div style={{ fontSize: 11, marginTop: 4, fontWeight: 600 }}>
                    {skuChecking ? (
                      <span style={{ color: '#94A3B8' }}>Checking availability…</span>
                    ) : skuTaken ? (
                      <span style={{ color: '#EF4444' }}>This SKU already exists — use a different one</span>
                    ) : skuIsCheckedValue ? (
                      <span style={{ color: '#16A34A' }}>SKU available</span>
                    ) : null}
                  </div>
                )}
              </div>
              <div>
                <FieldLabel>Barcode</FieldLabel>
                <IconInput icon={Tag} value={draft.barcode} onChange={(e) => setDraft((d) => ({ ...d, barcode: e.target.value }))} placeholder="Optional" />
              </div>
            </div>
          <ModalSection icon={Package} title="For This Quote">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <FieldLabel required>Quantity</FieldLabel>
                <IconInput icon={Package} type="number" min="1" value={draft.quantity} onChange={(e) => setDraft((d) => ({ ...d, quantity: e.target.value }))} />
              </div>
              <div>
                <FieldLabel>Low Stock Alert</FieldLabel>
                <IconInput icon={Package} type="number" min="0" value={draft.lowStockThreshold} onChange={(e) => setDraft((d) => ({ ...d, lowStockThreshold: e.target.value }))} placeholder="0" />
              </div>
            </div>
          </ModalSection>

          <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
            <button onClick={onCancel} style={{ padding: '11px 18px', borderRadius: 10, border: '1px solid #E2E8F0', background: '#fff', color: '#64748B', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
            <button
              onClick={onAdd}
              disabled={!canAdd}
              title={skuTaken ? 'This SKU already exists — choose a different one' : undefined}
              style={{
                flex: 1, padding: '11px 18px', borderRadius: 10, border: 'none',
                background: canAdd ? 'linear-gradient(135deg, #0891B2 0%, #0E7490 100%)' : '#CBD5E1',
                color: '#fff', fontWeight: 700, fontSize: 13, cursor: canAdd ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              <Plus size={15} /> Add to Quote
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── PDF export — a polished, branded quotation document ─────────────────────
async function exportQuotationPdf({ quotation, business, baseCurrency }) {
  const { jsPDF } = await import('jspdf');
  const autoTableModule = await import('jspdf-autotable');
  const autoTable = autoTableModule.default || autoTableModule;

  const q = quotation;
  const symbol = baseCurrency?.symbol || '$';
  const money = (n) => `${symbol}${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtDate = (ts) => (ts ? new Date(ts).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

  const doc = new jsPDF('portrait', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 16;

  const INK = '#0F172A';
  const SLATE = '#64748B';
  const TEAL = '#0891B2';
  const TEAL_DARK = '#234C6A';
  const LIGHT = '#F1F5F9';
  const BORDER = '#E2E8F0';

  // ── Header band ────────────────────────────────────────────────────────
  const bandHeight = 40;
  doc.setFillColor(TEAL_DARK);
  doc.rect(0, 0, pageWidth, bandHeight, 'F');
  // Accent stripe for a little depth, since jsPDF has no real gradients.
  doc.setFillColor(TEAL);
  doc.rect(0, bandHeight - 3, pageWidth, 3, 'F');

  doc.setTextColor('#FFFFFF');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text(business?.businessName || 'Your Business', margin, 16);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  // jsPDF's setTextColor cannot parse rgba()/css color strings — it only
  // accepts hex, named colors, or (r,g,b) numeric triples. Use an explicit
  // light teal-tinted RGB to approximate "white at 85% opacity" on the
  // dark teal band instead.
  doc.setTextColor(214, 233, 240);
  const contactBits = [business?.email, business?.phoneNumber, baseCurrency?.code].filter(Boolean);
  if (contactBits.length) doc.text(contactBits.join('   •   '), margin, 23);
  if (q.branchName) doc.text(`Store: ${q.branchName}`, margin, 29);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor('#FFFFFF');
  doc.text('QUOTATION', pageWidth - margin, 16, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(q.quoteNumber || '', pageWidth - margin, 23, { align: 'right' });

  const statusLabel = (STATUS_CONFIG[q.status]?.label || q.status || '').toUpperCase();
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(statusLabel, pageWidth - margin, 30, { align: 'right' });

  // ── Info boxes: Quotation For / Quotation Details ────────────────────────
  let y = bandHeight + 10;
  const colWidth = (pageWidth - margin * 2 - 8) / 2;

  const boxTop = y;
  const boxHeight = 32;
  doc.setDrawColor(BORDER);
  doc.setFillColor('#FAFBFC');
  doc.roundedRect(margin, boxTop, colWidth, boxHeight, 2, 2, 'FD');
  doc.roundedRect(margin + colWidth + 8, boxTop, colWidth, boxHeight, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(TEAL);
  doc.text('QUOTATION FOR', margin + 6, boxTop + 7);
  doc.text('QUOTATION DETAILS', margin + colWidth + 14, boxTop + 7);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(INK);
  doc.text(q.customerName || 'Walk-in Customer', margin + 6, boxTop + 14);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(SLATE);
  let custLineY = boxTop + 20;
  if (q.customerPhone) { doc.text(q.customerPhone, margin + 6, custLineY); custLineY += 5.5; }
  if (q.customerEmail) { doc.text(q.customerEmail, margin + 6, custLineY); }

  const detailLine = (label, value, dy) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(SLATE);
    doc.text(label, margin + colWidth + 14, boxTop + dy);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(INK);
    doc.text(String(value), margin + colWidth + 8 + colWidth - 6, boxTop + dy, { align: 'right' });
  };
  detailLine('Date Issued', fmtDate(q.issueDate || q.createdAt), 14);
  detailLine('Valid Until', fmtDate(q.validUntil), 20.5);
  detailLine('Quote #', q.quoteNumber, 27);

  y = boxTop + boxHeight + 10;

  // ── Items table ───────────────────────────────────────────────────────
  const rows = (q.items || []).map((it) => [
    it.productName + (it.isCustom ? '  (custom)' : ''),
    String(it.quantity) + (it.unit && it.unit !== 'each' ? ` ${it.unit}` : ''),
    money(it.unitPrice),
    it.discountPercent ? `${it.discountPercent}%` : '—',
    money(it.lineTotal),
  ]);

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Item', 'Qty', 'Unit Price', 'Disc.', 'Total']],
    body: rows,
    styles: { fontSize: 9.5, cellPadding: 4, textColor: INK, lineColor: BORDER, lineWidth: 0.1 },
    headStyles: { fillColor: TEAL_DARK, textColor: '#FFFFFF', fontStyle: 'bold', fontSize: 9 },
    alternateRowStyles: { fillColor: '#F8FAFC' },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 22, halign: 'center' },
      2: { cellWidth: 28, halign: 'right' },
      3: { cellWidth: 18, halign: 'right' },
      4: { cellWidth: 28, halign: 'right' },
    },
  });

  let finalY = doc.lastAutoTable?.finalY || y + 20;

  // ── Totals box ────────────────────────────────────────────────────────
  const totalsWidth = 78;
  const totalsX = pageWidth - margin - totalsWidth;
  let ty = finalY + 8;

  const totalsLine = (label, value, opts = {}) => {
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    doc.setFontSize(opts.big ? 12 : 9.5);
    doc.setTextColor(opts.color || (opts.bold ? INK : SLATE));
    doc.text(label, totalsX, ty);
    doc.text(value, pageWidth - margin, ty, { align: 'right' });
    ty += opts.big ? 8 : 6.5;
  };

  totalsLine('Subtotal', money(q.subtotal));
  if (q.discountTotal) {
    const label = q.discountType === 'percent' ? `Discount (${q.discountValue}%)` : 'Discount';
    totalsLine(label, `-${money(q.discountTotal)}`, { color: '#D97706' });
  }
  if (q.taxTotal) totalsLine(`Tax (${q.taxPercent}%)`, money(q.taxTotal));

  doc.setDrawColor(BORDER);
  doc.line(totalsX, ty - 3, pageWidth - margin, ty - 3);
  ty += 2;

  doc.setFillColor(TEAL_DARK);
  doc.roundedRect(totalsX - 4, ty - 6, totalsWidth + 4, 12, 2, 2, 'F');
  doc.setTextColor('#FFFFFF');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('TOTAL', totalsX, ty + 1.5);
  doc.text(money(q.total), pageWidth - margin, ty + 1.5, { align: 'right' });
  ty += 14;

  // ── Notes & Terms ─────────────────────────────────────────────────────
  let noteY = Math.max(ty + 6, finalY + 40);
  const writeBlock = (title, text) => {
    if (!text) return;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(TEAL);
    doc.text(title, margin, noteY);
    noteY += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(SLATE);
    const lines = doc.splitTextToSize(text, pageWidth - margin * 2);
    doc.text(lines, margin, noteY);
    noteY += lines.length * 4.6 + 6;
  };
  writeBlock('Notes', q.notes);
  writeBlock('Terms & Conditions', q.terms);

  // ── Footer ────────────────────────────────────────────────────────────
  doc.setDrawColor(BORDER);
  doc.line(margin, pageHeight - 18, pageWidth - margin, pageHeight - 18);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(10);
  doc.setTextColor(TEAL_DARK);
  doc.text('Thank you for your business.', pageWidth / 2, pageHeight - 12, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor('#94A3B8');
  doc.text(`Generated ${new Date().toLocaleDateString()} · This quotation is not a tax invoice.`, pageWidth / 2, pageHeight - 7, { align: 'center' });

  doc.save(`quotation_${q.quoteNumber}.pdf`);
}

// ═══════════════════════════════════════════════════════════════════════════

export default function Quotations() {
  const { apiFetch, businessId, activeStaff, userProfile, baseCurrency, branches } = useAppContext();
  const { selectedBranchId, setSelectedBranchId } = useSelectedBranch({ allowAll: true });
  const staffId = activeStaff?.staffId || userProfile?.uid;
  const staffName = activeStaff?.name || userProfile?.name || 'Owner';

  const [view, setView] = useState('list');
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [toast, setToast] = useState(null);
  const showToast = (message, type = 'error') => setToast({ message, type });

  const [business, setBusiness] = useState(null);

  const [storePopoverOpen, setStorePopoverOpen] = useState(false);
  useEffect(() => {
    if (!selectedBranchId && branches?.length) setSelectedBranchId(branches[0].branchId);
  }, [branches, selectedBranchId]);
  const selectedBranchName = branches?.find((b) => b.branchId === selectedBranchId)?.name || 'Select Store';

  useEffect(() => {
    if (!businessId) return;
    apiFetch(`/business/${businessId}`).then(setBusiness).catch(() => {});
  }, [apiFetch, businessId]);

  const fetchQuotes = useCallback(async () => {
    if (!businessId || !selectedBranchId) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/business/${businessId}/branches/${selectedBranchId}/quotations`);
      setQuotes(res.data || []);
    } catch (e) {
      showToast(e.message || 'Failed to load quotations', 'error');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, businessId, selectedBranchId]);

  useEffect(() => { fetchQuotes(); }, [fetchQuotes]);

  const filtered = useMemo(() => {
    let result = quotes;
    if (statusFilter !== 'all') result = result.filter((q) => q.status === statusFilter);
    if (searchQuery.trim()) {
      const s = searchQuery.trim().toLowerCase();
      result = result.filter((q) => q.quoteNumber?.toLowerCase().includes(s) || q.customerName?.toLowerCase().includes(s));
    }
    return result;
  }, [quotes, statusFilter, searchQuery]);

  const summary = useMemo(() => {
    const s = { draft: 0, sent: 0, accepted: 0, declined: 0, acceptedValue: 0, awaitingValue: 0, expiringSoon: 0 };
    const soon = Date.now() + 3 * 24 * 60 * 60 * 1000;
    for (const q of quotes) {
      if (q.status === 'draft') s.draft++;
      if (q.status === 'sent') { s.sent++; s.awaitingValue += Number(q.total) || 0; }
      if (q.status === 'accepted') { s.accepted++; s.acceptedValue += Number(q.total) || 0; }
      if (q.status === 'declined') s.declined++;
      if (q.status === 'sent' && q.validUntil && q.validUntil < soon && q.validUntil > Date.now()) s.expiringSoon++;
    }
    return s;
  }, [quotes]);

  // ── Customers ─────────────────────────────────────────────────────────
  const [customers, setCustomers] = useState([]);
  const fetchCustomers = useCallback(async () => {
    if (!businessId || !selectedBranchId) return;
    try {
      const res = await apiFetch(`/business/${businessId}/branches/${selectedBranchId}/customers`);
      setCustomers(res.data || []);
    } catch (e) {
      showToast(e.message || 'Failed to load customers', 'error');
    }
  }, [apiFetch, businessId, selectedBranchId]);

  // ── Categories (for "New Item Not In Catalog") ───────────────────────
  const [categories, setCategories] = useState([]);
  const fetchCategories = useCallback(async () => {
    if (!businessId || !selectedBranchId) return;
    try {
      const res = await apiFetch(`/business/${businessId}/branches/${selectedBranchId}/categories`);
      const arr = Array.isArray(res) ? [...res] : [];
      if (!arr.some((c) => c.categoryId === 'no-category')) arr.unshift({ categoryId: 'no-category', name: 'No Category' });
      setCategories(arr);
    } catch (e) {
      console.error('Load categories error:', e);
      setCategories([{ categoryId: 'no-category', name: 'No Category' }]);
    }
  }, [apiFetch, businessId, selectedBranchId]);

  // ── Products ──────────────────────────────────────────────────────────
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsLoadedCount, setProductsLoadedCount] = useState(0);
  const [productSearch, setProductSearch] = useState('');
  const [visibleProductCount, setVisibleProductCount] = useState(RENDER_PAGE_SIZE);

  const fetchProducts = useCallback(async () => {
    if (!businessId || !selectedBranchId) return;
    setProductsLoading(true);
    setProductsLoadedCount(0);
    setProducts([]);
    try {
      let cursor = null;
      let hasMore = true;
      let accumulated = [];
      while (hasMore) {
        const params = new URLSearchParams({ status: 'active', limit: String(PRODUCTS_PAGE_SIZE) });
        if (cursor) params.append('cursor', cursor);
        const res = await apiFetch(`/business/${businessId}/branches/${selectedBranchId}/products?${params.toString()}`);
        accumulated = accumulated.concat(res.products || []);
        hasMore = !!res.hasMore;
        cursor = res.nextCursor || null;
        setProducts([...accumulated].sort((a, b) => (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase())));
        setProductsLoadedCount(accumulated.length);
        if (!cursor) break;
      }
    } catch (e) {
      showToast(e.message || 'Failed to load products', 'error');
    } finally {
      setProductsLoading(false);
    }
  }, [apiFetch, businessId, selectedBranchId]);

  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return products;
    const q = productSearch.trim().toLowerCase();
    return products.filter((p) => (p.name || '').toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q));
  }, [products, productSearch]);

  useEffect(() => { setVisibleProductCount(RENDER_PAGE_SIZE); }, [productSearch]);
  const renderedProducts = useMemo(() => filteredProducts.slice(0, visibleProductCount), [filteredProducts, visibleProductCount]);

  const handleProductListScroll = useCallback((e) => {
    const el = e.currentTarget;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom < SCROLL_LOAD_THRESHOLD_PX) {
      setVisibleProductCount((prev) => (prev >= filteredProducts.length ? prev : Math.min(prev + RENDER_PAGE_SIZE, filteredProducts.length)));
    }
  }, [filteredProducts.length]);

  // ── Create / edit flow state ─────────────────────────────────────────
  const [editingQuotationId, setEditingQuotationId] = useState(null);
  const [customerId, setCustomerId] = useState('');
  const [cart, setCart] = useState({});
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [newCustomerDraft, setNewCustomerDraft] = useState(emptyCustomerDraft);
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [customItemModalOpen, setCustomItemModalOpen] = useState(false);
  const [customItemDraft, setCustomItemDraft] = useState(emptyCustomItemDraft);
  // ✅ Same SKU-availability pattern as GRV.jsx's NewItemModal.
  const [skuCheck, setSkuCheck] = useState({ sku: '', checking: false, exists: false });
  const skuCheckTimerRef = useRef(null);
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState('50% deposit required before work begins.');
  const [validityDays, setValidityDays] = useState('7');
  const [discountType, setDiscountType] = useState('amount');
  const [discountValue, setDiscountValue] = useState('0');
  const [taxPercent, setTaxPercent] = useState('0');
  const [creating, setCreating] = useState(false);

  const cartItems = useMemo(() => Object.values(cart), [cart]);
  const currencySymbol = baseCurrency?.symbol || '$';

  // ✅ Same debounced SKU-availability check as GRV.jsx's NewItemModal, plus
  // a check against SKUs already staged in this quote's own cart.
  useEffect(() => {
    if (!customItemModalOpen) return;
    const sku = customItemDraft.sku.trim();
    if (!sku) { setSkuCheck({ sku: '', checking: false, exists: false }); return; }

    if (skuCheckTimerRef.current) clearTimeout(skuCheckTimerRef.current);

    const takenInCart = cartItems.some((it) => (it.sku || '').trim().toUpperCase() === sku.toUpperCase());
    if (takenInCart) { setSkuCheck({ sku, checking: false, exists: true }); return; }

    setSkuCheck((prev) => ({ ...prev, sku, checking: true }));
    skuCheckTimerRef.current = setTimeout(async () => {
      try {
        const res = await apiFetch(`/business/${businessId}/branches/${selectedBranchId}/products/sku-check?sku=${encodeURIComponent(sku)}`);
        setSkuCheck({ sku, checking: false, exists: !!res?.exists });
      } catch (e) {
        console.error('SKU check error:', e);
        setSkuCheck({ sku, checking: false, exists: false });
      }
    }, 400);

    return () => { if (skuCheckTimerRef.current) clearTimeout(skuCheckTimerRef.current); };
  }, [customItemDraft.sku, customItemModalOpen, apiFetch, businessId, selectedBranchId, cartItems]);

  const openCustomItemModal = useCallback(async () => {
    let newSku = '';
    try {
      const res = await apiFetch(`/business/${businessId}/branches/${selectedBranchId}/products/next-sku`);
      newSku = res.sku;
    } catch (e) {
      console.error('Error generating SKU:', e);
      newSku = String(Date.now()).slice(-6);
    }
    setCustomItemDraft({ ...emptyCustomItemDraft, sku: newSku });
    setSkuCheck({ sku: '', checking: false, exists: false });
    setCustomItemModalOpen(true);
  }, [apiFetch, businessId, selectedBranchId]);

  const cartSubtotal = useMemo(() => cartItems.reduce((sum, it) => {
    const gross = (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0);
    const disc = gross * ((Number(it.discountPercent) || 0) / 100);
    return sum + (gross - disc);
  }, 0), [cartItems]);

  const cartTotals = useMemo(() => {
    const dVal = Number(discountValue) || 0;
    const discountTotal = discountType === 'percent'
      ? cartSubtotal * (Math.min(100, Math.max(0, dVal)) / 100)
      : Math.min(dVal, cartSubtotal);
    const afterDiscount = Math.max(0, cartSubtotal - discountTotal);
    const tRate = Math.min(100, Math.max(0, Number(taxPercent) || 0));
    const taxTotal = afterDiscount * (tRate / 100);
    const total = afterDiscount + taxTotal;
    return { discountTotal, taxTotal, total };
  }, [cartSubtotal, discountType, discountValue, taxPercent]);

  const resetCreateFlow = () => {
    setEditingQuotationId(null);
    setCustomerId('');
    setCart({});
    setProductSearch('');
    setVisibleProductCount(RENDER_PAGE_SIZE);
    setNotes('');
    setTerms('50% deposit required before work begins.');
    setValidityDays('7');
    setDiscountType('amount');
    setDiscountValue('0');
    setTaxPercent('0');
  };

  const openCreateFlow = () => {
    resetCreateFlow();
    fetchCustomers();
    fetchProducts();
    fetchCategories();
    setView('create');
  };

  const openEditFlow = (q) => {
    setEditingQuotationId(q.quotationId);
    setCustomerId(q.customerId || '');
    const cartFromItems = {};
    (q.items || []).forEach((it, i) => {
      const key = it.isCustom ? `c:${i}` : it.productId;
      cartFromItems[key] = {
        key, productId: it.productId, sku: it.sku, productName: it.productName,
        unit: it.unit || 'each', quantity: it.quantity, unitPrice: Number(it.unitPrice).toFixed(2),
        discountPercent: it.discountPercent || 0, isCustom: !!it.isCustom,
      };
    });
    setCart(cartFromItems);
    setNotes(q.notes || '');
    setTerms(q.terms || '');
    setValidityDays(String(q.validityDays || 7));
    setDiscountType(q.discountType || 'amount');
    setDiscountValue(String(q.discountValue || 0));
    setTaxPercent(String(q.taxPercent || 0));
    setProductSearch('');
    fetchCustomers();
    fetchProducts();
    fetchCategories();
    setView('create');
  };

  const addProductToCart = (product) => {
    setCart((prev) => ({
      ...prev,
      [product.productId]: {
        key: product.productId, productId: product.productId, sku: product.sku,
        productName: product.name, unit: product.unit || 'each',
        quantity: 1, unitPrice: Number(product.sellingPrice ?? product.price ?? 0).toFixed(2),
        discountPercent: 0, isCustom: false,
      },
    }));
  };

  const addCustomItemToCart = () => {
    const name = customItemDraft.name.trim();
    const sku = customItemDraft.sku.trim();
    if (!name) return showToast('Product name is required', 'error');
    if (!sku) return showToast('SKU is required', 'error');
    if ((skuCheck.sku === sku && skuCheck.exists) || (skuCheck.sku === sku && skuCheck.checking)) {
      return showToast(`SKU "${sku.toUpperCase()}" already exists — please use a different SKU`, 'error');
    }
    const key = `c:${sku.toUpperCase()}`;
    if (cart[key]) return showToast('This item is already in the quote', 'error');
    setCart((prev) => ({
      ...prev,
      [key]: {
        key, productId: null, sku: sku.toUpperCase(), productName: name,
        unit: customItemDraft.unit || 'each', quantity: Number(customItemDraft.quantity) || 1,
        unitPrice: customItemDraft.sellingPrice || '0.00', discountPercent: 0, isCustom: true,
        // ✅ Same shape as GRV.jsx's newProduct payload — lets the backend
        // create this as a real catalog product when the quotation saves,
        // instead of just a text line that only lives on this document.
        newProduct: {
          sku: sku.toUpperCase(), name, category: customItemDraft.category,
          categoryId: customItemDraft.categoryId, unit: customItemDraft.unit || 'each',
          itemsPerUnit: customItemDraft.itemsPerUnit ? Number(customItemDraft.itemsPerUnit) : 1,
          barcode: customItemDraft.barcode || null, description: customItemDraft.description || null,
          lowStockThreshold: Number(customItemDraft.lowStockThreshold) || 0,
          sellingPrice: Number(customItemDraft.sellingPrice) || 0,
          costPrice: Number(customItemDraft.costPrice) || 0,
        },
      },
    }));
    setCustomItemModalOpen(false);
    setCustomItemDraft(emptyCustomItemDraft);
    setSkuCheck({ sku: '', checking: false, exists: false });
  };

  const updateCartField = (key, field, value) => setCart((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  const removeFromCart = (key) => setCart((prev) => { const n = { ...prev }; delete n[key]; return n; });

  const saveCustomerInline = async () => {
    if (!newCustomerDraft.name.trim()) return showToast('Customer name is required', 'error');
    setSavingCustomer(true);
    try {
      const res = await apiFetch(`/business/${businessId}/branches/${selectedBranchId}/customers`, {
        method: 'POST', body: JSON.stringify({ ...newCustomerDraft, posId: 'web-dashboard', staffId }),
      });
      showToast('Customer added', 'success');
      setCustomerModalOpen(false);
      await fetchCustomers();
      setCustomerId(res.customerId);
    } catch (e) {
      showToast(e.message || 'Failed to add customer', 'error');
    } finally {
      setSavingCustomer(false);
    }
  };

  const saveQuotation = async () => {
    if (!customerId) return showToast('Select a customer first', 'error');
    if (cartItems.length === 0) return showToast('Add at least one item', 'error');
    setCreating(true);
    try {
      const items = cartItems.map((it) => ({
        productId: it.productId, isCustom: it.isCustom,
        // ✅ Mirrors GRV.jsx: a not-in-catalog item carries isNewProduct +
        // its full newProduct draft so the backend creates the actual
        // catalog product as part of saving this quotation.
        isNewProduct: it.isCustom,
        newProduct: it.isCustom ? it.newProduct : undefined,
        sku: it.sku, productName: it.productName,
        unit: it.unit, quantity: Number(it.quantity) || 0, unitPrice: Number(it.unitPrice) || 0,
        discountPercent: Number(it.discountPercent) || 0,
      }));
      const body = {
        customerId, items, notes: notes.trim() || null, terms: terms.trim() || null,
        validityDays: Number(validityDays) || 7, discountType, discountValue: Number(discountValue) || 0,
        taxPercent: Number(taxPercent) || 0, currency: baseCurrency?.code || null, staffId, staffName,
      };
      if (editingQuotationId) {
        await apiFetch(`/business/${businessId}/branches/${selectedBranchId}/quotations/${editingQuotationId}`, {
          method: 'PUT', body: JSON.stringify(body),
        });
        showToast('Quotation updated', 'success');
      } else {
        await apiFetch(`/business/${businessId}/branches/${selectedBranchId}/quotations`, {
          method: 'POST', body: JSON.stringify(body),
        });
        showToast('Quotation created', 'success');
      }
      setView('list');
      fetchQuotes();
    } catch (e) {
      showToast(e.message || 'Failed to save quotation', 'error');
    } finally {
      setCreating(false);
    }
  };

  // ── Detail / actions ──────────────────────────────────────────────────
  const [selectedQuote, setSelectedQuote] = useState(null);
  const [sending, setSending] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [cancelPending, setCancelPending] = useState(null);
  const [declinePending, setDeclinePending] = useState(null);
  const [deletePending, setDeletePending] = useState(null);

  const openDetail = async (q) => {
    setSelectedQuote(q);
    setView('detail');
    try {
      const full = await apiFetch(`/business/${businessId}/branches/${selectedBranchId}/quotations/${q.quotationId}`);
      setSelectedQuote(full);
    } catch (e) {
      showToast(e.message || 'Failed to load quotation', 'error');
    }
  };

  const refreshDetail = async (quotationId) => {
    try {
      const full = await apiFetch(`/business/${businessId}/branches/${selectedBranchId}/quotations/${quotationId}`);
      setSelectedQuote(full);
    } catch { /* non-fatal */ }
  };

  const sendQuote = async () => {
    setSending(true);
    try {
      const res = await apiFetch(`/business/${businessId}/branches/${selectedBranchId}/quotations/${selectedQuote.quotationId}/send`, {
        method: 'POST', body: JSON.stringify({ staffId, businessName: business?.businessName }),
      });
      if (res.whatsappLink) {
        window.open(res.whatsappLink, '_blank', 'noopener,noreferrer');
        showToast('Quotation sent — opening WhatsApp', 'success');
      } else {
        showToast('Quotation marked as sent — no phone number on file for WhatsApp', 'warning');
      }
      refreshDetail(selectedQuote.quotationId);
      fetchQuotes();
    } catch (e) {
      showToast(e.message || 'Failed to send quotation', 'error');
    } finally {
      setSending(false);
    }
  };

  const downloadPdf = async (q) => {
    setExportingPdf(true);
    try {
      await exportQuotationPdf({ quotation: q, business, baseCurrency });
    } catch (e) {
      console.error('PDF export error:', e);
      showToast('Could not generate the PDF', 'error');
    } finally {
      setExportingPdf(false);
    }
  };

  const markAccepted = async () => {
    try {
      await apiFetch(`/business/${businessId}/branches/${selectedBranchId}/quotations/${selectedQuote.quotationId}/accept`, {
        method: 'POST', body: JSON.stringify({ staffId }),
      });
      showToast('Marked as accepted', 'success');
      refreshDetail(selectedQuote.quotationId);
      fetchQuotes();
    } catch (e) {
      showToast(e.message || 'Failed to update', 'error');
    }
  };

  const markDeclined = async () => {
    if (!declinePending) return;
    try {
      await apiFetch(`/business/${businessId}/branches/${selectedBranchId}/quotations/${declinePending.quotationId}/decline`, {
        method: 'POST', body: JSON.stringify({ staffId }),
      });
      showToast('Marked as declined', 'success');
      setDeclinePending(null);
      refreshDetail(declinePending.quotationId);
      fetchQuotes();
    } catch (e) {
      showToast(e.message || 'Failed to update', 'error');
      setDeclinePending(null);
    }
  };

  const cancelQuote = async () => {
    if (!cancelPending) return;
    try {
      await apiFetch(`/business/${businessId}/branches/${selectedBranchId}/quotations/${cancelPending.quotationId}/cancel`, {
        method: 'POST', body: JSON.stringify({ staffId }),
      });
      showToast('Quotation cancelled', 'success');
      setCancelPending(null);
      refreshDetail(cancelPending.quotationId);
      fetchQuotes();
    } catch (e) {
      showToast(e.message || 'Failed to cancel', 'error');
      setCancelPending(null);
    }
  };

  const deleteQuote = async () => {
    if (!deletePending) return;
    try {
      await apiFetch(`/business/${businessId}/branches/${selectedBranchId}/quotations/${deletePending.quotationId}`, { method: 'DELETE' });
      showToast('Draft deleted', 'success');
      setDeletePending(null);
      setView('list');
      fetchQuotes();
    } catch (e) {
      showToast(e.message || 'Failed to delete', 'error');
      setDeletePending(null);
    }
  };

  const duplicateQuote = async (q) => {
    try {
      const res = await apiFetch(`/business/${businessId}/branches/${selectedBranchId}/quotations/${q.quotationId}/duplicate`, {
        method: 'POST', body: JSON.stringify({ staffId, staffName }),
      });
      showToast(`Duplicated as ${res.quoteNumber}`, 'success');
      fetchQuotes();
      openDetail({ quotationId: res.quotationId });
    } catch (e) {
      showToast(e.message || 'Failed to duplicate', 'error');
    }
  };

  const renderStoreSelector = () => (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setStorePopoverOpen((v) => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', color: '#475569', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
      >
        <Store size={14} /> <span>{selectedBranchName}</span>
      </button>
      {storePopoverOpen && (
        <div className="reports-filter-popover" style={{ right: 0, left: 'auto', top: '110%', position: 'absolute', zIndex: 20 }}>
          {(branches || []).map((b) => (
            <button
              key={b.branchId}
              className={`reports-filter-option ${selectedBranchId === b.branchId ? 'is-active' : ''}`}
              onClick={() => { setSelectedBranchId(b.branchId); setStorePopoverOpen(false); }}
            >
              {b.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  // ── CREATE / EDIT VIEW ────────────────────────────────────────────────
  if (view === 'create') {
    return (
      <div className="reports-page">
        {toast && <Toast {...toast} onClose={() => setToast(null)} />}
        <div className="reports-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="reports-header-back" onClick={() => setView('list')}><ChevronLeft size={18} /></button>
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: 0, fontSize: 20 }}>{editingQuotationId ? 'Edit Quotation' : 'New Quotation'}</h1>
            <div style={{ fontSize: 13, color: '#64748B' }}>For {selectedBranchName}</div>
          </div>
          {renderStoreSelector()}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20, marginTop: 20, alignItems: 'start' }}>
          <div>
            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 8 }}>Customer *</label>
              <div style={{ display: 'flex', gap: 10 }}>
                <select style={fieldInput()} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                  <option value="">Select a customer…</option>
                  {customers.map((c) => <option key={c.customerId} value={c.customerId}>{c.name}</option>)}
                </select>
                <button
                  onClick={() => { setNewCustomerDraft(emptyCustomerDraft); setCustomerModalOpen(true); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  <Plus size={14} /> New Customer
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 16 }}>
                <div>
                  <FieldLabel>Valid For (days)</FieldLabel>
                  <IconInput icon={CalendarClock} type="number" min="1" value={validityDays} onChange={(e) => setValidityDays(e.target.value)} />
                </div>
                <div>
                  <FieldLabel>Discount</FieldLabel>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <select style={fieldInput({ width: 78 })} value={discountType} onChange={(e) => setDiscountType(e.target.value)}>
                      <option value="amount">{currencySymbol}</option>
                      <option value="percent">%</option>
                    </select>
                    <input style={fieldInput()} type="number" min="0" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} />
                  </div>
                </div>
                <div>
                  <FieldLabel>Tax %</FieldLabel>
                  <IconInput icon={Percent} type="number" min="0" value={taxPercent} onChange={(e) => setTaxPercent(e.target.value)} />
                </div>
              </div>

              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', margin: '16px 0 8px' }}>Notes</label>
              <textarea style={fieldInput({ minHeight: 50, resize: 'vertical' })} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional — shown on the PDF" />

              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', margin: '16px 0 8px' }}>Terms & Conditions</label>
              <textarea style={fieldInput({ minHeight: 50, resize: 'vertical' })} value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="Optional — shown on the PDF" />
            </div>

            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12, gap: 10 }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <Search size={16} style={{ position: 'absolute', left: 12, top: 12, color: '#94A3B8' }} />
                  <input style={fieldInput({ paddingLeft: 36 })} placeholder="Search products to add…" value={productSearch} onChange={(e) => setProductSearch(e.target.value)} />
                </div>
                <button onClick={openCustomItemModal} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', borderRadius: 8, border: '1px solid #0891B2', background: '#fff', color: '#0891B2', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  <Sparkles size={14} /> New Item Not In Catalog
                </button>
              </div>
              {productsLoading && (
                <div style={{ fontSize: 12, color: '#94A3B8', marginBottom: 8 }}>
                  Loading products… {productsLoadedCount} loaded so far
                </div>
              )}
              <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid #F1F5F9', borderRadius: 8 }} onScroll={handleProductListScroll}>
                {renderedProducts.map((p) => (
                  <div key={p.productId} onClick={() => addProductToCart(p)} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', borderBottom: '1px solid #F8FAFC', cursor: 'pointer' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                      <div style={{ fontSize: 12, color: '#94A3B8' }}>{p.sku} · Stock: {getCurrentStock(p)} · {formatMoney(p.sellingPrice ?? p.price ?? 0, baseCurrency)}</div>
                    </div>
                    {cart[p.productId] && <span style={{ color: '#16A34A', fontSize: 12, fontWeight: 700, alignSelf: 'center' }}>Added</span>}
                  </div>
                ))}
                {filteredProducts.length === 0 && (
                  <div style={{ padding: 20, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
                    {productsLoading ? 'Loading products…' : 'No products found.'}
                  </div>
                )}
                {visibleProductCount < filteredProducts.length && (
                  <div style={{ padding: '10px 12px', textAlign: 'center', color: '#94A3B8', fontSize: 12, borderTop: '1px solid #F8FAFC' }}>
                    Scroll for more — showing {renderedProducts.length} of {filteredProducts.length}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 16, position: 'sticky', top: 16 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Quote Items ({cartItems.length})</h3>
            {cartItems.length === 0 ? (
              <div style={{ color: '#94A3B8', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>Add items from the picker on the left.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 340, overflowY: 'auto' }}>
                {cartItems.map((it) => (
                  <div key={it.key} style={{ border: '1px solid #F1F5F9', borderRadius: 8, padding: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{it.productName}{it.isCustom && <span style={{ color: '#D97706', fontSize: 11, marginLeft: 6 }}>(custom)</span>}</div>
                      </div>
                      <button onClick={() => removeFromCart(it.key)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8' }}><Trash2 size={14} /></button>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, color: '#94A3B8' }}>Qty</div>
                        <input type="number" min="1" style={fieldInput({ padding: '6px 8px' })} value={it.quantity} onChange={(e) => updateCartField(it.key, 'quantity', e.target.value)} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, color: '#94A3B8' }}>Unit Price</div>
                        <input type="number" min="0" step="0.01" style={fieldInput({ padding: '6px 8px' })} value={it.unitPrice} onChange={(e) => updateCartField(it.key, 'unitPrice', e.target.value)} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, color: '#94A3B8' }}>Disc. %</div>
                        <input type="number" min="0" max="100" style={fieldInput({ padding: '6px 8px' })} value={it.discountPercent} onChange={(e) => updateCartField(it.key, 'discountPercent', e.target.value)} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ borderTop: '1px solid #F1F5F9', marginTop: 14, paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748B' }}><span>Subtotal</span><span>{formatMoney(cartSubtotal, baseCurrency)}</span></div>
              {cartTotals.discountTotal > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', color: '#D97706' }}><span>Discount</span><span>-{formatMoney(cartTotals.discountTotal, baseCurrency)}</span></div>}
              {cartTotals.taxTotal > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748B' }}><span>Tax</span><span>{formatMoney(cartTotals.taxTotal, baseCurrency)}</span></div>}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 15, marginTop: 4 }}><span>Total</span><span>{formatMoney(cartTotals.total, baseCurrency)}</span></div>
            </div>
            <button
              onClick={saveQuotation} disabled={creating}
              style={{ width: '100%', marginTop: 14, padding: '12px', borderRadius: 10, border: 'none', background: '#0891B2', color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: creating ? 0.7 : 1 }}
            >
              {creating ? 'Saving…' : editingQuotationId ? 'Save Changes' : 'Save Quotation'}
            </button>
          </div>
        </div>

        {customerModalOpen && (
          <CustomerModal draft={newCustomerDraft} setDraft={setNewCustomerDraft} saving={savingCustomer} onCancel={() => setCustomerModalOpen(false)} onSave={saveCustomerInline} />
        )}
        {customItemModalOpen && (
          <CustomItemModal
            draft={customItemDraft}
            setDraft={setCustomItemDraft}
            categories={categories}
            currencySymbol={currencySymbol}
            skuCheck={skuCheck}
            onCancel={() => setCustomItemModalOpen(false)}
            onAdd={addCustomItemToCart}
          />
        )}
      </div>
    );
  }

  // ── DETAIL VIEW ───────────────────────────────────────────────────────
  if (view === 'detail' && selectedQuote) {
    const q = selectedQuote;
    const canSend = q.status === 'draft';
    const canEdit = q.status === 'draft';
    const canDelete = q.status === 'draft';
    const canMarkResponse = q.status === 'sent';
    const canCancel = !['cancelled', 'declined'].includes(q.status);

    return (
      <div className="reports-page">
        {toast && <Toast {...toast} onClose={() => setToast(null)} />}
        <div className="reports-header" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button className="reports-header-back" onClick={() => setView('list')}><ChevronLeft size={18} /></button>
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: 0, fontSize: 20, display: 'flex', alignItems: 'center', gap: 10 }}>{q.quoteNumber} <StatusPill status={q.status} /></h1>
            <div style={{ fontSize: 13, color: '#64748B', display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
              <span>{q.customerName}</span>
              <BranchTag name={q.branchName} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => downloadPdf(q)} disabled={exportingPdf} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', fontWeight: 600, cursor: 'pointer' }}>
              <Download size={14} /> {exportingPdf ? 'Preparing…' : 'PDF'}
            </button>
            {canSend && (
              <button onClick={sendQuote} disabled={sending} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 8, border: 'none', background: '#25D366', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                <MessageCircle size={16} /> {sending ? 'Sending…' : 'Send to Customer'}
              </button>
            )}
            {canMarkResponse && (
              <>
                <button onClick={markAccepted} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', borderRadius: 8, border: '1px solid #DCFCE7', background: '#F0FDF4', color: '#16A34A', fontWeight: 600, cursor: 'pointer' }}>
                  <CheckCircle2 size={14} /> Mark Accepted
                </button>
                <button onClick={() => setDeclinePending(q)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', borderRadius: 8, border: '1px solid #FEE2E2', background: '#FEF2F2', color: '#EF4444', fontWeight: 600, cursor: 'pointer' }}>
                  <XCircle size={14} /> Mark Declined
                </button>
              </>
            )}
            <button onClick={() => duplicateQuote(q)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', fontWeight: 600, cursor: 'pointer' }}>
              <Copy size={14} /> Duplicate
            </button>
            {canEdit && (
              <button onClick={() => openEditFlow(q)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', fontWeight: 600, cursor: 'pointer' }}>
                Edit Draft
              </button>
            )}
            {canCancel && (
              <button onClick={() => setCancelPending(q)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', borderRadius: 8, border: '1px solid #FEE2E2', background: '#FEF2F2', color: '#EF4444', fontWeight: 600, cursor: 'pointer' }}>
                <Ban size={14} /> Cancel
              </button>
            )}
            {canDelete && (
              <button onClick={() => setDeletePending(q)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', fontWeight: 600, cursor: 'pointer' }}>
                <Trash2 size={14} /> Delete Draft
              </button>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16 }}>
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', marginBottom: 8 }}>Customer</div>
            <div style={{ fontWeight: 600 }}>{q.customerName}</div>
            {q.customerPhone && <div style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>{q.customerPhone}</div>}
            {q.customerEmail && <div style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>{q.customerEmail}</div>}
          </div>
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', marginBottom: 8 }}>Dates</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}><span style={{ color: '#64748B' }}>Issued</span><span>{new Date(q.issueDate || q.createdAt).toLocaleDateString()}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span style={{ color: '#64748B' }}>Valid Until</span><span>{q.validUntil ? new Date(q.validUntil).toLocaleDateString() : '—'}</span></div>
          </div>
        </div>

        {(q.notes || q.terms) && (
          <div style={{ display: 'grid', gridTemplateColumns: q.notes && q.terms ? '1fr 1fr' : '1fr', gap: 12, marginTop: 12 }}>
            {q.notes && (
              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: 12, fontSize: 13, color: '#475569' }}>
                <div style={{ fontWeight: 700, fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', marginBottom: 4 }}>Notes</div>
                {q.notes}
              </div>
            )}
            {q.terms && (
              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: 12, fontSize: 13, color: '#475569' }}>
                <div style={{ fontWeight: 700, fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', marginBottom: 4 }}>Terms & Conditions</div>
                {q.terms}
              </div>
            )}
          </div>
        )}

        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, marginTop: 16, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', padding: '10px 16px', background: '#F8FAFC', fontSize: 12, fontWeight: 700, color: '#64748B' }}>
            <div>ITEM</div><div>QTY</div><div>UNIT PRICE</div><div>DISCOUNT</div><div>TOTAL</div>
          </div>
          {(q.items || []).map((it, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', padding: '12px 16px', borderTop: '1px solid #F1F5F9', fontSize: 14, alignItems: 'center' }}>
              <div>{it.productName}{it.isCustom && <span style={{ color: '#D97706', fontSize: 11, marginLeft: 6 }}>(custom)</span>}</div>
              <div>{it.quantity} {it.unit !== 'each' ? it.unit : ''}</div>
              <div>{formatMoney(it.unitPrice, baseCurrency)}</div>
              <div>{it.discountPercent ? `${it.discountPercent}%` : '—'}</div>
              <div style={{ fontWeight: 600 }}>{formatMoney(it.lineTotal, baseCurrency)}</div>
            </div>
          ))}
          <div style={{ padding: '12px 16px', borderTop: '1px solid #F1F5F9', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <div style={{ fontSize: 13, color: '#64748B' }}>Subtotal: {formatMoney(q.subtotal, baseCurrency)}</div>
            {q.discountTotal > 0 && <div style={{ fontSize: 13, color: '#D97706' }}>Discount: -{formatMoney(q.discountTotal, baseCurrency)}</div>}
            {q.taxTotal > 0 && <div style={{ fontSize: 13, color: '#64748B' }}>Tax: {formatMoney(q.taxTotal, baseCurrency)}</div>}
            <div style={{ fontWeight: 700, fontSize: 16 }}>Total: {formatMoney(q.total, baseCurrency)}</div>
          </div>
        </div>

        {q.basedOnQuoteNumber && (
          <div style={{ marginTop: 12, fontSize: 12, color: '#94A3B8' }}>Duplicated from {q.basedOnQuoteNumber}.</div>
        )}

        {cancelPending && (
          <ConfirmDialog open={!!cancelPending} title="Cancel this quotation?" message={`${cancelPending.quoteNumber} will be marked cancelled. This can't be undone.`} confirmLabel="Cancel Quotation" onCancel={() => setCancelPending(null)} onConfirm={cancelQuote} />
        )}
        {declinePending && (
          <ConfirmDialog open={!!declinePending} danger={false} title="Mark as declined?" message={`${declinePending.quoteNumber} will be marked declined.`} confirmLabel="Mark Declined" onCancel={() => setDeclinePending(null)} onConfirm={markDeclined} />
        )}
        {deletePending && (
          <ConfirmDialog open={!!deletePending} title="Delete this draft?" message={`${deletePending.quoteNumber} will be permanently deleted.`} confirmLabel="Delete" onCancel={() => setDeletePending(null)} onConfirm={deleteQuote} />
        )}
      </div>
    );
  }

  // ── LIST VIEW ─────────────────────────────────────────────────────────
  return (
    <div className="reports-page">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
      <div className="reports-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <FileText size={20} />
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 20 }}>Quotations</h1>
          <div style={{ fontSize: 13, color: '#64748B' }}>Create, send, and track quotes for your customers</div>
        </div>
        {renderStoreSelector()}
        <button onClick={openCreateFlow} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 8, border: 'none', background: '#0891B2', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
          <Plus size={16} /> New Quotation
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, margin: '16px 0' }}>
        {[
          { label: 'Drafts', value: summary.draft, icon: FileText, color: '#475569' },
          { label: 'Sent', value: summary.sent, icon: Send, color: '#0891B2' },
          { label: 'Awaiting Value', value: formatMoney(summary.awaitingValue, baseCurrency), icon: Clock, color: '#D97706' },
          { label: 'Accepted Value', value: formatMoney(summary.acceptedValue, baseCurrency), icon: CheckCircle2, color: '#16A34A' },
          { label: 'Declined', value: summary.declined, icon: XCircle, color: '#EF4444' },
          { label: 'Expiring Soon', value: summary.expiringSoon, icon: CalendarClock, color: '#C2410C' },
        ].map((card) => (
          <div key={card.label} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: card.color, marginBottom: 6 }}>
              <card.icon size={14} />
              <span style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase' }}>{card.label}</span>
            </div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{card.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, margin: '16px 0', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', maxWidth: 300 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: 12, color: '#94A3B8' }} />
          <input style={fieldInput({ paddingLeft: 36 })} placeholder="Search by quote # or customer…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </div>
        <select style={fieldInput({ width: 200 })} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="accepted">Accepted</option>
          <option value="declined">Declined</option>
          <option value="expired">Expired</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {loading ? (
        <div style={{ color: '#64748B', fontSize: 14 }}>Loading quotations…</div>
      ) : filtered.length === 0 ? (
        <div style={{ color: '#94A3B8', fontSize: 14, background: '#fff', border: '1px dashed #E2E8F0', borderRadius: 12, padding: 32, textAlign: 'center' }}>
          No quotations yet for {selectedBranchName}.
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
          {filtered.map((q) => (
            <div key={q.quotationId} onClick={() => openDetail(q)} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderBottom: '1px solid #F1F5F9', cursor: 'pointer' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#F8FAFC')} onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <FileText size={17} color="#0891B2" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{q.quoteNumber} — {q.customerName}</div>
                <div style={{ fontSize: 12, color: '#94A3B8', display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                  <span>{(q.items || []).length} item(s) · {new Date(q.createdAt).toLocaleDateString()}</span>
                  {q.status === 'sent' && q.validUntil && <span>· Valid until {new Date(q.validUntil).toLocaleDateString()}</span>}
                  <BranchTag name={q.branchName} />
                </div>
              </div>
              <div style={{ fontWeight: 600 }}>{formatMoney(q.total || 0, baseCurrency)}</div>
              <StatusPill status={q.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}