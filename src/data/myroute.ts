import type { IconName } from '@/components/myroute/icon';
import type { Tone } from '@/constants/theme';

export type Place = {
  name: string;
  area: string;
  distance: string;
  category: string;
  tone: Tone;
  icon: IconName;
  rating: string;
  reviews: string;
  /** Short "area · travel time" line used by peek cards. */
  meta: string;
  hours: string;
  entrance: string;
  howToFind: string;
  /** Coordinates in WGS84 decimal degrees. Required for plotting on the map. */
  latitude: number;
  longitude: number;
};

export type CommunityRequest = {
  name: string;
  /** Free-text description a neighbour wrote. */
  detail: string;
  meta: string;
  icon: IconName;
  tone: Tone;
  time: string;
  urgent?: boolean;
  /** Posted by the signed-in contributor. */
  mine?: boolean;
  /** The signed-in contributor offered to help. */
  canHelp?: boolean;
  /** Coordinates captured when the request was created. */
  latitude: number;
  longitude: number;
};

/** A place resolved from navigation params (never a bundled sample). */
export type PlaceParams = {
  name?: string | string[];
  area?: string;
  latitude?: number;
  longitude?: number;
};

function first(value?: string | string[]): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Build a Place from the params a search hit, submission or map tap carried.
 *
 * There is no bundled place dataset any more, so a place only exists once it has
 * a name and coordinates. Returns `null` when the coordinates are missing, and
 * callers are expected to show an empty/not-found state rather than invent one.
 */
export function placeFromParams(params: PlaceParams): Place | null {
  const name = first(params.name)?.trim();
  if (!name || params.latitude == null || params.longitude == null) {
    return null;
  }
  if (!Number.isFinite(params.latitude) || !Number.isFinite(params.longitude)) {
    return null;
  }
  return {
    name,
    area: params.area ?? 'Botswana',
    distance: '',
    category: 'Place',
    tone: 'blue',
    icon: 'pin',
    rating: '—',
    reviews: 'No reviews yet',
    meta: 'Not yet verified by the community',
    hours: 'Hours unknown',
    entrance: 'Not yet added',
    howToFind: 'Contribute the details so others can find this place.',
    latitude: params.latitude,
    longitude: params.longitude,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Explore / search shortcuts
// ─────────────────────────────────────────────────────────────────────────────

export const exploreCategories = [
  { label: 'Shops', icon: 'shop' as const },
  { label: 'Health', icon: 'heart' as const },
  { label: 'Stay', icon: 'home' as const },
  { label: 'Places', icon: 'church' as const },
];

export const placeCategories = [
  { label: 'Shop', icon: 'shop' as const },
  { label: 'House', icon: 'home' as const },
  { label: 'Clinic', icon: 'heart' as const },
  { label: 'Church', icon: 'church' as const },
];

// ─────────────────────────────────────────────────────────────────────────────
// Travel modes
// ─────────────────────────────────────────────────────────────────────────────

/** Labels for the travel-mode chips; live values are filled in from routing. */
export const travelModes = [
  {
    key: 'car',
    icon: 'car' as const,
    label: 'Car',
    summary: '—',
    detail: 'Route not calculated yet',
    note: 'Fastest route',
  },
  {
    key: 'bike',
    icon: 'bike' as const,
    label: 'Bike',
    summary: '—',
    detail: 'Route not calculated yet',
    note: 'Bike friendly',
  },
  {
    key: 'walk',
    icon: 'walk' as const,
    label: 'Walk',
    summary: '—',
    detail: 'Route not calculated yet',
    note: 'Footpaths',
  },
] as const;

export type TravelModeKey = (typeof travelModes)[number]['key'];

export const requestFilters = ['All', 'My requests', 'I can help'];

// ─────────────────────────────────────────────────────────────────────────────
// Profile
// ─────────────────────────────────────────────────────────────────────────────

export const profile = {
  name: 'Your profile',
  initials: '·',
  location: 'Botswana',
  stats: [
    { value: '0', label: 'Places added' },
    { value: '0', label: 'People helped' },
    { value: '0', label: 'Badges' },
  ],
  menu: [
    { label: 'Messages', icon: 'chat' as const },
    { label: 'Offline maps', icon: 'map' as const },
    { label: 'My contributions', icon: 'plus' as const },
    { label: 'Community settings', icon: 'request' as const },
    { label: 'Help & support', icon: 'heart' as const },
  ],
};
