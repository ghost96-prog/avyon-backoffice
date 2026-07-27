// src/utils/mediaCompression.js
//
// Client-side image compression so a post's Storage footprint stays
// reasonable even when someone attaches full-resolution phone photos.
// Downscales to a max dimension and re-encodes as JPEG at a fixed
// quality — a typical 4-8MB phone photo usually comes back under 500KB.
//
// Videos aren't touched here. Real video transcoding needs a much
// heavier tool (e.g. ffmpeg.wasm) than belongs in a client-side upload
// step — the existing size/duration caps in mediaValidation.js are what
// keeps video storage in check for now.

const MAX_DIMENSION = 1920; // longest edge, px — plenty for feed/lightbox viewing
const JPEG_QUALITY = 0.8;

/**
 * Returns a new File: same rough name, downscaled and re-encoded as
 * JPEG. Falls back to the original file untouched if anything goes
 * wrong (corrupt image, canvas unsupported, unusual format, or the
 * "compressed" result isn't actually smaller) — compression is a
 * nice-to-have, never a reason to block a post.
 */
export async function compressImageFile(file) {
  if (!file.type.startsWith("image/")) return file;
  // Animated GIFs lose their animation pushed through a canvas — leave
  // them as-is rather than silently flattening to a single frame.
  if (file.type === "image/gif") return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await new Promise((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Image compression failed"))),
        "image/jpeg",
        JPEG_QUALITY
      )
    );

    // Only worth the swap if it's actually smaller — a small or
    // already-compressed image can come back larger after re-encoding.
    if (blob.size >= file.size) return file;

    const newName = file.name.replace(/\.\w+$/, "") + ".jpg";
    return new File([blob], newName, { type: "image/jpeg", lastModified: Date.now() });
  } catch (err) {
    console.error("compressImageFile error:", err);
    return file;
  }
}
