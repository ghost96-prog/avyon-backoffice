// src/pages/Inventory/ImportStock.jsx
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  ArrowLeft, Store, X, UploadCloud, FileSpreadsheet, Download, FileDown,
  CheckCircle2, AlertTriangle, Trash2, RefreshCw, Loader2, Lock,
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useSelectedBranch } from '../hooks/useSelectedBranch';
import { useModuleGate } from '../hooks/useModuleGate';
import ModuleSubscriptionModal from '../components/common/ModuleSubscriptionModal';
import {
  UNITS, parseCsvText, parseBool, downloadProductTemplate,
  downloadProductsForReimport, evaluateImportRow, triggerCsvDownload,
} from '../utils/csvUtils';
import '../styles/ReportsShared.css';

const DASHBOARD_POS_ID = 'web-dashboard';

function fieldInput(props) {
  return { width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #E2E8F0', fontSize: 12, boxSizing: 'border-box', ...props };
}

function StatusBadge({ action, hasErrors }) {
  if (hasErrors) return <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: '#FEE2E2', color: '#EF4444' }}>Error</span>;
  if (action === 'update') return <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: '#FEF3C7', color: '#B45309' }}>Update</span>;
  return <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: '#DCFCE7', color: '#16A34A' }}>New</span>;
}

export default function ImportStock() {
  const navigate = useNavigate();
  const location = useLocation();
  const { apiFetch, businessId, branches, baseCurrency, activeStaff, userProfile } = useAppContext();

  // ✅ Use the shared selected branch hook
  const { selectedBranchId, setSelectedBranchId } = useSelectedBranch();

  // ✅ Module gate for Inventory Management
  const { guardAction, hasModuleAccess, getModuleState, gateModalModuleId, closeGateModal } = useModuleGate();
  const hasInventoryMgmt = hasModuleAccess('inventory_mgmt');

  const staffId = activeStaff?.staffId || userProfile?.uid || 'dashboard';
  const staffName = activeStaff?.name || userProfile?.name || userProfile?.email?.split('@')[0] || 'Owner';

  const [storeModalOpen, setStoreModalOpen] = useState(false);
  const branchName = branches?.find((b) => b.branchId === selectedBranchId)?.name || 'Select Store';

  const [allProducts, setAllProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);

  const [fileName, setFileName] = useState(null);
  const [parsedRows, setParsedRows] = useState([]);
  const [dragActive, setDragActive] = useState(false);
  const [skipErrors, setSkipErrors] = useState(true);
  const [excludedIndexes, setExcludedIndexes] = useState(new Set());

  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, label: '' });
  const [importResults, setImportResults] = useState(null);

  const fileInputRef = useRef(null);

  // ─── Load products + categories for the selected branch ────────────────────
  const fetchBranchData = useCallback(async () => {
    if (!businessId || !selectedBranchId) return;
    setLoadingProducts(true);
    try {
      const [productsRes, categoriesRes] = await Promise.all([
        apiFetch(`/business/${businessId}/branches/${selectedBranchId}/products?status=all`),
        apiFetch(`/business/${businessId}/branches/${selectedBranchId}/categories`),
      ]);
      setAllProducts(Array.isArray(productsRes) ? productsRes : []);
      setCategories(Array.isArray(categoriesRes) ? categoriesRes : []);
    } catch (e) {
      console.error('Failed to load branch data:', e);
    } finally {
      setLoadingProducts(false);
    }
  }, [apiFetch, businessId, selectedBranchId]);

  useEffect(() => {
    if (importResults && !importing && importResults.every(r => r.success)) {
      navigate('/inventory/products');
    }
  }, [importResults, importing, navigate]);

  useEffect(() => { fetchBranchData(); }, [fetchBranchData]);

  // ─── File handling ──────────────────────────────────────────────────────────
  const handleFile = useCallback((file) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) {
      alert('Please upload a .csv file');
      return;
    }
    setFileName(file.name);
    setImportResults(null);
    setExcludedIndexes(new Set());
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const rows = parseCsvText(text);
      setParsedRows(rows);
    };
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault(); e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    handleFile(file);
  }, [handleFile]);

  const handleClearFile = useCallback(() => {
    setFileName(null);
    setParsedRows([]);
    setImportResults(null);
    setExcludedIndexes(new Set());
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  // ─── Evaluate rows (create / update / error) ────────────────────────────────
  const duplicateSkuSet = useMemo(() => {
    const counts = {};
    parsedRows.forEach((r) => {
      const sku = (r.sku || '').trim().toUpperCase();
      if (!sku) return;
      counts[sku] = (counts[sku] || 0) + 1;
    });
    return new Set(Object.keys(counts).filter((k) => counts[k] > 1));
  }, [parsedRows]);

  const evaluatedRows = useMemo(() => {
    return parsedRows.map((row, idx) => {
      const { action, targetProductId, errors } = evaluateImportRow(row, allProducts, duplicateSkuSet);
      return { ...row, _index: idx, action, targetProductId, errors };
    });
  }, [parsedRows, allProducts, duplicateSkuSet]);

  const summary = useMemo(() => {
    let creates = 0, updates = 0, errors = 0, excluded = 0;
    evaluatedRows.forEach((r) => {
      if (excludedIndexes.has(r._index)) { excluded++; return; }
      if (r.errors.length > 0) { errors++; return; }
      if (r.action === 'update') updates++; else creates++;
    });
    return { creates, updates, errors, excluded, total: evaluatedRows.length };
  }, [evaluatedRows, excludedIndexes]);

  const rowsToImport = useMemo(() => {
    return evaluatedRows.filter((r) => {
      if (excludedIndexes.has(r._index)) return false;
      if (r.errors.length > 0) return false;
      return true;
    });
  }, [evaluatedRows, excludedIndexes]);

  const blockingErrors = !skipErrors && summary.errors > 0;
  const canImport = rowsToImport.length > 0 && !blockingErrors && !importing;

  const updateRowField = useCallback((index, field, value) => {
    setParsedRows((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  }, []);

  const toggleExcludeRow = useCallback((index) => {
    setExcludedIndexes((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
  }, []);

  // ─── Create / update helpers ─────────────────────────────────────────────────
  const createProductFromRow = useCallback(async (row) => {
    const category = categories.find((c) => c.name.toLowerCase() === (row.category || '').trim().toLowerCase());
    const unitDef = UNITS.find((u) => u.value === (row.unit || 'each').trim().toLowerCase()) || UNITS[0];
    const itemsPerUnitValue = unitDef.requiresQuantityPerUnit ? (parseInt(row.itemsPerUnit, 10) || 1) : 1;
    const trackInventory = row.trackInventory === '' || row.trackInventory === undefined ? true : parseBool(row.trackInventory);
    const initialStock = trackInventory ? (parseInt(row.currentStock, 10) || 0) : 0;

    const payload = {
      posId: DASHBOARD_POS_ID,
      staffId,
      cashierName: staffName,
      sku: row.sku.trim().toUpperCase(),
      barcode: row.barcode?.trim() || null,
      name: row.name.trim().toUpperCase(),
      description: row.description?.trim() || null,
      category: category?.name || (row.category?.trim() || 'No Category'),
      categoryId: category?.categoryId || 'no-category',
      unit: unitDef.value,
      itemsPerUnit: itemsPerUnitValue,
      sellingPrice: parseFloat(row.sellingPrice) || 0,
      sellingCurrency: baseCurrency?.code || 'USD',
      costPrice: parseFloat(row.costPrice) || 0,
      costCurrency: baseCurrency?.code || 'USD',
      markupPercent: 0,
      trackInventory,
      currentStock: 0,
      lowStockThreshold: parseInt(row.lowStockThreshold, 10) || 0,
      reservedStock: 0,
      availableStock: 0,
      taxable: parseBool(row.taxable),
      taxName: row.taxName?.trim() || null,
      taxPercent: parseFloat(row.taxPercent) || 0,
      taxInclusive: parseBool(row.taxInclusive),
      status: (row.status || 'active').trim().toLowerCase() === 'inactive' ? 'inactive' : 'active',
      storeIds: JSON.stringify([selectedBranchId]),
      posIds: JSON.stringify([DASHBOARD_POS_ID]),
      version: 1,
    };

    const created = await apiFetch(`/business/${businessId}/branches/${selectedBranchId}/products`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (initialStock > 0 && created?.productId) {
      await apiFetch(`/business/${businessId}/branches/${selectedBranchId}/stock-movements`, {
        method: 'POST',
        body: JSON.stringify({
          productId: created.productId,
          sku: payload.sku,
          productName: payload.name,
          type: 'initial_stock',
          reason: 'CSV import - initial stock',
          quantityChange: initialStock,
          unit: payload.unit,
          posId: DASHBOARD_POS_ID,
          staffId,
          cashierName: staffName,
          referenceType: 'csv_import',
          referenceId: created.productId,
        }),
      });
    }
  }, [apiFetch, businessId, selectedBranchId, categories, baseCurrency, staffId, staffName]);

  const updateProductFromRow = useCallback(async (row) => {
    const target = allProducts.find((p) => p.productId === row.targetProductId);
    if (!target) throw new Error('Product no longer exists');

    const category = categories.find((c) => c.name.toLowerCase() === (row.category || '').trim().toLowerCase());
    const unitDef = UNITS.find((u) => u.value === (row.unit || target.unit || 'each').trim().toLowerCase()) || UNITS[0];
    const itemsPerUnitValue = unitDef.requiresQuantityPerUnit
      ? (parseInt(row.itemsPerUnit, 10) || target.itemsPerUnit || 1)
      : 1;
    const trackInventory = row.trackInventory === '' || row.trackInventory === undefined
      ? target.trackInventory !== false
      : parseBool(row.trackInventory);

    const payload = {
      staffId,
      cashierName: staffName,
      posId: DASHBOARD_POS_ID,
      sku: row.sku.trim().toUpperCase(),
      barcode: row.barcode?.trim() || null,
      name: row.name.trim().toUpperCase(),
      description: row.description?.trim() || null,
      category: category?.name || (row.category?.trim() || target.category || 'No Category'),
      categoryId: category?.categoryId || target.categoryId || 'no-category',
      unit: unitDef.value,
      itemsPerUnit: itemsPerUnitValue,
      sellingPrice: parseFloat(row.sellingPrice) || 0,
      sellingCurrency: baseCurrency?.code || 'USD',
      costPrice: parseFloat(row.costPrice) || 0,
      costCurrency: baseCurrency?.code || 'USD',
      markupPercent: 0,
      trackInventory,
      lowStockThreshold: parseInt(row.lowStockThreshold, 10) || 0,
      status: (row.status || 'active').trim().toLowerCase() === 'inactive' ? 'inactive' : 'active',
    };

    await apiFetch(`/business/${businessId}/branches/${selectedBranchId}/products/${target.productId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });

    if (trackInventory) {
      const originalStock = target.currentStock || 0;
      const newStock = parseInt(row.currentStock, 10);
      if (!isNaN(newStock) && newStock !== originalStock) {
        const diff = newStock - originalStock;
        await apiFetch(`/business/${businessId}/branches/${selectedBranchId}/stock-movements`, {
          method: 'POST',
          body: JSON.stringify({
            productId: target.productId,
            sku: payload.sku,
            productName: payload.name,
            type: diff > 0 ? 'stock_addition' : 'stock_reduction',
            reason: `CSV import: stock set from ${originalStock} to ${newStock}`,
            quantityChange: diff,
            unit: payload.unit,
            posId: DASHBOARD_POS_ID,
            staffId,
            cashierName: staffName,
            referenceType: 'csv_import',
            referenceId: target.productId,
          }),
        });
      }
    }
  }, [apiFetch, businessId, selectedBranchId, allProducts, categories, baseCurrency, staffId, staffName]);

  // ─── Run the import ───────────────────────────────────────────────────────────
  const handleImport = useCallback(async () => {
    // ✅ Guard: Check if user has inventory management module access
    if (!guardAction('inventory_mgmt')) return;
    if (!canImport) return;
    
    setImporting(true);
    setImportResults(null);
    const results = [];

    for (let i = 0; i < rowsToImport.length; i++) {
      const row = rowsToImport[i];
      setImportProgress({ current: i + 1, total: rowsToImport.length, label: row.sku || row.name });
      try {
        if (row.action === 'create') await createProductFromRow(row);
        else await updateProductFromRow(row);
        results.push({ row, success: true });
      } catch (e) {
        results.push({ row, success: false, error: e.message || 'Import failed' });
      }
    }

    setImportResults(results);
    setImporting(false);
    await fetchBranchData();
  }, [canImport, rowsToImport, createProductFromRow, updateProductFromRow, fetchBranchData, guardAction]);

  const handleDownloadFailedRows = useCallback(() => {
    if (!importResults) return;
    const failed = importResults.filter((r) => !r.success);
    if (!failed.length) return;
    const headers = ['Product ID', 'SKU', 'Name', 'Error'];
    const rows = failed.map((r) => [r.row.targetProductId || r.row.productId || '', r.row.sku, r.row.name, r.error]);
    triggerCsvDownload('import_failures.csv', [headers, ...rows]);
  }, [importResults]);

  const successCount = importResults?.filter((r) => r.success).length || 0;
  const failCount = importResults?.filter((r) => !r.success).length || 0;

  // ─── ACCESS DENIED ────────────────────────────────────────────────────────
  if (!hasInventoryMgmt) {
    return (
      <div className="reports-page">
        {/* ✅ Store selector ALWAYS visible, even when access denied */}
        <div className="reports-header">
          <div className="reports-header-left">
            <button className="reports-header-back" onClick={() => navigate('/inventory/products')}><ArrowLeft size={18} /></button>
            <div>
              <div className="reports-header-title">Import Products</div>
              <div className="reports-header-sub">{branchName}</div>
            </div>
          </div>
          <div className="reports-header-right">
            <button className="reports-store-selector" onClick={() => setStoreModalOpen(true)}>
              <Store size={14} /> <span>{branchName || 'Select Store'}</span>
            </button>
          </div>
        </div>

        <div className="reports-access-denied" style={{ minHeight: '50vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="reports-access-denied-content">
            <Lock size={48} className="reports-access-denied-icon" />
            <h2>Access Denied</h2>
            <p>You need the Inventory Management module to import stock for <strong>{branchName}</strong>.</p>
            <p className="reports-access-denied-sub">Contact your administrator to subscribe.</p>
            <button 
              className="reports-access-denied-btn" 
              onClick={() => {
                // ✅ Open the subscription modal instead of going back
                guardAction('inventory_mgmt');
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
                    onClick={() => { setSelectedBranchId(b.branchId); setStoreModalOpen(false); handleClearFile(); }}>
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
      <div className="reports-page">
        <div className="reports-header">
          <div className="reports-header-left">
            <button className="reports-header-back" onClick={() => navigate('/inventory/products')}><ArrowLeft size={18} /></button>
            <div>
              <div className="reports-header-title">Import Products</div>
              <div className="reports-header-sub">{branchName}</div>
            </div>
          </div>
          <div className="reports-header-right">
            <button className="reports-store-selector" onClick={() => setStoreModalOpen(true)}>
              <Store size={14} /> <span>{branchName || 'Select Store'}</span>
            </button>
          </div>
        </div>

        {/* ─── Toolbar ─────────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '16px 0' }}>
          <button onClick={() => {
            if (!guardAction('inventory_mgmt')) return;
            downloadProductTemplate();
          }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#F8FAFC', color: '#475569', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            <FileDown size={15} /> Download Template
          </button>
          <button
            onClick={() => {
              if (!guardAction('inventory_mgmt')) return;
              downloadProductsForReimport(allProducts, (branchName || 'branch').toLowerCase().replace(/\s+/g, '-'));
            }}
            disabled={!allProducts.length}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#F8FAFC', color: '#475569', fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: allProducts.length ? 1 : 0.5 }}>
            <Download size={15} /> Export Current Products (re-importable)
          </button>
          <button onClick={() => {
            if (!guardAction('inventory_mgmt')) return;
            fetchBranchData();
          }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#F8FAFC', color: '#475569', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            <RefreshCw size={15} className={loadingProducts ? 'animate-spin' : ''} /> Refresh Product List
          </button>
        </div>

        {/* ─── Dropzone ────────────────────────────────────────────────────────── */}
        {!fileName ? (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            onClick={() => {
              if (!guardAction('inventory_mgmt')) return;
              fileInputRef.current?.click();
            }}
            style={{
              border: `2px dashed ${dragActive ? '#0891B2' : '#CBD5E1'}`,
              background: dragActive ? '#EFF6FF' : '#F8FAFC',
              borderRadius: 12, padding: '48px 24px', textAlign: 'center', cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            <UploadCloud size={36} color={dragActive ? '#0891B2' : '#94A3B8'} style={{ marginBottom: 10 }} />
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>
              Drag & drop a CSV file here
            </div>
            <div style={{ fontSize: 13, color: '#64748B' }}>or click to browse — use the template above for the correct format</div>
            <input ref={fileInputRef} type="file" accept=".csv" style={{ display: 'none' }}
              onChange={(e) => {
                if (!guardAction('inventory_mgmt')) return;
                handleFile(e.target.files?.[0]);
              }} />
          </div>
        ) : (
          <>
            {/* ─── File summary bar ──────────────────────────────────────────── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, marginBottom: 12, flexWrap: 'wrap' }}>
              <FileSpreadsheet size={20} color="#0891B2" />
              <div style={{ fontWeight: 700, fontSize: 13, color: '#0F172A' }}>{fileName}</div>
              <div style={{ display: 'flex', gap: 8, marginLeft: 8, flexWrap: 'wrap' }}>
                <span style={{ padding: '2px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700, background: '#DCFCE7', color: '#16A34A' }}>{summary.creates} new</span>
                <span style={{ padding: '2px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700, background: '#FEF3C7', color: '#B45309' }}>{summary.updates} update</span>
                <span style={{ padding: '2px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700, background: '#FEE2E2', color: '#EF4444' }}>{summary.errors} errors</span>
                {summary.excluded > 0 && <span style={{ padding: '2px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700, background: '#F1F5F9', color: '#64748B' }}>{summary.excluded} excluded</span>}
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569', cursor: 'pointer' }}>
                  <input type="checkbox" checked={skipErrors} onChange={(e) => setSkipErrors(e.target.checked)} />
                  Skip rows with errors
                </label>
                <button onClick={() => {
                  if (!guardAction('inventory_mgmt')) return;
                  handleClearFile();
                }} style={{ display: 'flex', alignItems: 'center', gap: 4, border: 'none', background: 'none', color: '#EF4444', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                  <X size={14} /> Remove file
                </button>
              </div>
            </div>

            {blockingErrors && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FEE2E2', color: '#EF4444', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
                <AlertTriangle size={16} /> Fix the errors below or enable "Skip rows with errors" to continue.
              </div>
            )}

            {/* ─── Table preview ──────────────────────────────────────────────── */}
            <div className="reports-list-card" style={{ overflowX: 'auto', marginBottom: 16 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #E2E8F0', background: '#F8FAFC' }}>
                    {['', 'Status', 'SKU', 'Name', 'Category', 'Unit', 'Items/Unit', 'Price', 'Cost', 'Stock', 'Low Alert', 'Status', 'Notes'].map((h) => (
                      <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {evaluatedRows.map((row) => {
                    const excluded = excludedIndexes.has(row._index);
                    const unitDef = UNITS.find((u) => u.value === (row.unit || 'each').trim().toLowerCase());
                    return (
                      <tr key={row._index} style={{ borderBottom: '1px solid #F1F5F9', opacity: excluded ? 0.4 : 1, background: row.errors.length ? '#FFF9F9' : '#fff' }}>
                        <td style={{ padding: '6px 8px' }}>
                          <button onClick={() => {
                            if (!guardAction('inventory_mgmt')) return;
                            toggleExcludeRow(row._index);
                          }} title={excluded ? 'Include row' : 'Exclude row'}
                            style={{ border: 'none', background: 'none', cursor: 'pointer' }}>
                            <Trash2 size={14} color={excluded ? '#CBD5E1' : '#EF4444'} />
                          </button>
                        </td>
                        <td style={{ padding: '6px 8px' }}><StatusBadge action={row.action} hasErrors={row.errors.length > 0} /></td>
                        <td style={{ padding: '6px 8px', minWidth: 110 }}>
                          <input style={fieldInput()} value={row.sku || ''} onChange={(e) => updateRowField(row._index, 'sku', e.target.value)} />
                        </td>
                        <td style={{ padding: '6px 8px', minWidth: 150 }}>
                          <input style={fieldInput()} value={row.name || ''} onChange={(e) => updateRowField(row._index, 'name', e.target.value)} />
                        </td>
                        <td style={{ padding: '6px 8px', minWidth: 120 }}>
                          <input style={fieldInput()} value={row.category || ''} onChange={(e) => updateRowField(row._index, 'category', e.target.value)} placeholder="No Category" />
                        </td>
                        <td style={{ padding: '6px 8px', minWidth: 90 }}>
                          <select style={fieldInput()} value={(row.unit || 'each').toLowerCase()} onChange={(e) => updateRowField(row._index, 'unit', e.target.value)}>
                            {UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                          </select>
                        </td>
                        <td style={{ padding: '6px 8px', minWidth: 70 }}>
                          {unitDef?.requiresQuantityPerUnit ? (
                            <input type="number" style={fieldInput()} value={row.itemsPerUnit || ''} onChange={(e) => updateRowField(row._index, 'itemsPerUnit', e.target.value)} />
                          ) : <span style={{ color: '#CBD5E1', fontSize: 12 }}>—</span>}
                        </td>
                        <td style={{ padding: '6px 8px', minWidth: 80 }}>
                          <input style={fieldInput()} value={row.sellingPrice || ''} onChange={(e) => updateRowField(row._index, 'sellingPrice', e.target.value)} />
                        </td>
                        <td style={{ padding: '6px 8px', minWidth: 80 }}>
                          <input style={fieldInput()} value={row.costPrice || ''} onChange={(e) => updateRowField(row._index, 'costPrice', e.target.value)} />
                        </td>
                        <td style={{ padding: '6px 8px', minWidth: 70 }}>
                          <input type="number" style={fieldInput()} value={row.currentStock || ''} onChange={(e) => updateRowField(row._index, 'currentStock', e.target.value)} />
                        </td>
                        <td style={{ padding: '6px 8px', minWidth: 70 }}>
                          <input type="number" style={fieldInput()} value={row.lowStockThreshold || ''} onChange={(e) => updateRowField(row._index, 'lowStockThreshold', e.target.value)} />
                        </td>
                        <td style={{ padding: '6px 8px', minWidth: 90 }}>
                          <select style={fieldInput()} value={(row.status || 'active').toLowerCase()} onChange={(e) => updateRowField(row._index, 'status', e.target.value)}>
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                          </select>
                        </td>
                        <td style={{ padding: '6px 8px', minWidth: 220, fontSize: 11, color: '#EF4444' }}>
                          {row.errors.map((err, i) => <div key={i}>• {err}</div>)}
                          {row.action === 'update' && row.errors.length === 0 && (
                            <div style={{ color: '#B45309' }}>Updating: {row.targetProductId}</div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ─── Import controls ────────────────────────────────────────────── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
              <button
                onClick={handleImport}
                disabled={!canImport}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 22px', borderRadius: 8, border: 'none', background: '#0891B2', color: '#fff', fontWeight: 700, fontSize: 14, cursor: canImport ? 'pointer' : 'not-allowed', opacity: canImport ? 1 : 0.5 }}
              >
                {importing ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} />}
                {importing ? `Importing ${importProgress.current}/${importProgress.total}...` : `Import ${rowsToImport.length} Product${rowsToImport.length === 1 ? '' : 's'}`}
              </button>
              {importing && (
                <span style={{ fontSize: 12, color: '#64748B' }}>Processing: {importProgress.label}</span>
              )}
            </div>

            {/* ─── Results ─────────────────────────────────────────────────────── */}
            {importResults && (
              <div className="reports-list-card" style={{ padding: 16, marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <CheckCircle2 size={20} color="#16A34A" />
                  <div style={{ fontWeight: 700, fontSize: 14 }}>
                    Import complete — {successCount} succeeded, {failCount} failed
                  </div>
                </div>
                {failCount > 0 && (
                  <>
                    <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid #FEE2E2', borderRadius: 8, marginBottom: 10 }}>
                      {importResults.filter((r) => !r.success).map((r, i) => (
                        <div key={i} style={{ padding: '8px 12px', borderBottom: '1px solid #FEF2F2', fontSize: 12 }}>
                          <strong>{r.row.sku}</strong> — {r.row.name}: <span style={{ color: '#EF4444' }}>{r.error}</span>
                        </div>
                      ))}
                    </div>
                    <button onClick={handleDownloadFailedRows} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#F8FAFC', color: '#475569', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
                      Download Failed Rows
                    </button>
                  </>
                )}
                <div style={{ marginTop: 12 }}>
                  <button onClick={() => navigate('/inventory/products')} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#0891B2', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                    Back to Products
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ─── Store selector modal ────────────────────────────────────────────── */}
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
                    onClick={() => { setSelectedBranchId(b.branchId); setStoreModalOpen(false); handleClearFile(); }}>
                    {b.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ─── Module subscription modal ────────────────────────────────────── */}
      {gateModalModuleId && (
        <ModuleSubscriptionModal
          moduleId={gateModalModuleId}
          moduleState={getModuleState(gateModalModuleId)}
          onClose={closeGateModal}
        />
      )}
    </>
  );
}