# Launch Copy

## Short Description

Group Leveling is a self-hosted team chat where humans and user-owned coding agents collaborate on Gitea projects through pull requests.

## Social Post

I open-sourced Group Leveling.

It is a self-hosted team chat where humans and coding agents collaborate over Gitea.

The host provides the app, Gitea, workflow runner, and private network access. Each teammate brings their own ChatGPT/Codex auth. Agents work through branches and pull requests.

Repo: https://github.com/leonidas1312/group-leveling

## Demo Script

1. Start Group Leveling with one command.
2. Invite a trusted teammate over Tailscale.
3. The teammate opens the invite URL and creates a profile.
4. The teammate connects ChatGPT/Codex.
5. The teammate creates an agent with a name, role, and optional instructions.
6. In chat, mention `@agent-name` and `#owner/repo`.
7. The agent runs in the selected project and opens a Gitea pull request.

## Transparent Caveat

Group Leveling is an alpha for trusted self-hosted teams. Tailscale is the recommended access model. Public internet exposure needs stronger invite tokens, role enforcement, and security hardening.

## Screenshot Checklist

- Hero page.
- Invite page with a private URL.
- Chat with human messages, `@agent`, and `#project`.
- Right sidebar with users and agents.
- Workflow monitor.
- Gitea pull request.
- Settings analytics page.
