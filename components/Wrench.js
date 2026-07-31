"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useBuildBridge } from "./BuildBridgeContext";

const startPosition = [0.24, 0.86, -0.76];
const worldPosition = new THREE.Vector3();
const previousPosition = new THREE.Vector3(...startPosition);
const collisionCenter = new THREE.Vector3();
const outpostOffset = new THREE.Vector3(0, 0.42, 0);

export default function Wrench({
  outpostPosition,
  outpostScale,
  onGrabChange,
}) {
  const groupRef = useRef();
  const draggingRef = useRef(false);
  const xrGrabRef = useRef(false);
  const grabOffsetRef = useRef(new THREE.Vector3());
  const dragPlaneRef = useRef(new THREE.Plane());
  const planeIntersectionRef = useRef(new THREE.Vector3());
  const cameraDirectionRef = useRef(new THREE.Vector3());
  const lastCollisionRef = useRef(0);
  const camera = useThree((state) => state.camera);
  const { status, acknowledged, registerRepairHit } = useBuildBridge();

  // Set the initial position once instead of keeping it as a declarative prop.
  // This prevents unrelated React renders from restoring the start position.
  useLayoutEffect(() => {
    groupRef.current.position.set(...startPosition);
  }, []);

  useEffect(
    () => () => {
      if (draggingRef.current) onGrabChange(false);
    },
    [onGrabChange],
  );

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    groupRef.current.getWorldPosition(worldPosition);
    outpostOffset.set(0, 0.42 * outpostScale, 0);
    collisionCenter.set(...outpostPosition).add(outpostOffset);
    const speed =
      worldPosition.distanceTo(previousPosition) / Math.max(delta, 0.001);
    const distance = worldPosition.distanceTo(collisionCenter);
    const now = performance.now();

    if (
      status === "FAILED" &&
      !acknowledged &&
      distance < 0.06 + outpostScale * 0.5 &&
      speed > 0.12 &&
      now - lastCollisionRef.current > 1100
    ) {
      lastCollisionRef.current = now;
      registerRepairHit();
    }
    previousPosition.copy(worldPosition);
  });

  function beginGrab(event) {
    event.stopPropagation();
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
  }

  return (
    <group
      ref={groupRef}
      rotation={[0.18, 0, -0.7]}
      scale={0.22}
      onPointerDown={beginGrab}
      onPointerMove={moveGrab}
      onPointerUp={endGrab}
      onPointerCancel={endGrab}
      onLostPointerCapture={endGrab}
      pointerEventsOrder={2}
    >
      <mesh castShadow>
        <cylinderGeometry args={[0.055, 0.075, 0.72, 12]} />
        <meshStandardMaterial
          color="#b9c6c3"
          metalness={0.94}
          roughness={0.19}
        />
      </mesh>

      <mesh castShadow position={[0, 0.43, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.145, 0.055, 10, 22]} />
        <meshStandardMaterial color="#c7d2cf" metalness={0.95} roughness={0.17} />
      </mesh>

      <group position={[0, -0.44, 0]}>
        <mesh castShadow position={[-0.085, 0, 0]} rotation={[0, 0, -0.45]}>
          <boxGeometry args={[0.1, 0.27, 0.09]} />
          <meshStandardMaterial
            color="#c7d2cf"
            metalness={0.95}
            roughness={0.17}
          />
        </mesh>
        <mesh castShadow position={[0.085, 0, 0]} rotation={[0, 0, 0.45]}>
          <boxGeometry args={[0.1, 0.27, 0.09]} />
          <meshStandardMaterial
            color="#c7d2cf"
            metalness={0.95}
            roughness={0.17}
          />
        </mesh>
      </group>

      <mesh position={[0, 0, 0.055]}>
        <boxGeometry args={[0.045, 0.44, 0.014]} />
        <meshStandardMaterial
          color="#72f6c1"
          emissive="#1bb37e"
          emissiveIntensity={0.9}
        />
      </mesh>
    </group>
  );
}
