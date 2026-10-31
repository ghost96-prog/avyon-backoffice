// src/utils/fiscal.js
//
// Fiscalised-branch rules shared by the BackOffice pages. A branch is "fiscalised" when tax
// is enabled for it (Taxes page). On those branches:
//   - every category must carry an 8-digit ZIMRA HS code (the code on each receipt line
//     comes from the product's category),
//   - a product with no tax picked is treated as the store's standard-rated tax (whatever its
//     rate is - nothing here hardcodes it, so a rate change in Taxes is picked up automatically).
// Non-fiscalised branches are never affected.

export const normalizeHsCode = (v) => String(v ?? '').replace(/\s+/g, '');

/** Empty is "valid" here (callers decide whether it is required). Otherwise 8 digits, not all zeros. */
export const isValidHsCode = (v) => {
  const s = normalizeHsCode(v);
  return s === '' || (/^\d{8}$/.test(s) && s !== '00000000');
};

/** A usable HS code: non-empty AND valid. */
export const hasValidHsCode = (v) => normalizeHsCode(v) !== '' && isValidHsCode(v);

/** The store's standard-rated tax record (kind 'standard'), or null if none is set up. */
export const findDefaultVatTax = (taxes) => {
  const standard = (Array.isArray(taxes) ? taxes : []).filter(
    (t) => t && t.kind === 'standard' && Number(t.rate) > 0,
  );
  return standard.find((t) => /^vat$/i.test(String(t.name).trim())) || standard[0] || null;
};

export const HS_REQUIRED_MSG =
  'This store is fiscalised, so every category needs an 8-digit HS code (e.g. 22021000).';
