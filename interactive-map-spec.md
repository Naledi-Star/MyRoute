# myroute — Interactive Map Spec

Status: **Draft for review** · Owner: myroute · Target app: Expo SDK 57 / RN 0.86 / expo-router (TypeScript)

This spec covers (1) fixing the blocking **"myroute could not download the map style"** error on
the Android development build, and (2) specifying the full interactive-map feature set the map
was always meant to have — search, directions, live location, offline regions, **drawing/saving
custom paths**, and a community contribution backend.

> **Not in scope of this document:** writing code. This is the plan to agree on before
> implementation. No source files were changed to produce it.

---

## 1. Problem statement

The Explore map (and every other screen that mounts `InteractiveMap`) shows the card:

> **The map didn't load** — *"myroute could not download the map style. Check your connection and try again."*

**The reporter states the device has a working connection, so the message is misleading.** As shown
in §2.3, this exact card is reused for several different failure causes, only one of which is actually
a style-download problem.

### Environment

| Item | Value |
| --- | --- |
| Platform | Android (physical device or emulator), **EAS cloud development build** (`--profile development`) |
| JS runtime | Expo SDK 57, React Native 0.86, expo-router, typed routes, React Compiler enabled |
| Map native lib | `@maplibre/maplibre-react-native` **11.5.0** (new-architecture only) |
| Map web lib | `maplibre-gl` 6.14 |
| Tile/style provider | OpenFreeMap public instance (keyless) |
| Style URLs | `https://tiles.openfreemap.org/styles/{positron,liberty,bright}` + inline OSM raster fallback |

---

## 2. Root-cause analysis of the style error

### 2.1 Where the message comes from

`src/components/myroute/map-status.tsx` → `MapFailure kind="style"` renders the string. It is
selected in `src/components/myroute/interactive-map.tsx` whenever `status === 'error'` **or**
`status === 'unavailable'` once the native module import path has run.

### 2.2 How `status` becomes `'error'` on native

1. The lazy `import('@maplibre/maplibre-react-native')` **rejects**, or the module fails the shape
   check `typeof module.Map === 'function' && typeof module.Camera === 'function'` → `fail()` sets
   `'error'`.
2. The `<Map mapStyle={url}>` fires **`onDidFailLoadingMap`** → `setStatus('error')`.

Both of these surface the *same* "could not download the map style" copy, even though cause (1)
has nothing to do with the network. **This conflation is itself a defect and should be fixed so the
error is diagnosable** (see §3.4).

### 2.3 CONFIRMED ROOT CAUSE (verified against the installed library)

`src/components/myroute/interactive-map.tsx` guarded the lazy import with:

```ts
if (typeof module.Map !== 'function' || typeof module.Camera !== 'function') { fail(); }
```

But `@maplibre/maplibre-react-native` 11.5.0 exports `Map` and `Camera` as
`React.memo(...)` **components**, and `React.memo` returns an **object**, not a function
(`src/components/map/Map.tsx` → `export const Map = memo(...)`; same for `Camera`). So
`typeof module.Map === 'object'`, the guard was **always true**, `fail()` ran every time, and the
UI showed the style card — **the map never mounted and the style was never even requested.** This
exactly matches the reporter's "it is not the network".

**Fix applied:** the guard now only checks that the exports exist
(`module.Map == null || module.Camera == null`) and logs the real error if they don't.

### 2.4 Ranked secondary hypotheses (still worth verifying on device)

| # | Hypothesis | Why plausible | How to confirm |
| --- | --- | --- | --- |
| H1 | **`import()` / module-shape failure mislabelled as a style error** | The UI reuses the network copy for an import failure. `Map`/`Camera` *are* exported by 11.5.0, so this is less likely, but the message would look identical. | Add distinct statuses + log the real `error` in the import `.catch` (§3.4). |
| H2 | **`onDidFailLoadingMap` fires but the style URL is actually reachable** (provider/outage, IPv6/DNS, TLS on the device, or OpenFreeMap returning an error page) | OpenFreeMap is donated infrastructure; the public instance is not an SLA. | Fetch the style URL on the device directly; swap to the inline OSM raster style as a control. |
| H3 | **New-architecture (Fabric) event issue on Android** — MapLibre RN v11 is new-arch-only and there are open Android/Fabric issues. | v11 dropped old-architecture support; the app is on RN 0.86 with the new architecture. | Check the EAS build logs + reproduce on the latest v11 patch; try `androidView="surface"` vs `"texture"`. |
| H4 | **Render-time crash from v11 API mismatches** (see §3) preventing the map/children from mounting cleanly | Confirmed stale API usage (below). | Fix the API mismatches first and re-test; the style error may disappear or change. |
| H5 | **Style references (glyphs/sprite/source) fail on Android** even though the top-level style JSON loads | Possible with mis-set or blocked sub-resources. | Inspect the style JSON and device logs. |

