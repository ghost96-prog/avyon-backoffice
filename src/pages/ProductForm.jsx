// src/pages/Inventory/ProductForm.jsx
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  ArrowLeft, Upload, X, Plus, Package, RefreshCw, AlertTriangle, Search, ArrowLeftRight,
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { uploadProductImage, deleteProductImage } from '../services/productImageApi';
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
  const [conversionResult, setConversionResult] = useState({ 
    fromQty: 0, toQty: 0, remainingStock: 0, hasEnoughStock: false 
  });

  const selectedUnit = UNITS.find((u) => u.value === form.unit) || UNITS[0];
  const isPackOrBox = selectedUnit?.requiresQuantityPerUnit;

  const getHighestSKU = useCallback(async () => {
    if (!businessId || !branchId) return 10000;
    try {
      const products = await apiFetch(`/business/${businessId}/branches/${branchId}/products?status=all`);
      let highest = 10000;
      if (Array.isArray(products)) {
        products.forEach((p) => {
          if (p.sku) {
            const skuNum = parseInt(p.sku, 10);
            if (!isNaN(skuNum) && skuNum > highest) {
              highest = skuNum;
            }
          }
        });
      }
      return highest;
    } catch (error) {
      console.error('Error getting highest SKU:', error);
      return 10000;
    }
  }, [businessId, branchId, apiFetch]);

  const generateNextSKU = useCallback(async () => {
    setLoadingSku(true);
    try {
      const highest = await getHighestSKU();
      const next = highest + 1;
      setField('sku', String(next));
    } catch (error) {
      console.error('Error generating SKU:', error);
      setField('sku', String(Date.now()).slice(-6));
    } finally {
      setLoadingSku(false);
    }
  }, [getHighestSKU]);

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
      const totalItems = qty * itemsPerUnitNum;
      const remainingStock = currentStock - qty;
      setConversionResult({
        fromQty: qty,
        toQty: totalItems,
        remainingStock: remainingStock,
        hasEnoughStock: remainingStock >= 0,
      });
    } else {
      setConversionResult({ fromQty: 0, toQty: 0, remainingStock: 0, hasEnoughStock: false });
    }
  }, [conversionQuantity, form.itemsPerUnit, form.currentStock]);

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
    if (!conversionResult.toQty || conversionResult.toQty <= 0) {
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
          reason: `Received ${conversionResult.toQty} items from conversion of ${conversionResult.fromQty} ${form.unit}(s) of ${form.name}`,
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
          reason: `Converted ${conversionResult.fromQty} ${form.unit}(s) to individual items (${conversionResult.toQty} items)`,
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

  const handleAdjustStock = useCallback(async () => {
    const val = parseInt(adjustmentValue, 10);
    if (!val || val <= 0) { setError('Enter a valid quantity'); return; }
    if (!adjustReason.trim()) { setError('A reason is required for stock adjustments'); return; }

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

        if (imageFile && created?.productId) {
          try {
            await uploadProductImage(apiFetch, { businessId, branchId, productId: created.productId, staffId, file: imageFile });
          } catch (imgErr) {
            console.warn('Image upload failed:', imgErr.message);
          }
        }

        navigate('/inventory/products');
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

      if (imageFile) {
        try {
          await uploadProductImage(apiFetch, { businessId, branchId, productId, staffId, file: imageFile });
        } catch (imgErr) {
          console.warn('Image upload failed:', imgErr.message);
        }
      }

      navigate('/inventory/products');

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
  }, [form, isEdit, productId, apiFetch, businessId, branchId, staffId, staffName, baseCurrency, imageFile, navigate, loadProduct, originalStock, stockAdjustType, calculatedStock, selectedUnit, generateNextSKU]);

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

              {/* Description */}
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Description</label>
                <textarea style={{ ...fieldInput(), minHeight: 70, resize: 'vertical' }} value={form.description} onChange={(e) => setField('description', e.target.value)} placeholder="Optional description" />
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
                      <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Reason *</label>
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

                {conversionQuantity && conversionResult.toQty > 0 && (
                  <div style={{ padding: '10px 14px', borderRadius: 8, marginTop: 12, background: conversionResult.hasEnoughStock ? '#EFF6FF' : '#FEF2F2', border: `1px solid ${conversionResult.hasEnoughStock ? '#BFDBFE' : '#FEE2E2'}` }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: conversionResult.hasEnoughStock ? '#0891B2' : '#EF4444' }}>
                      {conversionResult.fromQty} {form.unit}(s) = {conversionResult.toQty} individual items
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

                {searchingProducts && <div style={{ textAlign: 'center', padding: 12, color: '#64748B' }}>Searching...</div>}

                {receivingResults.length > 0 && (
                  <div style={{ marginTop: 8, maxHeight: 200, overflowY: 'auto', border: '1px solid #E2E8F0', borderRadius: 8 }}>
                    {receivingResults.map((p) => (
                      <button key={p.productId} onClick={() => { setSelectedReceivingProduct(p); setReceivingSearch(p.name); setReceivingResults([]); }} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', borderBottom: '1px solid #F1F5F9', background: '#fff', cursor: 'pointer', width: '100%', textAlign: 'left', border: 'none' }}>
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
                      <div style={{ fontSize: 12, color: '#64748B' }}>SKU: {selectedReceivingProduct.sku} · Current Stock: {selectedReceivingProduct.currentStock || 0}</div>
                    </div>
                    <button onClick={() => { setSelectedReceivingProduct(null); setReceivingSearch(''); }} style={{ border: 'none', background: 'none', color: '#EF4444', cursor: 'pointer' }}><X size={18} /></button>
                  </div>
                )}

                {selectedReceivingProduct && conversionResult.toQty > 0 && conversionResult.hasEnoughStock && (
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
                      <div style={{ fontWeight: 600, textAlign: 'right' }}>{selectedReceivingProduct.currentStock || 0}</div>
                      <div style={{ color: '#64748B' }}>Will Receive:</div>
                      <div style={{ fontWeight: 600, color: '#16A34A', textAlign: 'right' }}>+{conversionResult.toQty}</div>
                      <div style={{ color: '#64748B' }}>New Stock:</div>
                      <div style={{ fontWeight: 700, color: '#0891B2', textAlign: 'right' }}>{(selectedReceivingProduct.currentStock || 0) + conversionResult.toQty}</div>
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
                  <button onClick={() => setConversionModalOpen(false)} style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', color: '#64748B', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                  <button onClick={handleConversion} disabled={!conversionResult.toQty || !conversionResult.hasEnoughStock || !selectedReceivingProduct || adjusting} style={{ flex: 2, padding: '10px', borderRadius: 8, border: 'none', background: '#0891B2', color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: (!conversionResult.toQty || !conversionResult.hasEnoughStock || !selectedReceivingProduct || adjusting) ? 0.5 : 1 }}>
                    {adjusting ? 'Processing...' : 'Confirm Conversion'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}