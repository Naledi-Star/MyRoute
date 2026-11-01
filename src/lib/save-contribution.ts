import { submitPath } from './api';
import { addPath, type PathWaypoint, type SavedPath } from './paths';
import type { TravelProfile } from './routing';

/**
 * Saving a recorded line, per kind.
 *
 * A path and a combi route are different things — one is a road, the other is a
 * ride with boarding points — so each has its own function here and each writes
 * its own `kind`. No caller passes a kind in, which is what makes it impossible
 * for a ride recorded on the Combies tab to land in the paths table.
 */

export type SaveOutcome = {
  /** The record as it now sits on the device. */
  saved: SavedPath;
  /** Set when the database did not take it yet; the record is still local. */
  uploadError: string | null;
};

type RecordInput = {
  id?: string;
  createdAt?: number;
  status?: SavedPath['status'];
  name: string;
  profile: TravelProfile;
  vertices: [number, number][];
  waypoints: PathWaypoint[];
  source: 'recorded' | 'drawn';
  coordinates: [number, number][];
  snapped: boolean;
  distanceMetres: number;
  durationSeconds: number;
};

async function persist(record: Parameters<typeof addPath>[0]): Promise<SaveOutcome> {
  const [added] = await addPath(record);
  if (!added) {
    throw new Error('The record could not be written to this device.');
  }
  try {
    const synced = await submitPath(added);
    const [stored] = await addPath(synced);
    return { saved: stored ?? synced, uploadError: null };
  } catch (error) {
    return {
      saved: added,
      uploadError:
        error instanceof Error ? error.message : 'The database did not receive it yet.',
    };
  }
}

/** Save a recorded or drawn road as a path. */
export async function savePath(input: RecordInput): Promise<SaveOutcome> {
  return persist({ ...input, kind: 'path' });
}

/** Save a recorded ride as a combi route, with its ordered stops. */
export async function saveCombiRoute(input: RecordInput & { rank: string }): Promise<SaveOutcome> {
  const named = input.waypoints.filter((stop) => stop.label.trim().length > 0);
  if (named.length < 2) {
    throw new Error(
      'A combi route needs two stops: where riders board and where they get off. Record a little further, or add a stop.',
    );
  }
  const name = input.name.trim();
  return persist({
    ...input,
    name,
    kind: 'combi',
    combiName: name,
    rank: input.rank.trim(),
    waypoints: named,
  });
}
