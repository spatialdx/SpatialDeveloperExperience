"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

const startPosition = [0.58, 0.96, -1.18];
const worldPosition = new THREE.Vector3();
const padCenter = new THREE.Vector3();

export default function Wrench({ padPosition, padActivationRadius, onGrabChange, onPadHover, onDrop }) {
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
      groupRef.current.position.set(...startPosition);
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
    groupRef.current.position.set(...startPosition);
  }

  return (
    <group
      ref={groupRef}
      rotation={[0.18, 0, -0.7]}
      scale={0.72}
      onPointerDown={beginGrab}
      onPointerMove={moveGrab}
      onPointerUp={endGrab}
      onPointerCancel={cancelGrab}
      onLostPointerCapture={cancelGrab}
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
