# Spatial DevEx Bridge

[![CI](https://github.com/dworlton/SpatialDeveloperExperience/actions/workflows/ci.yml/badge.svg)](https://github.com/dworlton/SpatialDeveloperExperience/actions/workflows/ci.yml)

A proof-of-concept WebXR/Desktop bridge that maps CI/CD build state to a
physical-feeling AR interaction on Meta Quest 3.

## What is included

- A React Three Fiber scene for desktop OrbitControls and WebXR AR.
- A stylized outpost with passed/failed materials, smoke, and sparks.
- A pointer-captured wrench for mouse, controller, and hand input.
- Desk-scale defaults: an approximately 19 cm outpost and 25 cm wrench.
- Grab the outpost to place it and pull its cyan handle to resize it.
- Velocity-and-distance collision detection for repair hits.
- An Express webhook bridge and `ws` WebSocket server.
- A guarded desktop action that opens only the current HTTP(S) build URL.

## Run on desktop

Node.js 22.13 or newer is required.

```bash
npm install
npm run dev
```

Open the local URL printed by the web process. The frontend connects to the
webhook server on port `8081` and the WebSocket bridge on port `8080`.

## Run on Meta Quest 3

The recommended development path uses USB forwarding. Quest Browser sees the
app as `localhost`, which is a WebXR secure context without requiring a
self-signed certificate.

### One-time headset setup

1. Follow Meta's [device setup
   guide](https://developers.meta.com/horizon/documentation/native/android/mobile-device-setup/)
   to register a developer organization and enable **Developer Mode** for the
   headset in the Meta Horizon mobile app.
2. Restart the headset after enabling Developer Mode.
3. Install Android Platform Tools on Windows:

   ```powershell
   winget install --id Google.PlatformTools --exact
   ```

4. Connect the Quest to the PC with a USB data cable. Put on the headset, accept
   the USB debugging prompt, and select **Always allow from this computer**.

### Start a Quest session

```bash
npm run dev:quest
```

Keep that terminal running. In Quest Browser, open
`http://localhost:3000`, confirm the page says **Bridge online**, and select
**Enter Passthrough AR**. Approve spatial-tracking/passthrough access if asked.

For a quick end-to-end test, select **Simulate Build Failure** before entering
AR. In AR, grab the wrench with a controller grip or a hand pinch and strike the
outpost. A successful hit changes the state and asks the desktop bridge to open
the active build URL on the PC.

If the launcher reports that the device is unauthorized, put on the headset,
accept the USB debugging prompt, and run the command again. If `adb` was just
installed, open a new PowerShell window first.

For remote console and network debugging, leave the USB cable connected, open
`chrome://inspect/#devices` in desktop Chrome, enable **Discover USB devices**,
and choose **inspect** beneath the Quest Browser tab.

### Optional Wi-Fi/LAN mode

For a cable-free test, start the LAN-accessible HTTPS mode:

```bash
npm run dev:xr
```

The first run requires `mkcert`, which can be installed with:

```powershell
winget install --id FiloSottile.mkcert --exact
```

Open the exact network URL printed by the launcher in Quest Browser. The
launcher generates a certificate containing the PC's current LAN address, so
the page and its JavaScript modules use the same valid identity. Quest Browser
may still show a local-CA warning; choose **Advanced** and continue on a device
you control. Keep Windows Firewall access limited to trusted/private networks.

Use `Ctrl+C` to stop either development session. The USB forwarding rules are
removed automatically when `dev:quest` exits normally.

## Send a build webhook

```bash
curl -X POST http://localhost:8081/api/webhook/build \
  -H "Content-Type: application/json" \
  -d '{"status":"FAILED","buildUrl":"https://github.com/example/repo/actions/runs/123"}'
```

Valid statuses are `PASSED` and `FAILED`. Build URLs must use HTTP or HTTPS.
For safety, the bridge opens only the URL in the current build state unless
`ALLOW_ARBITRARY_BUILD_URLS=true` is explicitly set.

## Configuration

Copy `.env.example` to `.env.local` when the web app and bridge use different
origins. Bridge environment variables:

- `WS_PORT` (default `8080`)
- `HTTP_PORT` (default `8081`)
- `DISABLE_PC_ACTIONS=true` to test without opening a browser
- `ALLOW_ARBITRARY_BUILD_URLS=true` to disable active-build URL matching

## Project map

```text
app/
  globals.css
  layout.tsx
  page.tsx
components/
  BuildBridgeContext.js
  DebugOverlay.js
  Outpost.js
  Scene.js
  SpatialDemo.js
  Wrench.js
server/
  index.js
  index.test.js
vite.config.ts
```
Credits: Dan & Paul Worlton