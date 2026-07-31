import crypto from "node:crypto";
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

const DEFAULT_REPO = "local/debug";
const buildStates = new Map([
  [DEFAULT_REPO, { status: "PASSED", buildUrl: "https://github.com/example/repo/actions/runs/123" }],
]);
let lastBroadcastRepo = DEFAULT_REPO;

const recentDeliveries = new Map();

function pruneOldDeliveries(now) {
  const cutoff = now - 5 * 60 * 1000;
  for (const [id, ts] of recentDeliveries) {
    if (ts < cutoff) recentDeliveries.delete(id);
  }
}

function verifyGithubSignature(secret, rawBody, header) {
  if (!header) return false;
  const eqIndex = header.indexOf("=");
  if (eqIndex < 0 || header.slice(0, eqIndex) !== "sha256") return false;
  const receivedHex = header.slice(eqIndex + 1);
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");
  let receivedBuf;
  try {
    receivedBuf = Buffer.from(receivedHex, "hex");
  } catch {
    return false;
  }
  if (receivedBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(receivedBuf, expectedBuf);
}

const PASSING_CONCLUSIONS = new Set(["success"]);
const FAILING_CONCLUSIONS = new Set(["failure", "timed_out", "startup_failure"]);

function mapWorkflowConclusion(conclusion) {
  if (PASSING_CONCLUSIONS.has(conclusion)) return "PASSED";
  if (FAILING_CONCLUSIONS.has(conclusion)) return "FAILED";
  if (conclusion) return "WARNING";
  return null;
}

function isRenovateBot(login) {
  return login === "renovate[bot]" ||
    (login.endsWith("[bot]") && login.toLowerCase().includes("renovate"));
}

function normalizeBuildState(payload) {
  const status = String(payload?.status || "").toUpperCase();
  if (status !== "PASSED" && status !== "WARNING" && status !== "FAILED") {
    throw new Error('status must be "PASSED", "WARNING", or "FAILED"');
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
function validateUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("url must be a valid URL");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("url must use http or https");
  }
  return parsed.toString();
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

function broadcastMessage(message) {
  const json = JSON.stringify(message);
  for (const client of socketServer.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(json);
  }
}

function broadcastBuildState(repo) {
  lastBroadcastRepo = repo;
  broadcastMessage({ type: "BUILD_STATE_CHANGE", ...buildStates.get(repo), repo });
}

socketServer.on("connection", (socket, request) => {
  socket.isAlive = true;
  console.log(`[ws] Quest client connected from ${request.socket.remoteAddress}`);
  socket.send(JSON.stringify({ type: "BUILD_STATE_CHANGE", ...buildStates.get(lastBroadcastRepo), repo: lastBroadcastRepo }));

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

    if (message.type === "TRIGGER_PC_ACTION") {
      const displayState = buildStates.get(lastBroadcastRepo);
      let target;
      try {
        target = normalizeBuildState({
          status: displayState.status,
          buildUrl: message.url,
        }).buildUrl;
      } catch (error) {
        socket.send(JSON.stringify({ type: "ERROR", message: error.message }));
        return;
      }

      if (!ALLOW_ARBITRARY_BUILD_URLS && target !== displayState.buildUrl) {
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
      return;
    }

    if (message.type === "TRIGGER_PR_DIFF" || message.type === "TRIGGER_SHIELD") {
      let target;
      try {
        target = validateUrl(message.url);
      } catch (error) {
        socket.send(JSON.stringify({ type: "ERROR", message: error.message }));
        return;
      }
      const label = message.type === "TRIGGER_PR_DIFF" ? "PR diff" : "security report";
      try {
        if (!DISABLE_PC_ACTIONS) await open(target, { wait: false });
        console.log(`[pc] Opened ${label}: ${target}`);
        socket.send(JSON.stringify({ type: "PC_ACTION_ACK", url: target }));
      } catch (error) {
        console.error(`[pc] Could not open ${label}:`, error);
        socket.send(
          JSON.stringify({
            type: "ERROR",
            message: "The desktop could not open the requested URL.",
          }),
        );
      }
      return;
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

// Mount before express.json() so express.raw() captures raw bytes for HMAC-SHA256 verification.
app.post("/api/webhook/github", express.raw({ type: "*/*" }), (request, response) => {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    return response.status(500).json({ ok: false, error: "GITHUB_WEBHOOK_SECRET is not configured" });
  }

  const signature = request.headers["x-hub-signature-256"];
  const deliveryId = request.headers["x-github-delivery"];
  const eventType = request.headers["x-github-event"];

  if (!verifyGithubSignature(secret, request.body, signature)) {
    return response.status(401).json({ ok: false, error: "Invalid signature" });
  }

  const now = Date.now();
  pruneOldDeliveries(now);
  if (deliveryId && recentDeliveries.has(deliveryId)) {
    return response.status(200).json({ ok: true, note: "Already processed" });
  }
  if (deliveryId) recentDeliveries.set(deliveryId, now);

  let payload;
  try {
    payload = JSON.parse(request.body.toString());
  } catch {
    return response.status(400).json({ ok: false, error: "Invalid JSON payload" });
  }

  const repo = payload.repository?.full_name || "unknown";

  if (eventType === "workflow_run") {
    if (payload.action !== "completed") {
      return response.status(200).json({ ok: true, note: "Event ignored" });
    }
    const status = mapWorkflowConclusion(payload.workflow_run?.conclusion);
    if (!status) {
      return response.status(200).json({ ok: true, note: "Event ignored" });
    }
    const buildUrl = payload.workflow_run?.html_url || "";
    let normalized;
    try {
      normalized = normalizeBuildState({ status, buildUrl });
    } catch (error) {
      return response.status(400).json({ ok: false, error: error.message });
    }
    buildStates.set(repo, normalized);
    broadcastBuildState(repo);
    console.log(`[github] ${repo} ${normalized.status} (${payload.workflow_run?.conclusion}) — ${deliveryId}`);
    return response.status(202).json({ ok: true, build: { ...normalized, repo } });
  }

  if (eventType === "pull_request") {
    const senderLogin = payload.sender?.login || "";
    if (!isRenovateBot(senderLogin)) {
      return response.status(200).json({ ok: true, note: "Event ignored" });
    }
    const prMessage = {
      type: "RENOVATE_PR",
      repo,
      prUrl: payload.pull_request?.html_url || "",
      updates: [],
    };
    broadcastMessage(prMessage);
    console.log(`[github] Renovate PR ${prMessage.prUrl} — ${deliveryId}`);
    return response.status(202).json({ ok: true });
  }

  return response.status(200).json({ ok: true, note: "Event ignored" });
});

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
    build: buildStates.get(lastBroadcastRepo),
    repos: buildStates.size,
  });
});

app.post("/api/webhook/build", (request, response) => {
  try {
    const normalized = normalizeBuildState(request.body);
    buildStates.set(DEFAULT_REPO, normalized);
    broadcastBuildState(DEFAULT_REPO);
    console.log(
      `[build] ${normalized.status} — ${normalized.buildUrl} (${socketServer.clients.size} clients)`,
    );
    response.status(202).json({ ok: true, build: normalized });
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
