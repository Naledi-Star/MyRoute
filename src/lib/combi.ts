import { distanceMetres, type LatLng } from './geo';
import type { PathWaypoint, SavedPath } from './paths';

/**
 * Combi journeys.
 *
 * A combi route in myroute is a recorded path: somebody rode the combi, the
 * track became the road it follows, and the stops they named on the way became
 * the places you can board and get off. That is deliberate — the network is
 * built from trips people actually took, not from a dataset that does not exist
 * (OpenStreetMap carries no combi routes for Gaborone).
 *
 * A route's stops are in travel order, so direction is implied by the order:
 * "Block 8 Route 1" boards near Block 3 and ends in Block 8. A trip the other way
 * needs the opposite route, exactly like the real thing.
 *
 * Everything here is pure: no React, no storage, no network.
 */

/** How far somebody will walk to reach a combi stop. */
export const MAX_ACCESS_WALK_M = 1200;

/** Two stops this close are the same place — opposite sides of a road, a rank. */
export const STOP_INTERCHANGE_M = 150;

/** Shorter rides are not worth boarding for; walking wins. */
export const MIN_RIDE_M = 400;

/** A combi stop, as captured on the recorded path. */
export type CombiStop = {
  name: string;
  latitude: number;
  longitude: number;
  /**
   * Standard fare from the previous stop to this one, in pula. Combis charge by
   * stage (Matebeleng to Airport Junction is P9, on to Gaborone is P4 more), so
   * a fare belongs to the segment, not to the whole route. `null` when the
   * contributor did not record it.
   */
  fareFromPrevious: number | null;
};

export type CombiRoute = {
  id: string;
  /** What people call it, e.g. "Block 8 Route 4". */
  name: string;
  /** The rank it leaves from, when that is known. */
  rank: string;
  /** Stops in the order the combi reaches them. */
  stops: CombiStop[];
};

/** One combi you stay on, from the stop you board to the stop you get off. */
export type CombiLeg = {
  route: CombiRoute;
  boardIndex: number;
  alightIndex: number;
  board: CombiStop;
  alight: CombiStop;
  rideMetres: number;
  /** Sum of the stage fares ridden; `null` when any stage fare is unset. */
  fare: number | null;
};

export type CombiItinerary = {
  legs: CombiLeg[];
  /** Walk from where you are to the first boarding stop. */
  walkToBoardMetres: number;
  /** Walk from the last stop to the destination. */
  walkFromAlightMetres: number;
  /** Walking between one combi and the next (crossing a rank, say). */
  transferMetres: number;
  /** Stops where you change combis, in order. */
  transferStops: CombiStop[];
  totalFare: number | null;
  totalRideMetres: number;
};

export type PlanOptions = {
  /** Defaults to `MAX_ACCESS_WALK_M`. */
  maxWalkMetres?: number;
  /** Only single-combi and one-change journeys are planned for now. */
  maxLegs?: 1 | 2;
  /** How many itineraries to return, best first. */
  limit?: number;
};

/** Fare from one stop to another along a route, or `null` if a stage is unset. */
export function fareBetween(route: CombiRoute, boardIndex: number, alightIndex: number): number | null {
  if (alightIndex <= boardIndex) {
    return null;
  }
  let total = 0;
  for (let index = boardIndex + 1; index <= alightIndex; index += 1) {
    const fare = route.stops[index].fareFromPrevious;
    if (fare == null) {
      return null;
    }
    total += fare;
  }
  return Math.round(total * 100) / 100;
}

function rideMetres(route: CombiRoute, boardIndex: number, alightIndex: number): number {
  let total = 0;
  for (let index = boardIndex + 1; index <= alightIndex; index += 1) {
    total += distanceMetres(route.stops[index - 1], route.stops[index]);
  }
  return total;
}

function makeLeg(route: CombiRoute, boardIndex: number, alightIndex: number): CombiLeg {
  return {
    route,
    boardIndex,
    alightIndex,
    board: route.stops[boardIndex],
    alight: route.stops[alightIndex],
    rideMetres: rideMetres(route, boardIndex, alightIndex),
    fare: fareBetween(route, boardIndex, alightIndex),
  };
}

/** The closest stop to a point, with its index. */
function nearestStop(route: CombiRoute, point: LatLng): { index: number; metres: number } | null {
  let bestIndex = -1;
  let bestMetres = Number.POSITIVE_INFINITY;
  for (let index = 0; index < route.stops.length; index += 1) {
    const metres = distanceMetres(point, route.stops[index]);
    if (metres < bestMetres) {
      bestMetres = metres;
      bestIndex = index;
    }
  }
  return bestIndex < 0 ? null : { index: bestIndex, metres: bestMetres };
}

