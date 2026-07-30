# Spatial DevEx Bridge

[![CI](https://github.com/dworlton/SpatialDeveloperExperience/actions/workflows/ci.yml/badge.svg)](https://github.com/dworlton/SpatialDeveloperExperience/actions/workflows/ci.yml)

A proof-of-concept WebXR/Desktop bridge that maps CI/CD build state to a
physical-feeling AR interaction on Meta Quest 3.

## What is included

- A React Three Fiber scene for desktop OrbitControls and WebXR AR.
- A stylized outpost with passed/failed materials, smoke, and sparks.
- A pointer-captured wrench for mouse, controller, and hand input.
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

WebXR requires a secure context. Start the LAN-accessible HTTPS mode:

```bash
npm run dev:xr
```

Open the printed `https://<your-pc-ip>:<port>` network URL in Quest Browser,
trust the local development certificate on devices you control, and select
**Enter Passthrough AR**. Quest mode serves the bridge over HTTPS/WSS with the
same local certificate as the web process.

Keep Windows Firewall limited to your trusted/private network when allowing
Node.js access.

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
