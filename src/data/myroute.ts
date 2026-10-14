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
};

export type CommunityRequest = {
  name: string;
  /** Free-text description a neighbour wrote; kept verbatim from the wireframe. */
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
};

/** Photo of the community-added place, shared by the hero, preview and form. */
export const shopImage = require('@/assets/images/shop-rotterdam.jpg');

export const places: Place[] = [
  {
    name: 'Rail Park Mall',
    area: 'Gaborone West',
    distance: '2.4 km',
    category: 'Shopping',
    tone: 'peach',
    icon: 'shop',
    rating: '4.5',
    reviews: '218 reviews',
    meta: 'Gaborone West · 12 min away',
    hours: 'Open now · Closes at 9:00 PM',
    entrance: 'Main entrance off the Western Bypass, free parking at the north gate',
    howToFind:
      'Look for the big yellow sign on the bypass, then turn in at the second traffic circle.',
  },
  {
    name: 'Main Mall',
    area: 'The Mall, Gaborone',
    distance: '3.1 km',
    category: 'Landmark',
    tone: 'blue',
    icon: 'pin',
    rating: '4.3',
    reviews: '96 reviews',
    meta: 'CBD · 14 min away',
    hours: 'Open now · Closes at 6:00 PM',
    entrance: 'Central square, between the post office and the bus rank',
    howToFind: 'Walk to the middle of the mall; the square with the fountains is hard to miss.',
  },
  {
    name: 'Mokolodi Nature Reserve',
    area: 'South of Gaborone',
    distance: '14 km',
    category: 'Outdoors',
    tone: 'green',
    icon: 'map',
    rating: '4.7',
    reviews: '410 reviews',
    meta: 'South of Gaborone · 25 min away',
    hours: 'Open now · Closes at 6:00 PM',
    entrance: 'Gate on the Mokolodi road, signposted from the Kanye road',
    howToFind: 'Take the Kanye road south, turn left at the Mokolodi sign and follow the dirt road.',
  },
];

/** The community-added place featured on the Explore sheet. */
export const featuredPlace: Place = {
  name: 'Rotterdam Shop',
  area: 'Broadhurst, Gaborone',
  distance: '500 m',
  category: 'Local shop',
  tone: 'green',
  icon: 'shop',
  rating: '4.8',
  reviews: '32 reviews',
  meta: 'Broadhurst · 8 min away',
  hours: 'Open now · Closes at 8:00 PM',
  entrance: 'Behind the blue house, 120 m from main road',
  howToFind:
    'From the main road, take the second dirt road on the left. The shop is next to the blue house.',
};

export function findPlace(name?: string | string[]): Place {
  const wanted = Array.isArray(name) ? name[0] : name;
  return [...places, featuredPlace].find((place) => place.name === wanted) ?? featuredPlace;
}

export const recentSearches = [
  'Sir Seretse Khama Airport',
  'University of Botswana',
  'Main Mall',
];

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

export const travelModes = [
  {
    key: 'car',
    icon: 'car' as const,
    label: '12 min',
    summary: '12 min',
    detail: '4.2 km · Fastest route',
    note: 'Light traffic',
  },
  {
    key: 'bike',
    icon: 'bike' as const,
    label: '28 min',
    summary: '28 min',
    detail: '4.2 km · Bike friendly',
    note: 'Cycle lanes',
  },
  {
    key: 'walk',
    icon: 'walk' as const,
    label: '1 hr 15',
    summary: '1 hr 15',
    detail: '3.9 km · Shorter walk',
    note: 'Footpaths',
  },
] as const;

export type TravelModeKey = (typeof travelModes)[number]['key'];

export const communityRequests: CommunityRequest[] = [
  {
    name: 'Rotterdam Shop',
    detail: 'Somewhere in Broadhurst, behind the blue house near the big tree.',
    meta: '500 m away · 2 responses',
    icon: 'shop',
    tone: 'red',
    time: '1h ago',
    urgent: true,
    mine: true,
  },
  {
    name: 'The White House',
    detail: 'It is next to the red gate, off the dirt road after the school.',
    meta: '1.2 km away · 0 responses',
    icon: 'home',
    tone: 'amber',
    time: '2h ago',
    mine: true,
  },
  {
    name: 'Mmamashia Church',
    detail: 'Near the old water tank in Mogoditshane.',
    meta: '2.1 km away · 3 responses',
    icon: 'church',
    tone: 'blue',
    time: '3h ago',
    canHelp: true,
  },
  {
    name: 'Broadhurst Clinic',
    detail: 'Looking for the new clinic near the Matlapaneng turn off.',
    meta: '2.8 km away · 1 response',
    icon: 'heart',
    tone: 'green',
    time: 'Yesterday',
    canHelp: true,
  },
];

export const requestFilters = ['All', 'My requests', 'I can help'];

export const savedPlaces = places.map((place) => ({
  ...place,
  offline: true,
}));

export const profile = {
  name: 'Kabelo Molefe',
  initials: 'KM',
  location: 'Gaborone, Botswana',
  stats: [
    { value: '18', label: 'Places added' },
    { value: '42', label: 'People helped' },
    { value: '7', label: 'Badges' },
  ],
  menu: [
    { label: 'Offline maps', icon: 'map' as const },
    { label: 'My contributions', icon: 'plus' as const },
    { label: 'Community settings', icon: 'request' as const },
    { label: 'Help & support', icon: 'heart' as const },
  ],
};

export const navigationDemo = {
  place: featuredPlace,
  turn: { distance: '300 m', instruction: 'Continue straight' },
  instruction: {
    distance: '100 m',
    text: 'Look for a blue shop with a large tree on the left.',
  },
};
