// src/pages/Inventory/ProductForm.jsx
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  ArrowLeft, Upload, X, Plus, Package, RefreshCw, AlertTriangle, Search, ArrowLeftRight,
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { uploadProductImage, deleteProductImage } from '../services/productImageApi';
import PackLinksEditor from '../components/common/PackLinksEditor';
import { computeUnitMultiplier, parsePackLinks } from '../utils/stockTransfer';
import '../styles/ReportsShared.css';

const UNITS = [
  { value: 'each', label: 'Each', requiresQuantityPerUnit: false },
  { value: 'kg', label: 'Kilogram (kg)', requiresQuantityPerUnit: false },
  { value: 'meter', label: 'Meter (m)', requiresQuantityPerUnit: false },
  { value: 'box', label: 'Box', requiresQuantityPerUnit: true, placeholder: 'Items per box' },
  { value: 'pack', label: 'Pack', requiresQuantityPerUnit: true, placeholder: 'Items per pack' },
];

const DASHBOARD_POS_ID = 'web-dashboard';

const formatPriceInput = (text) => {
  if (!text || text === '') return '0.00';
  const numericOnly = text.replace(/[^0-9]/g, '');
  if (!numericOnly) return '0.00';
  const cents = parseInt(numericOnly, 10);
  const dollars = Math.floor(cents / 100);
  const remainingCents = cents % 100;
  return `${dollars}.${remainingCents.toString().padStart(2, '0')}`;
};

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

function fieldInput(props) {
  return { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 14, boxSizing: 'border-box', ...props };
}

const emptyForm = {
  sku: '', name: '', barcode: '', categoryId: '', categoryName: 'No Category',
  unit: 'each', itemsPerUnit: '', description: '',
  sellingPrice: '0.00', costPrice: '0.00',
  trackInventory: true, currentStock: '0', lowStockThreshold: '0',
  status: 'active',
  taxable: false, taxName: '', taxPercent: '0', taxInclusive: false,
};

export default function ProductForm() {
  const navigate = useNavigate();
  const location = useLocation();
  const { productId } = useParams();
  const isEdit = !!productId;

  const { apiFetch, businessId, branches, baseCurrency, activeStaff, userProfile } = useAppContext();
  const staffId = activeStaff?.staffId || userProfile?.uid || 'dashboard';
  const staffName = activeStaff?.name || userProfile?.name || userProfile?.email?.split('@')[0] || 'Owner';

  const branchId = location.state?.branchId || branches?.[0]?.branchId;
  const branchName = branches?.find((b) => b.branchId === branchId)?.name || '';

  const [form, setForm] = useState(emptyForm);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(isEdit);
  const [loadingSku, setLoadingSku] = useState(!isEdit);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState(null);
  const [skuError, setSkuError] = useState(null);

  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [existingImageUrl, setExistingImageUrl] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  const [stockAdjustType, setStockAdjustType] = useState('add');
  const [adjustmentValue, setAdjustmentValue] = useState('');
  const [calculatedStock, setCalculatedStock] = useState(0);
  const [originalStock, setOriginalStock] = useState(0);
  const [adjustReason, setAdjustReason] = useState('');
  const [adjusting, setAdjusting] = useState(false);
  const [recentMovements, setRecentMovements] = useState([]);

  const [conversionModalOpen, setConversionModalOpen] = useState(false);
  const [conversionQuantity, setConversionQuantity] = useState('');
  const [selectedReceivingProduct, setSelectedReceivingProduct] = useState(null);
  const [receivingSearch, setReceivingSearch] = useState('');
  const [receivingResults, setReceivingResults] = useState([]);
  const [searchingProducts, setSearchingProducts] = useState(false);
  const [resolvingReceivingProduct, setResolvingReceivingProduct] = useState(false);
  const [conversionResult, setConversionResult] = useState({
    fromQty: 0, totalIndividualItems: 0, receivingUnitSize: 1, evenSplit: true,
    toQty: 0, remainingStock: 0, hasEnoughStock: false,
  });

  const [packLinks, setPackLinks] = useState([]);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transferSelectedLinkId, setTransferSelectedLinkId] = useState(null);
  const [transferQty, setTransferQty] = useState('1');
  const [transferring, setTransferring] = useState(false);
  const [transferConfirmOpen, setTransferConfirmOpen] = useState(false);

  const [parentOptions, setParentOptions] = useState([]);
  const [transferDirection, setTransferDirection] = useState('down');
  const [transferSelectedParentId, setTransferSelectedParentId] = useState(null);

  // ✅ NEW — dedicated "why can't I transfer" modal. Replaces disabling
  // the Review Transfer button outright: the button is now always
  // clickable, and if the transfer isn't actually possible yet, this modal
  // explains exactly why (with the specific product names involved)
  // instead of the person staring at a greyed-out button with no idea
  // what's wrong.
  const [transferBlockedInfo, setTransferBlockedInfo] = useState(null); // { title, message } | null

  const selectedUnit = UNITS.find((u) => u.value === form.unit) || UNITS[0];
  const isPackOrBox = selectedUnit?.requiresQuantityPerUnit;

