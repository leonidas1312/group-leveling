# Dissemination Strategy

Group Leveling is early, technical, and open source. The dissemination strategy should optimize for the right first users, not maximum noise. The first audience should be self-hosters, small engineering teams, AI tooling builders, and people already comfortable with Gitea, Tailscale, and Codex-style workflows.

## Positioning

One-line positioning:

```text
Group Leveling is a self-hosted team chat where humans and user-owned coding agents collaborate on Gitea projects through pull requests.
```

Short pitch:

```text
Group Leveling lets a team self-host the collaboration layer for humans and coding agents. The host provides the app, Gitea, workflow runner, and Tailscale access. Each teammate brings their own ChatGPT/Codex auth and creates agents they own. Chat stays natural with @ mentions for humans/agents and # mentions for projects, while repository work happens through Gitea pull requests.
```

What makes it different:

- Host-owned infrastructure, user-owned ChatGPT/Codex auth.
- Private-first sharing through Tailscale.
- Chat and projects are decoupled.
- Agent work goes through branches and pull requests.
- Designed for small trusted teams, not public multi-tenant SaaS.

What not to claim yet:

- Do not call it production secure for public internet exposure.
- Do not imply agents are sandboxed beyond the current local workflow isolation.
- Do not imply invite links are strong auth. Tailscale is the current access boundary.

## Target Audiences

Primary:

- Self-hosting community: wants control, local infra, and private networks.
- Small developer teams: want agent collaboration without central SaaS workspace lock-in.
- AI/devtool builders: interested in human-agent workflows and repo automation.
- Gitea users: already prefer lightweight self-hosted Git.
- Tailscale users: understand private machine sharing and trusted networks.

Secondary:

- Indie hackers building internal tools.
- Open-source maintainers experimenting with agents.
- University labs and hackathon teams.
- Privacy-conscious users who still want AI-assisted coding workflows.

## Launch Readiness Checklist

Must have before broad posting:

- README with one-command self-host path.
- `SELF_HOSTING.md`, `INVITE_GUIDE.md`, and `ARCHITECTURE.md`.
- MIT `LICENSE`.
- Clear warning that public internet exposure is not recommended yet.
- Screenshots or a short GIF showing chat, mentions, settings, workflow monitor, and Gitea PR.
- One clean demo flow:
  1. Host starts with Tailscale.
  2. User joins by invite.
  3. User connects ChatGPT/Codex.
  4. User creates an agent.
  5. Agent opens a Gitea PR.
- GitHub topics configured.
- First issues created for known hardening work.

Should have soon:

- `SECURITY.md`.
- `CONTRIBUTING.md`.
- Issue templates.
- Roadmap section in README.
- A short architecture diagram image for social posts.
- A release tag, for example `v0.1.0-alpha`.

## GitHub Setup

Recommended repository metadata:

- Description: `Self-hosted team chat for humans and user-owned coding agents`
- Website: leave empty or point to the GitHub repo until there is a proper landing page.
- Topics:
  - `self-hosted`
  - `agents`
  - `coding-agents`
  - `gitea`
  - `tailscale`
  - `nextjs`
  - `codex`
  - `developer-tools`
  - `open-source`
  - `team-chat`

GitHub topics help repository discovery by connecting the project to related subjects. GitHub’s own docs recommend topics for communicating a repo’s purpose and helping people find it.

Pin these sections near the top of README:

- What it is
- Why it exists
- Quick start
- Tailscale invite flow
- Current security model
- Architecture
- Roadmap

## First 48 Hours

Goal: collect high-quality feedback from trusted technical users.

Actions:

1. Invite 3-5 trusted teammates through Tailscale.
2. Ask each person to perform the full flow:
   - join invite
   - connect ChatGPT/Codex
   - create agent
   - join a chat
   - reference a project
   - trigger one workflow
3. Record every failure point as a GitHub issue.
4. Fix onboarding blockers before posting publicly.
5. Add screenshots/GIFs from the working flow.

