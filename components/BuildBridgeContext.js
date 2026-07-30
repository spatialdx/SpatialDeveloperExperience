"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const FALLBACK_BUILD_URL =
  "https://github.com/example/repo/actions/runs/123";
const BuildBridgeContext = createContext(null);

function getWebSocketUrl() {
  if (process.env.NEXT_PUBLIC_WS_URL) {
    return process.env.NEXT_PUBLIC_WS_URL;
  }
  const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${scheme}//${window.location.hostname}:8080/socket`;
}

function getApiBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_API_URL ||
    `${window.location.protocol}//${window.location.hostname}:8081`
  );
}

export function BuildBridgeProvider({ children }) {
  const socketRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const [status, setStatus] = useState("PASSED");
  const [buildUrl, setBuildUrl] = useState(FALLBACK_BUILD_URL);
  const [connection, setConnection] = useState("connecting");
  const [acknowledged, setAcknowledged] = useState(false);
  const [repairPulse, setRepairPulse] = useState(0);
  const [lastError, setLastError] = useState("");
  const [renovatePR, setRenovatePR] = useState(null);

  useEffect(() => {
    let disposed = false;

    function connect() {
      if (disposed) return;
      setConnection("connecting");
      const socket = new WebSocket(getWebSocketUrl());
      socketRef.current = socket;

      socket.addEventListener("open", () => {
        setConnection("online");
        setLastError("");
      });

      socket.addEventListener("message", (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === "BUILD_STATE_CHANGE") {
            setStatus(message.status);
            setBuildUrl(message.buildUrl);
            setAcknowledged(false);
          } else if (message.type === "RENOVATE_PR") {
            setRenovatePR(message);
          } else if (message.type === "ERROR") {
            setLastError(message.message);
          }
        } catch {
          setLastError("The bridge sent an unreadable message.");
        }
      });

      socket.addEventListener("close", () => {
        if (socketRef.current === socket) socketRef.current = null;
        if (!disposed) {
          setConnection("offline");
          reconnectTimerRef.current = window.setTimeout(connect, 1800);
        }
      });

      socket.addEventListener("error", () => {
        setConnection("offline");
        setLastError("Desktop bridge is offline. Retrying…");
      });
    }

    connect();
    return () => {
      disposed = true;
      window.clearTimeout(reconnectTimerRef.current);
      socketRef.current?.close();
    };
  }, []);

  const send = useCallback((message) => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) {
      setLastError("Desktop bridge is not connected yet.");
      return false;
    }
    socketRef.current.send(JSON.stringify(message));
    return true;
  }, []);

  const setBuildState = useCallback(
    async (nextStatus) => {
      setLastError("");
      try {
        const response = await fetch(`${getApiBaseUrl()}/api/webhook/build`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: nextStatus, buildUrl }),
        });
        if (!response.ok) throw new Error("Webhook request failed");
      } catch {
        setLastError("Could not reach the local webhook bridge.");
      }
    },
    [buildUrl],
  );

  const triggerPcAction = useCallback(() => {
    return send({ type: "TRIGGER_PC_ACTION", url: buildUrl });
  }, [buildUrl, send]);

  const registerRepairHit = useCallback(() => {
    if (status !== "FAILED" || acknowledged) return false;
    if (!triggerPcAction()) return false;
    setAcknowledged(true);
    setRepairPulse((value) => value + 1);
    return true;
  }, [acknowledged, status, triggerPcAction]);

  const value = useMemo(
    () => ({
      status,
      buildUrl,
      connection,
      acknowledged,
      repairPulse,
      lastError,
      renovatePR,
      setBuildState,
      triggerPcAction,
      registerRepairHit,
    }),
    [
      status,
      buildUrl,
      connection,
      acknowledged,
      repairPulse,
      lastError,
      renovatePR,
      setBuildState,
      triggerPcAction,
      registerRepairHit,
    ],
  );

  return (
    <BuildBridgeContext.Provider value={value}>
      {children}
    </BuildBridgeContext.Provider>
  );
}

export function useBuildBridge() {
  const value = useContext(BuildBridgeContext);
  if (!value) {
    throw new Error("useBuildBridge must be used inside BuildBridgeProvider");
  }
  return value;
}
