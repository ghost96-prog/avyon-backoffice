// src/utils/videoValidation.js
//
// Client-side check so we reject long videos before ever uploading them.
// Reads video metadata via a temporary <video> element — no upload needed.

export const MAX_VIDEO_SECONDS = 60;

export function getVideoDuration(file) {
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
 * Throws if `file` is a video longer than MAX_VIDEO_SECONDS.
 * No-ops for non-video files.
 */
export async function validateVideoFile(file) {
  if (!file || !file.type.startsWith("video/")) return;

  const duration = await getVideoDuration(file);
  if (duration > MAX_VIDEO_SECONDS) {
    throw new Error(
      `Videos must be under ${MAX_VIDEO_SECONDS}s (this one is ${Math.round(duration)}s).`
    );
  }
}