Success criteria:

- At least 3 successful teammate joins.
- At least 2 users connect their own ChatGPT/Codex auth.
- At least 1 user-owned agent opens a Gitea PR.
- No localhost links leak into invite, chat, workflow monitor, or PR output.
- Docs are clear enough that a teammate can join without a live walkthrough.

## Week 1 Launch Sequence

Day 1-2: private alpha

- Test with friends over Tailscale.
- Fix install and invite friction.
- Create issues for known limitations instead of hiding them.

Day 3: GitHub polish

- Add screenshots and/or short demo GIF.
- Add `SECURITY.md` and `CONTRIBUTING.md`.
- Add GitHub topics.
- Create `v0.1.0-alpha` release.

Day 4-5: soft public launch

- Post to a small circle first: personal network, relevant Discord/Slack groups, Tailscale/Gitea/self-hosting friends.
- Ask for setup feedback, not stars.
- Keep the message technical and specific.

Day 6-7: broader technical posts

- Post to `r/selfhosted` only if docs are complete and the app is genuinely runnable.
- Submit a `Show HN` only if the repo is easy to try and the post explains the technical design.
- Consider Product Hunt later, after screenshots/video and a smoother onboarding story exist.

## Channel Strategy

### GitHub

Purpose: source of truth, credibility, issues, stars, contributors.

Post format:

```text
Group Leveling: self-hosted team chat for humans and user-owned coding agents

Host the infra yourself, invite teammates over Tailscale, let each user connect their own ChatGPT/Codex auth, and coordinate agent work through Gitea pull requests.
```

Actions:

- Add topics.
- Add release notes.
- Convert known limitations into public issues.
- Pin a roadmap issue.
- Ask early testers to star only if they actually want to follow the project.

### Hacker News

Use `Show HN` only when it is directly tryable. HN’s Show guidelines say Show HN is for things people can try, especially things they can run on their own computer.

Suggested title:

```text
Show HN: Group Leveling, self-hosted chat for humans and coding agents
```

First comment outline:

- Why I built it.
- What problem it solves.
- How the architecture works.
- Why Tailscale + Gitea + user-owned Codex auth.
- Current limitations.
- What feedback I want.

Avoid:

- Marketing language.
- Overclaiming security.
- Posting before someone else can reproduce the install.

### r/selfhosted

The self-hosting audience is relevant, but self-promotion rules matter. The subreddit rules warn against too much self-promotion and expect promoted apps to be production ready with docs.

Post only after:

- `SELF_HOSTING.md` and `INVITE_GUIDE.md` are clear.
- You have screenshots.
- You can answer security questions directly.
- You disclose that it is trusted-alpha software.

Suggested post title:

```text
I built Group Leveling: a self-hosted team chat for humans and user-owned coding agents
```

Post content:

- What it does.
- Why self-hosting matters here.
- How Tailscale fits.
- What is not hardened yet.
- Link to repo.
- Ask for feedback from people who self-host Gitea or use private networks.

### Product Hunt

Product Hunt is better after there is a polished product surface and visual assets. The official launch guide frames success around understanding the platform and preparing launch material. For Group Leveling, Product Hunt should not be the first launch.

Use Product Hunt when:

- There is a hosted demo video.
- The landing page is crisp.
- There is a clear non-technical explanation.
- The install flow is reliable.
- The project has a few public testimonials or GitHub issues showing activity.

### X / LinkedIn / Personal Network

Best for a build-in-public narrative.

Post ideas:

```text
I open-sourced Group Leveling.

It is a self-hosted team chat where humans and coding agents collaborate over Gitea.

The host provides infra. Each teammate brings their own ChatGPT/Codex auth. Agents work through pull requests.

Repo: https://github.com/leonidas1312/group-leveling
```

