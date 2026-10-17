/**
 * myroute API — Cloudflare Worker.
 *
 * Owns the community data: places, paths and photos in D1, photo blobs in R2,
 * and the moderation review queue. Contributions always land as `pending`; only
 * an admin (via the dashboard) can flip them to `approved`, at which point the
 * mobile app can read them back.
 *
 * Bindings (see `wrangler.toml`):
 *   DB     — D1 database
 *   PHOTOS — R2 bucket
 *   CLERK_JWKS_URL  (optional) Clerk instance JWKS for token verification
 *   ADMIN_TOKEN     (secret) shared token that unlocks the moderation endpoints
 */

export interface Env {
  DB: D1Database;
  PHOTOS: R2Bucket;
  CLERK_JWKS_URL?: string;
  ADMIN_TOKEN?: string;
  /** Comma-separated allowed origins; defaults to the Expo dev origins. */
  ALLOWED_ORIGINS?: string;
}

type ContributionRow = Record<string, unknown>;

const GEOHASH_BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

/** Standard geohash encoder; 7 characters is ~153 m × 153 m. */
function geohash(latitude: number, longitude: number, precision = 7): string {
  let latMin = -90;
  let latMax = 90;
  let lngMin = -180;
  let lngMax = 180;
  let hash = '';
  let bits = 0;
  let bit = 0;
  let even = true;

  while (hash.length < precision) {
    if (even) {
      const mid = (lngMin + lngMax) / 2;
      if (longitude >= mid) {
        bits = (bits << 1) + 1;
        lngMin = mid;
      } else {
        bits <<= 1;
        lngMax = mid;
      }
    } else {
      const mid = (latMin + latMax) / 2;
      if (latitude >= mid) {
        bits = (bits << 1) + 1;
        latMin = mid;
      } else {
        bits <<= 1;
        latMax = mid;
      }
    }
    even = !even;
    if (++bit === 5) {
      hash += GEOHASH_BASE32[bits];
      bit = 0;
      bits = 0;
    }
  }
  return hash;
}

function haversineMetres(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function corsHeaders(env: Env, request: Request): Record<string, string> {
  const allowed = (env.ALLOWED_ORIGINS ?? '*')
    .split(',')
    .map((origin) => origin.trim());
  const origin = request.headers.get('Origin') ?? '';
  const allow = allowed.includes('*') || allowed.includes(origin) ? origin || '*' : allowed[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Admin-Token',
    'Access-Control-Max-Age': '86400',
  };
}

function json(env: Env, request: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(env, request) },
  });
}

async function requireUser(env: Env, request: Request): Promise<{ sub: string } | null> {
  const header = request.headers.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token || !env.CLERK_JWKS_URL) {
    // Anonymous contribution is allowed when Clerk is not configured.
    return null;
  }
  try {
    const { createRemoteJWKSet, jwtVerify } = await import('jose');
    const jwks = createRemoteJWKSet(new URL(env.CLERK_JWKS_URL));
    const { payload } = await jwtVerify(token, jwks);
    return { sub: String(payload.sub ?? 'unknown') };
  } catch {
    return null;
  }
}

function isAdmin(env: Env, request: Request): boolean {
  if (!env.ADMIN_TOKEN) {
    return false;
  }
  return (
    request.headers.get('X-Admin-Token') === env.ADMIN_TOKEN ||
    new URL(request.url).searchParams.get('token') === env.ADMIN_TOKEN
  );
}

/** Read one of the JSON columns without letting bad data take a request down. */
function parseJsonArray<T>(value: unknown, fallback: T[]): T[] {
  if (typeof value !== 'string' || value.length === 0) {
    return fallback;
  }
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : fallback;
  } catch {
    return fallback;
  }
}

/** D1 row → the camelCase shape the app uses (`src/lib/paths.ts`). */
function toPath(row: ContributionRow) {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    profile: String(row.profile ?? 'foot'),
    kind: row.kind === 'combi' ? 'combi' : 'path',
    combiName: String(row.combi_name ?? ''),
    rank: String(row.rank ?? ''),
    waypoints: parseJsonArray<Record<string, unknown>>(row.waypoints, []),
    vertices: parseJsonArray<[number, number]>(row.raw_geometry, []),
    coordinates: parseJsonArray<[number, number]>(row.snapped_geometry, []),
    snapped: Number(row.snapped ?? 0) === 1,
    distanceMetres: Number(row.distance_m ?? 0),
    durationSeconds: Number(row.duration_s ?? 0),
    createdAt: Number(row.created_at ?? 0),
    status: String(row.status ?? 'pending'),
  };
}

