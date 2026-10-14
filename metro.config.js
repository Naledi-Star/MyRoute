// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

const { syncMapWorker } = require('./scripts/sync-map-worker.cjs');

// MapLibre GL JS builds its web worker URL from `import.meta.url`, which Metro
// does not support, so the web map points MapLibre at `public/maplibre-gl-worker.mjs`
// instead. Refreshing it here keeps the copy in step with the installed version for
// every `expo start` / `expo export` run, whatever entry point is used.
syncMapWorker(__dirname);

/** @type {import('expo/metro-config').MetroConfig} */
module.exports = getDefaultConfig(__dirname);
