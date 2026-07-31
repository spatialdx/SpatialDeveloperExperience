"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";

const CHEVRON_ANGLES = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];

// hoverState: 'idle' | 'valid' | 'invalid'
export default function DockingPad({ position, hoverState = "idle" }) {
  const ringRef = useRef();
  const lightRef = useRef();

  useFrame(({ clock }) => {
    if (!ringRef.current || !lightRef.current) return;
    const t = clock.elapsedTime;
    if (hoverState === "valid") {
      ringRef.current.material.opacity = 0.3 + Math.sin(t * 5) * 0.2;
      lightRef.current.intensity = 0.9 + Math.sin(t * 5) * 0.3;
    } else {
      ringRef.current.material.opacity = 0.12;
      lightRef.current.intensity = hoverState === "invalid" ? 0.6 : 0.2;
    }
  });

  const padColor =
    hoverState === "valid"
      ? "#48ffb0"
      : hoverState === "invalid"
        ? "#ff5050"
        : "#3a7771";
  const lightColor =
    hoverState === "valid"
      ? "#48ffb0"
      : hoverState === "invalid"
        ? "#ff5050"
        : "#7bbfb8";

  return (
    <group position={position}>
      <mesh receiveShadow>
        <cylinderGeometry args={[0.28, 0.3, 0.04, 24]} />
        <meshStandardMaterial color={padColor} metalness={0.6} roughness={0.4} />
      </mesh>

      {/* Pulsing landing ring */}
      <mesh ref={ringRef} position={[0, 0.021, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.16, 0.27, 32]} />
        <meshStandardMaterial
          color={padColor}
          transparent
          opacity={0.12}
          depthWrite={false}
          side={2}
        />
      </mesh>

      {/* Invalid X indicator */}
      {hoverState === "invalid" && (
        <>
          <mesh position={[0, 0.022, 0]} rotation={[0, Math.PI / 4, 0]}>
            <boxGeometry args={[0.38, 0.014, 0.05]} />
            <meshStandardMaterial
              color="#ff5050"
              emissive="#cc0000"
              emissiveIntensity={0.7}
            />
          </mesh>
          <mesh position={[0, 0.022, 0]} rotation={[0, -Math.PI / 4, 0]}>
            <boxGeometry args={[0.38, 0.014, 0.05]} />
            <meshStandardMaterial
              color="#ff5050"
              emissive="#cc0000"
              emissiveIntensity={0.7}
            />
          </mesh>
        </>
      )}

      {/* Chevron shape markers at four compass points (non-color identity cue) */}
      {CHEVRON_ANGLES.map((angle) => {
        const r = 0.22;
        return (
          <group
            key={angle}
            position={[Math.sin(angle) * r, 0.03, Math.cos(angle) * r]}
            rotation={[0, -angle, 0]}
          >
            <mesh position={[-0.025, 0, 0]} rotation={[0, 0, Math.PI / 5]}>
              <boxGeometry args={[0.06, 0.016, 0.016]} />
              <meshStandardMaterial color="#c8ede8" metalness={0.7} roughness={0.3} />
            </mesh>
            <mesh position={[0.025, 0, 0]} rotation={[0, 0, -Math.PI / 5]}>
              <boxGeometry args={[0.06, 0.016, 0.016]} />
              <meshStandardMaterial color="#c8ede8" metalness={0.7} roughness={0.3} />
            </mesh>
          </group>
        );
      })}

      <pointLight ref={lightRef} color={lightColor} intensity={0.2} distance={1.4} decay={2} />
    </group>
  );
}