/** D1 row → the camelCase shape the app uses for community places. */
function toPlace(row: ContributionRow) {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    category: String(row.category ?? 'Place'),
    description: String(row.description ?? ''),
    area: String(row.area ?? ''),
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    status: String(row.status ?? 'pending'),
    createdAt: Number(row.created_at ?? 0),
  };
}

// ── Places ───────────────────────────────────────────────────────────────────

async function createPlace(env: Env, request: Request, body: ContributionRow): Promise<Response> {
  const user = await requireUser(env, request);
  const id = String(body.id ?? `place-${crypto.randomUUID()}`);
  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);
  const now = Date.now();

  // `ON CONFLICT DO NOTHING` keeps a retried upload from failing: the client
  // mints the id, so a lost response would otherwise leave the place stuck in
  // the offline queue forever.
  await env.DB.prepare(
    `INSERT INTO places (id, name, category, description, area, latitude, longitude,
       min_lat, max_lat, min_lng, max_lng, geohash, status, contributor_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
  )
    .bind(
      id,
      String(body.name ?? 'Unnamed place'),
      String(body.category ?? 'Place'),
      String(body.description ?? ''),
      String(body.area ?? ''),
      latitude,
      longitude,
      latitude - 0.01,
      latitude + 0.01,
      longitude - 0.01,
      longitude + 0.01,
      geohash(latitude, longitude),
      user?.sub ?? null,
      now,
      now,
    )
    .run();

  return json(env, request, { ...body, id, status: 'pending', createdAt: now }, 201);
}

async function listPlaces(env: Env, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const lat = Number(url.searchParams.get('lat'));
  const lng = Number(url.searchParams.get('lng'));
  const radius = Number(url.searchParams.get('radius') ?? 5000);

  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    // Bounding box first (uses the stored columns), then Haversine refinement.
    const latDelta = radius / 111320;
    const lngDelta = radius / (111320 * Math.cos((lat * Math.PI) / 180));
    const { results } = await env.DB.prepare(
      `SELECT * FROM places
       WHERE status = 'approved'
         AND latitude BETWEEN ? AND ?
         AND longitude BETWEEN ? AND ?`,
    )
      .bind(lat - latDelta, lat + latDelta, lng - lngDelta, lng + lngDelta)
      .all<ContributionRow>();

    const near = results
      .map((row) => ({
        ...toPlace(row),
        distanceMetres: haversineMetres(lat, lng, Number(row.latitude), Number(row.longitude)),
      }))
      .filter((row) => row.distanceMetres <= radius)
      .sort((a, b) => a.distanceMetres - b.distanceMetres);

    return json(env, request, near);
  }

  const { results } = await env.DB.prepare(
    `SELECT * FROM places WHERE status = 'approved' ORDER BY created_at DESC LIMIT 200`,
  ).all<ContributionRow>();
  return json(env, request, results.map(toPlace));
}

// ── Paths ────────────────────────────────────────────────────────────────────

async function createPath(env: Env, request: Request, body: ContributionRow): Promise<Response> {
  const user = await requireUser(env, request);
  const id = String(body.id ?? `path-${crypto.randomUUID()}`);
  const now = Date.now();

  // Paths are community data, not device data: an upload that failed half way
  // can be retried, and an edited path replaces the stored one. Either way it
  // goes back to `pending` so a changed line is reviewed again.
  await env.DB.prepare(
    `INSERT INTO paths (id, name, profile, kind, combi_name, rank, waypoints,
       raw_geometry, snapped_geometry, snapped, distance_m, duration_s, visibility,
       status, contributor_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'public', 'pending', ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       profile = excluded.profile,
       kind = excluded.kind,
       combi_name = excluded.combi_name,
       rank = excluded.rank,
       waypoints = excluded.waypoints,
       raw_geometry = excluded.raw_geometry,
       snapped_geometry = excluded.snapped_geometry,
       snapped = excluded.snapped,
       distance_m = excluded.distance_m,
       duration_s = excluded.duration_s,
       status = 'pending',
       updated_at = excluded.updated_at`,
  )
    .bind(
      id,
      String(body.name ?? 'Unnamed path'),
      String(body.profile ?? 'foot'),
      body.kind === 'combi' ? 'combi' : 'path',
      String(body.combiName ?? ''),
      String(body.rank ?? ''),
      JSON.stringify(body.waypoints ?? []),
      JSON.stringify(body.vertices ?? []),
      JSON.stringify(body.coordinates ?? []),
      body.snapped ? 1 : 0,
      Number(body.distanceMetres ?? 0),
      Number(body.durationSeconds ?? 0),
      user?.sub ?? null,
      now,
      now,
    )
    .run();

  return json(env, request, { ...body, id, status: 'pending', createdAt: now }, 201);
}

async function listPaths(env: Env, request: Request): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT * FROM paths WHERE status = 'approved' ORDER BY created_at DESC LIMIT 200`,
  ).all<ContributionRow>();
  return json(env, request, results.map(toPath));
}

