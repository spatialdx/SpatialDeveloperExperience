import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import test from "node:test";
import { WebSocket } from "ws";

const HTTP_PORT = 18081;
const WS_PORT = 18080;
const GH_SECRET = "test-secret";
let bridge;

function computeGithubSignature(secret, body) {
  return "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
}

async function githubWebhook(body, { eventType = "workflow_run", deliveryId, secret = GH_SECRET } = {}) {
  const bodyStr = JSON.stringify(body);
  return fetch(`http://127.0.0.1:${HTTP_PORT}/api/webhook/github`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Hub-Signature-256": computeGithubSignature(secret, bodyStr),
      "X-GitHub-Event": eventType,
      "X-GitHub-Delivery": deliveryId ?? crypto.randomUUID(),
    },
    body: bodyStr,
  });
}

const workflowRunPayload = (conclusion, action = "completed") => ({
  action,
  workflow_run: { conclusion, html_url: "https://github.com/owner/repo/actions/runs/1" },
  repository: { full_name: "owner/repo" },
});

const renovatePrPayload = () => ({
  action: "opened",
  pull_request: { html_url: "https://github.com/owner/repo/pull/1" },
  repository: { full_name: "owner/repo" },
  sender: { login: "renovate[bot]" },
});

function waitForBridge() {
  return new Promise((resolve, reject) => {
    const started = setTimeout(
      () => reject(new Error("Bridge did not start in time")),
      8_000,
    );
    bridge.stdout.on("data", (chunk) => {
      if (chunk.toString().includes("Webhook bridge listening")) {
        clearTimeout(started);
        resolve();
      }
    });
  });
}

test.before(async () => {
  bridge = spawn(process.execPath, ["server/index.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HTTP_PORT: String(HTTP_PORT),
      WS_PORT: String(WS_PORT),
      DISABLE_PC_ACTIONS: "true",
      GITHUB_WEBHOOK_SECRET: GH_SECRET,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await waitForBridge();
});

test.after(() => bridge.kill());

test("webhook broadcasts state and the PC action is acknowledged", async () => {
  const socket = new WebSocket(`ws://127.0.0.1:${WS_PORT}/socket`);
  const messages = [];
  socket.on("message", (data) => messages.push(JSON.parse(data.toString())));
  await new Promise((resolve) => socket.once("open", resolve));

  const buildUrl = "https://github.com/example/repo/actions/runs/456";
  const response = await fetch(
    `http://127.0.0.1:${HTTP_PORT}/api/webhook/build`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "FAILED", buildUrl }),
    },
  );
  assert.equal(response.status, 202);

  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.ok(
    messages.some(
      (message) =>
        message.type === "BUILD_STATE_CHANGE" &&
        message.status === "FAILED" &&
        message.buildUrl === buildUrl,
    ),
  );

  socket.send(JSON.stringify({ type: "TRIGGER_PC_ACTION", url: buildUrl }));
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.ok(messages.some((message) => message.type === "PC_ACTION_ACK"));
  socket.close();
});

test("webhook rejects invalid states and unsafe URL schemes", async () => {
  const response = await fetch(
    `http://127.0.0.1:${HTTP_PORT}/api/webhook/build`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "BROKEN", buildUrl: "file:///tmp/log" }),
    },
  );
  assert.equal(response.status, 400);
});

test("github webhook: valid signature + workflow_run success broadcasts PASSED", async () => {
  const socket = new WebSocket(`ws://127.0.0.1:${WS_PORT}/socket`);
  const messages = [];
  socket.on("message", (data) => messages.push(JSON.parse(data.toString())));
  await new Promise((resolve) => socket.once("open", resolve));

  const response = await githubWebhook(workflowRunPayload("success"));
  assert.equal(response.status, 202);

  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.ok(
    messages.some(
      (m) => m.type === "BUILD_STATE_CHANGE" && m.status === "PASSED" && m.repo === "owner/repo",
    ),
  );
  socket.close();
});

test("github webhook: invalid signature is rejected with 401", async () => {
  const response = await githubWebhook(workflowRunPayload("success"), { secret: "wrong-secret" });
  assert.equal(response.status, 401);
});

