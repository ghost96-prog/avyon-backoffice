// src/utils/stockTransfer.js
//
// Shared pack/box → target unit-conversion math for the backoffice.
//
// Mirrors the mobile app's realm/stockTransfer.js computeUnitMultiplier
// exactly, so a case-of-24 → half-case-of-12 link always resolves to "2"
// the same way whether it's set up from the POS app or from here — they
// read/write the same Product.packLinks field on the same backend record.
//
// This file is intentionally pure (no API calls, no React) so it can be
// unit-tested and imported from anywhere without pulling in fetch/context.

/**
 * How many of targetItemsPerUnit does one unit of packItemsPerUnit yield?
 *
 *   case (itemsPerUnit=24) → each (itemsPerUnit=1):        24 / 1  = 24 singles
 *   case (itemsPerUnit=24) → half-case (itemsPerUnit=12):  24 / 12 = 2 halves
 *   case (itemsPerUnit=24) → 6-pack (itemsPerUnit=6):      24 / 6  = 4 six-packs
 *
 * Returns null when the pack doesn't divide evenly into the target's unit
 * size (or the target's unit is bigger than the pack itself) — that's a
 * data problem the caller should surface, never silently round away.
 */
export function computeUnitMultiplier(packItemsPerUnit, targetItemsPerUnit) {
  const packSize = packItemsPerUnit > 0 ? packItemsPerUnit : 1;
  const targetSize = targetItemsPerUnit > 0 ? targetItemsPerUnit : 1;

  if (packSize < targetSize) return null;
  if (packSize % targetSize !== 0) return null;

  return packSize / targetSize;
}

/** Parse a product's packLinks JSON safely. Always returns an array. */
export function parsePackLinks(packLinksJson) {
  if (!packLinksJson) return [];
  try {
    const parsed = JSON.parse(packLinksJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('parsePackLinks: invalid packLinks JSON', err.message);
    return [];
  }
}