const generateNextSKU = useCallback(async () => {
  setLoadingSku(true);
  try {
    const res = await apiFetch(`/business/${businessId}/branches/${branchId}/products/next-sku`);
    setField('sku', res.sku);
  } catch (error) {
    console.error('Error generating SKU:', error);
    setField('sku', String(Date.now()).slice(-6));
  } finally {
    setLoadingSku(false);
  }
}, [apiFetch, businessId, branchId]);
  useEffect(() => {
    if (businessId && branchId && !isEdit) {
      generateNextSKU();
    }
  }, [businessId, branchId, generateNextSKU, isEdit]);

  const loadCategories = useCallback(async () => {
    if (!businessId || !branchId) return;
    try {
      const res = await apiFetch(`/business/${businessId}/branches/${branchId}/categories`);
      let categoryArray = Array.isArray(res) ? [...res] : [];
      const hasNoCategory = categoryArray.some((c) => c.name === 'No Category');
      if (!hasNoCategory) {
        categoryArray.push({ categoryId: 'no-category', name: 'No Category' });
      }
      categoryArray.sort((a, b) => {
        if (a.name === 'No Category') return -1;
        if (b.name === 'No Category') return 1;
        return a.name.localeCompare(b.name);
      });
      setCategories(categoryArray);
    } catch (e) {
      console.error('Load categories error:', e);
      setCategories([{ categoryId: 'no-category', name: 'No Category' }]);
    }
  }, [apiFetch, businessId, branchId]);

  const loadProduct = useCallback(async () => {
    if (!isEdit || !businessId || !branchId) return;
    setLoading(true);
    setError(null);
    try {
      const p = await apiFetch(`/business/${businessId}/branches/${branchId}/products/${productId}`);
      setForm({
        sku: p.sku || '',
        name: p.name || '',
        barcode: p.barcode || '',
        categoryId: p.categoryId || 'no-category',
        categoryName: p.category || 'No Category',
        unit: p.unit || 'each',
        itemsPerUnit: p.itemsPerUnit ? String(p.itemsPerUnit) : '',
        description: p.description || '',
        sellingPrice: Number(p.sellingPrice || 0).toFixed(2),
        costPrice: Number(p.costPrice || 0).toFixed(2),
        trackInventory: p.trackInventory !== false,
        currentStock: String(p.currentStock ?? 0),
        lowStockThreshold: String(p.lowStockThreshold ?? 0),
        status: p.status || 'active',
        taxable: !!p.taxable,
        taxName: p.taxName || '',
        taxPercent: p.taxPercent ? String(p.taxPercent) : '0',
        taxInclusive: !!p.taxInclusive,
      });
      setOriginalStock(p.currentStock || 0);
      setExistingImageUrl(p.imageUrl || null);

      const rawLinks = parsePackLinks(p.packLinks);
      if (rawLinks.length > 0) {
        const resolved = await Promise.all(
          rawLinks.map(async (link) => {
            try {
              const target = await apiFetch(`/business/${businessId}/branches/${branchId}/products/${link.targetProductId}`);
              return {
                id: link.id,
                targetProductId: link.targetProductId,
                qty: link.qty,
                targetName: target?.name || 'Unknown product',
                targetSku: target?.sku || '',
                targetItemsPerUnit: target?.itemsPerUnit || 1,
                targetUnit: target?.unit || 'each',
              };
            } catch (linkErr) {
              console.warn('Failed to resolve pack link target:', linkErr.message);
              return {
                id: link.id,
                targetProductId: link.targetProductId,
                qty: link.qty,
                targetName: 'Unknown product',
                targetSku: '',
                targetItemsPerUnit: 1,
                targetUnit: 'each',
              };
            }
          })
        );
        setPackLinks(resolved);
      } else {
        setPackLinks([]);
      }

      try {
        const movements = await apiFetch(
          `/business/${businessId}/branches/${branchId}/stock-movements?productId=${productId}&limit=10`
        );
        setRecentMovements(Array.isArray(movements) ? movements : []);
      } catch (movErr) {
        console.warn('Failed to load stock movements:', movErr);
        setRecentMovements([]);
      }
    } catch (e) {
      console.error('Load product error:', e);
      setError('Failed to load product');
    } finally {
      setLoading(false);
    }
  }, [isEdit, apiFetch, businessId, branchId, productId]);

  useEffect(() => { loadCategories(); }, [loadCategories]);
  useEffect(() => { loadProduct(); }, [loadProduct]);

  const loadParentOptions = useCallback(async () => {
    if (!isEdit || !productId || !businessId || !branchId) { setParentOptions([]); return []; }
    try {
      const res = await apiFetch(`/business/${businessId}/branches/${branchId}/products/${productId}/parent-links`);
      const resolved = Array.isArray(res) ? res : [];
      setParentOptions(resolved);
      return resolved;
    } catch (e) {
      console.warn('Failed to load consolidate-up options:', e.message);
      setError(`Could not load linked parent products: ${e.message || 'request failed'}`);
      setParentOptions([]);
      return [];
    }
  }, [apiFetch, businessId, branchId, productId, isEdit]);

  useEffect(() => { loadParentOptions(); }, [loadParentOptions]);

  useEffect(() => {
    const currentStock = parseInt(form.currentStock) || 0;
    if (stockAdjustType === 'override') {
      const val = parseInt(adjustmentValue);
      setCalculatedStock(isNaN(val) ? currentStock : val);
    } else if (stockAdjustType === 'add') {
      const val = parseInt(adjustmentValue);
      setCalculatedStock(currentStock + (isNaN(val) ? 0 : val));
    } else if (stockAdjustType === 'subtract') {
      const val = parseInt(adjustmentValue);
      setCalculatedStock(currentStock - (isNaN(val) ? 0 : val));
    }
  }, [stockAdjustType, adjustmentValue, form.currentStock]);

  useEffect(() => {
    const qty = parseInt(conversionQuantity);
    const itemsPerUnitNum = parseInt(form.itemsPerUnit);
    const currentStock = parseInt(form.currentStock) || 0;

    if (!isNaN(qty) && qty > 0 && itemsPerUnitNum > 0) {
      const totalIndividualItems = qty * itemsPerUnitNum;
      const remainingStock = currentStock - qty;

      const receivingUnitSize = selectedReceivingProduct?.itemsPerUnit > 0
        ? selectedReceivingProduct.itemsPerUnit
        : 1;
      const rawToQty = totalIndividualItems / receivingUnitSize;
      const evenSplit = Number.isInteger(rawToQty);
      const toQty = evenSplit ? rawToQty : Math.floor(rawToQty);

      setConversionResult({
        fromQty: qty,
        totalIndividualItems,
        receivingUnitSize,
        evenSplit,
        toQty,
        remainingStock,
        hasEnoughStock: remainingStock >= 0,
      });
    } else {
      setConversionResult({
        fromQty: 0, totalIndividualItems: 0, receivingUnitSize: 1, evenSplit: true,
        toQty: 0, remainingStock: 0, hasEnoughStock: false,
      });
    }
  }, [conversionQuantity, form.itemsPerUnit, form.currentStock, selectedReceivingProduct]);

  const handleSelectReceivingProduct = useCallback(async (product) => {
    setResolvingReceivingProduct(true);
    setReceivingResults([]);
    setReceivingSearch(product.name);
    try {
      const full = await apiFetch(`/business/${businessId}/branches/${branchId}/products/${product.productId}`);
      setSelectedReceivingProduct({
        productId: full.productId || product.productId,
        name: full.name || product.name,
        sku: full.sku || product.sku,
        unit: full.unit || 'each',
        itemsPerUnit: full.itemsPerUnit || 1,
        currentStock: full.currentStock ?? product.currentStock ?? 0,
      });
    } catch (err) {
      console.error('Failed to resolve receiving product:', err.message);
      setSelectedReceivingProduct({
        productId: product.productId,
        name: product.name,
        sku: product.sku,
        unit: product.unit || 'each',
        itemsPerUnit: 0,
        currentStock: product.currentStock || 0,
      });
      setError('Could not verify the receiving product\'s unit size — please try selecting it again.');
    } finally {
      setResolvingReceivingProduct(false);
    }
  }, [apiFetch, businessId, branchId]);

  const setField = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const handleImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const checkSkuAvailable = useCallback(async (sku) => {
    if (!sku.trim() || !businessId || !branchId) return;
    try {
      const res = await apiFetch(
        `/business/${businessId}/branches/${branchId}/products/sku-check?sku=${encodeURIComponent(sku.trim())}${isEdit ? `&excludeId=${productId}` : ''}`
      );
      setSkuError(res?.exists ? `SKU "${sku.trim().toUpperCase()}" already exists` : null);
    } catch (e) {}
  }, [apiFetch, businessId, branchId, isEdit, productId]);

  const handleAddCategory = useCallback(async () => {
    if (!newCategoryName.trim()) return;
    try {
      const res = await apiFetch(`/business/${businessId}/branches/${branchId}/categories`, {
        method: 'POST',
        body: JSON.stringify({ name: newCategoryName.trim(), posId: DASHBOARD_POS_ID, staffId }),
      });
      await loadCategories();
      setField('categoryId', res.categoryId);
      setField('categoryName', res.name);
      setNewCategoryName('');
      setAddCategoryOpen(false);
    } catch (e) {
      console.error('Add category error:', e);
      setError(e.message || 'Failed to add category');
    }
  }, [apiFetch, businessId, branchId, newCategoryName, staffId, loadCategories]);

  const searchReceivingProducts = useCallback(async (query) => {
    if (!query.trim() || !businessId || !branchId) {
      setReceivingResults([]);
      return;
    }
    setSearchingProducts(true);
    try {
      const res = await apiFetch(
        `/business/${businessId}/branches/${branchId}/products/search?q=${encodeURIComponent(query.trim())}&limit=20`
      );
      const results = Array.isArray(res) ? res : [];
      const filtered = results.filter(p => p.productId !== productId);
      setReceivingResults(filtered);
    } catch (e) {
      console.error('Search products error:', e);
      setReceivingResults([]);
    } finally {
      setSearchingProducts(false);
    }
  }, [apiFetch, businessId, branchId, productId]);

  const handleConversion = useCallback(async () => {
    if (!conversionResult.totalIndividualItems || conversionResult.totalIndividualItems <= 0) {
      setError('Invalid conversion quantity');
      return;
    }
    if (!conversionResult.hasEnoughStock) {
      setError(`Cannot convert ${conversionResult.fromQty} ${form.unit}(s). Only ${parseInt(form.currentStock)} ${form.unit}(s) available.`);
      return;
    }
    if (!selectedReceivingProduct) {
      setError('Please select a receiving product');
      return;
    }

    if (!conversionResult.evenSplit) {
      setError(
        `${conversionResult.fromQty} ${form.unit}(s) = ${conversionResult.totalIndividualItems} individual items, which doesn't split evenly into ` +
        `${selectedReceivingProduct.name}'s unit size of ${conversionResult.receivingUnitSize}. Choose a different quantity or receiving product.`
      );
      return;
    }

    setAdjusting(true);
    setError(null);
    try {
      await apiFetch(`/business/${businessId}/branches/${branchId}/stock-movements`, {
        method: 'POST',
        body: JSON.stringify({
          productId: selectedReceivingProduct.productId,
          sku: selectedReceivingProduct.sku,
          productName: selectedReceivingProduct.name,
          type: 'stock_addition',
          reason: `Converted ${conversionResult.fromQty} ${form.unit}(s) (${conversionResult.totalIndividualItems} individual items) into ${conversionResult.toQty} × ${selectedReceivingProduct.name} (${selectedReceivingProduct.unit || 'unit'})`,
          quantityChange: conversionResult.toQty,
          unit: selectedReceivingProduct.unit || 'each',
          posId: DASHBOARD_POS_ID,
          staffId,
          cashierName: staffName,
          referenceType: 'conversion_in',
        }),
      });

      await apiFetch(`/business/${businessId}/branches/${branchId}/stock-movements`, {
        method: 'POST',
        body: JSON.stringify({
          productId: productId,
          sku: form.sku,
          productName: form.name,
          type: 'stock_reduction',
          reason: `Converted ${conversionResult.fromQty} ${form.unit}(s) (${conversionResult.totalIndividualItems} individual items) into ${conversionResult.toQty} × ${selectedReceivingProduct.name} (${selectedReceivingProduct.unit || 'unit'})`,
          quantityChange: -conversionResult.fromQty,
          unit: form.unit,
          posId: DASHBOARD_POS_ID,
          staffId,
          cashierName: staffName,
          referenceType: 'conversion_out',
        }),
      });

      await loadProduct();
      setConversionModalOpen(false);
      setConversionQuantity('');
      setSelectedReceivingProduct(null);
      setReceivingSearch('');
      setReceivingResults([]);
    } catch (e) {
      console.error('Conversion error:', e);
      setError(e.message || 'Failed to process conversion');
    } finally {
      setAdjusting(false);
    }
  }, [conversionResult, selectedReceivingProduct, apiFetch, businessId, branchId, productId, form, staffId, staffName, loadProduct]);

  const getLinkMultiplier = useCallback((link) => {
    if (!link) return null;
    return computeUnitMultiplier(parseInt(form.itemsPerUnit) || 1, link.targetItemsPerUnit || 1);
  }, [form.itemsPerUnit]);

  const getParentMultiplier = useCallback((parentOption) => {
    if (!parentOption) return null;
    return computeUnitMultiplier(parentOption.parentItemsPerUnit || 1, parseInt(form.itemsPerUnit) || 1);
  }, [form.itemsPerUnit]);

  const openTransferModal = useCallback(async () => {
    const freshParentOptions = await loadParentOptions();
    const hasChildren = packLinks.length > 0;
    setTransferDirection(hasChildren ? 'down' : 'up');
    setTransferSelectedLinkId(hasChildren ? (packLinks[0]?.id || null) : null);
    setTransferSelectedParentId(hasChildren ? null : (freshParentOptions[0]?.id || null));
    setTransferQty('1');
    setError(null);
    setTransferBlockedInfo(null);
    setTransferModalOpen(true);
  }, [loadParentOptions, packLinks]);

  // ✅ FIX — the "Review Transfer" button used to be disabled outright
  // (`disabled={!transferSelectedParentId}` / `disabled={!transferSelectedLinkId}`)
  // whenever validation would fail, which just looked broken/frozen with
  // no explanation. It's now ALWAYS clickable. Every validation failure
  // here now opens transferBlockedInfo — a dedicated modal naming the
  // exact products involved and exactly why the transfer can't proceed —
  // instead of a small inline red banner easy to miss, and instead of a
  // silently-disabled button with no explanation at all.
  const openTransferConfirm = () => {
    if (transferDirection === 'up') {
      const parent = parentOptions.find((p) => p.id === transferSelectedParentId);
      const qty = parseInt(transferQty, 10);

      if (!parent) {
        setTransferBlockedInfo({
          title: "Can't Transfer Yet",
          message: `Choose which product ${form.name || 'this product'} should be consolidated into before reviewing the transfer.`,
        });
        return;
      }
      if (!qty || qty <= 0) {
        setTransferBlockedInfo({
          title: "Can't Transfer Yet",
          message: `Enter a quantity of ${form.name || 'this product'} greater than zero to consolidate into ${parent.parentName}.`,
        });
        return;
      }

      const multiplier = getParentMultiplier(parent);
      if (!multiplier) {
        setTransferBlockedInfo({
          title: "Unit Sizes Don't Match",
          message:
            `You can't transfer ${form.name || 'this product'} into ${parent.parentName} yet because the unit sizes don't divide evenly: ` +
            `${parent.parentName}'s unit size (${parent.parentItemsPerUnit}) isn't a whole multiple of ${form.name || 'this product'}'s unit size ` +
            `(${parseInt(form.itemsPerUnit) || 1}). Fix the items-per-unit on one of these two products, then try again.`,
        });
        return;
      }

      const requestedParents = Math.floor(qty / multiplier);
      if (requestedParents < 1) {
        setTransferBlockedInfo({
          title: "Not Enough to Consolidate",
          message:
            `${qty} × ${form.name || 'this product'} isn't enough to build even one ${parent.parentName}. ` +
            `It takes ${multiplier} × ${form.name || 'this product'} (${form.unit}) to make 1 × ${parent.parentName}. ` +
            `Enter at least ${multiplier}.`,
        });
        return;
      }

      const currentChildStock = parseInt(form.currentStock) || 0;
      if (qty > currentChildStock) {
        setTransferBlockedInfo({
          title: "Not Enough Stock",
          message: `You can't transfer ${qty} × ${form.unit}(s) of ${form.name || 'this product'} into ${parent.parentName} — only ${currentChildStock} ${form.unit}(s) are in stock.`,
        });
        return;
      }

      setTransferBlockedInfo(null);
      setTransferConfirmOpen(true);
      return;
    }

    const link = packLinks.find((l) => l.id === transferSelectedLinkId);
    const qty = parseInt(transferQty, 10);

    if (!link) {
      setTransferBlockedInfo({
        title: "Can't Transfer Yet",
        message: `Choose what ${form.name || 'this product'} should break into before reviewing the transfer.`,
      });
      return;
    }
    if (!qty || qty <= 0) {
      setTransferBlockedInfo({
        title: "Can't Transfer Yet",
        message: `Enter a quantity of ${form.name || 'this product'} greater than zero to break into ${link.targetName}.`,
      });
      return;
    }

    const multiplier = getLinkMultiplier(link);
    if (!multiplier) {
      setTransferBlockedInfo({
        title: "Unit Sizes Don't Match",
        message:
          `You can't break ${form.name || 'this product'} into ${link.targetName} yet because the unit sizes don't divide evenly: ` +
          `${form.name || 'this product'}'s unit size (${parseInt(form.itemsPerUnit) || 1}) isn't a whole multiple of ${link.targetName}'s unit size ` +
          `(${link.targetItemsPerUnit || 1}). Fix the items-per-unit on one of these two products, then try again.`,
      });
      return;
    }

    const currentStock = parseInt(form.currentStock) || 0;
    if (qty > currentStock) {
      setTransferBlockedInfo({
        title: "Not Enough Stock",
        message: `You can't break ${qty} × ${form.unit}(s) of ${form.name || 'this product'} into ${link.targetName} — only ${currentStock} ${form.unit}(s) are in stock.`,
      });
      return;
    }

    setTransferBlockedInfo(null);
    setTransferConfirmOpen(true);
  };

  const executeManualTransfer = useCallback(async () => {
    if (transferDirection === 'up') {
      const parent = parentOptions.find((p) => p.id === transferSelectedParentId);
      const qty = parseInt(transferQty, 10);
      const multiplier = getParentMultiplier(parent);
      if (!parent || !qty || !multiplier) { setTransferConfirmOpen(false); return; }

      const requestedParents = Math.floor(qty / multiplier);
      if (requestedParents < 1) { setTransferConfirmOpen(false); return; }
      const childUnitsUsed = requestedParents * multiplier;

      setTransferring(true);
      setError(null);
      try {
        await apiFetch(`/business/${businessId}/branches/${branchId}/stock-movements`, {
          method: 'POST',
          body: JSON.stringify({
            productId: parent.id,
            sku: parent.parentSku,
            productName: parent.parentName,
            type: 'stock_addition',
            reason: `Stock transfer: consolidated ${childUnitsUsed} × ${form.unit} of ${form.name} → +${requestedParents} ${parent.parentUnit || 'unit'}(s)`,
            quantityChange: requestedParents,
            unit: parent.parentUnit || 'each',
            posId: DASHBOARD_POS_ID,
            staffId,
            cashierName: staffName,
            referenceType: 'box_consolidate_in',
            referenceId: productId,
          }),
        });

        await apiFetch(`/business/${businessId}/branches/${branchId}/stock-movements`, {
          method: 'POST',
          body: JSON.stringify({
            productId: productId,
            sku: form.sku,
            productName: form.name,
            type: 'stock_reduction',
            reason: `Stock transfer: consolidated ${childUnitsUsed} × ${form.unit} into +${requestedParents} ${parent.parentName} (${parent.parentUnit || 'unit'})`,
            quantityChange: -childUnitsUsed,
            unit: form.unit,
            posId: DASHBOARD_POS_ID,
            staffId,
            cashierName: staffName,
            referenceType: 'box_consolidate_out',
            referenceId: parent.id,
          }),
        });

        setTransferConfirmOpen(false);
        setTransferModalOpen(false);
        setTransferQty('1');
        await loadProduct();
        await loadParentOptions();
      } catch (e) {
        console.error('Manual consolidate error:', e);
        setTransferConfirmOpen(false);
        setError(e.message || 'Failed to transfer stock');
      } finally {
        setTransferring(false);
      }
      return;
    }

    const link = packLinks.find((l) => l.id === transferSelectedLinkId);
    const qty = parseInt(transferQty, 10);
    const multiplier = getLinkMultiplier(link);
    if (!link || !qty || !multiplier) { setTransferConfirmOpen(false); return; }
    const targetQty = qty * multiplier;

    setTransferring(true);
    setError(null);
    try {
      await apiFetch(`/business/${businessId}/branches/${branchId}/stock-movements`, {
        method: 'POST',
        body: JSON.stringify({
          productId: link.targetProductId,
          sku: link.targetSku,
          productName: link.targetName,
          type: 'stock_addition',
          reason: `Stock transfer: broke ${qty} × ${form.unit} of ${form.name} → +${targetQty} ${link.targetUnit || 'unit'}(s)`,
          quantityChange: targetQty,
          unit: link.targetUnit || 'each',
          posId: DASHBOARD_POS_ID,
          staffId,
          cashierName: staffName,
          referenceType: 'box_break_in',
          referenceId: productId,
        }),
      });

      await apiFetch(`/business/${businessId}/branches/${branchId}/stock-movements`, {
        method: 'POST',
        body: JSON.stringify({
          productId: productId,
          sku: form.sku,
          productName: form.name,
          type: 'stock_reduction',
          reason: `Stock transfer: broke ${qty} × ${form.unit} into +${targetQty} ${link.targetName} (${link.targetUnit || 'unit'})`,
          quantityChange: -qty,
          unit: form.unit,
          posId: DASHBOARD_POS_ID,
          staffId,
          cashierName: staffName,
          referenceType: 'box_break_out',
          referenceId: link.targetProductId,
        }),
      });

      setTransferConfirmOpen(false);
      setTransferModalOpen(false);
      setTransferQty('1');
      await loadProduct();
    } catch (e) {
      console.error('Manual transfer error:', e);
      setTransferConfirmOpen(false);
      setError(e.message || 'Failed to transfer stock');
    } finally {
      setTransferring(false);
    }
  }, [
    transferDirection, parentOptions, transferSelectedParentId, getParentMultiplier, loadParentOptions,
    packLinks, transferSelectedLinkId, transferQty, getLinkMultiplier,
    apiFetch, businessId, branchId, form, staffId, staffName, productId, loadProduct,
  ]);

  const handleAdjustStock = useCallback(async () => {
    const val = parseInt(adjustmentValue, 10);
    if (!val || val <= 0) { setError('Enter a valid quantity'); return; }

    if (stockAdjustType === 'subtract') {
      const currentStock = parseInt(form.currentStock) || 0;
      if (val > currentStock) {
        setError(`Cannot subtract ${val} ${form.unit}(s). Only ${currentStock} available.`);
        return;
      }
    }

    setAdjusting(true);
    setError(null);
    try {
      let type = 'stock_addition';
      let qtyChange = val;

      if (stockAdjustType === 'subtract') {
        type = 'stock_reduction';
        qtyChange = -val;
      } else if (stockAdjustType === 'override') {
        const currentStock = parseInt(form.currentStock) || 0;
        qtyChange = val - currentStock;
        if (qtyChange < 0) {
          type = 'stock_reduction';
        } else if (qtyChange > 0) {
          type = 'stock_addition';
        } else {
          setError('New stock quantity is the same as current');
          setAdjusting(false);
          return;
        }
      }

      const reasonText = stockAdjustType === 'override' 
        ? `Stock override: ${adjustReason.trim()}`
        : `${stockAdjustType === 'add' ? 'Added' : 'Removed'} ${val} ${form.unit}(s): ${adjustReason.trim()}`;

      await apiFetch(`/business/${businessId}/branches/${branchId}/stock-movements`, {
        method: 'POST',
        body: JSON.stringify({
          productId: productId,
          sku: form.sku,
          productName: form.name,
          type: type,
          reason: reasonText,
          quantityChange: qtyChange,
          unit: form.unit,
          posId: DASHBOARD_POS_ID,
          staffId,
          cashierName: staffName,
          referenceType: 'manual',
        }),
      });

      setAdjustmentValue('');
      setAdjustReason('');
      await loadProduct();
      setError(null);
    } catch (e) {
      console.error('Adjust stock error:', e);
      setError(e.message || 'Failed to adjust stock');
    } finally {
      setAdjusting(false);
    }
  }, [adjustmentValue, adjustReason, stockAdjustType, apiFetch, businessId, branchId, productId, form, staffId, staffName, loadProduct]);

  const validate = () => {
    if (!form.name.trim()) return 'Product name is required';
    if (!form.sku.trim()) return 'SKU is required';
    if (skuError) return skuError;
    if (isNaN(parseFloat(form.sellingPrice))) return 'Selling price is invalid';
    if (selectedUnit.requiresQuantityPerUnit && !form.itemsPerUnit) return `${selectedUnit.placeholder} is required`;
    return null;
  };

  const handleSave = useCallback(async () => {
    if (savingRef.current) return;

    const validationError = validate();
    if (validationError) { 
      setError(validationError); 
      return; 
    }

    savingRef.current = true;
    setSaving(true);
    setError(null);

    try {
      let savedProductId = productId;

      if (!isEdit) {
        const itemsPerUnitValue = selectedUnit?.requiresQuantityPerUnit ? parseInt(form.itemsPerUnit, 10) : 1;
        const finalStock = form.trackInventory ? (parseInt(form.currentStock, 10) || 0) : 0;

        try {
          const skuCheck = await apiFetch(
            `/business/${businessId}/branches/${branchId}/products/sku-check?sku=${encodeURIComponent(form.sku.trim().toUpperCase())}`
          );
          if (skuCheck.exists) {
            setError(`SKU "${form.sku}" already exists. Generating a new one...`);
            await generateNextSKU();
            savingRef.current = false;
            setSaving(false);
            return;
          }
        } catch (error) {
          console.error('SKU check error:', error);
        }

        const payload = {
          posId: DASHBOARD_POS_ID,
          staffId,
          cashierName: staffName,
          sku: form.sku.trim().toUpperCase(),
          barcode: form.barcode.trim() || null,
          name: form.name.trim().toUpperCase(),
          description: form.description.trim() || null,
          category: form.categoryName,
          categoryId: form.categoryId || 'no-category',
          unit: form.unit,
          itemsPerUnit: itemsPerUnitValue,
          sellingPrice: parseFloat(form.sellingPrice) || 0,
          sellingCurrency: baseCurrency?.code || 'USD',
          costPrice: parseFloat(form.costPrice) || 0,
          costCurrency: baseCurrency?.code || 'USD',
          markupPercent: 0,
          trackInventory: form.trackInventory,
          currentStock: 0,
          lowStockThreshold: parseInt(form.lowStockThreshold, 10) || 0,
          reservedStock: 0,
          availableStock: 0,
          taxable: false,
          taxName: null,
          taxPercent: 0,
          taxInclusive: false,
          status: form.status,
          packLinks: (selectedUnit?.requiresQuantityPerUnit && packLinks.length > 0)
            ? JSON.stringify(packLinks.map((l) => ({ id: l.id, targetProductId: l.targetProductId, qty: l.qty })))
            : null,
          storeIds: JSON.stringify([branchId]),
          posIds: JSON.stringify([DASHBOARD_POS_ID]),
          version: 1,
        };

        const created = await apiFetch(`/business/${businessId}/branches/${branchId}/products`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });

        savedProductId = created.productId;

        if (form.trackInventory && finalStock > 0 && created?.productId) {
          try {
            await apiFetch(`/business/${businessId}/branches/${branchId}/stock-movements`, {
              method: 'POST',
              body: JSON.stringify({
                productId: created.productId,
                sku: payload.sku,
                productName: payload.name,
                type: 'initial_stock',
                reason: 'Product creation - initial stock',
                quantityChange: finalStock,
                unit: form.unit,
                posId: DASHBOARD_POS_ID,
                staffId,
                cashierName: staffName,
                referenceType: 'product_creation',
                referenceId: created.productId,
              }),
            });
          } catch (movErr) {
            console.warn('Initial stock movement failed:', movErr.message);
          }
        }

let uploadedImageUrl = null;
if (imageFile && created?.productId) {
  try {
    const result = await uploadProductImage(apiFetch, { businessId, branchId, productId: created.productId, staffId, file: imageFile });
    uploadedImageUrl = result?.imageUrl || null;
  } catch (imgErr) {
    console.warn('Image upload failed:', imgErr.message);
  }
}

navigate('/inventory/products', {
  state: {
    savedProduct: {
      ...created,
      currentStock: finalStock,
      imageUrl: uploadedImageUrl,
    },
    isEdit: false,
  },
});
return;
      }

      const itemsPerUnitValue = selectedUnit?.requiresQuantityPerUnit ? parseInt(form.itemsPerUnit, 10) : 1;
      const finalStock = form.trackInventory ? calculatedStock : 0;

      const originalStockValue = parseInt(originalStock) || 0;
      const newStockValue = finalStock;
      let stockChanged = form.trackInventory && (newStockValue !== originalStockValue);
      let stockMovementType = null;
      let stockAdjustQty = 0;

      if (stockChanged) {
        if (stockAdjustType === 'override') {
          stockMovementType = 'stock_override';
          stockAdjustQty = newStockValue - originalStockValue;
        } else if (newStockValue > originalStockValue) {
          stockMovementType = 'stock_addition';
          stockAdjustQty = newStockValue - originalStockValue;
        } else if (newStockValue < originalStockValue) {
          stockMovementType = 'stock_reduction';
          stockAdjustQty = originalStockValue - newStockValue;
        }
      }

      try {
        const skuCheck = await apiFetch(
          `/business/${businessId}/branches/${branchId}/products/sku-check?sku=${encodeURIComponent(form.sku.trim().toUpperCase())}&excludeId=${productId}`
        );
        if (skuCheck.exists) {
          setError(`SKU "${form.sku}" already exists. Please use a different SKU.`);
          savingRef.current = false;
          setSaving(false);
          return;
        }
      } catch (error) {
        console.error('SKU check error:', error);
      }

      const payload = {
        staffId,
        cashierName: staffName,
        posId: DASHBOARD_POS_ID,
        sku: form.sku.trim().toUpperCase(),
        barcode: form.barcode.trim() || null,
        name: form.name.trim().toUpperCase(),
        description: form.description.trim() || null,
        category: form.categoryName,
        categoryId: form.categoryId || 'no-category',
        unit: form.unit,
        itemsPerUnit: itemsPerUnitValue,
        sellingPrice: parseFloat(form.sellingPrice) || 0,
        sellingCurrency: baseCurrency?.code || 'USD',
        costPrice: parseFloat(form.costPrice) || 0,
        costCurrency: baseCurrency?.code || 'USD',
        markupPercent: 0,
        trackInventory: form.trackInventory,
        lowStockThreshold: parseInt(form.lowStockThreshold, 10) || 0,
        status: form.status,
        packLinks: (isPackOrBox && packLinks.length > 0)
          ? JSON.stringify(packLinks.map((l) => ({ id: l.id, targetProductId: l.targetProductId, qty: l.qty })))
          : null,
      };

      await apiFetch(`/business/${businessId}/branches/${branchId}/products/${productId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });

      if (stockChanged) {
        try {
          let reasonText = '';
          let movementType = stockMovementType;

          if (stockAdjustType === 'override') {
            reasonText = `Stock override from ${originalStockValue} to ${newStockValue}`;
            movementType = 'stock_override';
          } else if (stockAdjustType === 'add') {
            reasonText = `Stock addition from ${originalStockValue} to ${newStockValue}`;
            movementType = 'stock_addition';
          } else if (stockAdjustType === 'subtract') {
            reasonText = `Stock reduction from ${originalStockValue} to ${newStockValue}`;
            movementType = 'stock_reduction';
          }

          const adjustReasonText = adjustReason.trim();
          if (adjustReasonText) {
            reasonText = `${reasonText} — ${adjustReasonText}`;
          }

          await apiFetch(`/business/${businessId}/branches/${branchId}/stock-movements`, {
            method: 'POST',
            body: JSON.stringify({
              productId: productId,
              sku: payload.sku,
              productName: payload.name,
              type: movementType,
              reason: reasonText,
              quantityChange: stockAdjustQty * (movementType === 'stock_reduction' ? -1 : 1),
              unit: form.unit,
              posId: DASHBOARD_POS_ID,
              staffId,
              cashierName: staffName,
              referenceType: 'product_update',
              referenceId: productId,
            }),
          });
        } catch (movErr) {
          console.warn('Stock movement failed:', movErr.message);
        }
      }
let finalImageUrl = existingImageUrl;
if (imageFile) {
  try {
    const result = await uploadProductImage(apiFetch, { businessId, branchId, productId, staffId, file: imageFile });
    finalImageUrl = result?.imageUrl || finalImageUrl;
  } catch (imgErr) {
    console.warn('Image upload failed:', imgErr.message);
  }
}

navigate('/inventory/products', {
  state: {
    savedProduct: {
      productId,
      sku: payload.sku,
      barcode: payload.barcode,
      name: payload.name,
      description: payload.description,
      category: payload.category,
      categoryId: payload.categoryId,
      unit: payload.unit,
      itemsPerUnit: payload.itemsPerUnit,
      sellingPrice: payload.sellingPrice,
      sellingCurrency: payload.sellingCurrency,
      costPrice: payload.costPrice,
      costCurrency: payload.costCurrency,
      trackInventory: payload.trackInventory,
      lowStockThreshold: payload.lowStockThreshold,
      status: payload.status,
      currentStock: finalStock,
      imageUrl: finalImageUrl,
    },
    isEdit: true,
  },
});
    } catch (e) {
      console.error('Save error:', e);
      if (e.message?.includes('SKU') || e.status === 409) {
        setError('This SKU already exists. Generating a new one...');
        await generateNextSKU();
      } else {
        setError(e.message || 'Failed to save product');
      }
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  }, [form, isEdit, productId, apiFetch, businessId, branchId, staffId, staffName, baseCurrency, imageFile, navigate, loadProduct, originalStock, stockAdjustType, calculatedStock, selectedUnit, generateNextSKU, adjustReason, packLinks]);

  const handleRemoveImage = useCallback(async () => {
    if (!existingImageUrl && !isEdit) { setImageFile(null); setImagePreview(null); return; }
    if (!window.confirm('Remove this product image?')) return;
    try {
      await deleteProductImage(apiFetch, { businessId, branchId, productId, staffId });
      setExistingImageUrl(null);
      setImageFile(null);
      setImagePreview(null);
    } catch (e) {
      console.error('Delete image error:', e);
      setError('Failed to remove image');
    }
  }, [apiFetch, businessId, branchId, productId, staffId, existingImageUrl, isEdit]);

  const showLoadingBar = loading || saving || uploadingImage;

  // Derived — currently-selected transfer target, used to make labels and
  // buttons in the Transfer modal name the exact product instead of
  // saying "this product" generically.
  const selectedTransferParent = transferDirection === 'up'
    ? parentOptions.find((p) => p.id === transferSelectedParentId) || null
    : null;
  const selectedTransferLink = transferDirection === 'down'
    ? packLinks.find((l) => l.id === transferSelectedLinkId) || null
    : null;

  // ─── RENDER ─────────────────────────────────────────────────────────────
  return (
    <>
      <LoadingBar visible={showLoadingBar} />
      <div className="reports-page">
        <div className="reports-header">
          <div className="reports-header-left">
            <button className="reports-header-back" onClick={() => navigate('/inventory/products')}>
              <ArrowLeft size={18} />
            </button>
            <div>
              <div className="reports-header-title">{isEdit ? 'Edit Product' : 'New Product'}</div>
              <div className="reports-header-sub">{branchName}</div>
            </div>
          </div>
        
        </div>

        {error && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FEE2E2', color: '#EF4444', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          {/* ─── MAIN FORM ────────────────────────────────────────────────── */}
          <div style={{ flex: '1 1 300px', minWidth: '280px' }}>
            <div className="reports-list-card" style={{ padding: 20 }}>
              {/* Product Name */}
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Product Name *</label>
                <input style={fieldInput()} value={form.name} onChange={(e) => setField('name', e.target.value)} placeholder="Enter product name" />
              </div>

              {/* Category + Unit */}
              <div style={{ display: 'grid', gridTemplateColumns: selectedUnit.requiresQuantityPerUnit ? '1fr 1fr 1fr' : '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Category</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <select
                      style={{ ...fieldInput(), flex: 1 }}
                      value={form.categoryId}
                      onChange={(e) => {
                        const cat = categories.find((c) => c.categoryId === e.target.value);
                        setField('categoryId', e.target.value);
                        setField('categoryName', cat?.name || 'No Category');
                      }}
                    >
                      <option value="">No Category</option>
                      {categories.map((c) => <option key={c.categoryId} value={c.categoryId}>{c.name}</option>)}
                    </select>
                    <button type="button" onClick={() => setAddCategoryOpen(true)} title="Add category"
                      style={{ padding: '0 10px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#F8FAFC', cursor: 'pointer' }}>
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Unit</label>
                  <select style={fieldInput()} value={form.unit} onChange={(e) => setField('unit', e.target.value)}>
                    {UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                  </select>
                </div>
                {selectedUnit.requiresQuantityPerUnit && (
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>{selectedUnit.placeholder} *</label>
                    <input type="number" min="1" style={fieldInput()} value={form.itemsPerUnit} onChange={(e) => setField('itemsPerUnit', e.target.value)} />
                  </div>
                )}
              </div>

              {/* Selling Price + Cost Price */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Selling Price *</label>
                  <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'hidden' }}>
                    <span style={{ padding: '10px 12px', background: '#F8FAFC', borderRight: '1px solid #E2E8F0', fontSize: 14, fontWeight: 600, color: '#475569', minWidth: 40, textAlign: 'center' }}>
                      {baseCurrency?.symbol || '$'}
                    </span>
                    <input 
                      style={{ ...fieldInput(), border: 'none', borderRadius: 0, flex: 1 }} 
                      value={form.sellingPrice} 
                      onChange={(e) => setField('sellingPrice', formatPriceInput(e.target.value))}
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Cost Price</label>
                  <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'hidden' }}>
                    <span style={{ padding: '10px 12px', background: '#F8FAFC', borderRight: '1px solid #E2E8F0', fontSize: 14, fontWeight: 600, color: '#475569', minWidth: 40, textAlign: 'center' }}>
                      {baseCurrency?.symbol || '$'}
                    </span>
                    <input 
                      style={{ ...fieldInput(), border: 'none', borderRadius: 0, flex: 1 }} 
                      value={form.costPrice} 
                      onChange={(e) => setField('costPrice', formatPriceInput(e.target.value))}
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </div>

              {/* SKU + Barcode */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>SKU *</label>
                  <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'hidden', borderColor: skuError ? '#EF4444' : '#E2E8F0' }}>
                    <input 
                      style={{ ...fieldInput(), border: 'none', borderRadius: 0, flex: 1 }} 
                      value={form.sku} 
                      onChange={(e) => setField('sku', e.target.value)} 
                      onBlur={(e) => checkSkuAvailable(e.target.value)}
                      placeholder="Auto-generated"
                      disabled={loadingSku}
                    />
                    {loadingSku && (
                      <div style={{ padding: '0 12px' }}>
                        <RefreshCw size={16} className="animate-spin" color="#94A3B8" />
                      </div>
                    )}
                  </div>
                  {skuError && <div style={{ fontSize: 11, color: '#EF4444', marginTop: 4 }}>{skuError}</div>}
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Barcode</label>
                  <input style={fieldInput()} value={form.barcode} onChange={(e) => setField('barcode', e.target.value)} placeholder="Optional" />
                </div>
              </div>

            

              {/* Tax */}
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Tax</label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.taxable} onChange={(e) => setField('taxable', e.target.checked)} />
                  This product is taxable
                </label>
                {form.taxable && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Tax Name</label>
                      <input style={fieldInput()} value={form.taxName} onChange={(e) => setField('taxName', e.target.value)} placeholder="e.g. VAT" />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Tax Percent</label>
                      <input type="number" step="0.01" min="0" style={fieldInput()} value={form.taxPercent} onChange={(e) => setField('taxPercent', e.target.value)} />
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', gridColumn: '1 / -1' }}>
                      <input type="checkbox" checked={form.taxInclusive} onChange={(e) => setField('taxInclusive', e.target.checked)} />
                      Tax is included in selling price
                    </label>
                  </div>
                )}
              </div>

              {/* Inventory */}
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Inventory</label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.trackInventory} onChange={(e) => setField('trackInventory', e.target.checked)} />
                  Track inventory for this product
                </label>
                {form.trackInventory && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      {!isEdit ? (
                        <>
                          <div>
                            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Initial Stock Quantity</label>
                            <input type="number" min="0" style={fieldInput()} value={form.currentStock} onChange={(e) => setField('currentStock', e.target.value)} />
                          </div>
                          <div>
                            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Low Stock Alert</label>
                            <input type="number" min="0" style={fieldInput()} value={form.lowStockThreshold} onChange={(e) => setField('lowStockThreshold', e.target.value)} />
                          </div>
                        </>
                      ) : (
                        <>
                          <div>
                            <label style={{ fontSize: 12, fontWeight: 600, color: '#16A34A', display: 'block', marginBottom: 6 }}>Current Stock</label>
                            <div style={{ padding: '10px 12px', background: '#F8FAFC', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 14, fontWeight: 700, color: '#16A34A' }}>
                              {form.currentStock} {form.unit}{form.currentStock !== '1' ? 's' : ''}
                            </div>
                          </div>
                          <div>
                            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Low Stock Alert</label>
                            <input type="number" min="0" style={fieldInput()} value={form.lowStockThreshold} onChange={(e) => setField('lowStockThreshold', e.target.value)} />
                          </div>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Stock Breaking */}
              {(isPackOrBox || parentOptions.length > 0) && (
                <div style={{ marginBottom: 12, padding: 12, background: '#F8FAFC', borderRadius: 8, border: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Stock Breaking</div>
                  {isPackOrBox && (
                    <PackLinksEditor
                      links={packLinks}
                      onChange={setPackLinks}
                      selfProductId={isEdit ? productId : null}
                      unit={form.unit}
                      selfItemsPerUnit={parseInt(form.itemsPerUnit) || 1}
                      apiFetch={apiFetch}
                      businessId={businessId}
                      branchId={branchId}
                    />
                  )}
                  {isEdit && (packLinks.length > 0 || parentOptions.length > 0) && (
                    <button
                      type="button"
                      onClick={openTransferModal}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10, padding: '8px', borderRadius: 6, border: '1px solid #BFDBFE', background: '#EFF6FF', color: '#0891B2', fontWeight: 600, fontSize: 12, cursor: 'pointer', width: '100%' }}
                    >
                      <ArrowLeftRight size={14} /> Transfer Stock Now
                    </button>
                  )}
                </div>
              )}

              {/* Stock Management (Edit Only) */}
              {isEdit && form.trackInventory && (
                <div style={{ marginBottom: 12, padding: 12, background: '#F8FAFC', borderRadius: 8, border: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Stock Management</div>
                  
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Adjustment Type</label>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button type="button" onClick={() => { setStockAdjustType('add'); setAdjustmentValue(''); }} style={{ flex: 1, minWidth: '60px', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', border: `1px solid ${stockAdjustType === 'add' ? '#16A34A' : '#E2E8F0'}`, background: stockAdjustType === 'add' ? '#DCFCE7' : '#F8FAFC', color: stockAdjustType === 'add' ? '#16A34A' : '#64748B', fontWeight: 600, fontSize: 12 }}>+ Add</button>
                      <button type="button" onClick={() => { setStockAdjustType('subtract'); setAdjustmentValue(''); }} style={{ flex: 1, minWidth: '60px', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', border: `1px solid ${stockAdjustType === 'subtract' ? '#EF4444' : '#E2E8F0'}`, background: stockAdjustType === 'subtract' ? '#FEE2E2' : '#F8FAFC', color: stockAdjustType === 'subtract' ? '#EF4444' : '#64748B', fontWeight: 600, fontSize: 12 }}>- Subtract</button>
                      <button type="button" onClick={() => { setStockAdjustType('override'); setAdjustmentValue(form.currentStock); }} style={{ flex: 1, minWidth: '60px', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', border: `1px solid ${stockAdjustType === 'override' ? '#0891B2' : '#E2E8F0'}`, background: stockAdjustType === 'override' ? '#EFF6FF' : '#F8FAFC', color: stockAdjustType === 'override' ? '#0891B2' : '#64748B', fontWeight: 600, fontSize: 12 }}>Override</button>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>
                        {stockAdjustType === 'override' ? 'New Stock Quantity' : stockAdjustType === 'add' ? 'Quantity to Add' : 'Quantity to Subtract'}
                      </label>
<input 
  type="number" 
  min="0" 
  style={fieldInput({ padding: '8px 10px' })} 
  value={adjustmentValue} 
  onChange={(e) => setAdjustmentValue(e.target.value)} 
  placeholder={
    stockAdjustType === 'add' ? 'Enter stock to add' :
    stockAdjustType === 'subtract' ? 'Enter stock to subtract' :
    stockAdjustType === 'override' ? 'Enter new quantity' :
    'Enter quantity'
  } 
/>                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Reason (optional)</label>
                      <input style={fieldInput({ padding: '8px 10px' })} value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} placeholder="Why is this adjustment needed?" />
                    </div>
                  </div>

                  {adjustmentValue && (
                    <div style={{ padding: '6px 12px', background: '#EFF6FF', borderRadius: 6, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                      <RefreshCw size={14} color="#0891B2" />
                      <span>
                        {stockAdjustType === 'override' ? 'New stock will be: ' : stockAdjustType === 'add' ? 'Stock will become: ' : 'Stock will become: '}
                        <strong style={{ color: '#0891B2' }}>{calculatedStock} {form.unit}{calculatedStock !== 1 ? 's' : ''}</strong>
                      </span>
                    </div>
                  )}


                  {stockAdjustType === 'subtract' && isPackOrBox && form.itemsPerUnit && parseInt(form.itemsPerUnit) > 0 && (
                    <button type="button" onClick={() => { setConversionQuantity(''); setSelectedReceivingProduct(null); setReceivingSearch(''); setReceivingResults([]); setConversionModalOpen(true); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10, padding: '8px', borderRadius: 6, border: '1px solid #BFDBFE', background: '#EFF6FF', color: '#0891B2', fontWeight: 600, fontSize: 12, cursor: 'pointer', width: '100%' }}>
                      <ArrowLeftRight size={14} /> Convert {form.unit}s to Individual Items
                    </button>
                  )}
                </div>
              )}

              {/* Status */}
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Status</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => setField('status', 'active')} style={{ flex: 1, padding: 10, borderRadius: 8, cursor: 'pointer', border: `1px solid ${form.status === 'active' ? '#16A34A' : '#E2E8F0'}`, background: form.status === 'active' ? '#DCFCE7' : '#F8FAFC', color: form.status === 'active' ? '#16A34A' : '#64748B', fontWeight: 600, fontSize: 13 }}>Active</button>
                  <button type="button" onClick={() => setField('status', 'inactive')} style={{ flex: 1, padding: 10, borderRadius: 8, cursor: 'pointer', border: `1px solid ${form.status === 'inactive' ? '#EF4444' : '#E2E8F0'}`, background: form.status === 'inactive' ? '#FEE2E2' : '#F8FAFC', color: form.status === 'inactive' ? '#EF4444' : '#64748B', fontWeight: 600, fontSize: 13 }}>Inactive</button>
                </div>
              </div>
            </div>

         
          </div>

          {/* ─── IMAGE SIDEBAR ────────────────────────────────────────────── */}
          <div style={{ width: '200px', flexShrink: 0, minWidth: '160px' }}>
            <div className="reports-list-card" style={{ padding: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 8 }}>Product Image</label>
              <div style={{ width: '100%', aspectRatio: '1', borderRadius: 8, background: '#F1F5F9', border: '1px dashed #CBD5E1', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative', marginBottom: 8 }}>
                {(imagePreview || existingImageUrl) ? (
                  <>
                    <img src={imagePreview || existingImageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <button type="button" onClick={handleRemoveImage} style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={12} color="#fff" /></button>
                  </>
                ) : (
                  <div style={{ textAlign: 'center' }}><Package size={28} color="#CBD5E1" /><div style={{ fontSize: 10, color: '#94A3B8', marginTop: 4 }}>No image</div></div>
                )}
              </div>
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '6px 12px', borderRadius: 6, border: '1px solid #E2E8F0', background: '#F8FAFC', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: '#475569' }}>
                <Upload size={12} /> Choose Image
                <input type="file" accept="image/*" onChange={handleImageSelect} style={{ display: 'none' }} />
              </label>
            </div>
          </div>
           {/* Footer */}
<div style={{ 
  display: 'flex', 
  gap: 10, 
  marginTop: 16, 
  justifyContent: 'flex-end', 
  flexWrap: 'wrap',
  width: '100%',
  maxWidth: '100%'
}}>
  <button 
    onClick={() => navigate('/inventory/products')} 
    style={{ 
      padding: '10px 24px', 
      borderRadius: 8, 
      border: '1px solid #E2E8F0', 
      background: '#fff', 
      color: '#475569', 
      fontWeight: 600, 
      fontSize: 14, 
      cursor: 'pointer',
      whiteSpace: 'nowrap',
      flexShrink: 0
    }}
  >
    Cancel
  </button>
  <button 
    onClick={handleSave} 
    disabled={saving || uploadingImage} 
    style={{ 
      padding: '10px 24px', 
      borderRadius: 8, 
      border: 'none', 
      background: '#0891B2', 
      color: '#fff', 
      fontWeight: 700, 
      fontSize: 14, 
      cursor: 'pointer', 
      opacity: (saving || uploadingImage) ? 0.7 : 1,
      whiteSpace: 'nowrap',
      flexShrink: 0
    }}
  >
    {saving ? 'Saving...' : uploadingImage ? 'Uploading image...' : (isEdit ? 'Save Changes' : 'Create Product')}
  </button>
</div>
        </div>

        {/* ─── MODALS ──────────────────────────────────────────────────────── */}

        {/* Add Category Modal */}
        {addCategoryOpen && (
          <div className="reports-modal-overlay" onClick={() => setAddCategoryOpen(false)}>
            <div className="reports-modal" style={{ maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
              <div className="reports-modal-header">
                <span className="reports-modal-title">New Category</span>
                <button className="reports-modal-close" onClick={() => setAddCategoryOpen(false)}><X size={18} /></button>
              </div>
              <div className="reports-modal-body">
                <input style={fieldInput()} value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} placeholder="Category name" autoFocus />
                <button onClick={handleAddCategory} disabled={!newCategoryName.trim()} style={{ width: '100%', marginTop: 12, padding: 10, borderRadius: 8, border: 'none', background: '#0891B2', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Add Category</button>
              </div>
            </div>
          </div>
        )}

        {/* Conversion Modal */}
        {conversionModalOpen && (
          <div className="reports-modal-overlay" onClick={() => setConversionModalOpen(false)}>
            <div className="reports-modal" style={{ maxWidth: 520, maxHeight: '90vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
              <div className="reports-modal-header">
                <span className="reports-modal-title">Convert {form.unit}s to Items</span>
                <button className="reports-modal-close" onClick={() => setConversionModalOpen(false)}><X size={18} /></button>
              </div>
              <div className="reports-modal-body">
                <label style={{ fontSize: 13, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Step 1: Number of {form.unit}s to convert</label>
                <input type="number" min="1" style={fieldInput()} value={conversionQuantity} onChange={(e) => setConversionQuantity(e.target.value)} placeholder={`Enter quantity of ${form.unit}s`} />

                {conversionQuantity && conversionResult.totalIndividualItems > 0 && (
                  <div style={{ padding: '10px 14px', borderRadius: 8, marginTop: 12, background: conversionResult.hasEnoughStock ? '#EFF6FF' : '#FEF2F2', border: `1px solid ${conversionResult.hasEnoughStock ? '#BFDBFE' : '#FEE2E2'}` }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: conversionResult.hasEnoughStock ? '#0891B2' : '#EF4444' }}>
                      {conversionResult.fromQty} {form.unit}(s) = {conversionResult.totalIndividualItems} individual items
                    </div>
                    <div style={{ fontSize: 12, marginTop: 4, color: conversionResult.hasEnoughStock ? '#475569' : '#EF4444' }}>
                      {conversionResult.hasEnoughStock ? (
                        <>Remaining {form.unit}s after conversion: <strong>{conversionResult.remainingStock}</strong></>
                      ) : (
                        <>Not enough stock! Only {parseInt(form.currentStock)} {form.unit}(s) available.</>
                      )}
                    </div>
                  </div>
                )}

                <label style={{ fontSize: 13, fontWeight: 600, color: '#475569', display: 'block', marginTop: 16, marginBottom: 6 }}>Step 2: Select receiving product</label>
                <input style={{ ...fieldInput() }} value={receivingSearch} onChange={(e) => { setReceivingSearch(e.target.value); searchReceivingProducts(e.target.value); }} placeholder="Search for receiving product..." />

                {(searchingProducts || resolvingReceivingProduct) && (
                  <div style={{ textAlign: 'center', padding: 12, color: '#64748B' }}>{resolvingReceivingProduct ? 'Loading product...' : 'Searching...'}</div>
                )}

                {receivingResults.length > 0 && (
                  <div style={{ marginTop: 8, maxHeight: 200, overflowY: 'auto', border: '1px solid #E2E8F0', borderRadius: 8 }}>
                    {receivingResults.map((p) => (
                      <button key={p.productId} onClick={() => handleSelectReceivingProduct(p)} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', borderBottom: '1px solid #F1F5F9', background: '#fff', cursor: 'pointer', width: '100%', textAlign: 'left', border: 'none' }}>
                        <span style={{ fontWeight: 500 }}>{p.name}</span>
                        <span style={{ color: '#64748B', fontSize: 12 }}>SKU: {p.sku} · Stock: {p.currentStock || 0}</span>
                      </button>
                    ))}
                  </div>
                )}

                {selectedReceivingProduct && (
                  <div style={{ marginTop: 8, padding: '10px 14px', background: '#EFF6FF', borderRadius: 8, border: '1px solid #BFDBFE', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{selectedReceivingProduct.name}</div>
                      <div style={{ fontSize: 12, color: '#64748B' }}>SKU: {selectedReceivingProduct.sku} · Current Stock: {selectedReceivingProduct.currentStock || 0} {selectedReceivingProduct.unit}(s)</div>
                    </div>
                    <button onClick={() => { setSelectedReceivingProduct(null); setReceivingSearch(''); }} style={{ border: 'none', background: 'none', color: '#EF4444', cursor: 'pointer' }}><X size={18} /></button>
                  </div>
                )}

                {selectedReceivingProduct && conversionResult.totalIndividualItems > 0 && conversionResult.hasEnoughStock && (
                  conversionResult.evenSplit ? (
                    <div style={{ marginTop: 12, padding: '12px 16px', background: '#F8FAFC', borderRadius: 8, border: '1px solid #E2E8F0' }}>
                      <div style={{ fontWeight: 700, marginBottom: 8 }}>📦 Stock Preview</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 13 }}>
                        <div style={{ color: '#64748B' }}>Current Pack Stock:</div>
                        <div style={{ fontWeight: 600, textAlign: 'right' }}>{form.currentStock} {form.unit}(s)</div>
                        <div style={{ color: '#64748B' }}>After Conversion:</div>
                        <div style={{ fontWeight: 600, color: '#EF4444', textAlign: 'right' }}>{conversionResult.remainingStock} {form.unit}(s) (-{conversionResult.fromQty})</div>
                        <div style={{ color: '#64748B' }}>Receiving Item:</div>
                        <div style={{ fontWeight: 600, textAlign: 'right' }}>{selectedReceivingProduct.name}</div>
                        <div style={{ color: '#64748B' }}>Current Stock:</div>
                        <div style={{ fontWeight: 600, textAlign: 'right' }}>{selectedReceivingProduct.currentStock || 0} {selectedReceivingProduct.unit}(s)</div>
                        <div style={{ color: '#64748B' }}>Will Receive:</div>
                        <div style={{ fontWeight: 600, color: '#16A34A', textAlign: 'right' }}>+{conversionResult.toQty} {selectedReceivingProduct.unit}(s)</div>
                        <div style={{ color: '#64748B' }}>New Stock:</div>
                        <div style={{ fontWeight: 700, color: '#0891B2', textAlign: 'right' }}>{(selectedReceivingProduct.currentStock || 0) + conversionResult.toQty} {selectedReceivingProduct.unit}(s)</div>
                      </div>
                      {conversionResult.receivingUnitSize > 1 && (
                        <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 8 }}>
                          ({conversionResult.totalIndividualItems} individual items ÷ {conversionResult.receivingUnitSize} per {selectedReceivingProduct.unit})
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ padding: '10px 14px', borderRadius: 8, marginTop: 12, background: '#FEF2F2', border: '1px solid #FEE2E2' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#EF4444' }}>
                        {conversionResult.totalIndividualItems} individual items doesn't split evenly into {selectedReceivingProduct.name}'s unit size of {conversionResult.receivingUnitSize}.
                      </div>
                    </div>
                  )
                )}

                <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
                  <button onClick={() => setConversionModalOpen(false)} style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', color: '#64748B', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                  <button onClick={handleConversion} disabled={!conversionResult.totalIndividualItems || !conversionResult.hasEnoughStock || !conversionResult.evenSplit || !selectedReceivingProduct || adjusting} style={{ flex: 2, padding: '10px', borderRadius: 8, border: 'none', background: '#0891B2', color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: (!conversionResult.totalIndividualItems || !conversionResult.hasEnoughStock || !conversionResult.evenSplit || !selectedReceivingProduct || adjusting) ? 0.5 : 1 }}>
                    {adjusting ? 'Processing...' : 'Confirm Conversion'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── Transfer Stock Modal ──────────────────────────────────────── */}
        {transferModalOpen && (
          <div className="reports-modal-overlay" onClick={() => setTransferModalOpen(false)}>
            <div className="reports-modal" style={{ maxWidth: 460, maxHeight: '85vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
              <div className="reports-modal-header">
                <span className="reports-modal-title">Transfer Stock</span>
                <button className="reports-modal-close" onClick={() => setTransferModalOpen(false)}><X size={18} /></button>
              </div>
              <div className="reports-modal-body">
                {/* ✅ NEW — always-visible header naming the exact product this
                    modal is acting on, so "quantity of this product" never
                    has to stand in for a name the person can already see. */}
                <div style={{ fontSize: 12, color: '#64748B', marginBottom: 4 }}>Transferring stock for</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', marginBottom: 14 }}>
                  {form.name || 'This product'} <span style={{ fontWeight: 500, color: '#94A3B8', fontSize: 12 }}>({form.currentStock} {form.unit}(s) in stock)</span>
                </div>

                {packLinks.length > 0 && parentOptions.length > 0 && (
                  <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                    <button
                      type="button"
                      onClick={() => { setTransferDirection('down'); setTransferSelectedLinkId(packLinks[0]?.id || null); }}
                      style={{ flex: 1, padding: '8px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${transferDirection === 'down' ? '#0891B2' : '#E2E8F0'}`, background: transferDirection === 'down' ? '#EFF6FF' : '#F8FAFC', color: transferDirection === 'down' ? '#0891B2' : '#64748B', fontWeight: 600, fontSize: 12 }}
                    >
                      Break Down
                    </button>
                    <button
                      type="button"
                      onClick={() => { setTransferDirection('up'); setTransferSelectedParentId(parentOptions[0]?.id || null); }}
                      style={{ flex: 1, padding: '8px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${transferDirection === 'up' ? '#0891B2' : '#E2E8F0'}`, background: transferDirection === 'up' ? '#EFF6FF' : '#F8FAFC', color: transferDirection === 'up' ? '#0891B2' : '#64748B', fontWeight: 600, fontSize: 12 }}
                    >
                      Consolidate Up
                    </button>
                  </div>
                )}

                               {transferDirection === 'up' ? (
                  <>
                    <label style={{ fontSize: 13, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 8 }}>Consolidate into</label>
                    {parentOptions.map((parent) => {
                      const multiplier = getParentMultiplier(parent);
                      const active = transferSelectedParentId === parent.id;
                      return (
                        <button
                          key={parent.id}
                          onClick={() => setTransferSelectedParentId(parent.id)}
                          style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%', textAlign: 'left',
                            padding: '10px 12px', borderRadius: 8, marginBottom: 6, cursor: 'pointer',
                            border: `1px solid ${active ? '#0891B2' : '#E2E8F0'}`, background: active ? '#EFF6FF' : '#fff',
                          }}
                        >
                          <span style={{ fontSize: 13, color: active ? '#0891B2' : '#334155', fontWeight: 600 }}>
                            {parent.parentName}
                          </span>
                          <span style={{ fontSize: 11, color: multiplier ? '#94A3B8' : '#EF4444', marginTop: 2 }}>
                            {multiplier
                              ? `Needs ${multiplier} to make 1`
                              : "⚠ unit sizes don't divide evenly"}
                          </span>
                        </button>
                      );
                    })}

                    <label style={{ fontSize: 13, fontWeight: 600, color: '#475569', display: 'block', marginTop: 12, marginBottom: 6 }}>
                      {selectedTransferParent
                        ? `How many to use (building ${selectedTransferParent.parentName})`
                        : 'How many to use'}
                    </label>
                    <input type="number" min="1" style={fieldInput()} value={transferQty} onChange={(e) => setTransferQty(e.target.value)} placeholder="1" />

                    <button
                      onClick={openTransferConfirm}
                      style={{ width: '100%', marginTop: 16, padding: '10px', borderRadius: 8, border: 'none', background: '#0891B2', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
                    >
                      Review Transfer
                    </button>
                  </>
                ) : (
                  <>
                    <label style={{ fontSize: 13, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 8 }}>Break into</label>
                    {packLinks.map((link) => {
                      const multiplier = getLinkMultiplier(link);
                      const active = transferSelectedLinkId === link.id;
                      return (
                        <button
                          key={link.id}
                          onClick={() => setTransferSelectedLinkId(link.id)}
                          style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%', textAlign: 'left',
                            padding: '10px 12px', borderRadius: 8, marginBottom: 6, cursor: 'pointer',
                            border: `1px solid ${active ? '#0891B2' : '#E2E8F0'}`, background: active ? '#EFF6FF' : '#fff',
                          }}
                        >
                          <span style={{ fontSize: 13, color: active ? '#0891B2' : '#334155', fontWeight: 600 }}>
                            {link.targetName}
                          </span>
                          <span style={{ fontSize: 11, color: multiplier ? '#94A3B8' : '#EF4444', marginTop: 2 }}>
                            {multiplier
                              ? `Makes ${multiplier} per unit`
                              : "⚠ unit sizes don't divide evenly"}
                          </span>
                        </button>
                      );
                    })}

                    <label style={{ fontSize: 13, fontWeight: 600, color: '#475569', display: 'block', marginTop: 12, marginBottom: 6 }}>
                      {selectedTransferLink
                        ? `How many to break (into ${selectedTransferLink.targetName})`
                        : 'How many to break'}
                    </label>
                    <input type="number" min="1" style={fieldInput()} value={transferQty} onChange={(e) => setTransferQty(e.target.value)} placeholder="1" />

                    <button
                      onClick={openTransferConfirm}
                      style={{ width: '100%', marginTop: 16, padding: '10px', borderRadius: 8, border: 'none', background: '#0891B2', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
                    >
                      Review Transfer
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ─── Transfer Blocked Modal ─────────────────────────────────────
             ✅ NEW — replaces the old pattern of just disabling "Review
             Transfer". Names the exact reason (with the actual product
             names/quantities involved) so the person always knows exactly
             why a transfer can't proceed yet, and what to do about it. */}
        {transferBlockedInfo && (
          <div className="reports-modal-overlay" onClick={() => setTransferBlockedInfo(null)}>
            <div className="reports-modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
              <div className="reports-modal-header">
                <span className="reports-modal-title">{transferBlockedInfo.title}</span>
                <button className="reports-modal-close" onClick={() => setTransferBlockedInfo(null)}><X size={18} /></button>
              </div>
              <div className="reports-modal-body">
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 14px', background: '#FEF2F2', border: '1px solid #FEE2E2', borderRadius: 8, marginBottom: 16 }}>
                  <AlertTriangle size={18} color="#EF4444" style={{ flexShrink: 0, marginTop: 1 }} />
                  <div style={{ fontSize: 13, color: '#7F1D1D', lineHeight: 1.5 }}>{transferBlockedInfo.message}</div>
                </div>
                <button
                  onClick={() => setTransferBlockedInfo(null)}
                  style={{ width: '100%', padding: '10px', borderRadius: 8, border: 'none', background: '#0891B2', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
                >
                  Got It
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── Transfer Confirm Modal ───────────────────────────────────── */}
        {transferConfirmOpen && (() => {
          if (transferDirection === 'up') {
            const parent = parentOptions.find((p) => p.id === transferSelectedParentId);
            const qty = parseInt(transferQty, 10) || 0;
            const multiplier = getParentMultiplier(parent);
            const requestedParents = multiplier ? Math.floor(qty / multiplier) : 0;
            const actualChildUsed = requestedParents * (multiplier || 0);

            return (
              <div className="reports-modal-overlay" onClick={() => !transferring && setTransferConfirmOpen(false)}>
                <div className="reports-modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
                  <div className="reports-modal-header">
                    <span className="reports-modal-title">Confirm Transfer</span>
                    {!transferring && (
                      <button className="reports-modal-close" onClick={() => setTransferConfirmOpen(false)}><X size={18} /></button>
                    )}
                  </div>
                  <div className="reports-modal-body">
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 8 }}>You are about to consolidate:</div>
                    <div style={{ background: '#F8FAFC', borderRadius: 8, padding: 12, border: '1px solid #E2E8F0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                        <span style={{ fontSize: 12, color: '#64748B' }}>From:</span>
                        <span style={{ fontSize: 12, fontWeight: 600 }}>{form.name}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                        <span style={{ fontSize: 12, color: '#64748B' }}>Quantity to use:</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#EF4444' }}>-{actualChildUsed} {form.unit}(s)</span>
                      </div>
                      <div style={{ height: 1, background: '#E2E8F0', margin: '8px 0' }} />
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                        <span style={{ fontSize: 12, color: '#64748B' }}>Into:</span>
                        <span style={{ fontSize: 12, fontWeight: 600 }}>{parent?.parentName || '—'}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                        <span style={{ fontSize: 12, color: '#64748B' }}>Will receive:</span>
                        <span style={{ fontSize: 12, fontWeight: 800, color: '#16A34A' }}>+{requestedParents} {parent?.parentUnit || 'unit'}(s)</span>
                      </div>
                      {multiplier > 1 && (
                        <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 6 }}>
                          = {actualChildUsed} ÷ {multiplier} {form.unit}(s) per {parent?.parentUnit || 'unit'}
                        </div>
                      )}
                      {qty > actualChildUsed && (
                        <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 6 }}>
                          {qty - actualChildUsed} {form.unit}(s) left over — not enough for another {parent?.parentUnit || 'unit'}, will stay as-is.
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 12, lineHeight: 1.5 }}>
                      This updates stock on both products immediately and cannot be undone from here.
                    </div>
                    <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                      <button
                        onClick={() => setTransferConfirmOpen(false)}
                        disabled={transferring}
                        style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', color: '#64748B', fontWeight: 600, cursor: 'pointer' }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={executeManualTransfer}
                        disabled={transferring}
                        style={{ flex: 2, padding: '10px', borderRadius: 8, border: 'none', background: '#0891B2', color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: transferring ? 0.7 : 1 }}
                      >
                        {transferring ? 'Transferring...' : 'Confirm & Transfer'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          }

          const link = packLinks.find((l) => l.id === transferSelectedLinkId);
          const qty = parseInt(transferQty, 10) || 0;
          const multiplier = getLinkMultiplier(link);
          const willReceive = multiplier ? qty * multiplier : 0;
          return (
            <div className="reports-modal-overlay" onClick={() => !transferring && setTransferConfirmOpen(false)}>
              <div className="reports-modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
                <div className="reports-modal-header">
                  <span className="reports-modal-title">Confirm Transfer</span>
                  {!transferring && (
                    <button className="reports-modal-close" onClick={() => setTransferConfirmOpen(false)}><X size={18} /></button>
                  )}
                </div>
                <div className="reports-modal-body">
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 8 }}>You are about to break:</div>
                  <div style={{ background: '#F8FAFC', borderRadius: 8, padding: 12, border: '1px solid #E2E8F0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                      <span style={{ fontSize: 12, color: '#64748B' }}>From:</span>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{form.name}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                      <span style={{ fontSize: 12, color: '#64748B' }}>Quantity to break:</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#EF4444' }}>-{qty} {form.unit}(s)</span>
                    </div>
                    <div style={{ height: 1, background: '#E2E8F0', margin: '8px 0' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                      <span style={{ fontSize: 12, color: '#64748B' }}>Into:</span>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{link?.targetName || '—'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                      <span style={{ fontSize: 12, color: '#64748B' }}>Will receive:</span>
                      <span style={{ fontSize: 12, fontWeight: 800, color: '#16A34A' }}>+{willReceive} {link?.targetUnit || 'unit'}(s)</span>
                    </div>
                    {multiplier > 1 && (
                      <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 6 }}>
                        = {qty} × {multiplier} {link?.targetUnit || 'unit'}(s) per {form.unit}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 12, lineHeight: 1.5 }}>
                    This updates stock on both products immediately and cannot be undone from here.
                  </div>
                  <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                    <button
                      onClick={() => setTransferConfirmOpen(false)}
                      disabled={transferring}
                      style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', color: '#64748B', fontWeight: 600, cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={executeManualTransfer}
                      disabled={transferring}
                      style={{ flex: 2, padding: '10px', borderRadius: 8, border: 'none', background: '#0891B2', color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: transferring ? 0.7 : 1 }}
                    >
                      {transferring ? 'Transferring...' : 'Confirm & Transfer'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </>
  );
}