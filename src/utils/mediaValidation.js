// src/utils/mediaValidation.js
//
// One place that decides whether an attachment is allowed onto a post or
// comment: right type, under the size cap, and (for video) under the
// duration cap. Replaces the old videoValidation.js — update any import
// still pointing at that file to this one.

export const MAX_IMAGE_SIZE_MB = 8;
export const MAX_VIDEO_SIZE_MB = 60;
export const MAX_VIDEO_SECONDS = 60;

function readVideoDuration(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";

    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(video.duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't read that video file."));
    };

    video.src = url;
  });
}

/**
 * Throws a friendly error if `file` isn't an allowed attachment.
 * Checks (in order): file type, file size, then — for video only —
 * duration. No-ops (resolves) for a valid file.
 */
export async function validateMediaFile(file) {
  if (!file) return;

  const isVideo = file.type.startsWith("video/");
  const isImage = file.type.startsWith("image/");
  if (!isVideo && !isImage) {
    throw new Error("Only images and videos are supported.");
  }

  const sizeMB = file.size / (1024 * 1024);

  if (isImage && sizeMB > MAX_IMAGE_SIZE_MB) {
    throw new Error(
      `Images must be under ${MAX_IMAGE_SIZE_MB}MB (this one is ${sizeMB.toFixed(1)}MB).`
    );
  }

  if (isVideo) {
    if (sizeMB > MAX_VIDEO_SIZE_MB) {
      throw new Error(
        `Videos must be under ${MAX_VIDEO_SIZE_MB}MB (this one is ${sizeMB.toFixed(1)}MB).`
      );
    }
    const duration = await readVideoDuration(file);
    if (duration > MAX_VIDEO_SECONDS) {
      throw new Error(
        `Videos must be under ${MAX_VIDEO_SECONDS}s (this one is ${Math.round(duration)}s).`
      );
    }
  }
}
