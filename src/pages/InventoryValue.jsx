// src/pages/Inventory/InventoryValue.jsx
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Store, Search, X, Landmark, RefreshCw, Download, FileText, ChevronLeft, Lock, AlertTriangle } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { formatMoney, toApiDate, downloadCsv } from '../utils/exportUtils';
import Button from '../components/common/Button';
import '../styles/ReportsShared.css';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useSelectedBranch } from '../hooks/useSelectedBranch';
import { useModuleGate } from '../hooks/useModuleGate';
import ModuleSubscriptionModal from '../components/common/ModuleSubscriptionModal';
import { getModuleInfo } from '../utils/moduleCatalog';

// ─── Loading Bar Component (Loyverse style) ──────────────────────────────
function LoadingBar({ visible }) {
  if (!visible) return null;
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      height: 3,
      zIndex: 9999,
      background: '#E2E8F0',
      overflow: 'hidden',
    }}>
      <div style={{
        height: '100%',
        width: '100%',
        background: 'linear-gradient(90deg, #234C6A 0%, #3B82F6 50%, #234C6A 100%)',
        animation: 'loadingBar 1.5s ease-in-out infinite',
        transformOrigin: '0% 50%',
      }} />
      <style>{`
        @keyframes loadingBar {
          0% { transform: translateX(-100%) scaleX(0.3); }
          50% { transform: translateX(0%) scaleX(0.8); }
          100% { transform: translateX(100%) scaleX(0.3); }
        }
      `}</style>
    </div>
  );
}

// Helper to get margin color based on percentage
const getMarginColor = (percent) => {
  if (percent >= 40) return '#16A34A'; // Green - high margin
  if (percent >= 25) return '#0891B2'; // Cyan - good margin
  if (percent >= 15) return '#D97706'; // Orange - medium margin
  return '#EF4444'; // Red - low margin
};

