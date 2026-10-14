# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Interactive map

The Explore tab renders a real map with [MapLibre](https://maplibre.org): MapLibre Native
(`@maplibre/maplibre-react-native`) on Android and iOS, and MapLibre GL JS on the web.
MapLibre does not ship map data, so tiles come from a separate provider.

- **Provider and tiles:** the [OpenFreeMap](https://openfreemap.org) public instance —
  free, no API key, vector tiles built from OpenStreetMap data. The style URLs, the
  Gaborone / Botswana camera defaults and the attribution all live in
  `src/constants/map.ts`, so moving to another provider or to self-hosted tiles is a
  change to that file.
- **Attribution:** the map always shows `© OpenFreeMap · © OpenMapTiles · © OpenStreetMap`,
  and tapping it reveals the full credit. OpenFreeMap and OpenStreetMap require this, and
  the public instance forbids bulk and offline tile downloads.
- **Controls:** the layers button cycles the provider styles (Positron, Liberty, Bright),
  the map button toggles between Gaborone and the whole country, and the blue button
  recentres on Gaborone — the slot that will track the device once GPS lands.

### MapLibre needs a development build

MapLibre ships native code that Expo Go does not bundle, so the map screen shows a
"Map needs a development build" card there instead of a blank screen. Build and run a
development client first:

```bash
npm run android          # local Android dev build (expo run:android)
npm run ios              # local iOS dev build (expo run:ios)

# or in the cloud, then install the build on the device
npx eas-cli build --profile development --platform android
npx eas-cli build --profile development --platform ios
```

After the dev client is installed, `npm start` serves the JavaScript to it.

Tiles, styles and labels are downloaded at runtime, so the map needs a network
connection; failures show a retry card on top of the map.

### Web preview

The web build uses MapLibre GL JS. `metro.config.js` copies MapLibre's web worker into
`public/` (which Expo copies into the build) before every bundle, because Metro has no
`import.meta.url` for MapLibre to resolve it from. Refresh the copy by hand with
`npm run map:worker` after upgrading `maplibre-gl`.

```bash
npm run web:export       # static export to dist/
node scripts/serve-dist.js 8090   # serve the export locally
```

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
