// src/utils/csvUtils.js
// Shared CSV parsing/building utilities for Product import & export.

export const UNITS = [
  { value: 'each', label: 'Each', requiresQuantityPerUnit: false },
  { value: 'kg', label: 'Kilogram (kg)', requiresQuantityPerUnit: false },
  { value: 'meter', label: 'Meter (m)', requiresQuantityPerUnit: false },
  { value: 'box', label: 'Box', requiresQuantityPerUnit: true, placeholder: 'Items per box' },
  { value: 'pack', label: 'Pack', requiresQuantityPerUnit: true, placeholder: 'Items per pack' },
];

// Column order used for BOTH the template and the re-importable export.
export const PRODUCT_CSV_COLUMNS = [
  { key: 'productId', label: 'Product ID' },
  { key: 'sku', label: 'SKU' },
  { key: 'name', label: 'Name' },
  { key: 'barcode', label: 'Barcode' },
  { key: 'category', label: 'Category' },
  { key: 'unit', label: 'Unit' },
  { key: 'itemsPerUnit', label: 'Items Per Unit' },
  { key: 'description', label: 'Description' },
  { key: 'sellingPrice', label: 'Selling Price' },
  { key: 'costPrice', label: 'Cost Price' },
  { key: 'trackInventory', label: 'Track Inventory' },
  { key: 'currentStock', label: 'Current Stock' },
  { key: 'lowStockThreshold', label: 'Low Stock Threshold' },
  { key: 'status', label: 'Status' },
  { key: 'taxable', label: 'Taxable' },
  { key: 'taxName', label: 'Tax Name' },
  { key: 'taxPercent', label: 'Tax Percent' },
  { key: 'taxInclusive', label: 'Tax Inclusive' },
];

const HEADER_ALIASES = {
  'product id': 'productId',
  productid: 'productId',
  id: 'productId',
  sku: 'sku',
  name: 'name',
  'product name': 'name',
  barcode: 'barcode',
  category: 'category',
  unit: 'unit',
  'items per unit': 'itemsPerUnit',
  itemsperunit: 'itemsPerUnit',
  description: 'description',
  'selling price': 'sellingPrice',
  sellingprice: 'sellingPrice',
  price: 'sellingPrice',
  'cost price': 'costPrice',
  costprice: 'costPrice',
  cost: 'costPrice',
  'track inventory': 'trackInventory',
  trackinventory: 'trackInventory',
  'current stock': 'currentStock',
  currentstock: 'currentStock',
  stock: 'currentStock',
  'low stock threshold': 'lowStockThreshold',
  'low stock alert': 'lowStockThreshold',
  lowstockthreshold: 'lowStockThreshold',
  status: 'status',
  taxable: 'taxable',
  'tax name': 'taxName',
  taxname: 'taxName',
  'tax percent': 'taxPercent',
  taxpercent: 'taxPercent',
  'tax inclusive': 'taxInclusive',
  taxinclusive: 'taxInclusive',
};