**Working conclusion:** H1 and H4 were the most actionable *without* device logs, and both were
code-level defects. H1 (the guard) is now **confirmed and fixed**. H2/H3/H5 remain secondary and
would only matter if the map still fails after the fix; the new logging and raster fallback (§3.2,
§3.4) make that diagnosable. **The diagnosis must not stop at "check your connection".**

### 2.5 Evidence available

The reporter can share **EAS build logs**. Device logs (`adb logcat`) are *not* available, so the
spec must build in enough distinct logging to make a blind fix safe (§3.4).

---

## 3. Confirmed defect: stale v10 API usage against MapLibre RN v11

This is independent of, and probably entangled with, the style error. Verified directly against the
**installed** `node_modules/@maplibre/maplibre-react-native` (11.5.0):

| Current code in `interactive-map.tsx` | Reality in v11.5.0 | Consequence |
| --- | --- | --- |
| `const { …, ShapeSource, LineLayer } = mapLibre;` | **Neither is exported.** Sources are `GeoJSONSource`; layers are a single `Layer` with a `type` prop. | `ShapeSource`/`LineLayer` are `undefined` → rendering a route throws *"Element type is invalid"*. Route line never draws. |
| `<ShapeSource id=… shape={routeShape}>` | `GeoJSONSource` with a `data` prop (`shape`/`url` were unified into `data`). | Same as above. |
| `<LineLayer style={{ lineColor, lineWidth, … }}>` | `<Layer type="line" …>`; `style` is deprecated in favour of `paint`/`layout` with **kebab-case** keys (`"line-color"`, `"line-width"`). | Same as above. |
| `<Marker coordinate={[…]} anchor="bottom" …>` | `Marker` takes **`lngLat`**, not `coordinate` (`coordinate` was renamed). | Pins silently fail to place. |
| `onPress={(feature) => feature.geometry.coordinates}` | `onPress` now delivers a `NativeSyntheticEvent`; payload is in **`event.nativeEvent`** (`lngLat`, `features`, `point`). | Tap-to-drop-pin never fires correctly. |
| Import shape-check only tests `Map`/`Camera` | Those exist, so the check passes, hiding the missing `ShapeSource`/`LineLayer`. | The guard gives false confidence. |

**Decision (locked):** "make my map work" means fixing the style error **and** correcting every v11
API mismatch in `interactive-map.tsx` (and re-auditing `interactive-map.web.tsx` for parity). See
§13 M1–M2.

### 3.1 v11 reference (from the installed package + official migration guide)

- Components exported: `Map`, `Camera`, `Marker`, `ViewAnnotation`, `LayerAnnotation`, `Callout`,
  `GeoJSONSource`, `RasterSource`, `VectorSource`, `RasterDEMSource`, `ImageSource`, `Images`,
  `Layer`, `UserLocation`, `NativeUserLocation`.
- `MapView` → **`Map`**. Android default renderer is `GLSurfaceView`; `androidView="texture"` opts
  into `TextureView`.
- `Marker` uses `lngLat`; `ViewAnnotation` (was `PointAnnotation`) also uses `lngLat`.
- Sources: `GeoJSONSource` (`data`), `VectorSource` (`tiles`, `minzoom`, `maxzoom`, `scheme`).
- Layers: one `Layer` component, `type="line" | "fill" | …`, `source`/`beforeId`/`afterId`, and
  `paint`/`layout` style-spec keys.
