/**
 * Browser smoke test for "the map picks my current location".
 *
 * Emulates the device position as Johannesburg (far from the Gaborone
 * reference view), opens the Explore tab and checks that:
 *   1. the blue "you" dot is rendered, and
 *   2. vector tiles were fetched around the device position — which only
 *      happens if the camera framed the fix.
 *
 *   node scripts/smoke-map.cjs
 *
 * Requires the export to be served (scripts/serve-dist.js) and Chrome started
 * with --remote-debugging-port=9223.
 */
const PORT = 9223;
const BASE = 'http://127.0.0.1:8090';

const DEVICE = { latitude: -26.2041, longitude: 28.0473 }; // Johannesburg
const GABORONE = { latitude: -24.6541, longitude: 25.9087 };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.requests = [];
    ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.method === 'Network.requestWillBeSent') {
        this.requests.push(message.params.request.url);
      }
      const waiter = message.id ? this.pending.get(message.id) : null;
      if (!waiter) return;
      this.pending.delete(message.id);
      if (message.error) waiter.reject(new Error(message.error.message));
      else waiter.resolve(message.result);
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
}

function tileXY(lat, lng, zoom) {
  const scale = 2 ** zoom;
  const x = Math.floor(((lng + 180) / 360) * scale);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * scale,
  );
  return { x, y, z: zoom };
}

const TILE_PATTERN = /\/(\d+)\/(\d+)\/(\d+)\.(pbf|png|mvt)/;

function tilesNear(urls, point) {
  const hits = [];
  for (let zoom = 12; zoom <= 16; zoom += 1) {
    const target = tileXY(point.latitude, point.longitude, zoom);
    urls.forEach((url) => {
      const match = url.match(TILE_PATTERN);
      if (!match) return;
      const [z, x, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
      if (z === zoom && Math.abs(x - target.x) <= 2 && Math.abs(y - target.y) <= 2) {
        hits.push(`${z}/${x}/${y}`);
      }
    });
  }
  return hits;
}

async function main() {
  const failures = [];
  const check = (name, ok, detail = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` — ${detail}`}`);
    if (!ok) failures.push(name);
  };

  const targets = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
  const page = targets.find((target) => target.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve) => ws.addEventListener('open', resolve));
  const cdp = new CDP(ws);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  // Tiles are fetched by the map worker, so they never appear in the page's
  // performance timeline — watch the Network domain instead.
  await cdp.send('Network.enable');

  const version = await fetch(`http://127.0.0.1:${PORT}/json/version`).then((r) => r.json());
  const browserWs = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve) => browserWs.addEventListener('open', resolve));
  const browserCdp = new CDP(browserWs);
  await browserCdp
    .send('Browser.grantPermissions', { permissions: ['geolocation'], origin: BASE })
    .catch((error) => console.warn(`grant permissions: ${error.message}`));

  await cdp.send('Emulation.setGeolocationOverride', {
    latitude: DEVICE.latitude,
    longitude: DEVICE.longitude,
    accuracy: 10,
  });

  await cdp.send('Page.navigate', { url: `${BASE}/` });

  const evaluate = async (expression) => {
    const result = await cdp.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    }
    return result.result.value;
  };

  const waitForIt = async (expression, timeoutMs = 25000) => {
    const startedAt = Date.now();
    let value = 0;
    for (;;) {
      value = await evaluate(expression);
      if (value > 0 || Date.now() - startedAt > timeoutMs) return value;
      await sleep(500);
    }
  };

  // 1 ── the you-dot rendered (RNW serialises rgba() without trailing zeros)
  const dotCount = await waitForIt(
    `[...document.querySelectorAll('div')].filter(
        (el) => (el.style.backgroundColor || '').replace(/\\s/g, '') === 'rgba(39,121,232,0.2)',
      ).length`,
  );
  check('Device position dot is on the map', dotCount > 0, `found ${dotCount}`);

  // 1b ── tiles are fetched inside MapLibre's worker, so attach to any worker
  // targets as they appear; the page's Network domain never sees them.
  const sessions = [cdp];
  const attached = new Set();
  const attachWorkers = async (deadlineMs) => {
    for (;;) {
      const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
      for (const target of list) {
        if (target.type !== 'worker' || attached.has(target.id)) continue;
        attached.add(target.id);
        try {
          const workerWs = new WebSocket(target.webSocketDebuggerUrl);
          await new Promise((resolve) => workerWs.addEventListener('open', resolve));
          const workerCdp = new CDP(workerWs);
          await workerCdp.send('Network.enable').catch(() => {});
          sessions.push(workerCdp);
          console.log(`      attached to worker target ${target.url || target.id}`);
        } catch (error) {
          console.warn(`      worker attach failed: ${error.message}`);
        }
      }
      if (Date.now() > deadlineMs) return;
      await sleep(500);
    }
  };
  await attachWorkers(Date.now() + 8000);
  console.log(
    '      webgl:',
    await evaluate(`Boolean(document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl'))`),
  );

  // 2 ── tiles were fetched around the device position
  const startedAt = Date.now();
  let tiles = [];
  for (;;) {
    await attachWorkers(Date.now() + 1500);
    tiles = sessions.flatMap((session) => session.requests).filter((url) => TILE_PATTERN.test(url));
    if (tiles.length > 0 || Date.now() - startedAt > 30000) break;
    await sleep(500);
  }

  const deviceTiles = tilesNear(tiles, DEVICE);
  const homeTiles = tilesNear(tiles, GABORONE);
  console.log(
    `      ${tiles.length} tile requests | near device: ${deviceTiles.slice(0, 4).join(', ') || 'none'} | near Gaborone: ${homeTiles.slice(0, 4).join(', ') || 'none'}`,
  );
  check(
    'Camera framed the device position (Johannesburg tiles requested)',
    deviceTiles.length > 0,
    `${tiles.length} tile requests, ${deviceTiles.length} near the device`,
  );

  ws.close();
  browserWs.close();

  if (failures.length > 0) {
    console.error(`\n${failures.length} check(s) failed: ${failures.join(', ')}`);
    process.exit(1);
  }
  console.log('\nMap location smoke checks passed.');
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