export default function InventoryValue() {
  const { apiFetch, businessId, branches, baseCurrency } = useAppContext();

  // ✅ Module gate for Inventory Management (same as ImportStock)
  const { guardAction, hasModuleAccess, getModuleState, gateModalModuleId, closeGateModal } = useModuleGate();
  const hasInventoryMgmt = hasModuleAccess('inventory_mgmt');

  const { selectedBranchId, setSelectedBranchId } = useSelectedBranch();
  const [storeModalOpen, setStoreModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rebuilding, setRebuilding] = useState(false);
  const [error, setError] = useState(null);
  const [products, setProducts] = useState([]);
  const [stats, setStats] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    if (!selectedBranchId && branches?.length) setSelectedBranchId(branches[0].branchId);
  }, [branches, selectedBranchId]);

  const selectedBranchName = branches?.find((b) => b.branchId === selectedBranchId)?.name || 'Select Store';

  const fetchData = useCallback(async () => {
    if (!businessId || !selectedBranchId) return;
    setLoading(true);
    setError(null);
    try {
      const [productsRes, statsRes] = await Promise.all([
        apiFetch(`/business/${businessId}/branches/${selectedBranchId}/products?status=all`),
        apiFetch(`/business/${businessId}/branches/${selectedBranchId}/inventory-stats`),
      ]);
      setProducts(Array.isArray(productsRes) ? productsRes.filter((p) => p.status !== 'deleted') : []);
      setStats(statsRes);
    } catch (e) {
      console.error('Fetch inventory value error:', e);
      setError('Failed to load inventory value');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, businessId, selectedBranchId]);

  useEffect(() => { 
    if (hasInventoryMgmt) {
      fetchData(); 
    }
  }, [fetchData, hasInventoryMgmt]);

  const handleRebuild = useCallback(async () => {
    if (!guardAction('inventory_mgmt')) return;
    setRebuilding(true);
    try {
      await apiFetch(`/business/${businessId}/branches/${selectedBranchId}/inventory-stats/rebuild`, { method: 'POST' });
      await fetchData();
    } catch (e) {
      console.error('Rebuild stats error:', e);
      setError('Failed to rebuild stats');
    } finally {
      setRebuilding(false);
    }
  }, [apiFetch, businessId, selectedBranchId, fetchData, guardAction]);

  const withValues = useMemo(() => products.map((p) => {
    const costPrice = p.costPrice || 0;
    const sellingPrice = p.sellingPrice || 0;
    const stock = p.currentStock || 0;
    const costValue = costPrice * stock;
    const retailValue = sellingPrice * stock;
    const profit = retailValue - costValue;
    const marginPercent = sellingPrice > 0 ? ((sellingPrice - costPrice) / sellingPrice) * 100 : 0;
    
    return {
      ...p,
      costValue,
      retailValue,
      profit,
      marginPercent,
      stock,
    };
  }), [products]);

  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return withValues;
    const q = searchQuery.trim().toLowerCase();
    return withValues.filter((p) => 
      p.name?.toLowerCase().includes(q)
    );
  }, [withValues, searchQuery]);

  const productRows = useMemo(() => 
    [...filteredProducts].sort((a, b) => b.retailValue - a.retailValue), 
    [filteredProducts]
  );

  // Calculate totals
  const totalRetail = productRows.reduce((sum, p) => sum + p.retailValue, 0);
  const totalCost = productRows.reduce((sum, p) => sum + p.costValue, 0);
  const totalProfit = totalRetail - totalCost;
  const totalMargin = totalRetail > 0 ? (totalProfit / totalRetail) * 100 : 0;
  const totalItems = productRows.reduce((sum, p) => sum + p.stock, 0);

  // ─── Export Functions ────────────────────────────────────────────────────────
  const handleExportCsv = useCallback(() => {
    if (!guardAction('inventory_mgmt')) return;
    if (isExporting || !productRows.length) return;
    setIsExporting(true);
    try {
      const header = ['Product', 'Stock', 'Retail Value', 'Cost Value', 'Profit', 'Margin %'];
      const rows = productRows.map((p) => [
        `"${p.name || ''}"`,
        p.stock,
        p.retailValue.toFixed(2),
        p.costValue.toFixed(2),
        p.profit.toFixed(2),
        p.marginPercent.toFixed(1),
      ]);
      
      // Add totals row
      const totalsRow = [
        'TOTAL',
        totalItems,
        totalRetail.toFixed(2),
        totalCost.toFixed(2),
        totalProfit.toFixed(2),
        totalMargin.toFixed(1),
      ];
      
      const branchTag = selectedBranchName.toLowerCase().replace(/\s+/g, '-');
      const allRows = [...rows, [], totalsRow];
      downloadCsv(`inventory_value_${branchTag}_${toApiDate(new Date())}.csv`, [header, ...allRows]);
    } finally {
      setIsExporting(false);
    }
  }, [productRows, selectedBranchName, totalItems, totalRetail, totalCost, totalProfit, totalMargin, isExporting, guardAction]);

  const handleExportPdf = useCallback(() => {
    if (!guardAction('inventory_mgmt')) return;
    if (isExporting || !productRows.length) return;
    setIsExporting(true);

    try {
      const doc = new jsPDF('landscape', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      
      doc.setFontSize(16);
      doc.setTextColor('#0F172A');
      doc.text(`Inventory Value - ${selectedBranchName}`, pageWidth / 2, 15, { align: 'center' });
      
      doc.setFontSize(10);
      doc.setTextColor('#64748B');
      doc.text(`${baseCurrency?.code || 'USD'} | ${new Date().toLocaleString()}`, pageWidth / 2, 22, { align: 'center' });

      const headers = ['Product', 'Stock', 'Retail Value', 'Cost Value', 'Profit', 'Margin %'];
      const tableData = productRows.map((p) => [
        p.name || '',
        String(p.stock),
        formatMoney(p.retailValue, baseCurrency),
        formatMoney(p.costValue, baseCurrency),
        formatMoney(p.profit, baseCurrency),
        p.marginPercent.toFixed(1) + '%',
      ]);

      // Add totals row
      tableData.push([
        'TOTAL',
        String(totalItems),
        formatMoney(totalRetail, baseCurrency),
        formatMoney(totalCost, baseCurrency),
        formatMoney(totalProfit, baseCurrency),
        totalMargin.toFixed(1) + '%',
      ]);

      autoTable(doc, {
        head: [headers],
        body: tableData,
        startY: 30,
        theme: 'striped',
        headStyles: {
          fillColor: '#F1F5F9',
          textColor: '#0F172A',
          fontStyle: 'bold',
          fontSize: 8,
          halign: 'center',
        },
        bodyStyles: {
          fontSize: 7,
          textColor: '#1E293B',
        },
        margin: { left: 8, right: 8 },
        columnStyles: {
          0: { cellWidth: 40 },
          1: { cellWidth: 20, halign: 'center' },
          2: { cellWidth: 28, halign: 'right' },
          3: { cellWidth: 28, halign: 'right' },
          4: { cellWidth: 28, halign: 'right' },
          5: { cellWidth: 25, halign: 'right' },
        },
        didParseCell: function(data) {
          if (data.section === 'body') {
            // Check if it's the totals row
            const isTotalRow = data.row.index === tableData.length - 1;
            
            if (isTotalRow) {
              data.cell.styles.fontStyle = 'bold';
              data.cell.styles.fillColor = '#F1F5F9';
              data.cell.styles.textColor = '#0F172A';
            }
            
            if (data.column.index === 5) {
              const val = parseFloat(data.cell.raw);
              if (!isNaN(val)) {
                data.cell.styles.textColor = isTotalRow ? '#0F172A' : getMarginColor(val);
                data.cell.styles.fontStyle = 'bold';
              }
            }
            if (data.column.index === 4) {
              const val = parseFloat(data.cell.raw.replace(/[^0-9.-]/g, ''));
              if (!isNaN(val)) {
                data.cell.styles.textColor = isTotalRow ? '#0F172A' : (val >= 0 ? '#16A34A' : '#EF4444');
                data.cell.styles.fontStyle = 'bold';
              }
            }
            if (data.column.index === 2 || data.column.index === 3) {
              if (isTotalRow) {
                data.cell.styles.textColor = '#0F172A';
                data.cell.styles.fontStyle = 'bold';
              }
            }
          }
        },
        didDrawPage: function(data) {
          doc.setFontSize(7);
          doc.setTextColor('#94A3B8');
          const pageNumber = doc.internal.getCurrentPageInfo().pageNumber;
          const totalPages = doc.internal.getNumberOfPages();
          doc.text(`Page ${pageNumber} of ${totalPages}`, pageWidth - 15, doc.internal.pageSize.getHeight() - 10, { align: 'right' });
          doc.text(`Generated: ${new Date().toLocaleString()}`, 15, doc.internal.pageSize.getHeight() - 10);
        },
      });

      const branchTag = selectedBranchName.toLowerCase().replace(/\s+/g, '-');
      doc.save(`inventory_value_${branchTag}_${toApiDate(new Date())}.pdf`);
    } catch (error) {
      console.error('PDF export error:', error);
      alert('Failed to export PDF. Please try again.');
    } finally {
      setIsExporting(false);
    }
  }, [productRows, selectedBranchName, baseCurrency, totalItems, totalRetail, totalCost, totalProfit, totalMargin, isExporting, guardAction]);

  // ─── Show loading bar instead of full screen spinner ──────────────────
  const showLoadingBar = loading || rebuilding || isExporting;

  // ─── ACCESS DENIED ────────────────────────────────────────────────────────
  if (!hasInventoryMgmt) {
    const moduleInfo = getModuleInfo('inventory_mgmt');
    return (
      <div className="reports-page">
        {/* ✅ Store selector ALWAYS visible, even when access denied */}
        <div className="reports-header">
          <div className="reports-header-left">
            <button className="reports-header-back" onClick={() => window.history.back()}>
              <ChevronLeft size={18} />
            </button>
            <div>
              <div className="reports-header-title">Inventory Value</div>
              <div className="reports-header-sub">What your stock is worth, right now</div>
            </div>
          </div>
          <div className="reports-header-right">
            <button className="reports-store-selector" onClick={() => setStoreModalOpen(true)}>
              <Store size={14} /> <span>{selectedBranchName}</span>
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
          <div style={{ textAlign: 'center', maxWidth: 400, padding: 24 }}>
            <div style={{ width: 64, height: 64, borderRadius: 16, background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Lock size={32} color="#EF4444" />
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>
              {moduleInfo?.label || 'Inventory Management'} Required
            </h2>
            <p style={{ fontSize: 14, color: '#64748B', lineHeight: 1.5 }}>
              You need the <strong>{moduleInfo?.label || 'Inventory Management'}</strong> module to view inventory value for <strong>{selectedBranchName}</strong>.
              Please subscribe to unlock this functionality.
            </p>
            <div style={{ marginTop: 16, fontSize: 13, color: '#94A3B8' }}>
              {moduleInfo?.price && (
                <span>Price: {moduleInfo.price}{moduleInfo.period || '/month'}</span>
              )}
            </div>
            <button 
              onClick={() => guardAction('inventory_mgmt')}
              style={{ 
                marginTop: 20,
                padding: '10px 24px',
                borderRadius: 8,
                border: 'none',
                background: '#0891B2',
                color: '#fff',
                fontWeight: 700,
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              Subscribe Now
            </button>
          </div>
        </div>

        {/* Store selector modal */}
        {storeModalOpen && (
          <div className="reports-modal-overlay" onClick={() => setStoreModalOpen(false)}>
            <div className="reports-modal" style={{ maxWidth: 320 }} onClick={(e) => e.stopPropagation()}>
              <div className="reports-modal-header">
                <span className="reports-modal-title">Select Store</span>
                <button className="reports-modal-close" onClick={() => setStoreModalOpen(false)}><X size={18} /></button>
              </div>
              <div className="reports-modal-body" style={{ padding: '8px 4px' }}>
                {(branches || []).map((b) => (
                  <button key={b.branchId} className={`reports-filter-option ${selectedBranchId === b.branchId ? 'is-active' : ''}`}
                    onClick={() => { setSelectedBranchId(b.branchId); setStoreModalOpen(false); }}>
                    {b.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ✅ Module gate modal */}
        {gateModalModuleId && (
          <ModuleSubscriptionModal
            moduleId={gateModalModuleId}
            moduleState={getModuleState(gateModalModuleId)}
            onClose={closeGateModal}
          />
        )}
      </div>
    );
  }

  return (
    <>
      <LoadingBar visible={showLoadingBar} />
      <div className="reports-page">
        <div className="reports-header">
          <div className="reports-header-left">
            <button className="reports-header-back" onClick={() => window.history.back()}>
              <ChevronLeft size={18} />
            </button>
            <div>
              <div className="reports-header-title">Inventory Value</div>
              <div className="reports-header-sub">What your stock is worth, right now</div>
            </div>
          </div>
          <div className="reports-header-right">
            <button className="reports-store-selector" onClick={() => setStoreModalOpen(true)}>
              <Store size={14} /> <span>{selectedBranchName}</span>
            </button>
            <Button variant="secondary" size="sm" icon={FileText} onClick={handleExportPdf} disabled={isExporting || !productRows.length}>
              PDF
            </Button>
            <Button variant="secondary" size="sm" icon={Download} onClick={handleExportCsv} disabled={isExporting || !productRows.length}>
              CSV
            </Button>
            <button onClick={handleRebuild} disabled={rebuilding}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', color: '#475569', fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: rebuilding ? 0.7 : 1 }}>
              <RefreshCw size={14} className={rebuilding ? 'spin' : ''} /> {rebuilding ? 'Rebuilding...' : 'Rebuild Stats'}
            </button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="reports-stats-row">
          <div className="reports-stat-card">
            <span className="reports-stat-label">Total Items</span>
            <span className="reports-stat-value">{stats?.totalItems ?? 0}</span>
          </div>
          <div className="reports-stat-card">
            <span className="reports-stat-label">Retail Value</span>
            <span className="reports-stat-value">{formatMoney(stats?.totalRetailValue || 0, baseCurrency)}</span>
          </div>
          <div className="reports-stat-card">
            <span className="reports-stat-label">Cost Value</span>
            <span className="reports-stat-value">{formatMoney(stats?.totalCostValue || 0, baseCurrency)}</span>
          </div>
          <div className="reports-stat-card">
            <span className="reports-stat-label">Profit</span>
            <span className="reports-stat-value" style={{ color: totalProfit >= 0 ? '#16A34A' : '#EF4444' }}>
              {formatMoney(totalProfit, baseCurrency)}
            </span>
          </div>
          <div className="reports-stat-card">
            <span className="reports-stat-label">Margin %</span>
            <span className="reports-stat-value" style={{ color: getMarginColor(totalMargin) }}>
              {totalMargin.toFixed(1)}%
            </span>
          </div>
        </div>

        <div className="reports-toolbar" style={{ marginTop: 16 }}>
          <div className="reports-search">
            <Search size={14} />
            <input placeholder="Search by product name" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            {searchQuery && <button onClick={() => setSearchQuery('')} style={{ border: 'none', background: 'none', cursor: 'pointer' }}><X size={14} color="#8b97a7" /></button>}
          </div>
        </div>

        <div className="reports-list-card" style={{ overflowX: 'auto' }}>
          {error ? (
            <div className="reports-empty"><div className="reports-empty-title">{error}</div></div>
          ) : productRows.length === 0 ? (
            <div className="reports-empty"><Landmark size={32} /><div className="reports-empty-title">No products</div></div>
          ) : (
            <>
              <table style={{ width: '100%', minWidth: 600, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #E2E8F0', background: '#F8FAFC' }}>
                    <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', minWidth: 150 }}>Product</th>
                    <th style={{ padding: '10px 16px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', minWidth: 60 }}>Stock</th>
                    <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', minWidth: 100 }}>Retail Value</th>
                    <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', minWidth: 100 }}>Cost Value</th>
                    <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', minWidth: 100 }}>Profit</th>
                    <th style={{ padding: '10px 16px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', minWidth: 100 }}>Margin %</th>
                  </tr>
                </thead>
                <tbody>
                  {productRows.map((p) => {
                    const marginColor = getMarginColor(p.marginPercent);
                    return (
                      <tr key={p.productId} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '10px 16px', fontWeight: 600, fontSize: 13 }}>{p.name}</td>
                        <td style={{ padding: '10px 16px', textAlign: 'center', fontSize: 13 }}>{p.stock}</td>
                        <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: 13, fontWeight: 600 }}>{formatMoney(p.retailValue, baseCurrency)}</td>
                        <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: 13 }}>{formatMoney(p.costValue, baseCurrency)}</td>
                        <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: 13, color: p.profit >= 0 ? '#16A34A' : '#EF4444', fontWeight: 600 }}>
                          {formatMoney(p.profit, baseCurrency)}
                        </td>
                        <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                            <div style={{ flex: 1, minWidth: 60, height: 6, background: '#F1F5F9', borderRadius: 3, overflow: 'hidden' }}>
                              <div style={{ 
                                width: `${Math.min(Math.max(p.marginPercent, 0), 100)}%`, 
                                height: '100%', 
                                background: marginColor,
                                borderRadius: 3,
                              }} />
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 700, color: marginColor, minWidth: 45, textAlign: 'right' }}>
                              {p.marginPercent.toFixed(1)}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {/* Totals Row */}
                  <tr style={{ borderTop: '2px solid #E2E8F0', background: '#F8FAFC', fontWeight: 'bold' }}>
                    <td style={{ padding: '10px 16px', fontWeight: 700, fontSize: 13 }}>TOTAL</td>
                    <td style={{ padding: '10px 16px', textAlign: 'center', fontSize: 13, fontWeight: 700 }}>{totalItems}</td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: 13, fontWeight: 700 }}>{formatMoney(totalRetail, baseCurrency)}</td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: 13, fontWeight: 700 }}>{formatMoney(totalCost, baseCurrency)}</td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: totalProfit >= 0 ? '#16A34A' : '#EF4444' }}>
                      {formatMoney(totalProfit, baseCurrency)}
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 700 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                        <div style={{ flex: 1, minWidth: 60, height: 6, background: '#F1F5F9', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ 
                            width: `${Math.min(Math.max(totalMargin, 0), 100)}%`, 
                            height: '100%', 
                            background: getMarginColor(totalMargin),
                            borderRadius: 3,
                          }} />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: getMarginColor(totalMargin), minWidth: 45, textAlign: 'right' }}>
                          {totalMargin.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </>
          )}
        </div>

        {storeModalOpen && (
          <div className="reports-modal-overlay" onClick={() => setStoreModalOpen(false)}>
            <div className="reports-modal" style={{ maxWidth: 320 }} onClick={(e) => e.stopPropagation()}>
              <div className="reports-modal-header">
                <span className="reports-modal-title">Select Store</span>
                <button className="reports-modal-close" onClick={() => setStoreModalOpen(false)}><X size={18} /></button>
              </div>
              <div className="reports-modal-body" style={{ padding: '8px 4px' }}>
                {(branches || []).map((b) => (
                  <button key={b.branchId} className={`reports-filter-option ${selectedBranchId === b.branchId ? 'is-active' : ''}`}
                    onClick={() => { setSelectedBranchId(b.branchId); setStoreModalOpen(false); }}>
                    {b.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ✅ Module gate modal */}
        {gateModalModuleId && (
          <ModuleSubscriptionModal
            moduleId={gateModalModuleId}
            moduleState={getModuleState(gateModalModuleId)}
            onClose={closeGateModal}
          />
        )}
      </div>
    </>
  );
}