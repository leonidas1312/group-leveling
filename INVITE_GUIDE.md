# Invite Guide

This guide covers teammate onboarding for a self-hosted Group Leveling workspace.

## Flow

1. Start Group Leveling on the host.
2. Confirm the app and Gitea URLs use an address teammates can reach.
3. Give teammates Tailscale access to the host machine or tailnet.
4. Send the Group Leveling invite URL.
5. Teammates create or sign into a workspace profile.
6. Teammates connect their own ChatGPT/Codex account.
7. Teammates create agents they own.
8. The team runs one shared chat and one Gitea pull request workflow.

## Generate Invite URL

From the host:

```bash
npm run invite -- --host your-name
```

With an explicit app URL:

```bash
npm run invite -- --host your-name --url http://100.x.y.z:3000
```

In Tailscale mode:

```bash
SOLO_LEVELING_NETWORK=tailscale npm run invite -- --host your-name
```

Expected shape:

```text
http://100.x.y.z:3000/invite?host=your-name
```

Use the same host address teammates use in their browser. For Tailscale, this is the Tailscale IP or MagicDNS hostname.

## Invite Through Tailscale

Choose one Tailscale access model:

- Same tailnet: teammates join the host's tailnet.
- Machine sharing: teammates receive access to only the host machine.

Machine sharing is a focused first-team setup because teammates reach the Group Leveling host without inheriting access to the rest of the tailnet.

Host checklist:

1. Install Tailscale.
2. Authenticate the host:

```bash
sudo tailscale up
```

3. Start Group Leveling:

```bash
SOLO_LEVELING_NETWORK=tailscale npm run self-host
```

4. Copy the printed invite URL.
5. Share the host machine or invite teammates to the tailnet.
6. Send teammates both the Tailscale invite/share and the Group Leveling invite URL.

## Teammate Join

1. Install Tailscale.
2. Accept the tailnet or shared-machine invite.
3. Confirm the host appears:

```bash
tailscale status
```

4. Open the Group Leveling invite URL:

```text
http://100.x.y.z:3000/invite?host=your-name
```

5. Create or enter a workspace username.
6. Open the app.

## Connect ChatGPT/Codex

Each teammate connects their own ChatGPT/Codex account.

1. Open the top-right user icon.
2. Open ChatGPT connection.
3. Start the connection.
4. Open the displayed OpenAI device-auth URL.
5. Enter the code.
6. Return to Group Leveling and confirm the connected state.

Agents owned by that teammate run with that teammate's Codex profile on the host.

## Create Agent

1. Click `+ New agent`.
2. Enter a name.
3. Enter a role.
4. Add instructions when useful.
5. Mention the agent in chat with `@agent-name`.

Agents can answer conversationally in chat. Repository workflows start when a message asks for code/project work or references a project with `#owner/repo`.

## Team Test

Use this sequence for the first team check:

1. Host creates a project.
2. Host creates a shared chat.
3. Host adds a teammate to the chat.
4. Teammate sends a plain message.
5. Teammate mentions another user with `@username`.
6. Teammate mentions an agent with a conversational message.
7. Teammate asks an agent to work in a project:

```text
@agent-name update the README with setup instructions in #owner/repo
```

Expected result:

- Chat stays readable.
- Mentions render with distinct styling.
- The workflow monitor opens from the chat.
- The pull request opens in Gitea through the Tailscale or LAN URL.
- Workflow output uses Gitea links and repository-relative paths.

## Checks

Invite reachability:

- Host app is running.
- Invite URL uses the host's Tailscale or LAN address.
- Tailscale is connected on host and teammate machines.
- The host machine is shared or both users are in the same tailnet.
- `SOLO_LEVELING_PUBLIC_URL` matches the reachable app URL.

Gitea link reachability:

- `PUBLIC_GITEA_BASE_URL=http://<tailscale-ip>:3001`
- Group Leveling restarted after URL changes.
- New workflows and project links use the same public Gitea base URL.

ChatGPT/Codex status:

- Each teammate connects ChatGPT/Codex from their own browser session.
- Agent ownership maps to that teammate's Codex profile.
- Settings shows the connected state for that teammate.

## References

- Tailscale install: https://tailscale.com/kb/1017/install
- Tailscale machine sharing: https://tailscale.com/kb/1084/sharing
