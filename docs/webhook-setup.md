# Webhook Setup

This guide covers configuring live GitHub Actions webhook events for the Spatial
Developer Experience bridge server.

## GitHub webhook

### Required event types

Configure the webhook to send:

- **Workflow runs** — so `workflow_run` events update the Outpost build state.
- **Pull requests** — so Renovate dependency-update PRs trigger the Cog indicator.

### Webhook URL

```
https://<your-host>:<HTTP_PORT>/api/webhook/github
```

For local development with a tunnel, see [Local tunneling](#local-tunneling).

### Secret

Generate a random secret and keep it out of source control:

```bash
openssl rand -hex 32
```

Set it on the GitHub webhook configuration page (Settings → Webhooks → Secret)
and export it in your server environment:

```bash
export GITHUB_WEBHOOK_SECRET=<your-secret>
```

### Content type

Set the webhook content type to `application/json`.

---

## Local tunneling with ngrok

Install ngrok from <https://ngrok.com> and authenticate once with your account
token. Then, with the bridge server running on port 8081:

```bash
ngrok http 8081
```

Copy the forwarding URL (e.g. `https://abc123.ngrok-free.app`) and use it as
your GitHub webhook URL:

```
https://abc123.ngrok-free.app/api/webhook/github
```

**Never commit tunnel URLs or ngrok auth tokens to source control.**
Add `.env` to `.gitignore` and store the secret there during development:

```
GITHUB_WEBHOOK_SECRET=<your-secret>
```

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `GITHUB_WEBHOOK_SECRET` | Yes | HMAC-SHA256 signing secret configured on the GitHub webhook |
| `HTTP_PORT` | No (default 8081) | Port the HTTP webhook bridge listens on |
| `WS_PORT` | No (default 8080) | Port the WebSocket bridge listens on |
| `XR_HTTPS` | No | Set to `1` to enable HTTPS/WSS for Meta Quest |
| `DISABLE_PC_ACTIONS` | No | Set to `true` to suppress `open()` calls (useful in tests) |

---

## Testing delivery with curl

You can simulate a `workflow_run` completed event locally without a tunnel.
Replace `<secret>` with your `GITHUB_WEBHOOK_SECRET`:

```bash
BODY='{"action":"completed","workflow_run":{"conclusion":"failure","html_url":"https://github.com/owner/repo/actions/runs/1"},"repository":{"full_name":"owner/repo"}}'
SIG="sha256=$(echo -n "$BODY" | openssl dgst -sha256 -hmac '<secret>' | awk '{print $2}')"

curl -X POST http://localhost:8081/api/webhook/github \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: $SIG" \
  -H "X-GitHub-Event: workflow_run" \
  -H "X-GitHub-Delivery: $(uuidgen)" \
  -d "$BODY"
```

Expected response: `{"ok":true,"build":{"status":"FAILED","buildUrl":"...","repo":"owner/repo"}}`

---

## Troubleshooting

**401 Invalid signature** — The `GITHUB_WEBHOOK_SECRET` on the server does not
match the secret configured on the GitHub webhook. Regenerate and update both.

**500 GITHUB_WEBHOOK_SECRET is not configured** — The server was started without
the environment variable set. Export it and restart the bridge.

**200 Event ignored** — The event type or action is not handled (e.g. a
`workflow_run` with `action: "requested"`, or an unknown sender on a
`pull_request`). This is intentional; check the server console for a log line.

**No WebSocket broadcast after a valid 202** — The Quest client may not be
connected. Check `/api/health` for `websocketClients > 0`.
