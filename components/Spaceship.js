"use client";

import { useLayoutEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useBuildBridge } from "./BuildBridgeContext";

const LAUNCH_DURATION = 2.2;
const LAND_DURATION = 2.2;
const CRASH_DURATION = 1.6;
const ORBIT_SPEED = 0.9; // rad/s
const ORBIT_HEIGHT_AMP = 0.04;
const ORBIT_RADIUS_FACTOR = 2.4;

// Module-level temp objects — one Spaceship instance per scene
const _tangent = new THREE.Vector3();
const _upY = new THREE.Vector3(0, 1, 0);
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const _euler = new THREE.Euler();

function getOrbitRadius(ss) {
  return Math.max(0.2, ss * ORBIT_RADIUS_FACTOR);
}

function setDockPos(sp, ss, v) {
  v.set(sp[0] + ss * 0.48, sp[1] + ss * 0.82, sp[2]);
}

function setCrashPos(sp, ss, v) {
  v.set(sp[0] + ss * 0.15, sp[1] - ss * 0.05, sp[2] + ss * 0.42);
}

function setOrbitCenter(sp, ss, v) {
  v.set(sp[0], sp[1] + ss * 0.3, sp[2]);
}

function setOrbitPos(center, angle, radius, v) {
  v.set(
    center.x + Math.cos(angle) * radius,
    center.y + Math.sin(angle * 1.9) * ORBIT_HEIGHT_AMP,
    center.z + Math.sin(angle) * radius,
  );
}