/** Cheapest direction-valid leg of one route for this trip, if there is one. */
function bestLegForRoute(
  route: CombiRoute,
  origin: LatLng,
  destination: LatLng,
  maxWalk: number,
): CombiLeg | null {
  let bestLeg: CombiLeg | null = null;
  let bestWalking = Number.POSITIVE_INFINITY;

  for (let boardIndex = 0; boardIndex < route.stops.length; boardIndex += 1) {
    const walkToBoard = distanceMetres(origin, route.stops[boardIndex]);
    if (walkToBoard > maxWalk) {
      continue;
    }
    for (let alightIndex = boardIndex + 1; alightIndex < route.stops.length; alightIndex += 1) {
      const walkFromAlight = distanceMetres(destination, route.stops[alightIndex]);
      if (walkFromAlight > maxWalk) {
        continue;
      }
      if (rideMetres(route, boardIndex, alightIndex) < MIN_RIDE_M) {
        continue;
      }
      const walking = walkToBoard + walkFromAlight;
      if (walking < bestWalking) {
        bestWalking = walking;
        bestLeg = makeLeg(route, boardIndex, alightIndex);
      }
    }
  }

  return bestLeg;
}

function itineraryFrom(
  legs: CombiLeg[],
  origin: LatLng,
  destination: LatLng,
): CombiItinerary {
  const first = legs[0];
  const last = legs[legs.length - 1];
  let transferMetres = 0;
  for (let index = 1; index < legs.length; index += 1) {
    transferMetres += distanceMetres(legs[index - 1].alight, legs[index].board);
  }

  // A trip with any unset still counts as "unknown", rather than pretending the
  // known legs are the whole cost.
  const totalFare = legs.every((leg) => leg.fare != null)
    ? legs.reduce((total, leg) => total + (leg.fare ?? 0), 0)
    : null;

  return {
    legs,
    walkToBoardMetres: distanceMetres(origin, first.board),
    walkFromAlightMetres: distanceMetres(destination, last.alight),
    transferMetres,
    transferStops: legs.slice(1).map((leg) => leg.board),
    totalFare: totalFare == null ? null : Math.round(totalFare * 100) / 100,
    totalRideMetres: legs.reduce((total, leg) => total + leg.rideMetres, 0),
  };
}

/** Best first: fewer combis, then less walking, then a known and cheaper fare. */
function compareItineraries(a: CombiItinerary, b: CombiItinerary): number {
  if (a.legs.length !== b.legs.length) {
    return a.legs.length - b.legs.length;
  }
  const walkingA = a.walkToBoardMetres + a.walkFromAlightMetres + a.transferMetres;
  const walkingB = b.walkToBoardMetres + b.walkFromAlightMetres + b.transferMetres;
  if (Math.abs(walkingA - walkingB) > 50) {
    return walkingA - walkingB;
  }
  if ((a.totalFare == null) !== (b.totalFare == null)) {
    return a.totalFare == null ? 1 : -1;
  }
  if (a.totalFare != null && b.totalFare != null && a.totalFare !== b.totalFare) {
    return a.totalFare - b.totalFare;
  }
  return a.totalRideMetres - b.totalRideMetres;
}

/**
 * Find the combi journeys that cover a trip.
 *
 * Returns single-combi journeys and journeys with one change, best first. A
 * change happens where two routes share a stop — in practice a rank or station,
 * which is where combis converge.
 */
