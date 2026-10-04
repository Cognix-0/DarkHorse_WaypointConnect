# Waypoint Driver (Android)

The driver's phone app as a real installable Android app (Capacitor 7). It runs in the app's own WebView (no Chrome
needed) and opens the driver screens of the live site, so every driver feature (today's runs, load check, route,
proof of delivery with camera and signature, offline sync, live updates) works as on the web, and fixes reach the
app without an update.

Build: GitHub Actions → "Driver app (Android)" (or push to the `driver-app` branch). The artifact is
`waypoint-driver.apk`; install it on the phone (allow installing from this source once).

Package id `lk.darkhorse.waypointdriver`. Camera permission is requested for proof-of-delivery photos.
Fingerprint unlock uses the phone's native prompt (`@capgo/capacitor-native-biometric`, called from
`apps/web/src/roles/driver/biometric.ts` through the Capacitor bridge), because Android's WebView has no WebAuthn.
Adding a native plugin means drivers install the new APK once.
