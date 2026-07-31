"use client";

import { useCallback, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Grid, OrbitControls, Text } from "@react-three/drei";
import { XR, createXRStore, useXR } from "@react-three/xr";
import Outpost, { OUTPOST_POSITION } from "./Outpost";
import Spaceship from "./Spaceship";
import Wrench from "./Wrench";
import Cog from "./Cog";
import DockingPad from "./DockingPad";
import ShieldModule from "./ShieldModule";
import { useBuildBridge } from "./BuildBridgeContext";

const PAD_POSITION = [-0.4, 0, -0.8];
const PAD_ACTIVATION_RADIUS = 0.38;

const FEEDBACK_MESSAGES = {
  success: "Action sent",
  failure: "Action failed",
  unavailable: "Not available",
};
const FEEDBACK_COLORS = {
  success: "#48ffb0",
  failure: "#ff5050",
  unavailable: "#888888",
};

function DockFeedbackLabel({ position, feedback, onExpire }) {
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(onExpire, 2000);
    return () => clearTimeout(timer);
  }, [feedback, onExpire]);

  if (!feedback) return null;

  return (
    <Text
      position={[position[0], position[1] + 0.42, position[2]]}
      fontSize={0.1}
      color={FEEDBACK_COLORS[feedback.result]}
      anchorX="center"
      anchorY="middle"
      outlineWidth={0.005}
      outlineColor="#000000"
    >
      {FEEDBACK_MESSAGES[feedback.result]}
    </Text>
  );
}

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
  const [padHoverState, setPadHoverState] = useState("idle");
  const [dockFeedback, setDockFeedback] = useState(null);
  const {
    registerRepairHit,
    triggerPrDiff,
    triggerShieldAction,
    renovatePR,
    securityReport,
  } = useBuildBridge();

  const handlePadHover = useCallback((inRadius) => {
    setPadHoverState(inRadius ? "valid" : "idle");
  }, []);

  const handleDrop = useCallback(
    (objectType, snapped) => {
      if (!snapped) return;
      let result;
      if (objectType === "wrench") {
        result = registerRepairHit() ? "success" : "unavailable";
      } else if (objectType === "cog") {
        result = renovatePR ? (triggerPrDiff() ? "success" : "failure") : "unavailable";
      } else if (objectType === "shield") {
        result = securityReport
          ? (triggerShieldAction() ? "success" : "failure")
          : "unavailable";
      } else {
        return;
      }
      setDockFeedback({ objectType, result });
    },
    [registerRepairHit, triggerPrDiff, triggerShieldAction, renovatePR, securityReport],
  );

  return (
    <>
      <AdaptiveEnvironment objectInteractionActive={objectInteractionActive} />
      <DockingPad position={PAD_POSITION} hoverState={padHoverState} />
      <Outpost
        initialPosition={OUTPOST_POSITION}
        scale={outpostScale}
        onScaleChange={setOutpostScale}
        onPositionChange={setOutpostPosition}
        onGrabChange={setObjectInteractionActive}
      />
      <Spaceship stationPosition={outpostPosition} stationScale={outpostScale} />
      <Cog
        padPosition={PAD_POSITION}
        padActivationRadius={PAD_ACTIVATION_RADIUS}
        onGrabChange={setObjectInteractionActive}
        onPadHover={handlePadHover}
        onDrop={(snapped) => handleDrop("cog", snapped)}
      />
      <Wrench
        padPosition={PAD_POSITION}
        padActivationRadius={PAD_ACTIVATION_RADIUS}
        onGrabChange={setObjectInteractionActive}
        onPadHover={handlePadHover}
        onDrop={(snapped) => handleDrop("wrench", snapped)}
      />
      <ShieldModule
        padPosition={PAD_POSITION}
        padActivationRadius={PAD_ACTIVATION_RADIUS}
        onGrabChange={setObjectInteractionActive}
        onPadHover={handlePadHover}
        onDrop={(snapped) => handleDrop("shield", snapped)}
      />
      <DockFeedbackLabel
        position={PAD_POSITION}
        feedback={dockFeedback}
        onExpire={() => setDockFeedback(null)}
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
