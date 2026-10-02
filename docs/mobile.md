# Mobile app for drivers and store managers

Waypoint Connect is an installable web app (PWA): the same code as the website, with an icon on the home screen, full screen, and offline driving. There are two ways to hand it out. Both need the public HTTPS site first (`docs/deploy.md`).

Everyone can open **https://\<DOMAIN\>/get-app** (also linked from the sign-in page). It shows the right steps for their phone.

## 1. Install from the browser (no file, works today)

- **Android (Chrome):** open the site → *Install* button on `/get-app`, or ⋮ → *Add to Home screen* → *Install*.
- **iPhone/iPad (Safari):** Share → *Add to Home Screen* → *Add*. (Apple does not allow app files outside the App Store, so this is the iPhone route.)

## 2. A downloadable Android app (APK)

The APK is a Trusted Web Activity: a real Android app that opens our site in Chrome's engine, full screen, so the offline mode, camera and sync all keep working, and updates to the site reach the app with no reinstall.

1. Go to **https://www.pwabuilder.com**, enter `https://<DOMAIN>`, click **Start**, then **Package for stores → Android → Generate package**.
   - Package ID: `com.darkhorse.waypointconnect` · App name: `Waypoint Connect`.
   - Leave *Signing key* on **Create new**.
2. Download the zip. Keep **`signing.keystore` and `signing-key-info.txt` safe** (in the team drive, not in Git): every later version must be signed with the same key.
3. Copy two files from the zip into the repository:
   - the `.apk` (not the `.aab`) → `apps/web/public/downloads/waypoint-connect.apk`
   - `assetlinks.json` → `apps/web/public/.well-known/assetlinks.json` (this proves the app and the site belong together, so Android hides the address bar)
4. Commit, push, and on the server run `bash scripts/server-setup.sh` again (or `git pull && docker compose up -d --build`).

`/get-app` now shows **Download the app (APK)**. Send people that link (or a QR code of it). On the phone: open the file, allow *Install unknown apps* for the browser once, *Install*.

Notes
- The APK points at one domain. If the domain changes, generate it again.
- For the Google Play Store, upload the `.aab` from the same zip instead (needs a Play developer account, one-off USD 25, and a review of a few days).
