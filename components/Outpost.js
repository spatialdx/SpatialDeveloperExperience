"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useBuildBridge } from "./BuildBridgeContext";

export const OUTPOST_POSITION = [0, 0.75, -0.8];
const MIN_OUTPOST_SCALE = 0.11;
const MAX_OUTPOST_SCALE = 0.34;

function seededUnit(seed) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function createParticlePositions(count, xSpread, ySpread, zSpread, seed) {
  const values = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    const stride = index * 3;
    values[stride] = (seededUnit(seed + index * 3) - 0.5) * xSpread;
    values[stride + 1] = seededUnit(seed + index * 3 + 1) * ySpread;
    values[stride + 2] =
      (seededUnit(seed + index * 3 + 2) - 0.5) * zSpread;
  }
  return values;
}

function SmokeParticles() {
  const pointsRef = useRef();
  const positions = useMemo(
    () => createParticlePositions(30, 0.16, 0.55, 0.16, 11),
    [],
  );

  useFrame((state, delta) => {
    const attribute = pointsRef.current?.geometry.attributes.position;
    if (!attribute) return;
    for (let index = 0; index < attribute.count; index += 1) {
      const y = attribute.getY(index) + delta * (0.11 + (index % 5) * 0.018);
      const sway = Math.sin(state.clock.elapsedTime * 0.8 + index) * 0.0008;
      attribute.setX(index, attribute.getX(index) + sway);
      attribute.setY(index, y > 0.62 ? 0 : y);
    }
    attribute.needsUpdate = true;
  });

  return (
    <points ref={pointsRef} position={[0, 0.68, 0]}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color="#4a5554"
        size={0.075}
        transparent
        opacity={0.48}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}

function SparkParticles() {
  const pointsRef = useRef();
  const materialRef = useRef();
  const positions = useMemo(
    () => createParticlePositions(14, 0.32, 0.24, 0.32, 97),
    [],
  );

  useFrame((state, delta) => {
    if (!pointsRef.current || !materialRef.current) return;
    materialRef.current.opacity =
      Math.sin(state.clock.elapsedTime * 13) > 0.45 ? 0.95 : 0.05;
    const attribute = pointsRef.current.geometry.attributes.position;
    for (let index = 0; index < attribute.count; index += 1) {
      let y = attribute.getY(index) - delta * (0.25 + (index % 4) * 0.04);
      if (y < -0.1) y = 0.25;
      attribute.setY(index, y);
    }
    attribute.needsUpdate = true;
  });

  return (
    <points ref={pointsRef} position={[0, 0.62, 0]}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        ref={materialRef}
        color="#ffb11b"
        size={0.024}
        transparent
        depthWrite={false}
      />
    </points>
  );
}

export default function Outpost({
  initialPosition,
  scale,
  onScaleChange,
  onPositionChange,
  onGrabChange,
}) {
  const placementRef = useRef();
  const coreMaterialRef = useRef();
  const ringRef = useRef();
  const repairStartedRef = useRef(0);
  const interactionRef = useRef(null);
  const xrInteractionRef = useRef(false);
  const pointerTargetRef = useRef(null);
  const movePlaneRef = useRef(new THREE.Plane());
  const scalePlaneRef = useRef(new THREE.Plane());
  const planePointRef = useRef(new THREE.Vector3());
  const grabOffsetRef = useRef(new THREE.Vector3());
  const centerWorldRef = useRef(new THREE.Vector3());
  const cameraDirectionRef = useRef(new THREE.Vector3());
  const scaleStartRef = useRef({ scale, distance: 1 });
  const camera = useThree((state) => state.camera);
  const [scaleHovered, setScaleHovered] = useState(false);
  const { status, acknowledged, repairPulse } = useBuildBridge();
  const failed = status === "FAILED";
  const warning = status === "WARNING";
  const smoking = (failed || warning) && !acknowledged;
  const targetColor = useMemo(
    () =>
      new THREE.Color(
        acknowledged ? "#f0aa3c" : failed ? "#7d171c" : warning ? "#c47a00" : "#168a65",
      ),
    [acknowledged, failed, warning],
  );

  useLayoutEffect(() => {
    placementRef.current.position.set(...initialPosition);
  }, [initialPosition]);

  useEffect(
    () => () => {
      if (interactionRef.current) onGrabChange(false);
    },
    [onGrabChange],
  );

  useEffect(() => {
    if (repairPulse) repairStartedRef.current = performance.now();
  }, [repairPulse]);

  useFrame((state, delta) => {
    if (ringRef.current) ringRef.current.rotation.y += delta * 0.55;
    if (!coreMaterialRef.current) return;
    coreMaterialRef.current.color.lerp(targetColor, Math.min(1, delta * 6));
    coreMaterialRef.current.emissive.copy(targetColor);
    const repairAnimationActive =
      acknowledged && performance.now() - repairStartedRef.current < 1600;
    const pulse =
      repairAnimationActive
        ? 1.35 + Math.sin(state.clock.elapsedTime * 10) * 0.55
        : failed
          ? 0.55 + Math.sin(state.clock.elapsedTime * 4) * 0.15
          : warning
            ? 0.45 + Math.sin(state.clock.elapsedTime * 2.5) * 0.12
            : 0.32 + Math.sin(state.clock.elapsedTime * 2) * 0.08;
    coreMaterialRef.current.emissiveIntensity = pulse;
  });

  const shellColor = acknowledged
    ? "#966224"
    : failed
      ? "#3f1519"
      : warning
        ? "#5c3c00"
        : "#173f38";

  function configureInteractionPlane(event, plane) {
    placementRef.current.getWorldPosition(centerWorldRef.current);
    camera.getWorldDirection(cameraDirectionRef.current);
    plane.setFromNormalAndCoplanarPoint(
      cameraDirectionRef.current,
      centerWorldRef.current,
    );
    return event.ray.intersectPlane(plane, planePointRef.current);
  }

  function beginMove(event) {
    event.stopPropagation();
    interactionRef.current = "move";
    xrInteractionRef.current = event.pointerType === "grab";
    pointerTargetRef.current = event.target;
    event.target.setPointerCapture(event.pointerId);
    onGrabChange(true);

    if (xrInteractionRef.current) {
      grabOffsetRef.current
        .copy(placementRef.current.position)
        .sub(event.point);
      return;
    }

    if (configureInteractionPlane(event, movePlaneRef.current)) {
      grabOffsetRef.current
        .copy(placementRef.current.position)
        .sub(planePointRef.current);
    }
  }

  function moveOutpost(event) {
    if (interactionRef.current !== "move") return;
    event.stopPropagation();
    const point = xrInteractionRef.current
      ? event.point
      : event.ray.intersectPlane(movePlaneRef.current, planePointRef.current)
        ? planePointRef.current
        : null;
    if (point) {
      placementRef.current.position.copy(point).add(grabOffsetRef.current);
    }
  }

  function beginScale(event) {
    event.stopPropagation();
    interactionRef.current = "scale";
    xrInteractionRef.current = event.pointerType === "grab";
    pointerTargetRef.current = event.target;
    event.target.setPointerCapture(event.pointerId);
    onGrabChange(true);
    placementRef.current.getWorldPosition(centerWorldRef.current);

    const point = xrInteractionRef.current
      ? event.point
      : configureInteractionPlane(event, scalePlaneRef.current)
        ? planePointRef.current
        : event.point;
    scaleStartRef.current = {
      scale,
      distance: Math.max(0.01, point.distanceTo(centerWorldRef.current)),
    };
  }

  function resizeOutpost(event) {
    if (interactionRef.current !== "scale") return;
    event.stopPropagation();
    const point = xrInteractionRef.current
      ? event.point
      : event.ray.intersectPlane(scalePlaneRef.current, planePointRef.current)
        ? planePointRef.current
        : null;
    if (!point) return;

    placementRef.current.getWorldPosition(centerWorldRef.current);
    const ratio =
      point.distanceTo(centerWorldRef.current) /
      scaleStartRef.current.distance;
    onScaleChange(
      THREE.MathUtils.clamp(
        scaleStartRef.current.scale * ratio,
        MIN_OUTPOST_SCALE,
        MAX_OUTPOST_SCALE,
      ),
    );
  }

  function finishInteraction(event) {
    if (!interactionRef.current) return;
    event.stopPropagation();
    const completedMove = interactionRef.current === "move";
    interactionRef.current = null;
    onGrabChange(false);
    if (completedMove) {
      onPositionChange(placementRef.current.position.toArray());
    }
    const target = pointerTargetRef.current;
    if (target?.hasPointerCapture(event.pointerId)) {
      target.releasePointerCapture(event.pointerId);
    }
    pointerTargetRef.current = null;
  }

  return (
    <group
      ref={placementRef}
      scale={scale}
      onPointerDown={beginMove}
      onPointerMove={moveOutpost}
      onPointerUp={finishInteraction}
      onPointerCancel={finishInteraction}
      onLostPointerCapture={finishInteraction}
      pointerEventsOrder={1}
    >
      <mesh castShadow receiveShadow position={[0, 0.08, 0]}>
        <cylinderGeometry args={[0.42, 0.48, 0.16, 8]} />
        <meshStandardMaterial color="#162526" metalness={0.85} roughness={0.28} />
      </mesh>

      <mesh castShadow position={[0, 0.34, 0]}>
        <cylinderGeometry args={[0.29, 0.35, 0.48, 8]} />
        <meshStandardMaterial
          ref={coreMaterialRef}
          color="#168a65"
          emissive="#168a65"
          emissiveIntensity={0.35}
          metalness={0.72}
          roughness={0.3}
        />
      </mesh>

      <mesh castShadow position={[0, 0.62, 0]}>
        <cylinderGeometry args={[0.22, 0.28, 0.12, 8]} />
        <meshStandardMaterial
          color={shellColor}
          metalness={0.8}
          roughness={0.26}
        />
      </mesh>

      <group ref={ringRef} position={[0, 0.56, 0]}>
        {[0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2].map((angle) => (
          <mesh
            key={angle}
            castShadow
            position={[Math.cos(angle) * 0.34, 0, Math.sin(angle) * 0.34]}
            rotation={[0, -angle, 0]}
          >
            <boxGeometry args={[0.17, 0.07, 0.09]} />
            <meshStandardMaterial
              color={failed ? "#8b2929" : warning ? "#8b6200" : "#2bb48c"}
              emissive={failed ? "#4b0808" : warning ? "#3d2a00" : "#0a5c44"}
              emissiveIntensity={0.7}
              metalness={0.6}
            />
          </mesh>
        ))}
      </group>

      <mesh castShadow position={[0, 0.82, 0]}>
        <cylinderGeometry args={[0.025, 0.04, 0.34, 8]} />
        <meshStandardMaterial color="#94a29f" metalness={0.9} roughness={0.22} />
      </mesh>
      <mesh position={[0, 1.01, 0]}>
        <sphereGeometry args={[0.065, 16, 12]} />
        <meshStandardMaterial
          color={failed ? "#ff3e38" : warning ? "#ffcc00" : "#71ffd0"}
          emissive={failed ? "#ff1810" : warning ? "#cc9900" : "#36ffbb"}
          emissiveIntensity={2}
        />
      </mesh>

      {smoking && (
        <>
          <SmokeParticles />
          {failed && <SparkParticles />}
        </>
      )}

      <group
        position={[0.58, 0.9, 0]}
        scale={1 / scale}
        onPointerDown={beginScale}
        onPointerMove={resizeOutpost}
        onPointerUp={finishInteraction}
        onPointerCancel={finishInteraction}
        onLostPointerCapture={finishInteraction}
        onPointerOver={(event) => {
          event.stopPropagation();
          setScaleHovered(true);
        }}
        onPointerOut={(event) => {
          event.stopPropagation();
          setScaleHovered(false);
        }}
        pointerEventsOrder={3}
      >
        <mesh>
          <sphereGeometry args={[scaleHovered ? 0.035 : 0.028, 18, 14]} />
          <meshStandardMaterial
            color="#72f6c1"
            emissive="#27dca0"
            emissiveIntensity={scaleHovered ? 2.4 : 1.4}
            transparent
            opacity={0.92}
          />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.052, 0.005, 8, 28]} />
          <meshBasicMaterial color="#baffea" transparent opacity={0.72} />
        </mesh>
      </group>
    </group>
  );
}