test("github webhook: missing GITHUB_WEBHOOK_SECRET returns 500", async () => {
  const bare = spawn(process.execPath, ["server/index.js"], {
    cwd: process.cwd(),
    env: { ...process.env, HTTP_PORT: "18083", WS_PORT: "18082", DISABLE_PC_ACTIONS: "true" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("Bridge did not start")), 8_000);
    bare.stdout.on("data", (chunk) => {
      if (chunk.toString().includes("Webhook bridge listening")) { clearTimeout(t); resolve(); }
    });
  });
  const body = JSON.stringify(workflowRunPayload("success"));
  const response = await fetch("http://127.0.0.1:18083/api/webhook/github", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Hub-Signature-256": "sha256=invalid",
      "X-GitHub-Event": "workflow_run",
      "X-GitHub-Delivery": crypto.randomUUID(),
    },
    body,
  });
  bare.kill();
  assert.equal(response.status, 500);
});

test("github webhook: workflow_run cancelled broadcasts WARNING", async () => {
  const socket = new WebSocket(`ws://127.0.0.1:${WS_PORT}/socket`);
  const messages = [];
  socket.on("message", (data) => messages.push(JSON.parse(data.toString())));
  await new Promise((resolve) => socket.once("open", resolve));

  const response = await githubWebhook(workflowRunPayload("cancelled"));
  assert.equal(response.status, 202);

  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.ok(messages.some((m) => m.type === "BUILD_STATE_CHANGE" && m.status === "WARNING"));
  socket.close();
});

test("github webhook: workflow_run action queued is silently accepted without broadcast", async () => {
  const socket = new WebSocket(`ws://127.0.0.1:${WS_PORT}/socket`);
  const messages = [];
  socket.on("message", (data) => messages.push(JSON.parse(data.toString())));
  await new Promise((resolve) => socket.once("open", resolve));
  await new Promise((resolve) => setTimeout(resolve, 40));
  messages.length = 0;

  const response = await githubWebhook(workflowRunPayload("success", "requested"));
  assert.equal(response.status, 200);

  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(messages.length, 0);
  socket.close();
});

test("github webhook: unrecognised event type is silently accepted", async () => {
  const response = await githubWebhook({}, { eventType: "ping" });
  assert.equal(response.status, 200);
});

test("github webhook: Renovate pull_request broadcasts RENOVATE_PR", async () => {
  const socket = new WebSocket(`ws://127.0.0.1:${WS_PORT}/socket`);
  const messages = [];
  socket.on("message", (data) => messages.push(JSON.parse(data.toString())));
  await new Promise((resolve) => socket.once("open", resolve));

  const response = await githubWebhook(renovatePrPayload(), { eventType: "pull_request" });
  assert.equal(response.status, 202);

  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.ok(
    messages.some(
      (m) =>
        m.type === "RENOVATE_PR" &&
        m.repo === "owner/repo" &&
        m.prUrl === "https://github.com/owner/repo/pull/1" &&
        Array.isArray(m.updates),
    ),
  );
  socket.close();
});

test("github webhook: duplicate delivery ID is idempotent", async () => {
  const socket = new WebSocket(`ws://127.0.0.1:${WS_PORT}/socket`);
  const messages = [];
  socket.on("message", (data) => messages.push(JSON.parse(data.toString())));
  await new Promise((resolve) => socket.once("open", resolve));
  await new Promise((resolve) => setTimeout(resolve, 40));
  messages.length = 0;

  const deliveryId = crypto.randomUUID();
  await githubWebhook(workflowRunPayload("success"), { deliveryId });
  await new Promise((resolve) => setTimeout(resolve, 40));
  const afterFirst = messages.filter((m) => m.type === "BUILD_STATE_CHANGE").length;

  const second = await githubWebhook(workflowRunPayload("failure"), { deliveryId });
  assert.equal(second.status, 200);
  await new Promise((resolve) => setTimeout(resolve, 80));
  const afterSecond = messages.filter((m) => m.type === "BUILD_STATE_CHANGE").length;
  assert.equal(afterFirst, afterSecond, "duplicate delivery must not produce a second broadcast");
  socket.close();
});