// ── Photos ───────────────────────────────────────────────────────────────────

// ── Chat ─────────────────────────────────────────────────────────────────────

/**
 * Append a chat message. The client mints the id, so an offline send that is
 * retried later cannot duplicate; the `ON CONFLICT` clause enforces that.
 */
async function createMessage(env: Env, request: Request, body: ContributionRow): Promise<Response> {
  const user = await requireUser(env, request);
  const id = String(body.id ?? `msg-${crypto.randomUUID()}`);
  const threadId = String(body.threadId ?? 'community');
  const authorId = user?.sub ?? String(body.authorId ?? '');
  const kind = body.kind === 'location' ? 'location' : 'text';
  const latitude = body.latitude == null ? null : Number(body.latitude);
  const longitude = body.longitude == null ? null : Number(body.longitude);
  const createdAt = Number(body.createdAt ?? Date.now());

  await env.DB.prepare(
    `INSERT INTO messages (id, thread_id, author_id, author_name, kind, body, latitude, longitude, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
  )
    .bind(
      id,
      threadId,
      authorId || null,
      String(body.authorName ?? ''),
      kind,
      String(body.body ?? ''),
      latitude,
      longitude,
      createdAt,
    )
    .run();

  return json(env, request, { ...body, id, threadId, authorId, kind, createdAt }, 201);
}

/**
 * Messages in one thread, newer than `since` (a timestamp in ms). The client
 * polls this; `>=` plus client-side id de-duplication keeps a send that crossed
 * the poll boundary from being missed.
 */
async function listMessages(env: Env, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const threadId = url.searchParams.get('thread') ?? 'community';
  const sinceRaw = Number(url.searchParams.get('since') ?? 0);
  const since = Number.isFinite(sinceRaw) && sinceRaw > 0 ? sinceRaw : 0;

  const { results } = await env.DB.prepare(
    `SELECT * FROM messages WHERE thread_id = ? AND created_at >= ?
     ORDER BY created_at ASC LIMIT 300`,
  )
    .bind(threadId, since)
    .all<ContributionRow>();

  return json(env, request, results);
}

async function signPhoto(env: Env, request: Request, body: ContributionRow): Promise<Response> {
  const key = `photos/${crypto.randomUUID()}`;
  const origin = new URL(request.url).origin;
  return json(env, request, {
    key,
    uploadUrl: `${origin}/photos/${encodeURIComponent(key)}?ownerId=${encodeURIComponent(
      String(body.ownerId ?? ''),
    )}`,
  });
}

async function putPhoto(env: Env, request: Request, key: string): Promise<Response> {
  const ownerId = new URL(request.url).searchParams.get('ownerId') ?? '';
  await env.PHOTOS.put(key, request.body as ReadableStream, {
    httpMetadata: { contentType: request.headers.get('Content-Type') ?? 'image/jpeg' },
  });
  await env.DB.prepare(
    `INSERT INTO photos (id, owner_type, owner_id, r2_key, position, status, created_at)
     VALUES (?, 'place', ?, ?, 0, 'pending', ?)`,
  )
    .bind(`photo-${crypto.randomUUID()}`, ownerId, key, Date.now())
    .run();
  return json(env, request, { key }, 201);
}

// ── Moderation ───────────────────────────────────────────────────────────────

async function listPending(env: Env, request: Request, table: string): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT * FROM ${table} WHERE status = 'pending' ORDER BY created_at ASC LIMIT 500`,
  ).all<ContributionRow>();
  return json(env, request, results);
}