- Events: all `NativeSyntheticEvent`; payload under `event.nativeEvent`; source `onPress` bubbles to
  `Map` unless `event.stopPropagation()`.
- Camera: `initialViewState`, `center`/`zoom`/`bearing`/`pitch`, `easing: 'fly'|'ease'|'linear'`,
  `fitBounds(…, { padding: ViewPadding })`.

### 3.2 Auto-fallback chain (locked: never show a dead map)

Replace the single "error card on style failure" with an ordered fallback:

1. Try the user-selected streamed vector style (positron/liberty/bright).
2. On failure, retry once (transient).
3. On failure, fall back to a **second provider style** (see §7) if configured.
4. On failure, fall back to the **inline OSM raster style** (`OSM_RASTER_STYLE`, already in
   `src/constants/map.ts`).
5. Only if *all* of the above fail, show the error card — with the real cause and a Retry.

A small, non-blocking notice (e.g. "Using offline/base map") should indicate a fallback is active.

### 3.3 Rendering robustness

- Guard every optional child (`GeoJSONSource`/`Layer`/`Marker`) so a missing export degrades to
  "no line/pins" rather than a crash.
- Consider an error boundary around the map subtree so a child crash cannot blank the screen.

### 3.4 Diagnosability (fixes the misleading message)

Split the single `'error'` status into distinct, user-visible causes and log the underlying error:

- `native-module-missing` → "needs a development build" (already exists as `unavailable`).
- `native-import-failed` → "Map engine failed to start" + log.
- `style-download-failed` → the existing network copy **only when it truly is the style**.
- `render-failed` → child/render error.

Emit the real `error` object to the console in each branch so the EAS/native logs are conclusive.

---

## 4. Live device location (locked: wire it now)

- Add `expo-location` (via `npx expo install expo-location`) for permissions + position + watch.
- Replace the fixed `GABORONE_VIEW` origin used in `route.tsx` and `navigate.tsx` with the real
  device location.
- MapLibre exposes `LocationManager`, `UserLocation`/`NativeUserLocation`, and the v11 Camera
  `trackUserLocation="default" | "heading" | "course"` for a follow-me mode.
- Behaviour: request foreground permission, show a "my location" dot, "locate" buttons recentre on
  the user, and directions use the user's position as origin. Fall back to Gaborone when permission
  is denied (with an explanatory, dismissible hint).

---

## 5. Offline regions (locked: downloads screen with progress)

**Decision:** a dedicated **Offline regions / Downloads** screen with a real download manager.

- Use MapLibre Native **`OfflineManager` + `OfflinePack`** (both exported by 11.5.0).
- Per region: choose area (default **Gaborone**), show estimated size, **download**, **pause/resume**,
  **delete**, and live **progress**; allow **several** regions per user.
- Store region metadata (name, bbox, style, state) locally (AsyncStorage/SQLite) and expose it on the
  screen; surface a "downloaded" indicator on the map.

**Provider constraint (researched):** the OpenFreeMap public instance explicitly allows
**offline downloads up to 3,000 tiles or 50 MB per download, max 4 parallel requests, with a unique
User-Agent.** *(Note: the comment in `src/constants/map.ts` claiming the public instance forbids
offline downloads is **outdated** and should be corrected.)*

**Decision on large areas (locked: decide in spec):** the 50 MB / 3,000-tile cap comfortably covers
Gaborone and several towns but **not** whole-country offline. Therefore:

- **Phase A:** ship region downloads within the public-instance caps, multiple small regions per user.
- **Phase B (only if whole-Botswana offline is required):** **self-host OpenFreeMap tiles** (they
  publish full-planet Btrfs images) or move to a keyed provider (MapTiler/Stadia) whose terms and
  limits allow larger packs. This ties into §7.

---

## 6. Search & geocoding (locked: free, recommend best)

Current: direct **Nominatim** calls (`src/lib/search.ts`) with `countrycodes=bw`, debounce, and a
1 req/s politeness cap. Nominatim's public instance is fine for development but is rate-limited and
not intended for production app traffic.

**Recommendation to evaluate and adopt (free-tier requirement):**

