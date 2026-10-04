# Mobile app for drivers and store managers

Waypoint Connect is one web app that also installs on phones (a PWA): home-screen icon, full screen, offline driving, camera, and fingerprint unlock. The phone apps are that same app, so every fix you deploy reaches them without a reinstall. Everything below needs the public HTTPS site first (`docs/deploy.md`).

Everyone can open **https://\<DOMAIN\>/get-app** (linked from the sign-in page). It shows the right steps for their phone.

| | Android | iPhone / iPad |
| --- | --- | --- |
| Install from the browser (free, works today) | Chrome → *Install* on `/get-app` | Safari → Share → *Add to Home Screen* |
| Downloadable app file | **APK** from the GitHub job below, offered on `/get-app` | Not allowed by Apple outside the App Store (see the end) |
| Fingerprint / face unlock | Yes | Yes (Touch ID / Face ID) |
| Works without signal | Yes | Yes |

## Fingerprint unlock (driver app)

After the first password sign-in, *Today's runs* offers **Open the app with your fingerprint**. Once on, the app shows a lock screen whenever it is opened, or comes back after 5 minutes in the background, until the phone verifies its owner (fingerprint, face, or the phone's PIN).

- Uses WebAuthn, the standard behind passkeys (`apps/web/src/roles/driver/biometric.ts`). The fingerprint never leaves the phone; the browser only reports "owner verified".
- Works offline, in Chrome, in the Android app and in the iPhone home-screen app. Needs HTTPS (or `localhost`).
- It is an app lock on top of the normal sign-in: a new phone, or a session older than 12 hours, still needs the password. *Use password instead* on the lock screen signs out.
- On/off: the row at the bottom of *Today's runs*.

Try it on a laptop: Chrome DevTools → ⋮ → More tools → **WebAuthn** → *Enable virtual authenticator environment* → add an "internal" authenticator with user verification. Then sign in as the driver and tap *Turn on*.

## Android app (APK) — one click on GitHub

`.github/workflows/android-app.yml` builds the app with Google's Bubblewrap: a real Android app that opens our site full screen in Chrome's engine (Trusted Web Activity), so offline mode, camera and fingerprint keep working.

**One-time: create the signing key** (on your Mac; keep the file and password safe, never in Git):

```bash
keytool -genkeypair -keystore waypoint-android.keystore -alias android -keyalg RSA -keysize 2048 -validity 10000 \
  -dname "CN=Waypoint Connect, O=Team Dark Horse, C=LK"          # choose a password when asked
base64 -i waypoint-android.keystore | pbcopy                      # copies it for the next step
```

GitHub → repository → **Settings → Secrets and variables → Actions → New repository secret**:
- `ANDROID_KEYSTORE_BASE64` = paste
- `ANDROID_KEYSTORE_PASSWORD` = the password you chose

(Without these the job still works but signs with a throw-away key, and phones then cannot update to the next build.)

**Each release:**
1. GitHub → **Actions → Android app → Run workflow**. Domain: the live site without `https://`. Version: 1 the first time, then 2, 3…
2. After ~5 minutes, open the finished run and download the artifact `waypoint-connect-android-N` (zip with `waypoint-connect.apk`, `waypoint-connect.aab`, `assetlinks.json`).
3. Copy into the repository:
   - `waypoint-connect.apk` → `apps/web/public/downloads/waypoint-connect.apk`
   - `assetlinks.json` → `apps/web/public/.well-known/assetlinks.json` (proves the app and the site belong together, so Android hides the address bar; it only changes if the key changes)
4. Commit, push, and redeploy (`bash scripts/server-setup.sh` on the server, or `git pull && docker compose up -d --build`).

`/get-app` now shows **Download the app (APK)**. Send people that link. On the phone: open the file → allow *Install unknown apps* for the browser once → *Install*.

If the job fails, the same result comes from https://www.pwabuilder.com: enter the site → *Package for stores* → *Android* → *Generate*, then steps 3–4 with the files in its zip (keep its `signing.keystore`).

For the Google Play Store: upload `waypoint-connect.aab` (Play developer account, one-off USD 25, review takes a few days).

## iPhone

Apple only allows apps from the App Store (or TestFlight), so there is no file to download. Options:
- **Now, free:** Safari → Share → *Add to Home Screen*. It runs full screen with its own icon, offline mode and Face ID / Touch ID unlock — the same as the Android app.
- **Later, App Store / TestFlight:** needs an Apple Developer account (USD 99 / year) and Xcode on a Mac. PWABuilder → *Package for stores* → *iOS* generates the Xcode project from the live site; open it in Xcode → *Archive* → upload to TestFlight, then invite testers by email.
