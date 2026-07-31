"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useBuildBridge } from "./BuildBridgeContext";

const COG_POSITION = [0.25, 0.82, -0.8];
// Module-level temp vectors; safe because only one Cog exists at a time.
const worldPosition = new THREE.Vector3();
const padCenter = new THREE.Vector3();
// Six tooth rectangles evenly spaced around the hub
const TOOTH_ANGLES = Array.from({ length: 6 }, (_, i) => (i * Math.PI) / 3);

function GearMesh({ color }) {
  return (
    <group>
      <mesh>
        <torusGeometry args={[0.072, 0.022, 8, 24]} />
        <meshStandardMaterial color={color} metalness={0.8} roughness={0.25} />
      </mesh>
      <mesh>
        <cylinderGeometry args={[0.038, 0.038, 0.028, 16]} />
        <meshStandardMaterial color={color} metalness={0.8} roughness={0.25} />
      </mesh>
      {TOOTH_ANGLES.map((angle) => (
        <mesh
          key={angle}
          position={[Math.cos(angle) * 0.086, 0, Math.sin(angle) * 0.086]}
          rotation={[0, -angle, 0]}
        >
          <boxGeometry args={[0.032, 0.028, 0.022]} />
          <meshStandardMaterial color={color} metalness={0.8} roughness={0.25} />
        </mesh>
      ))}
    </group>
  );
}

export default function Cog({
  padPosition,
  padActivationRadius,
  onGrabChange,
  onPadHover,
  onDrop,
}) {
  const groupRef = useRef();
  const draggingRef = useRef(false);
  const xrGrabRef = useRef(false);
  const grabOffsetRef = useRef(new THREE.Vector3());
  const dragPlaneRef = useRef(new THREE.Plane());
  const planeIntersectionRef = useRef(new THREE.Vector3());
  const cameraDirectionRef = useRef(new THREE.Vector3());
  const inRadiusRef = useRef(false);
  const droppedRef = useRef(false);
  const snapTargetRef = useRef(new THREE.Vector3());
  const camera = useThree((state) => state.camera);
  const { renovatePR } = useBuildBridge();

  // useLayoutEffect sets initial position; groupRef is always mounted (visible controls visibility).
  useLayoutEffect(() => {
    groupRef.current.position.set(...COG_POSITION);
  }, []);

  useEffect(
    () => () => {
      if (draggingRef.current) onGrabChange(false);
    },
    [onGrabChange],
  );

  useFrame((_, delta) => {
    if (!groupRef.current) return;

    if (droppedRef.current) {
      groupRef.current.position.lerp(snapTargetRef.current, 1 - Math.exp(-14 * delta));
      return;
    }

    if (!draggingRef.current) {
      groupRef.current.rotation.y += delta * 0.9;
      return;
    }

    groupRef.current.getWorldPosition(worldPosition);
    padCenter.set(...padPosition);
    const inRadius = worldPosition.distanceTo(padCenter) < padActivationRadius;
    if (inRadius !== inRadiusRef.current) {
      inRadiusRef.current = inRadius;
      onPadHover(inRadius);
    }
  });

  function beginGrab(event) {
    event.stopPropagation();
    droppedRef.current = false;
    inRadiusRef.current = false;
    draggingRef.current = true;
    xrGrabRef.current = event.pointerType === "grab";
    onGrabChange(true);
    event.target.setPointerCapture(event.pointerId);

    if (xrGrabRef.current) {
      grabOffsetRef.current.copy(groupRef.current.position).sub(event.point);
      return;
    }

    groupRef.current.getWorldPosition(worldPosition);
    camera.getWorldDirection(cameraDirectionRef.current);
    dragPlaneRef.current.setFromNormalAndCoplanarPoint(
      cameraDirectionRef.current,
      worldPosition,
    );
    if (
      event.ray.intersectPlane(
        dragPlaneRef.current,
        planeIntersectionRef.current,
      )
    ) {
      grabOffsetRef.current
        .copy(groupRef.current.position)
        .sub(planeIntersectionRef.current);
    }
  }

  function moveGrab(event) {
    if (!draggingRef.current) return;
    event.stopPropagation();

    if (xrGrabRef.current) {
      groupRef.current.position.copy(event.point).add(grabOffsetRef.current);
      return;
    }

    if (
      event.ray.intersectPlane(
        dragPlaneRef.current,
        planeIntersectionRef.current,
      )
    ) {
      groupRef.current.position
        .copy(planeIntersectionRef.current)
        .add(grabOffsetRef.current);
    }
  }

  function endGrab(event) {
    if (!draggingRef.current) return;
    event.stopPropagation();
    draggingRef.current = false;
    onGrabChange(false);
    if (event.target.hasPointerCapture(event.pointerId)) {
      event.target.releasePointerCapture(event.pointerId);
    }

    if (inRadiusRef.current) {
      droppedRef.current = true;
      snapTargetRef.current.set(padPosition[0], padPosition[1] + 0.12, padPosition[2]);
      inRadiusRef.current = false;
      onPadHover(false);
      onDrop(true);
    } else {
      groupRef.current.position.set(...COG_POSITION);
      onPadHover(false);
      onDrop(false);
    }
  }

  function cancelGrab() {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    onGrabChange(false);
    inRadiusRef.current = false;
    onPadHover(false);
    groupRef.current.position.set(...COG_POSITION);
  }

  return (
    <group
      ref={groupRef}
      visible={!!renovatePR}
      scale={0.55}
      onPointerDown={beginGrab}
      onPointerMove={moveGrab}
      onPointerUp={endGrab}
      onPointerCancel={cancelGrab}
      onLostPointerCapture={cancelGrab}
      pointerEventsOrder={2}
    >
      <GearMesh color="#6ab0ff" />
      <pointLight color="#4488ff" intensity={0.6} distance={0.6} decay={2} />
    </group>
  );
}