async function decide(
  env: Env,
  request: Request,
  table: string,
  id: string,
  body: ContributionRow,
): Promise<Response> {
  const decision = body.decision === 'approved' ? 'approved' : 'rejected';
  const now = Date.now();
  await env.DB.prepare(`UPDATE ${table} SET status = ?, updated_at = ? WHERE id = ?`)
    .bind(decision, now, id)
    .run();
  await env.DB.prepare(
    `INSERT INTO reviews (id, owner_type, owner_id, decision, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(`review-${crypto.randomUUID()}`, table, id, decision, String(body.note ?? ''), now)
    .run();
  return json(env, request, { id, status: decision });
}

/** A minimal dashboard so moderation can happen on the web (Cloudflare-hosted). */
function dashboard(token: string): Response {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>myroute · moderation</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 0; background: #f5f7f5; color: #17211b; }
  header { background: #078c4b; color: #fff; padding: 16px 22px; font-weight: 700; }
  main { max-width: 900px; margin: 0 auto; padding: 22px; }
  h2 { font-size: 15px; margin: 22px 0 8px; }
  .card { background: #fff; border: 1px solid #e3e8e4; border-radius: 13px; padding: 14px; margin-bottom: 10px; }
  .meta { color: #68736c; font-size: 12px; margin-top: 4px; }
  button { border: 0; border-radius: 9px; padding: 8px 14px; font-weight: 600; cursor: pointer; }
  .approve { background: #078c4b; color: #fff; }
  .reject { background: #fee9e5; color: #cf4f3d; margin-left: 8px; }
  .empty { color: #68736c; }
</style>
</head>
<body>
<header>myroute · moderation</header>
<main>
  <h2>Pending places</h2><div id="places"></div>
  <h2>Pending paths</h2><div id="paths"></div>
</main>
<script>
  const TOKEN = ${JSON.stringify(token)};
  async function load(table, el) {
    const res = await fetch('/admin/pending/' + table, { headers: { 'X-Admin-Token': TOKEN } });
    const rows = await res.json();
    const box = document.getElementById(el);
    box.innerHTML = rows.length ? '' : '<p class="empty">Nothing waiting.</p>';
    rows.forEach((row) => {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = '<strong>' + (row.name || row.id) + '</strong><div class="meta">' +
        (row.category || row.profile || '') + ' · ' + row.latitude + ', ' + row.longitude + '</div>';
      const ok = document.createElement('button'); ok.className = 'approve'; ok.textContent = 'Approve';
      const no = document.createElement('button'); no.className = 'reject'; no.textContent = 'Reject';
      ok.onclick = () => decide(table, row.id, 'approved');
      no.onclick = () => decide(table, row.id, 'rejected');
      card.append(document.createElement('div'), ok, no);
      box.append(card);
    });
  }
  async function decide(table, id, decision) {
    await fetch('/admin/decide/' + table + '/' + id, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Token': TOKEN },
      body: JSON.stringify({ decision }),
    });
    load('places', 'places'); load('paths', 'paths');
  }
  load('places', 'places'); load('paths', 'paths');
</script>
</body>
</html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env, request) });
    }

    if (url.pathname === '/health') {
      return json(env, request, { ok: true });
    }

    try {
      const segments = url.pathname.split('/').filter(Boolean);
      const [root, second, third] = segments;

      if (request.method === 'POST' && root === 'places') {
        return createPlace(env, request, (await request.json()) as ContributionRow);
      }
      if (request.method === 'GET' && root === 'places') {
        return listPlaces(env, request);
      }
      if (request.method === 'POST' && root === 'paths') {
        return createPath(env, request, (await request.json()) as ContributionRow);
      }
      if (request.method === 'GET' && root === 'paths') {
        return listPaths(env, request);
      }
      if (request.method === 'POST' && root === 'messages') {
        return createMessage(env, request, (await request.json()) as ContributionRow);
      }
      if (request.method === 'GET' && root === 'messages') {
        return listMessages(env, request);
      }
      if (request.method === 'POST' && root === 'photos' && second === 'sign') {
        return signPhoto(env, request, (await request.json()) as ContributionRow);
      }
      if (request.method === 'PUT' && root === 'photos' && second) {
        return putPhoto(env, request, decodeURIComponent(second));
      }

      // Moderation (admin only).
      if (root === 'admin') {
        if (!isAdmin(env, request)) {
          return new Response('Forbidden', { status: 403 });
        }
        if (!second) {
          return dashboard(env.ADMIN_TOKEN ?? '');
        }
        if (second === 'pending' && third) {
          return listPending(env, request, third === 'paths' ? 'paths' : 'places');
        }
        if (second === 'decide' && third) {
          const id = segments[3];
          return decide(env, request, third === 'paths' ? 'paths' : 'places', id, (await request.json()) as ContributionRow);
        }
      }

      return json(env, request, { error: 'Not found' }, 404);
    } catch (error) {
      return json(env, request, { error: error instanceof Error ? error.message : 'Unknown error' }, 500);
    }
  },
};
