/**
 * Photo upload limits (pure, no native modules — unit-tested).
 *
 * The app compresses every photo before it asks the server for a signature:
 * long edge at most 1600 px, JPEG, targeting 500 KB, and it refuses to upload
 * anything over 1 MB. The server enforces the same 1 MB ceiling independently
 * (it HEADs the object), because a client cannot be trusted to self-police.
 */

/** Longest edge after resizing. */
export const PHOTO_MAX_EDGE_PX = 1600;

/** What compression aims for; a few attempts are allowed to get there. */
export const PHOTO_TARGET_BYTES = 500 * 1024;

/** Above this the app refuses to upload at all, and the server would delete it. */
export const PHOTO_HARD_MAX_BYTES = 1024 * 1024;

/** Quality steps tried in order until the file fits the target. */
export const JPEG_QUALITY_LADDER = [0.8, 0.7, 0.55, 0.4, 0.3] as const;

export type ResizeTarget = {
  width: number;
  height: number;
  /** False when the image already fits inside `maxEdge`. */
  resized: boolean;
};

/**
 * Fit an image inside a square `maxEdge` while keeping its aspect ratio.
 * A portrait photo is scaled by its height, a landscape one by its width.
 * Invalid dimensions are rejected rather than producing NaN geometry.
 */
export function resizeDimensions(
  width: number,
  height: number,
  maxEdge: number = PHOTO_MAX_EDGE_PX,
): ResizeTarget {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    !Number.isFinite(maxEdge) ||
    maxEdge <= 0
  ) {
    throw new Error('Photo dimensions must be positive numbers.');
  }

  const longest = Math.max(width, height);
  if (longest <= maxEdge) {
    return { width: Math.round(width), height: Math.round(height), resized: false };
  }

  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    resized: true,
  };
}

/** True only for a real file size inside the hard cap. */
export function isUploadableSize(bytes: number | null | undefined): boolean {
  return typeof bytes === 'number' && Number.isFinite(bytes) && bytes > 0 && bytes <= PHOTO_HARD_MAX_BYTES;
}

/** Whether the compressed result reached the 500 KB target (an optimisation, not a gate). */
export function meetsTargetSize(bytes: number): boolean {
  return Number.isFinite(bytes) && bytes > 0 && bytes <= PHOTO_TARGET_BYTES;
}

/** A short, user-facing reason an upload was refused. */
export function describeUploadRefusal(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) {
    return 'The photo could not be prepared for upload.';
  }
  return `This photo is still ${Math.round(bytes / 1024)} KB after compression. ` +
    'Photos must be under 1 MB — try again, or take a smaller picture.';
}
