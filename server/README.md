# myroute API (Cloudflare Worker)

The community backend for myroute: places, paths and photos in **D1**, photo blobs
in **R2**, Clerk-authenticated contributions, and a review queue with a web
dashboard. Everything on Cloudflare, per the project decision.

## Why Cloudflare (and the D1 caveat)

Cloudflare has an official Expo mobile guide and one dashboard for everything.
**D1 is SQLite and has no PostGIS-style spatial extension**, so location search
uses a `geohash` column plus a stored bounding box (see `schema.sql`); "near me"
is a bounding-box scan refined with a Haversine distance in the Worker. That is
plenty at Botswana scale. If you later need real spatial queries at global scale,
add a free Postgres + PostGIS sibling (e.g. Neon) for the `places` table only.

## Endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | — | Liveness check |
| POST | `/places` | user\* | Submit a place → `pending` |
| GET | `/places?lat&lng&radius` | — | Approved places, nearest first, in the app's shape |
| POST | `/paths` | user\* | Submit a recorded path or combi route → `pending` (upsert, so retries and edits are safe) |
| GET | `/paths` | — | Approved community paths and combi routes, in the app's shape (named stops and fares included) |
| POST | `/photos/sign` | user\* | Get a key + upload URL |
| PUT | `/photos/:key?ownerId=` | user\* | Upload a photo blob to R2 |
| GET | `/admin` | admin | Moderation dashboard (HTML) |
| GET | `/admin/pending/:table` | admin | Pending rows as JSON |
| POST | `/admin/decide/:table/:id` | admin | Approve / reject |

\* Anonymous contributions are allowed when `CLERK_JWKS_URL` is unset; set it to
enforce signed-in contributors. Admin access uses the `ADMIN_TOKEN` secret via the
`X-Admin-Token` header (or `?token=` for the dashboard link).

## Who owns what

- **Places and paths are community property.** A contributor submits one, it lands
  as `pending`, a moderator approves it, and from then on every device reads it
  back. The app never treats a place or a recorded path as belonging to the person
  who typed it: the offline queue exists only so a contribution is not lost before
  it reaches the database.
- **Messages belong to their author and thread.** They are never listed as
  community data and are not part of the moderation queue.

## Upgrading an existing database

`schema.sql` uses `CREATE TABLE IF NOT EXISTS`, so it will not add columns to a
database created earlier. Combi routes added `kind`, `combi_name`, `rank` and
`waypoints` to `paths`; apply the migration once:

```bash
cd server
npx wrangler d1 execute myroute --file=./migrations/0001_paths_combi.sql --remote
```

## Setup

```bash
cd server
npm install
npx wrangler d1 create myroute            # copy the id into wrangler.toml
npx wrangler r2 bucket create myroute-photos
npm run db:migrate:remote                 # apply schema.sql
npx wrangler secret put ADMIN_TOKEN       # choose a strong token
npm run deploy
```

Then point the app at it:

```bash
# .env in the app root
EXPO_PUBLIC_API_URL=https://myroute-api.<your-subdomain>.workers.dev
```

The mobile client lives in `src/lib/api.ts`. Until `EXPO_PUBLIC_API_URL` is set,
the app stores contributions locally so nothing is lost.

## Not done yet

- Clerk **roles** (the `admin` role) rather than a shared `ADMIN_TOKEN`.
- Rate limiting / Turnstile on public write endpoints.
- Photo `status` review UI (the `photos` table is ready for it).
- Stop photos stay on the contributor's device: `waypoints[].photoUri` is a local
  file uri, and uploading them to R2 needs the `/photos/sign` flow wired into the
  recorder.
- Place search still goes to the geocoder; the community places show on the
  Explore map and community combi routes drive the combi search.