export function planCombiJourney(
  origin: LatLng,
  destination: LatLng,
  routes: CombiRoute[],
  { maxWalkMetres = MAX_ACCESS_WALK_M, maxLegs = 2, limit = 5 }: PlanOptions = {},
): CombiItinerary[] {
  const usable = routes.filter((route) => route.stops.length >= 2);
  const itineraries: CombiItinerary[] = [];

  // One combi, door to door.
  for (const route of usable) {
    const leg = bestLegForRoute(route, origin, destination, maxWalkMetres);
    if (leg) {
      itineraries.push(itineraryFrom([leg], origin, destination));
    }
  }

  if (maxLegs >= 2) {
    for (const firstRoute of usable) {
      for (const secondRoute of usable) {
        if (firstRoute.id === secondRoute.id) {
          continue;
        }

        // The first leg: reachable from here, and ending at a stop the second
        // route also serves before it gets to the destination.
        for (let boardIndex = 0; boardIndex < firstRoute.stops.length; boardIndex += 1) {
          if (distanceMetres(origin, firstRoute.stops[boardIndex]) > maxWalkMetres) {
            continue;
          }
          for (let alightIndex = boardIndex + 1; alightIndex < firstRoute.stops.length; alightIndex += 1) {
            if (rideMetres(firstRoute, boardIndex, alightIndex) < MIN_RIDE_M) {
              continue;
            }
            const handover = firstRoute.stops[alightIndex];

            // Where does the second route pick up? Same place, later in its run.
            const pickup = nearestStop(secondRoute, handover);
            if (!pickup || pickup.metres > STOP_INTERCHANGE_M) {
              continue;
            }

            for (let finalIndex = pickup.index + 1; finalIndex < secondRoute.stops.length; finalIndex += 1) {
              if (distanceMetres(destination, secondRoute.stops[finalIndex]) > maxWalkMetres) {
                continue;
              }
              if (rideMetres(secondRoute, pickup.index, finalIndex) < MIN_RIDE_M) {
                continue;
              }
              itineraries.push(
                itineraryFrom(
                  [
                    makeLeg(firstRoute, boardIndex, alightIndex),
                    makeLeg(secondRoute, pickup.index, finalIndex),
                  ],
                  origin,
                  destination,
                ),
              );
            }
          }
        }
      }
    }
  }

  // The same journey can be found through several stop pairs; keep the best one
  // and drop the rest so the list reads like options, not like duplicates.
  const best = new Map<string, CombiItinerary>();
  for (const itinerary of itineraries) {
    const key = itinerary.legs
      .map((leg) => `${leg.route.id}:${leg.boardIndex}-${leg.alightIndex}`)
      .join('>');
    const existing = best.get(key);
    if (!existing || compareItineraries(itinerary, existing) < 0) {
      best.set(key, itinerary);
    }
  }

  // Also collapse journeys that use the same routes with a slightly different
  // stop pair: to a rider they are the same two combis.
  const byRoutes = new Map<string, CombiItinerary>();
  for (const itinerary of best.values()) {
    const key = itinerary.legs.map((leg) => leg.route.id).join('>');
    const existing = byRoutes.get(key);
    if (!existing || compareItineraries(itinerary, existing) < 0) {
      byRoutes.set(key, itinerary);
    }
  }

  return [...byRoutes.values()].sort(compareItineraries).slice(0, limit);
}

/**
 * Turn one stored stop into a planner stop, or discard it.
 *
 * Routes can arrive from the community database, so their contents are treated
 * as untrusted: a half-filled row must not put `NaN` into the distance maths and
 * quietly ruin every journey that crosses it.
 */
function toCombiStop(stop: PathWaypoint | null | undefined): CombiStop | null {
  if (
    !stop ||
    typeof stop.label !== 'string' ||
    stop.label.trim().length === 0 ||
    !Number.isFinite(stop.latitude) ||
    !Number.isFinite(stop.longitude)
  ) {
    return null;
  }
  const fare = stop.fareFromPrevious;
  return {
    name: stop.label.trim(),
    latitude: stop.latitude,
    longitude: stop.longitude,
    fareFromPrevious: typeof fare === 'number' && Number.isFinite(fare) && fare >= 0 ? fare : null,
  };
}

/**
 * Search the combi network.
 *
 * People search a stop (“where can I board for Station?”), a rank, or the name
 * somebody gave the route — so all three are matched, case-insensitively, and
 * an empty term returns the network untouched.
 */
export function searchCombiRoutes(routes: CombiRoute[], query: string): CombiRoute[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) {
    return routes;
  }
  return routes.filter(
    (route) =>
      route.name.toLowerCase().includes(needle) ||
      route.rank.toLowerCase().includes(needle) ||
      route.stops.some((stop) => stop.name.toLowerCase().includes(needle)),
  );
}

/**
 * The combi network: paths a contributor saved as combi routes, with their
 * captured stops in travel order. This is the community's network — routes come
 * from the database, plus anything of the contributor's still on this device.
 */
export function combiRoutesFromPaths(paths: SavedPath[]): CombiRoute[] {
  const routes: CombiRoute[] = [];
  for (const path of paths) {
    if (path.kind !== 'combi' || !Array.isArray(path.waypoints)) {
      continue;
    }
    const name = (path.combiName ?? '').trim() || path.name?.trim() || '';
    if (name.length === 0) {
      continue;
    }
    const stops = path.waypoints
      .map(toCombiStop)
      .filter((stop): stop is CombiStop => stop != null);
    if (stops.length < 2) {
      continue;
    }
    routes.push({ id: path.id, name, rank: (path.rank ?? '').trim(), stops });
  }
  return routes;
}