```text
The design principle behind Group Leveling:

Chat is the coordination layer.
Gitea is the project layer.
Codex is user-owned.
Tailscale is the private access layer.

That separation makes human-agent collaboration feel closer to a real team workspace.
```

### Dev Communities

Potential communities:

- Gitea users.
- Tailscale users.
- local-first and self-hosted Discord/Slack groups.
- AI engineer communities.
- indie hacker devtool groups.

Approach:

- Do not drop links cold.
- Share architecture and ask for critique.
- Ask specific questions: "Would this fit your team if invites were signed?" or "Would you prefer Gitea-only auth?"

## Content Assets

Create these assets before broad posting:

- 30-second GIF: host creates chat, mentions agent, workflow starts, PR appears.
- Architecture image from `ARCHITECTURE.md`.
- Screenshot of Tailscale-mode invite URL.
- Screenshot of ChatGPT connection page.
- Screenshot of workflow monitor.
- Screenshot of Gitea PR.

Suggested demo script:

```text
1. Start Group Leveling with one command.
2. Invite a teammate over Tailscale.
3. Teammate connects their ChatGPT/Codex auth.
4. Teammate creates @agent-name.
5. In chat: @agent-name update README in #owner/repo.
6. Agent opens a Gitea pull request.
```

## Messaging Pillars

Private by default:

- "Use Tailscale instead of exposing a public alpha."

User-owned AI:

- "Each teammate connects their own ChatGPT/Codex auth."

Git-native work:

- "Agents produce branches and pull requests, not invisible side effects."

Natural coordination:

- "`@` for people/agents, `#` for projects."

Self-hosted control:

- "Your laptop or server is the team infra."

## Metrics

GitHub:

- Stars
- Watchers
- Issues opened by non-maintainers
- Forks
- Clone traffic
- Release downloads, once releases exist

Activation:

- Successful self-host starts
- Users invited
- Users connected to ChatGPT/Codex
- Agents created
- Workflows completed
- Gitea PRs created

Qualitative:

- Where onboarding fails
- Security concerns repeated by testers
- Whether people understand user-owned auth
- Whether people ask for GitHub/GitLab instead of Gitea

## Feedback Questions

Ask early users:

- Did the Tailscale invite model make sense?
- Did you understand that your agent uses your own ChatGPT/Codex auth?
- Did `@agent` and `#project` feel natural?
- Was project creation separate enough from chat creation?
- Did Gitea PR output feel trustworthy?
- What security concern would stop you from inviting your team?
- What would make this worth starring or contributing to?

## Roadmap For Public Trust

Public trust items:

- Signed, expiring invite tokens.
- Server-enforced accepted-member allowlist.
- Stronger session auth.
- Role model: host/admin/member.
- Workflow sandbox hardening.
- Better per-user resource usage analytics.
- Security documentation.
- Contribution guidelines.
- Automated CI.

Public launch should explicitly say these are being worked on.

## Launch Copy

Short:

```text
Group Leveling is a self-hosted team chat for humans and user-owned coding agents. Host the infra, invite teammates over Tailscale, let each user connect their own ChatGPT/Codex auth, and coordinate Gitea pull requests from chat.
```

Technical:

```text
Group Leveling separates the collaboration stack into clear layers: chat for coordination, Gitea for repositories and PRs, Codex for agent execution, per-user CODEX_HOME for identity, and Tailscale for private access. Agents are mentioned naturally with @, projects with #, and code work lands as pull requests.
```

Transparent caveat:

```text
This is an alpha for trusted self-hosted teams. Tailscale is the recommended access model. Public internet exposure needs more auth and invite hardening.
```

## Sources And Channel Notes

- Hacker News Show HN guidelines: https://news.ycombinator.com/showhn.html
- Product Hunt launch guide: https://www.producthunt.com/launch
- GitHub topics docs: https://docs.github.com/articles/classifying-your-repository-with-topics
- r/selfhosted rules: https://www.reddit.com/r/selfhosted/wiki/rules/
