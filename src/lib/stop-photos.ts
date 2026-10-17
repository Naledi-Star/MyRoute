import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

/**
 * Photos of captured stops.
 *
 * Both the camera and the photo library hand back a file inside the app's cache
 * directory, which the operating system may clear whenever it needs the space. A
 * stop photo is part of the contribution, so it is moved into the documents
 * directory before it is attached to a stop.
 */

const PHOTO_DIRECTORY = 'stop-photos';

export type StopPhotoOutcome =
  | { status: 'saved'; uri: string }
  | { status: 'cancelled' }
  | { status: 'failed'; message: string };

/** Keep the picked image's own format where the uri reveals it. */
function extensionOf(uri: string): string {
  const match = /\.([a-z0-9]{2,4})(?:\?|$)/i.exec(uri);
  return match ? match[1].toLowerCase() : 'jpg';
}

/** Move a freshly picked photo somewhere the OS will not clear. */
function relocate(sourceUri: string, key: string): string {
  try {
    const directory = new Directory(Paths.document, PHOTO_DIRECTORY);
    directory.create({ intermediates: true, idempotent: true });
    const destination = new File(directory, `${key}.${extensionOf(sourceUri)}`);
    new File(sourceUri).moveSync(destination, { overwrite: true });
    return destination.uri;
  } catch {
    // A move can fail on a provider-backed uri; showing the original is still
    // better than losing the photo entirely.
    return sourceUri;
  }
}

/**
 * Take a photo of the stop, or pick one from the library.
 *
 * `key` names the stored file — the stop's id — so re-taking a photo for the
 * same stop overwrites the old one instead of leaving it behind.
 */
export async function addStopPhoto(
  source: 'camera' | 'library',
  key: string,
): Promise<StopPhotoOutcome> {
  try {
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      return {
        status: 'failed',
        message:
          source === 'camera'
            ? 'Camera permission is needed to photograph a stop.'
            : 'Photo permission is needed to choose a picture.',
      };
    }

    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.6 };
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);

    const asset = result.assets?.[0];
    if (result.canceled || !asset) {
      return { status: 'cancelled' };
    }
    return { status: 'saved', uri: relocate(asset.uri, key) };
  } catch (error) {
    return {
      status: 'failed',
      message: error instanceof Error ? error.message : 'Could not add the photo.',
    };
  }
}
