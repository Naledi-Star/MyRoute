-- myroute D1 schema.
--
-- Ownership: places and paths are community property. They are written by one
-- contributor and read by everybody once a moderator approves them; nobody's
-- device is the only copy. Chat messages are the opposite — they belong to the
-- thread they were sent in and are never part of the community data.
--
-- D1 is SQLite and has no PostGIS-style spatial extension, so location search
-- uses a geohash column plus a stored bounding box. A "near me" query becomes a
-- geohash-prefix + bounding-box scan, refined with a Haversine distance in the
-- Worker. See `src/lib/geo.ts` for the client-side equivalent.

CREATE TABLE IF NOT EXISTS places (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  category      TEXT NOT NULL DEFAULT 'Place',
  description   TEXT NOT NULL DEFAULT '',
  latitude      REAL NOT NULL,
  longitude     REAL NOT NULL,
  -- Stored bounding box for coarse filtering (see geohash below).
  min_lat       REAL NOT NULL,
  max_lat       REAL NOT NULL,
  min_lng       REAL NOT NULL,
  max_lng       REAL NOT NULL,
  -- Geohash-7 prefix: the primary geo index.
  geohash       TEXT NOT NULL,
  area          TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  contributor_id TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS places_status_idx ON places (status);
CREATE INDEX IF NOT EXISTS places_geohash_idx ON places (geohash);

CREATE TABLE IF NOT EXISTS paths (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  profile        TEXT NOT NULL DEFAULT 'foot',   -- car | bike | foot
  -- A recorded walk/drive ('path') or a combi route ('combi').
  kind           TEXT NOT NULL DEFAULT 'path',
  -- Combi routes only: what riders call it, and the rank it leaves from.
  combi_name     TEXT NOT NULL DEFAULT '',
  rank           TEXT NOT NULL DEFAULT '',
  -- JSON array of named stops, in travel order:
  -- [{id,label,latitude,longitude,accuracy,capturedAt,photoUri,fareFromPrevious}]
  waypoints      TEXT NOT NULL DEFAULT '[]',
  -- GeoJSON LineString strings, [lng, lat] pairs.
  raw_geometry   TEXT NOT NULL,
  snapped_geometry TEXT NOT NULL,
  snapped        INTEGER NOT NULL DEFAULT 0,
  distance_m     REAL NOT NULL DEFAULT 0,
  duration_s     REAL NOT NULL DEFAULT 0,
  start_label    TEXT NOT NULL DEFAULT '',
  end_label      TEXT NOT NULL DEFAULT '',
  visibility     TEXT NOT NULL DEFAULT 'public', -- public | private
  status         TEXT NOT NULL DEFAULT 'pending',
  contributor_id TEXT,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS paths_status_idx ON paths (status);

CREATE TABLE IF NOT EXISTS photos (
  id             TEXT PRIMARY KEY,
  owner_type     TEXT NOT NULL,   -- place | path
  owner_id       TEXT NOT NULL,
  r2_key         TEXT NOT NULL,
  position       INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'pending',
  contributor_id TEXT,
  created_at     INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS photos_owner_idx ON photos (owner_type, owner_id);

CREATE TABLE IF NOT EXISTS reviews (
  id          TEXT PRIMARY KEY,
  owner_type  TEXT NOT NULL,
  owner_id    TEXT NOT NULL,
  decision    TEXT NOT NULL,      -- approved | rejected
  note        TEXT NOT NULL DEFAULT '',
  reviewer_id TEXT,
  created_at  INTEGER NOT NULL
);

-- Chat: messages belong to a thread (the shared "community" room, or a 1:1
-- thread id minted by the client). Text messages use `body`; location messages
-- additionally carry coordinates so the app can render a map card.
CREATE TABLE IF NOT EXISTS messages (
  id          TEXT PRIMARY KEY,
  thread_id   TEXT NOT NULL,
  author_id   TEXT,
  author_name TEXT NOT NULL DEFAULT '',
  kind        TEXT NOT NULL DEFAULT 'text',   -- text | location
  body        TEXT NOT NULL DEFAULT '',
  latitude    REAL,
  longitude   REAL,
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS messages_thread_idx ON messages (thread_id, created_at);