function normalizeHeader(h) {
  return (h || '').trim().toLowerCase().replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

export function parseBool(str) {
  return /^(true|yes|1|y)$/i.test((str || '').trim());
}

// ─── CSV text -> array of row objects (handles quoted commas/newlines) ────────
export function parseCsvText(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => { rows.push(row); row = []; };

  const src = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < src.length; i++) {
    const char = src[i];
    if (inQuotes) {
      if (char === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      pushField();
    } else if (char === '\n') {
      pushField();
      pushRow();
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) { pushField(); pushRow(); }

  const cleanRows = rows.filter((r) => r.some((c) => c && c.trim() !== ''));
  if (cleanRows.length === 0) return [];

  const headerRow = cleanRows[0].map(normalizeHeader);
  const mappedHeaders = headerRow.map((h) => HEADER_ALIASES[h] || h);

  return cleanRows.slice(1).map((r) => {
    const obj = {};
    mappedHeaders.forEach((key, idx) => { obj[key] = (r[idx] ?? '').trim(); });
    return obj;
  });
}

// ─── Build + trigger download of a CSV file ───────────────────────────────────
function csvEscape(value) {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export function buildCsvText(rows) {
  return rows.map((r) => r.map(csvEscape).join(',')).join('\n');
}

export function triggerCsvDownload(filename, rows) {
  const csvText = buildCsvText(rows);
  const blob = new Blob(['\uFEFF' + csvText], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ─── Template: headers + one example row ──────────────────────────────────────
export function downloadProductTemplate() {
  const headers = PRODUCT_CSV_COLUMNS.map((c) => c.label);
  const example = [
    '', 'SKU1001', 'Sample Product', '', 'No Category', 'each', '',
    'Optional description', '9.99', '5.00', 'TRUE', '20', '5', 'active',
    'FALSE', '', '0', 'FALSE',
  ];
  triggerCsvDownload('product_import_template.csv', [headers, example]);
}

// ─── Export current products in a re-uploadable format ───────────────────────
export function downloadProductsForReimport(products, branchTag) {
  const headers = PRODUCT_CSV_COLUMNS.map((c) => c.label);
  const rows = products.map((p) => ([
    p.productId || '',
    p.sku || '',
    p.name || '',
    p.barcode || '',
    p.category || 'No Category',
    p.unit || 'each',
    p.itemsPerUnit || '',
    p.description || '',
    Number(p.sellingPrice || 0).toFixed(2),
    Number(p.costPrice || 0).toFixed(2),
    p.trackInventory !== false ? 'TRUE' : 'FALSE',
    p.trackInventory !== false ? (p.currentStock ?? 0) : 0,
    p.lowStockThreshold ?? 0,
    p.status === 'active' ? 'active' : 'inactive',
    p.taxable ? 'TRUE' : 'FALSE',
    p.taxName || '',
    p.taxPercent ?? 0,
    p.taxInclusive ? 'TRUE' : 'FALSE',
  ]));
  triggerCsvDownload(`products_${branchTag}_reimport.csv`, [headers, ...rows]);
}

// ─── Row evaluation: decide create / update / error ───────────────────────────
export function evaluateImportRow(row, allProducts, duplicateSkuSet) {
  const errors = [];
  const name = (row.name || '').trim();
  const skuRaw = (row.sku || '').trim();
  const sku = skuRaw.toUpperCase();
  const productId = (row.productId || '').trim();

  if (!name) errors.push('Name is required');
  if (!sku) errors.push('SKU is required');

  const priceNum = parseFloat(row.sellingPrice);
  if (row.sellingPrice === '' || row.sellingPrice === undefined || isNaN(priceNum)) {
    errors.push('Selling price is required and must be a number');
  }

  const unit = (row.unit || 'each').trim().toLowerCase();
  const unitDef = UNITS.find((u) => u.value === unit);
  if (row.unit && !unitDef) errors.push(`Unrecognized unit "${row.unit}" — will default to "each"`);
  if (unitDef?.requiresQuantityPerUnit) {
    const ipu = parseInt(row.itemsPerUnit, 10);
    if (!ipu || ipu <= 0) errors.push(`${unitDef.placeholder} is required for unit "${unitDef.label}"`);
  }

  if (sku && duplicateSkuSet.has(sku)) errors.push('Duplicate SKU within this file');

  let action = 'create';
  let targetProductId = null;

  if (productId) {
    const targetProduct = allProducts.find((p) => p.productId === productId);
    if (!targetProduct) {
      errors.push('Product ID not found in this branch');
    } else {
      action = 'update';
      targetProductId = targetProduct.productId;
      const otherMatch = allProducts.find(
        (p) => p.productId !== productId && (p.sku || '').toUpperCase() === sku && sku
      );
      if (otherMatch) {
        errors.push(`SKU "${sku}" is already used by "${otherMatch.name}" — change the SKU or fix the Product ID`);
      }
    }
  } else {
    action = 'create';
    const existing = allProducts.find((p) => (p.sku || '').toUpperCase() === sku && sku);
    if (existing) {
      errors.push(`SKU "${sku}" already exists (${existing.name}) — change the SKU, or add Product ID "${existing.productId}" to update it instead`);
    }
  }

  return { action, targetProductId, errors };
}