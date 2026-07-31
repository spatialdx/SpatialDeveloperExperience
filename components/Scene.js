"use client";

import { useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Grid, OrbitControls } from "@react-three/drei";
import { XR, createXRStore, useXR } from "@react-three/xr";
import Outpost, { OUTPOST_POSITION } from "./Outpost";
import Wrench from "./Wrench";
import Cog from "./Cog";

const DEFAULT_OUTPOST_SCALE = 0.18;

export const xrStore = createXRStore({
  controller: true,
  hand: true,
  handTracking: true,
  emulate: false,
  offerSession: false,
});

function AdaptiveEnvironment({ objectInteractionActive }) {
  const session = useXR((state) => state.session);
  const inXR = Boolean(session);

  return (
    <>
      <ambientLight intensity={inXR ? 1.2 : 0.55} />
      <hemisphereLight args={["#d9fff4", "#071a1d", inXR ? 1.1 : 0.8]} />
      <directionalLight
        castShadow={!inXR}
        intensity={2.4}
        position={[3, 5, 2]}
        color="#dcfff3"
      />
      {!inXR && (
        <>
          <OrbitControls
            makeDefault
            enabled={!objectInteractionActive}
            target={[0, 0.84, -0.8]}
            minDistance={0.3}
            maxDistance={4}
          />
          <Grid
            position={[0, 0.75, 0]}
            args={[12, 12]}
            cellSize={0.25}
            cellThickness={0.6}
            cellColor="#28514f"
            sectionSize={1}
            sectionThickness={1}
            sectionColor="#3a7771"
            fadeDistance={8}
            fadeStrength={1}
            infiniteGrid
          />
        </>
      )}
    </>
  );
}

function SpatialScene() {
  const [objectInteractionActive, setObjectInteractionActive] = useState(false);
  const [outpostPosition, setOutpostPosition] = useState(OUTPOST_POSITION);
  const [outpostScale, setOutpostScale] = useState(DEFAULT_OUTPOST_SCALE);

  return (
    <>
      <AdaptiveEnvironment objectInteractionActive={objectInteractionActive} />
      <Outpost
        initialPosition={OUTPOST_POSITION}
        scale={outpostScale}
        onScaleChange={setOutpostScale}
        onPositionChange={setOutpostPosition}
        onGrabChange={setObjectInteractionActive}
      />
      <Cog />
      <Wrench
        outpostPosition={outpostPosition}
        outpostScale={outpostScale}
        onGrabChange={setObjectInteractionActive}
      />
    </>
  );
}

export default function Scene() {
  return (
    <Canvas
      className="scene-canvas"
      camera={{ position: [1.05, 1.15, 1.45], fov: 42, near: 0.01, far: 100 }}
      gl={{ alpha: true, antialias: true }}
      dpr={[1, 1.75]}
      shadows
      onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
    >
      <XR store={xrStore}>
        <SpatialScene />
      </XR>
    </Canvas>
  );
}