| Option | Free tier | Notes |
| --- | --- | --- |
| **LocationIQ** | ~5,000 req/day | Hosted Nominatim; drop-in for the current OSM result shape. |
| **Geoapify** | Generous free tier | Geocoding + routing + tiles under one key. |
| **MapTiler** | Free tier | Also a tile/offline provider → could unify §7 and §6 on one key. |
| **Photon** | Free (hosted/self-host) | Search-as-you-type, typo-tolerant; self-hostable. |
| Nominatim (current) | "Unlimited" | Keep as the **fallback**, not the primary, in production. |

**Plan:** abstract geocoding behind one interface (as `search.ts` already is), keep Nominatim as a
keyless fallback, and adopt a keyed free provider for production reliability. Keep results
**Botswana-bounded** for now, structured so more countries can be added later (§11).

---

## 7. Tile/style provider recommendation (open: decide after investigation)

Reporter's answer: *"decide after you investigate."* Findings so far:

- **OpenFreeMap public instance** — genuinely free, no key, no view/request limits, **limited** offline
  downloads (§5). Donated infra, no SLA.
- **Self-hosted OpenFreeMap** — best fit if large offline areas are needed and cost is paramount.
- **Keyed providers (MapTiler / Stadia)** — more reliable, have SLAs, and pair cleanly with
  MapLibre Native offline packs.

**Recommendation (pending the §2 investigation):**

1. Keep **OpenFreeMap** as the ship-now keyless default (fix reliability via §3).
2. **Self-host OpenFreeMap** when whole-region offline is required.
3. Adopt **MapTiler** (or Stadia) *only if* the investigation shows OpenFreeMap is the actual root
   cause or if an SLA is needed; then unify tiles + offline + geocoding under that one key.

Keep the provider swappable: everything provider-specific stays in `src/constants/map.ts`.

---

## 8. Draw & save custom paths (locked: snap to roads, user picks profile)

The headline feature. Interaction is **tap-to-add vertices**, then an explicit **"Snap to roads"**
action; the user chooses the travel profile (car / bike / foot) like the directions screen.

- Draw: tap points on the real map → preview a freeform line; adjustable vertices (drag to move,
  tap to delete); undo/clear.
- Snap: call the routing engine (§8.1) with the vertices as waypoints for the selected profile and
  replace the freeform line with the snapped geometry.
- Save: prompt for a name; store **both** the raw drawn vertices **and** the snapped geometry.
- Reverse-geocode a start/end label for the saved path.

### 8.1 Routing engine (locked: keep public OSRM)

- Reuse `router.project-osrm.org` (current `src/lib/routing.ts`) for now — free, no key, has
  driving/cycling/walking profiles. Extend `getRoute` to support **multi-waypoint** routes (OSRM
  accepts more than two coordinates) and optionally `steps=true` for navigation (§9).
- **Risk noted:** the public OSRM demo server has **no SLA**. Self-hosting OSRM on a Botswana OSM
  extract is the escape hatch and aligns with the offline/self-host direction (§5, §7).

### 8.2 Entry points (locked: all of the above)

Reachable from:
- the **Explore** sheet and a map action button,
- the **Add place / Create request** flow (replacing the fake `MapCanvas` in
  `src/components/myroute/place-form.tsx`),
- the **Directions/route** screen (draw/plan alongside directions).

Unify "add a place" and "draw a path" into one coherent flow so the form uses the **real**
`InteractiveMap` (`droppedPin` + `onMapPress`) instead of the stylised canvas stub.

---

## 9. Turn-by-turn navigation (locked: real, replacing the demo)

`src/app/navigate.tsx` is currently a simulation ("Simulate arrival", static instruction).

- Fetch a route with **`steps=true`** (OSRM) to get manoeuvres, distances, and geometry.
- Track the device with `expo-location`; advance the current step as the user progresses; show
  distance-to-next-turn, current instruction, and ETA.
