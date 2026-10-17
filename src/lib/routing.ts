export type TravelProfile = 'car' | 'bike' | 'foot';

/** A single manoeuvre in a turn-by-turn route. */
export type RouteStep = {
  distanceMetres: number;
  durationSeconds: number;
  /** Human-readable instruction, e.g. "Turn left onto Kgale View". */
  instruction: string;
  /** The manoeuvre kind from the engine: 'turn', 'depart', 'arrive', … */
  maneuver: string;
  /** [lng, lat] where the manoeuvre happens. */
  location: [number, number];
};

export type RouteResult = {
  distanceMetres: number;
  durationSeconds: number;
  /** GeoJSON LineString coordinate array: [[lng, lat], ...] */
  coordinates: [number, number][];
  /** Present when `steps` was requested. */
  steps?: RouteStep[];
};

const OSRM_PROFILES: Record<TravelProfile, string> = {
  car: 'driving',
  bike: 'cycling',
  foot: 'walking',
};

const OSRM_BASE = 'https://router.project-osrm.org/route/v1';

type OsrmStep = {
  distance: number;
  duration: number;
  name?: string;
  maneuver?: {
    type?: string;
    modifier?: string;
    location?: [number, number];
  };
};

type OsrmRoute = {
  distance: number;
  duration: number;
  geometry: { coordinates: [number, number][] };
  legs?: { steps?: OsrmStep[] }[];
};

function describeStep(step: OsrmStep): string {
  const maneuver = step.maneuver ?? {};
  const type = maneuver.type ?? 'continue';
  const modifier = maneuver.modifier ? ` ${maneuver.modifier}` : '';
  const onto = step.name ? ` onto ${step.name}` : '';

  switch (type) {
    case 'depart':
      return step.name ? `Head out on ${step.name}` : 'Start';
    case 'arrive':
      return 'Arrive at your destination';
    case 'turn':
      return `Turn${modifier}${onto}`;
    case 'new name':
      return `Continue${onto}`;
    case 'merge':
      return `Merge${modifier}${onto}`;
    case 'on ramp':
      return `Take the ramp${onto}`;
    case 'off ramp':
      return `Take the exit${onto}`;
    case 'fork':
      return `Keep${modifier || ' straight'}${onto}`;
    case 'roundabout':
    case 'rotary':
      return `At the roundabout, take the exit${onto}`;
    case 'end of road':
      return `At the end of the road, turn${modifier}${onto}`;
    default:
      return `${type.charAt(0).toUpperCase()}${type.slice(1)}${modifier}${onto}`.trim();
  }
}

function toSteps(route: OsrmRoute): RouteStep[] {
  const steps = route.legs?.flatMap((leg) => leg.steps ?? []) ?? [];
  return steps.map((step) => ({
    distanceMetres: step.distance,
    durationSeconds: step.duration,
    instruction: describeStep(step),
    maneuver: step.maneuver?.type ?? 'continue',
    location: step.maneuver?.location ?? [0, 0],
  }));
}

/**
 * Query OSRM for a route through two or more waypoints.
 *
 * The public OSRM demo server is fine for development and light use, but has no
 * SLA. For production, self-host OSRM (or Valhalla) on a free tier.
 *
 * @param waypoints At least two `[lng, lat]` points; more makes a multi-leg route,
 *   which is what "snap my drawn path to roads" uses.
 */
export async function getRouteThrough(
  waypoints: [number, number][],
  profile: TravelProfile = 'car',
  { steps = false }: { steps?: boolean } = {},
): Promise<RouteResult> {
  if (waypoints.length < 2) {
    throw new Error('A route needs at least two waypoints');
  }

  const path = waypoints.map(([lng, lat]) => `${lng},${lat}`).join(';');
  const url =
    `${OSRM_BASE}/${OSRM_PROFILES[profile]}/${path}` +
    `?overview=full&geometries=geojson&steps=${steps ? 'true' : 'false'}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Routing failed (${res.status})`);
  }

  const data = (await res.json()) as { routes?: OsrmRoute[] };
  const route = data.routes?.[0];
  if (!route) {
    throw new Error('No route found');
  }

  return {
    distanceMetres: route.distance,
    durationSeconds: route.duration,
    coordinates: route.geometry.coordinates,
    steps: steps ? toSteps(route) : undefined,
  };
}

/** Query OSRM for a route between two coordinates. */
export function getRoute(
  from: [number, number],
  to: [number, number],
  profile: TravelProfile = 'car',
): Promise<RouteResult> {
  return getRouteThrough([from, to], profile);
}

/** "12 min" / "1 hr 15" — the format used by the travel mode chips. */
export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest}`;
}
