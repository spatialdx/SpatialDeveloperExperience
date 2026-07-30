"use client";

import Scene from "./Scene";
import DebugOverlay from "./DebugOverlay";
import { BuildBridgeProvider } from "./BuildBridgeContext";

export default function SpatialDemo() {
  return (
    <BuildBridgeProvider>
      <main className="demo-shell">
        <div className="brand-lockup" aria-hidden="true">
          <div className="brand-mark">XR</div>
          <div>
            <p className="eyebrow">Developer Experience / Live Link</p>
            <h1>Spatial Build Outpost</h1>
          </div>
        </div>
        <Scene />
        <DebugOverlay />
      </main>
    </BuildBridgeProvider>
  );
}
