"use client";

import { useState, useSyncExternalStore } from "react";
import { useBuildBridge } from "./BuildBridgeContext";
import { xrStore } from "./Scene";

export default function DebugOverlay() {
  const {
    status,
    connection,
    acknowledged,
    lastError,
    setBuildState,
    triggerPcAction,
    registerRepairHit,
  } = useBuildBridge();
  const mode = useSyncExternalStore(
    xrStore.subscribe,
    () => xrStore.getState().mode,
    () => null,
  );
  const [xrError, setXrError] = useState("");
  const displayedStatus =
    status === "FAILED" && acknowledged ? "ACTION SENT" : status;

  async function enterAR() {
    setXrError("");
    try {
      const session = await xrStore.enterAR();
      if (!session) {
        setXrError("AR was not started. Use Quest Browser over HTTPS.");
      }
    } catch {
      setXrError("AR was not started. Use Quest Browser over HTTPS.");
    }
  }

  return (
    <aside className="debug-panel" aria-label="Desktop debug controls">
      <div className="panel-header">
        <p className="panel-title">Bridge control</p>
        <span className={`connection ${connection}`}>
          {connection === "online" ? "Bridge online" : "Bridge offline"}
        </span>
      </div>

      <div className="status-row">
        <div className="status-copy">
          <span>Pipeline state</span>
          <strong
            className={
              acknowledged ? "repaired" : status === "FAILED" ? "failed" : "passed"
            }
          >
            {displayedStatus}
          </strong>
        </div>
        <span className="mode-chip">{mode ? "XR session" : "Desktop mode"}</span>
      </div>

      <div className="button-grid">
        <button className="panel-button xr" onClick={enterAR}>
          Enter Passthrough AR
        </button>
        <button
          className="panel-button danger"
          onClick={() => setBuildState("FAILED")}
        >
          Simulate Build Failure
        </button>
        <button
          className="panel-button"
          disabled={status !== "FAILED"}
          onClick={() => {
            if (!registerRepairHit()) triggerPcAction();
          }}
        >
          Simulate Wrench Hit
        </button>
        <button
          className="panel-button"
          onClick={() => setBuildState("PASSED")}
        >
          Reset Build
        </button>
      </div>

      <div className="panel-footer">
        <span>Grab either prop to place it. Pull the cyan orb to resize.</span>
        <span>Empty space: orbit · Wheel: zoom</span>
      </div>

      {(lastError || xrError) && (
        <p className="error-copy" role="status">
          {lastError || xrError}
        </p>
      )}
    </aside>
  );
}
