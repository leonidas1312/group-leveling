# Invite Guide

This guide is for inviting teammates into a self-hosted Group Leveling workspace.

## Recommended Flow

1. Host starts Group Leveling.
2. Host verifies app and Gitea URLs are reachable.
3. Host invites teammates to the private network if using Tailscale.
4. Host sends the Group Leveling invite URL.
5. Each teammate creates or signs into their workspace profile.
6. Each teammate connects their own ChatGPT/Codex account.
7. Each teammate creates an agent.
8. The team tests one shared chat and one project workflow.

## Host: Generate Invite URL

From the host machine:

```bash
npm run invite -- --host your-name
```

For an explicit URL:

```bash
npm run invite -- --host your-name --url http://100.x.y.z:3000
```

For Tailscale mode:

```bash
SOLO_LEVELING_NETWORK=tailscale npm run invite -- --host your-name
```

The output should look like:

```text
http://100.x.y.z:3000/invite?host=your-name
```

Do not send an invite URL that starts with `http://localhost`. That only works on the host machine.

## Host: Invite Through Tailscale

Use one of these models:

- Same tailnet: invite your teammates to your Tailscale network.
- Machine sharing: share only the host machine with each teammate.

Machine sharing is the cleaner test setup because teammates can reach this one host without joining everything else in your tailnet.

Host checklist:

1. Install and authenticate Tailscale on the host.
2. Start Group Leveling in Tailscale mode:

```bash
SOLO_LEVELING_NETWORK=tailscale npm run self-host
```

3. Copy the printed invite URL.
4. In Tailscale admin, share the host machine or invite teammates to the tailnet.
5. Send teammates both the Tailscale invite/share and the Group Leveling invite URL.

## Teammate: Join

1. Install Tailscale.
2. Accept the tailnet invite or shared-machine invite.
3. Confirm the host is reachable:

```bash
tailscale status
```

4. Open the Group Leveling invite URL in a browser:

```text
http://100.x.y.z:3000/invite?host=your-name
```

5. Create or enter a workspace username.
6. Open the app.

## Teammate: Connect ChatGPT

Each teammate uses their own ChatGPT/Codex account.

1. Open the top-right user icon.
2. Open ChatGPT connection.
3. Click connect.
4. Open the displayed OpenAI device-auth URL.
5. Enter the code.
6. Return to Group Leveling and confirm the status is connected.

Agents owned by that teammate will run with that teammate's Codex profile on the host.

## Teammate: Create Agent

1. Click `+ New agent`.
2. Enter a name.
3. Enter a role.
4. Add instructions if needed.
5. Mention the agent in chat with `@agent-name`.

Casual chat should work without starting a workflow. Repository work should start only when the message asks for code/project work or mentions a project with `#owner/repo`.

## Team Test

Use this order:

1. Host creates a project.
2. Host creates a shared chat.
3. Host adds at least one teammate to the chat.
4. Teammate sends a plain message without mentioning an agent.
5. Teammate mentions another user with `@username`.
6. Teammate mentions an agent with a casual message.
7. Teammate asks the agent to work in a project:

```text
@agent-name update the README with setup instructions in #owner/repo
```

Expected result:

- Chat stays readable.
- Agent starts a workflow only for project/code work.
- Workflow monitor opens from the chat.
- Pull request link opens in Gitea through the Tailscale or public Gitea URL.
- No chat, monitor, or pull request text exposes host paths like `/home/.../.solo-leveling/workflows/...`.

## Troubleshooting

If teammates cannot open the invite:

- Check that the host app is running.
- Check that the URL does not use `localhost`.
- Check that Tailscale is connected on both machines.
- Check that the host was shared with the teammate or both users are in the same tailnet.
- Check that `SOLO_LEVELING_PUBLIC_URL` points to the same host the teammate can reach.

If Gitea links open on the host but not for teammates:

- Set `PUBLIC_GITEA_BASE_URL=http://<tailscale-ip>:3001`.
- Restart `npm run self-host`.
- Create a new workflow or reopen an existing workflow monitor.

If ChatGPT connection is missing:

- Each teammate must connect their own ChatGPT/Codex account.
- The host's ChatGPT auth is not reused for other users.
- The settings page should show `connected` for that teammate.

## References

- Tailscale install: https://tailscale.com/kb/1017/install
- Tailscale machine sharing: https://tailscale.com/kb/1084/sharing
