// Writes the Bubblewrap config (twa-manifest.json) for the Android app, which opens the live site
// full screen in Chrome's engine (Trusted Web Activity). Used by .github/workflows/android-app.yml.
// Usage: node scripts/twa-manifest.mjs <domain> [versionCode]
const domain = (process.argv[2] ?? '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
const code = Number(process.argv[3] ?? 1);
if (!domain) { console.error('Usage: node scripts/twa-manifest.mjs <domain> [versionCode]'); process.exit(1); }
const site = `https://${domain}`;
// Colours match apps/web/public/manifest.webmanifest.
const header = '#0F1629';
const page = '#F4F5F9';

console.log(JSON.stringify({
  packageId: 'lk.darkhorse.waypointconnect',
  host: domain,
  name: 'Waypoint Connect',
  launcherName: 'Waypoint',
  display: 'standalone',
  orientation: 'default',
  themeColor: header,
  themeColorDark: header,
  navigationColor: header,
  navigationColorDark: header,
  navigationDividerColor: header,
  navigationDividerColorDark: header,
  backgroundColor: page,
  enableNotifications: false,
  startUrl: '/',
  iconUrl: `${site}/icon-512.png`,
  maskableIconUrl: `${site}/icon-512.png`,
  splashScreenFadeOutDuration: 300,
  signingKey: { path: './android.keystore', alias: 'android' },
  appVersionName: `1.0.${code}`,
  appVersionCode: code,
  appVersion: `1.0.${code}`,
  shortcuts: [],
  generatorApp: 'bubblewrap-cli',
  webManifestUrl: `${site}/manifest.webmanifest`,
  fullScopeUrl: `${site}/`,
  fallbackType: 'customtabs',
  features: {},
  alphaDependencies: { enabled: false },
  enableSiteSettingsShortcut: true,
  isChromeOSOnly: false,
  isMetaQuest: false,
  minSdkVersion: 21,
  fingerprints: [],
  additionalTrustedOrigins: [],
  retainedBundles: [],
}, null, 2));
