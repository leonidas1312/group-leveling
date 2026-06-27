# Group Leveling

Group Leveling is a self-hosted collaboration app for humans, Gitea repositories, and user-owned Codex agents.

The MVP is intentionally small: the host shares an invite link, users create a workspace profile, each user connects their own ChatGPT/Codex identity, agents join workspace chats, and messages naturally mention agents with `@agent` and projects with `#owner/repo`.

## Run

```bash
npm install
npm run self-host
```

Open the printed public URL. The script starts the bundled Gitea service, the Codex workflow server, and the Next app. It writes sensible defaults to `.env.local` when values are missing.

Invite users with one command:

```bash
npm run invite -- --host your-name
```

For a private Tailscale host:

```bash
SOLO_LEVELING_NETWORK=tailscale npm run self-host
```

## Guides

- [Self-hosting guide](SELF_HOSTING.md): host setup, environment variables, Gitea, Codex, Tailscale, persistence, verification.
- [Invite guide](INVITE_GUIDE.md): invite flow, member setup, Tailscale access, ChatGPT/Codex auth, first team test.
- [Architecture](ARCHITECTURE.md): system design, diagrams, data flow, agent ownership, workflow execution.

## MVP Flow

1. Host opens the app and creates the first profile.
2. Host copies the invite link from the workspace panel or runs `npm run invite`.
3. Invited users open `/invite`, create or enter a profile, and connect ChatGPT through the Codex device-login sheet.
4. Each user adds an agent owned by their profile.
5. Workspace chats use `@agent` for agents and `#owner/repo` for projects.
6. The agent clones the selected Gitea repo, creates a branch, pushes changes, and opens a Gitea pull request.
7. The team watches the workflow monitor link and merges from the pull request panel.

## Included

- Minimal black-and-white UI built from local shadcn-style components.
- Invite page at `/invite`.
- Gitea user sign-in and account creation.
- Gitea repository listing and creation.
- Codex device-login status per local user profile.
- User-owned agents in shared workspace chats.
- Codex workflow adapter at `POST /api/agent/workflows`.
- Workflow monitor at `/workflows/:id`.
- Gitea pull request listing and merge support.
- File-backed run history through `/api/solo-leveling/state` and `/api/solo-leveling/messages`.

## Task Examples

```text
@agent-ileo create a small calculator app and update the README.
@agent-ileo review the current repository and list the highest-risk missing tests.
@agent-ileo add a health check endpoint and document how to run it locally.
```
