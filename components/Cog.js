"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useBuildBridge } from "./BuildBridgeContext";

const COG_POSITION = [0.72, 0.3, -1.4];
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

export default function Cog() {
  const groupRef = useRef();
  const { renovatePR } = useBuildBridge();

  useFrame((_, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * 0.9;
  });

  if (!renovatePR) return null;

  return (
    <group ref={groupRef} position={COG_POSITION}>
      <GearMesh color="#6ab0ff" />
      <pointLight color="#4488ff" intensity={0.6} distance={0.6} decay={2} />
    </group>
  );
}
