// src/utils/mediaValidation.js
//
// One place that decides whether an attachment is allowed onto a post or
// comment: right type, under the size cap, and (for video) under the
// duration cap. Replaces the old videoValidation.js — update any import
// still pointing at that file to this one.

export const MAX_IMAGE_SIZE_MB = 8;
export const MAX_VIDEO_SIZE_MB = 60;
export const MAX_VIDEO_SECONDS = 60;

// A post can carry up to this many images AND, separately, up to this
// many videos — two independent caps, not one shared pool. A post with
// its 1 video already attached can still take 3 images alongside it,
// but not a 2nd video. Shared here so the composer and the edit form
// can't drift apart.
export const MAX_IMAGES_PER_POST = 3;
export const MAX_VIDEOS_PER_POST = 1;
// Total attachment slots, for any UI copy that wants a single number.
export const MAX_MEDIA_ITEMS = MAX_IMAGES_PER_POST + MAX_VIDEOS_PER_POST;

/**
 * Counts images/videos in a gallery-shaped list. Accepts either
 * PostComposer's `{ kind: "image"|"video" }` items or PostEditForm's
 * `{ type: "image"|"video" }` items.
 */
export function countMediaByType(items) {
  return items.reduce(
    (acc, item) => {
      const isVideo = (item.kind || item.type) === "video";
      if (isVideo) acc.videos += 1;
      else acc.images += 1;
      return acc;
    },
    { images: 0, videos: 0 }
  );
}

/**
 * How many more images/videos can still be added, given what's already
 * attached (existing + freshly-picked, combined into one list).
 */
export function remainingMediaSlots(items) {
  const { images, videos } = countMediaByType(items);
  return {
    images: Math.max(0, MAX_IMAGES_PER_POST - images),
    videos: Math.max(0, MAX_VIDEOS_PER_POST - videos),
  };
}

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
