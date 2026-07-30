import express from "express";
import { WebSocket, WebSocketServer } from "ws";
import open from "open";
import { createServer as createHttpServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { readFile } from "node:fs/promises";
import path from "node:path";

const HTTP_PORT = Number(process.env.HTTP_PORT || 8081);
const WS_PORT = Number(process.env.WS_PORT || 8080);
const DISABLE_PC_ACTIONS = process.env.DISABLE_PC_ACTIONS === "true";
const ALLOW_ARBITRARY_BUILD_URLS =
  process.env.ALLOW_ARBITRARY_BUILD_URLS === "true";
const XR_HTTPS = process.env.XR_HTTPS === "1";

let currentBuild = {
  status: "PASSED",
  buildUrl: "https://github.com/example/repo/actions/runs/123",
};

function normalizeBuildState(payload) {
  const status = String(payload?.status || "").toUpperCase();
  if (status !== "PASSED" && status !== "FAILED") {
    throw new Error('status must be either "PASSED" or "FAILED"');
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(payload?.buildUrl);
  } catch {
    throw new Error("buildUrl must be a valid URL");
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("buildUrl must use http or https");
  }

  return { status, buildUrl: parsedUrl.toString() };
}

function buildStateMessage() {
  return JSON.stringify({ type: "BUILD_STATE_CHANGE", ...currentBuild });
}

async function loadTlsOptions() {
  if (!XR_HTTPS) return null;

  const certPath =
    process.env.TLS_CERT_PATH ||
    path.resolve("node_modules/.vite/basic-ssl/_cert.pem");
  const keyPath = process.env.TLS_KEY_PATH || certPath;

  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const [cert, key] = await Promise.all([
        readFile(certPath),
        readFile(keyPath),
      ]);
      return { cert, key };
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  throw new Error(
    `XR HTTPS certificate was not found at ${certPath}. Start the web process once or set TLS_CERT_PATH and TLS_KEY_PATH.`,
  );
}

const tlsOptions = await loadTlsOptions();
const socketTransport = tlsOptions
  ? createHttpsServer(tlsOptions)
  : createHttpServer();
const socketServer = new WebSocketServer({
  server: socketTransport,
  path: "/socket",
});

function broadcastBuildState() {
  const message = buildStateMessage();
  for (const client of socketServer.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(message);
  }
}

socketServer.on("connection", (socket, request) => {
  socket.isAlive = true;
  console.log(`[ws] Quest client connected from ${request.socket.remoteAddress}`);
  socket.send(buildStateMessage());

  socket.on("pong", () => {
    socket.isAlive = true;
  });

  socket.on("message", async (rawMessage) => {
    let message;
    try {
      message = JSON.parse(rawMessage.toString());
    } catch {
      socket.send(
        JSON.stringify({ type: "ERROR", message: "Message must be valid JSON." }),
      );
      return;
    }

    if (message.type !== "TRIGGER_PC_ACTION") return;

    let target;
    try {
      target = normalizeBuildState({
        status: currentBuild.status,
        buildUrl: message.url,
      }).buildUrl;
    } catch (error) {
      socket.send(JSON.stringify({ type: "ERROR", message: error.message }));
      return;
    }

    if (!ALLOW_ARBITRARY_BUILD_URLS && target !== currentBuild.buildUrl) {
      socket.send(
        JSON.stringify({
          type: "ERROR",
          message: "Requested URL does not match the active build.",
        }),
      );
      return;
    }

    try {
      if (!DISABLE_PC_ACTIONS) await open(target, { wait: false });
      console.log(`[pc] Opened build log: ${target}`);
      socket.send(JSON.stringify({ type: "PC_ACTION_ACK", url: target }));
    } catch (error) {
      console.error("[pc] Could not open build log:", error);
      socket.send(
        JSON.stringify({
          type: "ERROR",
          message: "The desktop could not open the build URL.",
        }),
      );
    }
  });

  socket.on("close", () => console.log("[ws] Quest client disconnected"));
});

const heartbeat = setInterval(() => {
  for (const socket of socketServer.clients) {
    if (socket.isAlive === false) {
      socket.terminate();
      continue;
    }
    socket.isAlive = false;
    socket.ping();
  }
}, 30_000);

const app = express();
app.use(express.json({ limit: "32kb" }));
app.use((request, response, next) => {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (request.method === "OPTIONS") return response.sendStatus(204);
  next();
});

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    websocketClients: socketServer.clients.size,
    build: currentBuild,
  });
});

app.post("/api/webhook/build", (request, response) => {
  try {
    currentBuild = normalizeBuildState(request.body);
    broadcastBuildState();
    console.log(
      `[build] ${currentBuild.status} — ${currentBuild.buildUrl} (${socketServer.clients.size} clients)`,
    );
    response.status(202).json({ ok: true, build: currentBuild });
  } catch (error) {
    response.status(400).json({ ok: false, error: error.message });
  }
});

const httpTransport = tlsOptions
  ? createHttpsServer(tlsOptions, app)
  : createHttpServer(app);

socketTransport.listen(WS_PORT, "0.0.0.0");
const httpServer = httpTransport.listen(HTTP_PORT, "0.0.0.0", () => {
  const httpProtocol = tlsOptions ? "https" : "http";
  const wsProtocol = tlsOptions ? "wss" : "ws";
  console.log(
    `[http] Webhook bridge listening on ${httpProtocol}://0.0.0.0:${HTTP_PORT}`,
  );
  console.log(
    `[ws] WebSocket bridge listening on ${wsProtocol}://0.0.0.0:${WS_PORT}/socket`,
  );
});

function shutdown() {
  clearInterval(heartbeat);
  for (const socket of socketServer.clients) socket.close(1001, "Server shutdown");
  socketServer.close(() => socketTransport.close());
  httpServer.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
