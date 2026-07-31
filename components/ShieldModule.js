"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

const START_POSITION = [-0.55, 0.85, -0.5];
// Module-level temp vectors; safe because only one ShieldModule exists at a time.
const worldPosition = new THREE.Vector3();
const padCenter = new THREE.Vector3();

function ShieldMesh() {
  return (
    <group>
      {/* Main shield body */}
      <mesh castShadow>
        <boxGeometry args={[0.16, 0.16, 0.045]} />
        <meshStandardMaterial color="#b06eff" metalness={0.75} roughness={0.25} />
      </mesh>
      {/* Diamond point at the bottom */}
      <mesh castShadow position={[0, -0.13, 0]} rotation={[Math.PI, 0, Math.PI / 4]}>
        <coneGeometry args={[0.09, 0.1, 4]} />
        <meshStandardMaterial color="#b06eff" metalness={0.75} roughness={0.25} />
      </mesh>
      {/* Inner accent stripe */}
      <mesh position={[0, 0, 0.024]}>
        <boxGeometry args={[0.07, 0.12, 0.006]} />
        <meshStandardMaterial
          color="#d4a8ff"
          emissive="#9944ff"
          emissiveIntensity={0.6}
        />
      </mesh>
      <pointLight color="#9944ff" intensity={0.5} distance={0.5} decay={2} />
    </group>
  );
}

export default function ShieldModule({
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

  useLayoutEffect(() => {
    groupRef.current.position.set(...START_POSITION);
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

    if (!draggingRef.current) return;

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
      groupRef.current.position.set(...START_POSITION);
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
    groupRef.current.position.set(...START_POSITION);
  }

  return (
    <group
      ref={groupRef}
      onPointerDown={beginGrab}
      onPointerMove={moveGrab}
      onPointerUp={endGrab}
      onPointerCancel={cancelGrab}
      onLostPointerCapture={cancelGrab}
      pointerEventsOrder={2}
    >
      <ShieldMesh />
    </group>
  );
}
