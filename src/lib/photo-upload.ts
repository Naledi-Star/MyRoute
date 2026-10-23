import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import {
  JPEG_QUALITY_LADDER,
  PHOTO_MAX_EDGE_PX,
  describeUploadRefusal,
  isUploadableSize,
  meetsTargetSize,
  resizeDimensions,
} from './photo-limits';

/**
 * Prepare a photo for upload.
 *
 * Every photo is resized (long edge ≤ 1600 px) and JPEG-compressed before a
 * signature is requested, so the app never uploads an original camera file and
 * the bucket never holds anything large. Compression runs only when the user
 * taps save: there is no background queue, no pre-signing and no retry loop.
 *
 * If the result cannot be brought under 1 MB, this throws and the caller shows
 * the message to the user; the server would delete such an object anyway.
 */

export class PhotoUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PhotoUploadError';
  }
}

function fileSize(uri: string): number | null {
  try {
    return new File(uri).size ?? null;
  } catch {
    return null;
  }
}

function removeQuietly(uri: string): void {
  try {
    new File(uri).delete();
  } catch {
    // A cache file that outlives us is harmless.
  }
}

export type PreparedPhoto = {
  /** Local JPEG uri, ready to PUT to the signed URL. */
  uri: string;
  /** Bytes on disk; `null` when the platform will not report it. */
  bytes: number | null;
};

export async function preparePhotoForUpload(sourceUri: string): Promise<PreparedPhoto> {
  let saved: string | null = null;

  try {
    const context = ImageManipulator.manipulate(sourceUri);

    // Render once without transformations to learn the real dimensions, then
    // resize only if the long edge is over the cap (never upscale).
    const original = await context.renderAsync();
    const target = resizeDimensions(original.width, original.height, PHOTO_MAX_EDGE_PX);
    if (target.resized) {
      context.resize({ width: target.width, height: target.height });
    }

    const image = await context.renderAsync();

    let bytes: number | null = null;
    for (const quality of JPEG_QUALITY_LADDER) {
      const candidate = await image.saveAsync({ compress: quality, format: SaveFormat.JPEG });
      if (saved) {
        removeQuietly(saved);
      }
      saved = candidate.uri;
      bytes = fileSize(candidate.uri);
      if (bytes == null) {
        break;
      }
      if (meetsTargetSize(bytes)) {
        break;
      }
    }

    if (!saved) {
      throw new PhotoUploadError('The photo could not be compressed.');
    }

    // Unknown size (web) is allowed through: the server HEADs the object and
    // rejects anything over its own 1 MB cap.
    if (bytes != null && !isUploadableSize(bytes)) {
      throw new PhotoUploadError(describeUploadRefusal(bytes));
    }

    return { uri: saved, bytes };
  } catch (error) {
    if (saved) {
      removeQuietly(saved);
    }
    if (error instanceof PhotoUploadError) {
      throw error;
    }
    throw new PhotoUploadError(
      error instanceof Error
        ? `The photo could not be prepared: ${error.message}`
        : 'The photo could not be prepared.',
    );
  }
}
