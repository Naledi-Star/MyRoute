// Learn more: https://docs.expo.dev/guides/customizing-metro/
const http = require('http');

const { getDefaultConfig } = require('expo/metro-config');

const { syncMapWorker } = require('./scripts/sync-map-worker.cjs');

// MapLibre GL JS builds its web worker URL from `import.meta.url`, which Metro
// does not support, so the web map points MapLibre at `public/maplibre-gl-worker.mjs`
// instead. Refreshing it here keeps the copy in step with the installed version for
// every `expo start` / `expo export` run, whatever entry point is used.
syncMapWorker(__dirname);

// ── Dev-time API proxy ──────────────────────────────────────────────────────
//
// The app must reach the backend over exactly the route it already reaches
// Metro for. A phone pulls its JavaScript over Wi-Fi, USB (`adb reverse`),
// an emulator's NAT or a tunnel — and Windows/macOS firewalls routinely block
// a *second* port (3000) even when the bundle port (8081) works, which looks
// to the app like "the backend is down" and silently loses contributions.
//
// So during development Metro doubles as the API's front door: `/api/*` and
// `/health` are proxied to the Express backend, everything else is Metro's.
// The app derives its API base from the address it loaded the bundle from
// (see `resolveApiBase` in src/lib/api.ts), so one reachable port is enough.
// Production builds are unaffected — they set EXPO_PUBLIC_API_URL.

const API_PROXY_TARGET = process.env.EXPO_PUBLIC_API_PROXY || 'http://127.0.0.1:3000';
const API_PROXY_PREFIXES = ['/api/', '/health'];

function apiProxy(metroMiddleware) {
  return (req, res, next) => {
    const url = req.url || '/';
    if (!API_PROXY_PREFIXES.some((prefix) => url === prefix || url.startsWith(prefix))) {
      return metroMiddleware(req, res, next);
    }

    const target = new URL(API_PROXY_TARGET);
    const headers = { ...req.headers, host: target.host };
    delete headers.connection;

    const upstream = http.request(
      { protocol: target.protocol, hostname: target.hostname, port: target.port, method: req.method, path: url, headers },
      (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
        upstreamRes.pipe(res);
      },
    );
    upstream.on('error', () => {
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
      }
      res.end(
        JSON.stringify({
          error: {
            code: 'api_unreachable',
            message: `The myroute backend is not running (expected on ${API_PROXY_TARGET}).`,
          },
        }),
      );
    });
    req.pipe(upstream);
  };
}

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

module.exports = {
  ...config,
  server: {
    ...(config.server ?? {}),
    enhanceMiddleware: (metroMiddleware, server) => {
      const existing = config.server?.enhanceMiddleware;
      const inner = existing ? existing(metroMiddleware, server) : metroMiddleware;
      return apiProxy(inner);
    },
  },
};
