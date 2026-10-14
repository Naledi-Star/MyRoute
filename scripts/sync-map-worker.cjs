/**
 * Copies the MapLibre GL JS web worker into `public/`, the directory Expo copies
 * into the web build root.
 *
 * MapLibre resolves its worker through `import.meta.url`, which Metro does not
 * provide, so the web map points MapLibre at this copied file instead (see
 * `setWorkerUrl` in `src/components/myroute/interactive-map.web.tsx`). Keeping the
 * copy next to the installed version means it never drifts: this module runs from
 * `metro.config.js` before every bundle, and can also be run on its own with
 * `npm run map:worker`.
 */
const { copyFileSync, existsSync, mkdirSync, readFileSync } = require('node:fs');
const path = require('node:path');

const WORKER = 'maplibre-gl-worker.mjs';

function syncMapWorker(projectRoot = path.join(__dirname, '..')) {
  const require_ = require('node:module').createRequire(path.join(projectRoot, 'package.json'));
  const source = require_.resolve(`maplibre-gl/dist/${WORKER}`);
  const version = require_('maplibre-gl/package.json').version;
  const target = path.join(projectRoot, 'public', WORKER);

  mkdirSync(path.dirname(target), { recursive: true });

  if (existsSync(target) && readFileSync(target).equals(readFileSync(source))) {
    return { copied: false, version, target };
  }
  copyFileSync(source, target);
  return { copied: true, version, target };
}

module.exports = { syncMapWorker };

if (require.main === module) {
  const { copied, version, target } = syncMapWorker();
  console.log(
    copied
      ? `copied the maplibre-gl ${version} web worker to ${target}`
      : `the maplibre-gl ${version} web worker in public/ is up to date`,
  );
}
