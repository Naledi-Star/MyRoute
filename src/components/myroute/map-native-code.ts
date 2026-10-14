/**
 * MapLibre registers these TurboModules in the native binary. Expo Go and development
 * clients that were built before `@maplibre/maplibre-react-native` was added do not
 * have them, and attempting to import the library in that state makes Metro log an
 * invariant violation from inside its module loader — the map screen probes for these
 * first so it can explain the problem instead.
 *
 * Any one module counting as "present" is deliberate: it keeps the probe from locking
 * the map out of a working build if MapLibre renames or adds modules between versions.
 */
const MAPLIBRE_NATIVE_MODULES = [
  'MLRNCameraModule',
  'MLRNMapViewModule',
  'MLRNGeoJSONSourceModule',
  'MLRNVectorSourceModule',
  'MLRNImagesModule',
  'MLRNLocationModule',
  'MLRNLogModule',
  'MLRNNetworkModule',
  'MLRNOfflineModule',
  'MLRNStaticMapModule',
  'MLRNTransformRequestModule',
] as const;

/** The slice of React Native's `TurboModuleRegistry` this check needs. */
export type TurboModuleLookup = { get: (name: string) => unknown };

export function hasMapLibreNativeCode(registry: TurboModuleLookup): boolean {
  try {
    return MAPLIBRE_NATIVE_MODULES.some((name) => registry.get(name) != null);
  } catch {
    // A registry that cannot answer tells us nothing, so assume the native code is
    // there and let the import report the real problem.
    return true;
  }
}
