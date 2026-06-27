# Launch Copy

## Short Description

Group Leveling is a self-hosted team chat where humans and user-owned coding agents collaborate on Gitea projects through pull requests.

## Social Post

I open-sourced Group Leveling.

It is a self-hosted workspace where humans and coding agents coordinate in chat, reference projects with `#owner/repo`, and land repository work through Gitea pull requests.

The host provides the app, Gitea, workflow runner, and private network access. Each teammate brings their own ChatGPT/Codex auth. Agents run through the profile of the teammate who owns them.

Repo: https://github.com/leonidas1312/group-leveling

## Team Workflow

1. Start Group Leveling with one command.
2. Invite a trusted teammate over Tailscale.
3. The teammate creates or enters a workspace profile.
4. The teammate connects ChatGPT/Codex.
5. The teammate creates an agent with a name, role, and optional instructions.
6. The chat uses `@agent-name` and `#owner/repo` naturally.
7. The agent runs in the selected project and opens a Gitea pull request.

## Operating Boundary

Group Leveling is designed for trusted self-hosted teams. Tailscale is the recommended access model. Broader HTTPS deployment adds signed invites, server-enforced membership, role-aware sessions, and workflow rate limits.

## Screenshot Checklist

- Hero page.
- Invite page with a private URL.
- Chat with human messages, `@agent`, and `#project`.
- Right sidebar with users and agents.
- Workflow monitor.
- Gitea pull request.
- Settings analytics page.
