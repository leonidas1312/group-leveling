# Self-Hosting Guide

This guide is for the host machine. In the normal setup, your laptop or workstation runs:

- Group Leveling web app on port `3000`
- Gitea on port `3001`
- Local Codex workflow server on port `8787`

The recommended private setup is Tailscale. It keeps the app off the public internet while still letting invited teammates reach your host from another network.

## Prerequisites

- Node.js 22 or newer
- npm
- Docker with Compose support
- Codex CLI available as `codex` on `PATH`
- Optional but recommended: Tailscale
- A Gitea admin token for real project creation and pull requests

## One-Command Local Start

```bash
npm install
npm run self-host
```

The self-host command starts Gitea, starts the Codex workflow server, starts the Next app, and writes missing defaults to `.env.local`.

Open the printed `Group Leveling public URL`.

## One-Command Tailscale Start

1. Install Tailscale on the host.
2. Authenticate the host into your tailnet:

```bash
sudo tailscale up
```

3. Start Group Leveling in Tailscale mode:

```bash
SOLO_LEVELING_NETWORK=tailscale npm run self-host
```

To preview the computed Tailscale config without starting services:

```bash
SOLO_LEVELING_NETWORK=tailscale npm run self-host -- --print-config
```

In Tailscale mode, the script uses `tailscale ip -4` to find the host's Tailscale IPv4 address. It then sets:

```bash
SOLO_LEVELING_PUBLIC_URL=http://<tailscale-ip>:3000
PUBLIC_GITEA_BASE_URL=http://<tailscale-ip>:3001
SOLO_LEVELING_BIND_HOST=<tailscale-ip>
```

That means the app and Gitea bind to the Tailscale interface instead of all network interfaces.

If you prefer a MagicDNS hostname or custom domain, set the URLs yourself:

```bash
SOLO_LEVELING_PUBLIC_URL=http://your-host.your-tailnet.ts.net:3000
PUBLIC_GITEA_BASE_URL=http://your-host.your-tailnet.ts.net:3001
SOLO_LEVELING_BIND_HOST=<tailscale-ip>
npm run self-host
```

## Environment

Create or edit `.env.local` for persistent configuration:

```bash
SOLO_LEVELING_NETWORK=tailscale
SOLO_LEVELING_PUBLIC_URL=http://100.x.y.z:3000
SOLO_LEVELING_BIND_HOST=100.x.y.z
SOLO_LEVELING_DATA_DIR=/home/you/.solo-leveling

GITEA_BASE_URL=http://100.x.y.z:3001
PUBLIC_GITEA_BASE_URL=http://100.x.y.z:3001
GITEA_TOKEN=your-gitea-token
GITEA_DEFAULT_OWNER=your-gitea-username-or-org

CODEX_SERVER_URL=http://localhost:8787
```

For LAN-only testing, use your LAN IP instead of the Tailscale IP and set `SOLO_LEVELING_BIND_HOST=0.0.0.0`.

## Persistence

Group Leveling host data defaults to:

```text
~/.solo-leveling
```

This includes app state, workflow runs, and fresh per-user Codex profiles. You can override storage with:

```bash
SOLO_LEVELING_DATA_DIR=/path/to/solo-leveling-data
SOLO_LEVELING_STATE_PATH=/path/to/state.json
CODEX_WORKFLOW_RUNS_DIR=/path/to/workflows
CODEX_USER_HOME_ROOT=/path/to/codex-users
```

Gitea data defaults to `../gitea-data` through Docker Compose. Move it with:

```bash
GITEA_DATA_PATH=/path/to/gitea-data npm run self-host
```

## Per-User ChatGPT/Codex Auth

Each workspace user connects their own ChatGPT/Codex account from:

```text
Settings -> ChatGPT connection
```

The workflow server launches Codex with that user's dedicated `CODEX_HOME`, so agents owned by different users do not share the host's ChatGPT auth.

## Project Creation

Project creation uses Gitea. For real repositories, `GITEA_TOKEN` and `GITEA_DEFAULT_OWNER` must be set.

The host can create a project from the app. The app creates a Gitea repository and stores both:

- `cloneUrl`: used internally by the workflow server
- `webUrl`: shown to users and opened in the browser

In Tailscale mode, browser links should point at `PUBLIC_GITEA_BASE_URL`, not `localhost`.

## Security Model

- Treat the host machine as shared infrastructure for trusted teammates.
- Prefer Tailscale for private testing.
- Do not expose ports `3000`, `3001`, or `8787` directly to the public internet.
- Never send invite links that point at `localhost`.
- Do not paste `GITEA_TOKEN`, `.env.local`, or Codex auth files into chat.
- Workflow summaries are sanitized before they reach chat, monitors, or pull request bodies. Host paths under `.solo-leveling/workflows` are rewritten to public Gitea URLs or repo-relative paths.

## Verification

Run checks before inviting a team:

```bash
npm run build
npm run typecheck
node --check scripts/self-host.mjs
node --check scripts/invite.mjs
node --check scripts/codex-workflow-server.mjs
```

Check services:

```bash
curl http://localhost:8787/health
curl http://localhost:3000/api/gitea/status
curl http://localhost:3000/api/solo-leveling/state
```

In Tailscale mode, also test from another device in the tailnet:

```text
http://<tailscale-ip>:3000
http://<tailscale-ip>:3001
```

If teammates are not online yet, run the offline team smoke test against the running app:

```bash
GROUP_LEVELING_BASE_URL=http://<tailscale-ip>:3000 npm run smoke:offline-team
```

This creates temporary test teammates, verifies accepted-member visibility, creates a shared chat, checks leave/delete permissions, verifies new teammates do not inherit the host's Codex auth, deletes the smoke chat, and removes the temporary Gitea users when a host token is available. It does not complete real ChatGPT device login for those teammates; each real teammate still needs to connect ChatGPT/Codex in their own browser session.

## References

- Tailscale install: https://tailscale.com/kb/1017/install
- Tailscale CLI: https://tailscale.com/kb/1080/cli
- Tailscale machine sharing: https://tailscale.com/kb/1084/sharing