// Aligns the ship's +Y axis (nose) with the orbit tangent and adds an inward bank.
function setOrbitOrientation(group, angle, bank) {
  _tangent.set(-Math.sin(angle), 0, Math.cos(angle));
  _q1.setFromUnitVectors(_upY, _tangent);
  _q2.setFromAxisAngle(_tangent, bank);
  group.quaternion.multiplyQuaternions(_q2, _q1);
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

export default function Spaceship({ stationPosition: sp, stationScale: ss }) {
  const groupRef = useRef();
  const glowMatRef = useRef();

  const { status, acknowledged } = useBuildBridge();

  const phaseRef = useRef("docked");
  const phaseTimeRef = useRef(0);
  const orbitAngleRef = useRef(Math.PI * 0.25);
  const prevStatusRef = useRef(null);
  const prevAckRef = useRef(false);
  const startPosRef = useRef(new THREE.Vector3());
  const startQuatRef = useRef(new THREE.Quaternion());

  const dockPos = useRef(new THREE.Vector3());
  const crashPos = useRef(new THREE.Vector3());
  const orbitCenter = useRef(new THREE.Vector3());
  const orbitPos = useRef(new THREE.Vector3());

  useLayoutEffect(() => {
    if (!groupRef.current) return;
    setDockPos(sp, ss, dockPos.current);
    setCrashPos(sp, ss, crashPos.current);
    setOrbitCenter(sp, ss, orbitCenter.current);

    if (status === "RUNNING") {
      phaseRef.current = "orbiting";
      const r = getOrbitRadius(ss);
      setOrbitPos(orbitCenter.current, orbitAngleRef.current, r, orbitPos.current);
      groupRef.current.position.copy(orbitPos.current);
      setOrbitOrientation(groupRef.current, orbitAngleRef.current, 0.28);
    } else if (status === "FAILED") {
      phaseRef.current = "crashed";
      groupRef.current.position.copy(crashPos.current);
      groupRef.current.rotation.set(1.2, 0.5, 2.1);
    } else {
      groupRef.current.position.copy(dockPos.current);
      groupRef.current.quaternion.identity();
    }
    prevStatusRef.current = status;
    prevAckRef.current = acknowledged;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((state, delta) => {
    const mesh = groupRef.current;
    if (!mesh) return;

    const radius = getOrbitRadius(ss);
    setDockPos(sp, ss, dockPos.current);
    setCrashPos(sp, ss, crashPos.current);
    setOrbitCenter(sp, ss, orbitCenter.current);

    // Status transition detection
    if (prevStatusRef.current !== status) {
      prevStatusRef.current = status;

      if (status === "RUNNING") {
        startPosRef.current.copy(mesh.position);
        startQuatRef.current.copy(mesh.quaternion);
        phaseRef.current = "launching";
        phaseTimeRef.current = 0;
      } else if (
        status === "PASSED" &&
        (phaseRef.current === "orbiting" || phaseRef.current === "launching")
      ) {
        startPosRef.current.copy(mesh.position);
        startQuatRef.current.copy(mesh.quaternion);
        phaseRef.current = "landing";
        phaseTimeRef.current = 0;
      } else if (status === "FAILED") {
        const phase = phaseRef.current;
        if (phase === "orbiting" || phase === "launching" || phase === "landing") {
          startPosRef.current.copy(mesh.position);
          startQuatRef.current.copy(mesh.quaternion);
          phaseRef.current = "crashing";
          phaseTimeRef.current = 0;
        } else if (phase === "docked" || phase === "landed") {
          // Failed with no preceding run — ship snaps to crashed
          phaseRef.current = "crashed";
          mesh.position.copy(crashPos.current);
          mesh.rotation.set(1.2, 0.5, 2.1);
        }
      }
    }

    // Rising-edge acknowledgement while crashed triggers repair return
    if (acknowledged && !prevAckRef.current && phaseRef.current === "crashed") {
      phaseRef.current = "docked";
      phaseTimeRef.current = 0;
    }
    prevAckRef.current = acknowledged;

    phaseTimeRef.current += delta;
    const t = phaseTimeRef.current;
    const phase = phaseRef.current;

    const glow = (on) => {
      if (!glowMatRef.current) return;
      glowMatRef.current.opacity = on ? 0.85 : 0;
      glowMatRef.current.emissiveIntensity = on
        ? 1.4 + Math.sin(state.clock.elapsedTime * 8) * 0.5
        : 0;
    };

    if (phase === "docked" || phase === "landed") {
      mesh.position.copy(dockPos.current);
      mesh.quaternion.identity();
      glow(false);
    } else if (phase === "crashed") {
      mesh.position.copy(crashPos.current);
      glow(false);
    } else if (phase === "orbiting") {
      orbitAngleRef.current += delta * ORBIT_SPEED;
      setOrbitPos(orbitCenter.current, orbitAngleRef.current, radius, orbitPos.current);
      mesh.position.copy(orbitPos.current);
      setOrbitOrientation(mesh, orbitAngleRef.current, 0.28);
      glow(true);
    } else if (phase === "launching") {
      const progress = Math.min(t / LAUNCH_DURATION, 1);
      const eased = easeInOut(progress);

      // Quadratic Bézier: dock → lift arc → orbit entry
      const entryAngle = orbitAngleRef.current + Math.PI * 0.5;
      setOrbitPos(orbitCenter.current, entryAngle, radius, _c);
      _b.set(
        (startPosRef.current.x + _c.x) * 0.5,
        startPosRef.current.y + ss * 1.8,
        (startPosRef.current.z + _c.z) * 0.5,
      );
      _a.lerpVectors(startPosRef.current, _b, eased);
      _d.lerpVectors(_b, _c, eased);
      mesh.position.lerpVectors(_a, _d, eased);
      setOrbitOrientation(mesh, entryAngle, 0.28 * eased);
      glow(progress > 0.2);

      if (progress >= 1) {
        orbitAngleRef.current = entryAngle;
        phaseRef.current = "orbiting";
        phaseTimeRef.current = 0;
      }
    } else if (phase === "landing") {
      const progress = Math.min(t / LAND_DURATION, 1);
      const eased = easeInOut(progress);

      mesh.position.lerpVectors(startPosRef.current, dockPos.current, eased);
      _q1.identity();
      mesh.quaternion.slerpQuaternions(startQuatRef.current, _q1, eased);
      glow(progress < 0.75);

      if (progress >= 1) {
        phaseRef.current = "landed";
        phaseTimeRef.current = 0;
      }
    } else if (phase === "crashing") {
      const progress = Math.min(t / CRASH_DURATION, 1);
      const accel = progress * progress; // ease-in: ship accelerates toward impact

      mesh.position.lerpVectors(startPosRef.current, crashPos.current, accel);
      _euler.set(progress * Math.PI * 1.8, progress * Math.PI * 2.5, progress * Math.PI * 0.9);
      _q1.setFromEuler(_euler);
      mesh.quaternion.copy(_q1);
      glow(false);

      if (progress >= 1) {
        phaseRef.current = "crashed";
        phaseTimeRef.current = 0;
      }
    }
  });

  return (
    <group ref={groupRef}>
      {/* Hull body — capsule along +Y, nose at top */}
      <mesh castShadow>
        <capsuleGeometry args={[0.013, 0.052, 4, 8]} />
        <meshStandardMaterial color="#c4d4cc" metalness={0.88} roughness={0.22} />
      </mesh>
      {/* Nose cone */}
      <mesh castShadow position={[0, 0.05, 0]}>
        <coneGeometry args={[0.013, 0.022, 8]} />
        <meshStandardMaterial color="#9ab4ae" metalness={0.9} roughness={0.18} />
      </mesh>
      {/* Port fin */}
      <mesh castShadow position={[-0.024, -0.016, 0.004]} rotation={[0.1, 0, 0.52]}>
        <boxGeometry args={[0.03, 0.014, 0.007]} />
        <meshStandardMaterial color="#7a9a94" metalness={0.85} roughness={0.3} />
      </mesh>
      {/* Starboard fin */}
      <mesh castShadow position={[0.024, -0.016, 0.004]} rotation={[-0.1, 0, -0.52]}>
        <boxGeometry args={[0.03, 0.014, 0.007]} />
        <meshStandardMaterial color="#7a9a94" metalness={0.85} roughness={0.3} />
      </mesh>
      {/* Engine bell */}
      <mesh position={[0, -0.0475, 0]}>
        <coneGeometry args={[0.011, 0.017, 8]} />
        <meshStandardMaterial color="#3e4e4c" metalness={0.95} roughness={0.15} />
      </mesh>
      {/* Engine exhaust glow — opacity driven in useFrame */}
      <mesh position={[0, -0.065, 0]}>
        <sphereGeometry args={[0.009, 8, 8]} />
        <meshStandardMaterial
          ref={glowMatRef}
          color="#48ffb0"
          emissive="#48ffb0"
          emissiveIntensity={0}
          transparent
          opacity={0}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
