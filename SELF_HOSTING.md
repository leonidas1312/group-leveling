# Self-Hosting Guide

This guide describes the host machine. In the standard deployment, one laptop, workstation, or small server runs:

- Group Leveling web app on port `3000`
- Gitea on port `3001`
- Codex workflow server on port `8787`
- File-backed Group Leveling state
- Per-user Codex profiles

Tailscale is the preferred network layer for a trusted team. The app stays on a private network while teammates connect from their own machines.

## Prerequisites

- Node.js 22 or newer
- npm
- Docker with Compose support
- Codex CLI available as `codex` on `PATH`
- Tailscale for private team access
- Gitea admin token for repository creation and pull requests

## Start The Host

```bash
npm install
npm run self-host
```

The self-host command starts Gitea, starts the Codex workflow server, starts the Next.js app, and writes runtime defaults to `.env.local`.

Open the printed Group Leveling URL.

## Start With Tailscale

Authenticate the host into your tailnet:

```bash
sudo tailscale up
```

Start Group Leveling on the Tailscale interface:

```bash
SOLO_LEVELING_NETWORK=tailscale npm run self-host
```

Preview the computed configuration:

```bash
SOLO_LEVELING_NETWORK=tailscale npm run self-host -- --print-config
```

In Tailscale mode the launcher reads the host Tailscale IPv4 address and sets:

```bash
SOLO_LEVELING_PUBLIC_URL=http://<tailscale-ip>:3000
PUBLIC_GITEA_BASE_URL=http://<tailscale-ip>:3001
SOLO_LEVELING_BIND_HOST=<tailscale-ip>
```

With MagicDNS or a custom private hostname:

```bash
SOLO_LEVELING_PUBLIC_URL=http://your-host.your-tailnet.ts.net:3000
PUBLIC_GITEA_BASE_URL=http://your-host.your-tailnet.ts.net:3001
SOLO_LEVELING_BIND_HOST=<tailscale-ip>
npm run self-host
```

## Environment

The current environment variable prefix remains `SOLO_LEVELING` for compatibility.

Use `.env.local` for persistent host configuration:

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

For LAN hosting, set the public URLs to the LAN address and bind the app to `0.0.0.0`:

```bash
SOLO_LEVELING_PUBLIC_URL=http://192.168.x.y:3000
PUBLIC_GITEA_BASE_URL=http://192.168.x.y:3001
SOLO_LEVELING_BIND_HOST=0.0.0.0
```

## Persistence

Group Leveling host data defaults to:

```text
~/.solo-leveling
```

This directory contains app state, workflow runs, and per-user Codex profiles.

Storage overrides:

```bash
SOLO_LEVELING_DATA_DIR=/path/to/group-leveling-data
SOLO_LEVELING_STATE_PATH=/path/to/state.json
CODEX_WORKFLOW_RUNS_DIR=/path/to/workflows
CODEX_USER_HOME_ROOT=/path/to/codex-users
```

Gitea data is stored through Docker Compose. Move the volume path with:

```bash
GITEA_DATA_PATH=/path/to/gitea-data npm run self-host
```

## ChatGPT And Codex Auth

Each teammate connects ChatGPT/Codex from:

```text
Settings -> ChatGPT connection
```

The workflow server launches Codex with the owning user's dedicated `CODEX_HOME`:

```text
agent.ownerUsername -> CODEX_USER_HOME_ROOT/<username> -> auth.json
```

The host provides compute and repositories. The teammate provides the Codex identity used by agents they own.

## Projects

Project creation is backed by Gitea. The app creates a repository and stores two URLs:

- `cloneUrl`: used by the workflow server for git operations.
- `webUrl`: shown to teammates in the browser.

In Tailscale mode, browser links should resolve through `PUBLIC_GITEA_BASE_URL`.

## Network Boundary

Recommended operating boundary:

- Use Tailscale or a trusted LAN for ports `3000` and `3001`.
- Keep the workflow server on `localhost:8787`.
- Share invite URLs that use the same address teammates can reach.
- Keep `.env.local`, `GITEA_TOKEN`, and Codex auth files on the host.
- Keep workflow output public-facing through the app and Gitea links.

Workflow summaries are sanitized before they reach chat, monitors, and pull request bodies. Host workflow paths are rewritten to Gitea URLs or repository-relative paths.

## Verification

Run code checks:

```bash
npm run build
npm run typecheck
node --check scripts/self-host.mjs
node --check scripts/invite.mjs
node --check scripts/codex-workflow-server.mjs
```

Check services from the host:

```bash
curl http://localhost:8787/health
curl http://localhost:3000/api/gitea/status
curl http://localhost:3000/api/solo-leveling/state
```

Check Tailscale URLs from a browser:

```text
http://<tailscale-ip>:3000
http://<tailscale-ip>:3001
```

Run the offline team smoke test against the running app:

```bash
GROUP_LEVELING_BASE_URL=http://<tailscale-ip>:3000 npm run smoke:offline-team
```

The smoke test creates temporary teammates, verifies accepted-member visibility, creates a shared chat, checks leave/delete permissions, verifies Codex auth separation, removes the smoke chat, and removes temporary Gitea users when a host token is available. Real teammates complete their own ChatGPT/Codex device login from their browser session.

## References

- Tailscale install: https://tailscale.com/kb/1017/install
- Tailscale CLI: https://tailscale.com/kb/1080/cli
- Tailscale machine sharing: https://tailscale.com/kb/1084/sharing