- **Arrival detection** via a geofence around the destination (replaces the "Simulate arrival" button).
- Keep the existing arrival confirmation flow (Yes, that's it / No → create request).

---

## 10. Community backend — Cloudflare (locked: stay on Cloudflare)

Decision inputs: **stay on Cloudflare**, **community-shared data**, **lightweight accounts**,
**review queue moderation**, **photo uploads**, **Botswana now / global later**, and **free/cheap**.

### 10.1 Recommended stack

| Concern | Recommendation | Notes |
| --- | --- | --- |
| API | **Cloudflare Workers** | Cloudflare publishes an official **Expo mobile app** framework guide. |
| Database | **D1 (SQLite)** | See §10.2 for the geospatial caveat and the recommended workaround. |
| Object storage | **R2** | Place/path photos (§12). |
| Auth | **Clerk** | First-class Workers support; email + social; managed sessions; fits "lightweight accounts". Alternatives: Better Auth or Expo's own auth patterns. |
| Admin dashboard | **Cloudflare Pages** (or Workers) web console | Independent of the mobile app (§13). |
| Edge caching | **Workers cache / Cache API** | For read-heavy public place/path lists. |

### 10.2 Geospatial storage — recommendation (reporter asked us to decide)

**D1 has no native geospatial support** (there is an open Cloudflare feature request for R-tree /
geo queries; D1 is SQLite without PostGIS). Recommendation:

- **Primary (now):** store `latitude`, `longitude`, a computed bounding-box pair
  (`min_lat/max_lat/min_lng/max_lng`), **and** a **geohash** column (e.g. geohash-7). Index the
  geohash. Query "places near X" as a **geohash-prefix + bounding-box** scan in a Worker, refined with
  a **Haversine** distance (the app already has `distanceMetres` in `src/lib/geo.ts`). This is
  simple, cheap, and plenty for a Botswana-scale dataset.
- **Escape hatch (later/global):** if real spatial queries or scale demand it, add a free
  **Postgres + PostGIS sibling** (e.g. Neon free tier) for the places table while keeping
  Workers/R2/D1 for everything else. Do **not** block the first release on this.

### 10.3 Why not a managed BaaS instead

Supabase/Firebase would reduce setup (Postgres+PostGIS / Firestore geo), but the reporter explicitly
prefers Cloudflare and wants cost minimized. The Cloudflare stack above is achievable on free tiers
and keeps everything in one account. **This is the recommendation, subject to the reporter's final
sign-off.**

---

## 11. Region scope (locked: Botswana now, global later)

- Keep search/offline/bounds Botswana-bounded today (`countrycodes=bw`, `BOTSWANA_SEARCH_BOUNDS`).
- Structure data (country/region columns, geohash, provider-agnostic styles) so additional countries
  can be enabled without rework. No hard-coded single-country assumptions in the API.

---

## 12. Photos (locked: yes, upload + moderated)

- Capture/pick a photo; upload to **R2** via a Worker (signed upload URL).
- Store the object key on the place/path record; render on the place screen (replacing the current
  sample `shopImage`).
- Photos enter the same **review queue** as other contributions.

---

## 13. Data model (initial)

Stored in D1 (SQLite). Types mirror the existing app types in `src/data/myroute.ts` and
`src/components/myroute/map-types.ts`.

```
users(id, display_name, email, created_at)                     -- via Clerk

places(
  id, name, category, description,
  latitude, longitude,
  min_lat, max_lat, min_lng, max_lng, geohash,                 -- geo index (see 10.2)
  area, how_to_find, hours, entrance,
  status,                                                       -- 'pending' | 'approved' | 'rejected'
  contributor_id, created_at, updated_at
)

paths(
  id, name, profile,                     -- 'car' | 'bike' | 'foot'
  raw_geometry,                          -- GeoJSON LineString, user's drawn vertices
  snapped_geometry,                      -- GeoJSON LineString, routing-engine result
  distance_m, start_label, end_label,
  visibility,                            -- 'public' (default) — see §14
  status, contributor_id, created_at, updated_at
)

photos(id, owner_type, owner_id, r2_key, position, status, contributor_id, created_at)

reviews(id, owner_type, owner_id, reviewer_id, decision, note, created_at)  -- moderation log
```

`status` drives the review queue (§15). Nothing is public until `status = 'approved'`.

---

## 14. Path visibility (locked: public community paths)

- Drawn paths are **public and discoverable by default**, subject to the review queue.
- The (previously considered) private/shareable toggle is dropped for now; the schema keeps a
  `visibility` column so it can be added later.

---

## 15. Auth & moderation

- **Auth:** lightweight accounts via **Clerk** (email + a social provider). Required to contribute.
- **Moderation:** a **review queue** — contributions land in `pending`. A moderator approves/rejects
  before anything is publicly visible. Every decision is logged in `reviews`.
- **Surface:** a **separate web dashboard** (Cloudflare Pages) that lists pending places/paths/photos
  with map previews, approve/reject actions, and reporter/contributor info. Restricted to admins.

---

## 16. Platform scope

| Platform | Requirement |
| --- | --- |
| **Android** | Primary. Must load the map, place pins, draw routes/paths, offline regions, live location. |
| **iOS** | Supported (same MapLibre Native path); verify after Android is green. |
| **Web** | **First-class** — drawing and search must work as far as the browser allows; offline regions cannot match native (browser storage limits) and should degrade gracefully with a clear explanation rather than pretending to work. |

---

## 17. Milestones

**M1 — Make the map load (blocking).**
Distinct error states + logging (§3.4); auto-fallback chain (§3.2); test the raw style URL;
confirm the native module is present; ship the narrow fix and confirm on an EAS dev build.
*Exit:* the map renders streets on Android; if a fallback is used, the user is told.

**M2 — Correct the v11 API usage.**
`ShapeSource`→`GeoJSONSource` (`data`), `LineLayer`→`Layer type="line"` (`paint`/`layout`),
`Marker` `coordinate`→`lngLat`, `onPress` `event.nativeEvent`; audit `.web.tsx` for parity.
*Exit:* pins place, the route line draws, tap-to-pin works, on native and web.

**M3 — Real device location** (§4) and **real turn-by-turn** (§9).

**M4 — Offline region downloads screen** (§5, Phase A).

**M5 — Draw/save custom paths** (§8) and wire the Add-place form to the real map.

**M6 — Community backend** (§10–§15): Workers + D1 + Clerk + R2, review queue, web dashboard, photos.

**M7 — Provider decision & self-host** (§5 Phase B / §7) if whole-region offline is required.

---

## 18. Acceptance criteria

1. On a fresh Android EAS development build, the Explore map renders streets/tiles **without** the
   "could not download the map style" card, on a working connection.
2. If the chosen style is unreachable, the map **auto-falls back** and clearly indicates the fallback
   instead of going blank.
3. When the native map engine genuinely fails, the message says so — **not** "check your connection".
4. Community request pins are **placed at their real coordinates**; tapping one opens its place.
5. The directions route **draws as a line** on the map for all three travel profiles.
6. Tapping the map (form mode) **drops a pin** at the tapped coordinate on native and web.
7. The device's real location is used as the route origin; "locate" recentres on the user.
8. A user can download a named region, watch progress, pause/resume, and delete it; the map works
   with the region loaded and the connection off.
9. A user can draw a path, snap it to roads for a chosen profile, name it, and save it; it appears on
   the map and on a saved-paths list.
10. Navigation gives live step instructions and detects arrival by geofence (no "simulate" button).
11. A contributed place/path/photo is **not public until approved** in the web dashboard.
12. `npx tsc --noEmit` and `npx expo lint` pass before each milestone is declared done.

---

## 19. Open questions / risks

- **[ ]** Exact root cause of the Android style failure (needs EAS build logs + reproduction). §2
  hypotheses H1–H5 remain open until then.
- **[ ]** Whether MapLibre RN 11.5.0 has an Android/Fabric defect affecting style loading; may require
  upgrading the patch or pinning.
- **[ ]** Final tile/style provider (§7) — OpenFreeMap vs self-host vs keyed, after the investigation.
- **[ ]** Whether whole-Botswana offline is required (drives §5 Phase B and §7 self-hosting).
- **[ ]** Which free geocoder to adopt (§6); preference is LocationIQ/Geoapify, pending comparison.
- **[ ]** Final backend sign-off on the Cloudflare recommendation (§10) and Clerk for auth.
- **[ ]** Custom-style hosting: if the style is customised (Maputnik), the style JSON must be
  self-hosted per OpenFreeMap's guidance.
- **[ ]** Correct the outdated offline-download claim in `src/constants/map.ts`.
```
