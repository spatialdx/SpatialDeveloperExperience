import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";
import { WebSocket } from "ws";

const HTTP_PORT = 18081;
const WS_PORT = 18080;
let bridge;

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
