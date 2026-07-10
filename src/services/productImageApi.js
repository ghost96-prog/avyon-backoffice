// src/services/productImageApi.js
//
// Web equivalent of the mobile app's services/productImageApi.js. The
// backend endpoint (POST/DELETE .../products/:productId/image) expects a
// raw base64 string with no data-URL prefix, same as the mobile client —
// so this reads the File via FileReader and strips the
// "data:image/jpeg;base64," prefix before sending.
//
// Uses the app's existing apiFetch (from AppContext) rather than a raw
// fetch(), so auth/retry/base-URL logic isn't duplicated here.

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.onloadend = () => {
      const result = String(reader.result || '');
      const base64 = result.split(',')[1] || '';
      resolve(base64);
    };
    reader.readAsDataURL(file);
  });
}

export async function uploadProductImage(apiFetch, { businessId, branchId, productId, staffId, file }) {
  if (!file) throw new Error('No file provided');
  const imageData = await fileToBase64(file);
  const mimeType = file.type || 'image/jpeg';

  return apiFetch(`/business/${businessId}/branches/${branchId}/products/${productId}/image`, {
    method: 'POST',
    body: JSON.stringify({ staffId, imageData, mimeType }),
  });
}

export async function deleteProductImage(apiFetch, { businessId, branchId, productId, staffId }) {
  return apiFetch(`/business/${businessId}/branches/${branchId}/products/${productId}/image`, {
    method: 'DELETE',
    body: JSON.stringify({ staffId }),
  });
}