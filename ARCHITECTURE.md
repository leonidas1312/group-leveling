# Architecture

Group Leveling is a self-hosted workspace for human-agent collaboration. The host machine provides the app, Gitea, workflow execution, state, and private network access. Teammates provide their own workspace identity, ChatGPT/Codex auth, and agents.

## Product Model

- Chat is the coordination layer.
- Gitea is the project and pull request layer.
- Codex is the execution layer.
- Tailscale is the private access layer.
- `@` routes attention to people and agents.
- `#owner/repo` routes work to projects.
- Repository changes land through branches and pull requests.

## Technology Stack

| Area | Technology | Role |
| --- | --- | --- |
| Web app | Next.js App Router, React, TypeScript | Workspace UI, API routes, invite, settings, workflow monitor |
| UI | Tailwind CSS, local shadcn-style components, lucide icons | Application shell and controls |
| Repository host | Gitea in Docker Compose | Users, repositories, branches, pull requests |
| Agent runtime | Local Codex CLI through `codex exec` | Project work inside cloned repositories |
| Workflow service | `scripts/codex-workflow-server.mjs` | Long-running agent jobs outside the Next.js request lifecycle |
| Persistence | JSON state file plus Gitea volume | Chats, users, agents, projects, workflow history |
| Private network | Tailscale | Team access to the host without public routing |

## System View

```mermaid
flowchart LR
  Host["Host machine"] --> App["Next.js app :3000"]
  Host --> Gitea["Gitea :3001"]
  Host --> Runner["Codex workflow server :8787"]
  Host --> Data["Host data dir"]

  Users["Teammates"] -->|Browser over Tailscale or LAN| App
  App -->|Gitea API| Gitea
  App -->|Workflow API| Runner
  Runner -->|git clone, branch, push| Gitea
  Runner -->|CODEX_HOME per owner| Codex["Codex CLI"]
  Codex --> OpenAI["ChatGPT/Codex auth and usage"]
  Data --> State["state.json"]
  Data --> Runs["workflow runs"]
  Data --> Homes["codex-users/*"]
```

## Runtime Components

```mermaid
flowchart TB
  subgraph Browser
    UI["Workspace UI"]
    Invite["Invite page"]
    Settings["Settings"]
    Monitor["Workflow monitor"]
  end

  subgraph Next["Next.js server"]
    StateAPI["/api/solo-leveling/state"]
    ChatAPI["/api/solo-leveling/chats"]
    AgentAPI["/api/solo-leveling/agents"]
    GiteaAPI["/api/gitea/*"]
    CodexAPI["/api/codex/*"]
    WorkflowAPI["/api/agent/workflows/*"]
  end

  subgraph Host["Host infrastructure"]
    Store[(state.json)]
    Repo[(Gitea)]
    Runner["Workflow server"]
    Homes[(per-user CODEX_HOME)]
  end

  UI --> StateAPI
  UI --> ChatAPI
  UI --> AgentAPI
  UI --> GiteaAPI
  UI --> WorkflowAPI
  Invite --> StateAPI
  Settings --> CodexAPI
  Monitor --> WorkflowAPI

  StateAPI --> Store
  ChatAPI --> Store
  AgentAPI --> Store
  GiteaAPI --> Repo
  WorkflowAPI --> Runner
  CodexAPI --> Homes
  Runner --> Repo
  Runner --> Homes
```

## Data Model

The app stores collaboration state in a JSON file and repository state in Gitea.

```mermaid
erDiagram
  USER ||--o{ AGENT : owns
  USER ||--o{ CHAT : creates
  CHAT ||--o{ MESSAGE : contains
  CHAT }o--o{ USER : members
  CHAT }o--o{ AGENT : mentions
  CHAT }o--o{ PROJECT : references
  PROJECT ||--o{ WORKFLOW : receives
  AGENT ||--o{ WORKFLOW : runs

  USER {
    string username
    string avatarUrl
    string email
  }
  AGENT {
    string handle
    string ownerUsername
    string role
    string instructions
  }
  CHAT {
    string id
    string title
    string ownerUsername
    string members
  }
  MESSAGE {
    string author
    string body
    string time
    string kind
  }
  PROJECT {
    string repo
    string cloneUrl
    string webUrl
    string defaultBranch
  }
  WORKFLOW {
    string id
    string branch
    string state
    string pullRequestUrl
  }
```

Primary TypeScript types live in `lib/demo-data.ts`. State normalization lives in `lib/solo-leveling-store.ts`.

## Agent Ownership

Each teammate creates agents under their own profile. The owner determines which Codex profile is used for execution.

```mermaid
sequenceDiagram
  participant User as Teammate
  participant App as Group Leveling
  participant CodexAPI as Codex auth API
  participant Host as Host filesystem
  participant AgentAPI as Agent API

  User->>App: Open invite URL
  User->>App: Create or sign into profile
  User->>CodexAPI: Start ChatGPT/Codex device login
  CodexAPI->>Host: Create CODEX_HOME for username
  CodexAPI-->>User: Device auth URL and code
  CodexAPI->>Host: Store auth.json in user's profile
  User->>AgentAPI: Create agent with name, role, instructions
  AgentAPI->>Host: Store agent ownerUsername
  App-->>User: Agent appears in autocomplete as @agent-name
```

Ownership rule:

```text
agent.ownerUsername -> CODEX_USER_HOME_ROOT/<username> -> ChatGPT/Codex auth
```

The host supplies compute and repositories. The teammate supplies the identity and usage plan for agents they own.

## Chat Routing

The composer treats symbols as structured routing hints inside normal chat.

- `@username` mentions a human.
- `@agent-name` mentions an agent.
- `#owner/repo` references a Gitea project.

```mermaid
flowchart TD
  Message["User sends message"] --> Parse["Parse @ mentions and # project refs"]
  Parse --> UserMention["Render human mentions"]
  Parse --> AgentMention{Agent mention?}
  AgentMention -->|chat| Conversational["Agent replies in chat"]
  AgentMention -->|project work| Auth["Load owner Codex profile"]
  Auth --> Gitea["Resolve Gitea project"]
  Gitea --> Workflow["Start workflow"]
```

Chat creation and project creation are independent operations. A chat can reference any project by mentioning `#owner/repo`.

## Workflow Execution

When a message asks an agent to work in a project, the app starts a workflow through the local workflow server.

```mermaid
sequenceDiagram
  participant Chat as Chat UI
  participant App as Next.js API
  participant Runner as Workflow server
  participant Gitea as Gitea
  participant Codex as Codex CLI
  participant State as Workflow state

  Chat->>App: POST /api/agent/workflows
  App->>Gitea: Resolve repository
  App->>Runner: Send prompt, repo, agent owner
  Runner->>State: Create wf-* status
  Runner->>Gitea: Clone repository
  Runner->>Codex: codex exec with owner CODEX_HOME
  Codex-->>Runner: Trace and final message
  Runner->>Gitea: Commit and push branch
  Runner->>Gitea: Open pull request
  Runner->>State: Save summary and PR URL
  Chat->>App: Poll workflow status
  App->>Runner: GET /workflows/:id
  App-->>Chat: Result message
```

Public workflow text is sanitized before it reaches chat, monitors, and pull request bodies:

- Host runtime paths are rewritten.
- Repository files become repo-relative paths or Gitea links.
- Pull request URLs use `PUBLIC_GITEA_BASE_URL`.

## Deployment Modes

```mermaid
flowchart LR
  subgraph Local["Local development"]
    LocalUser["Host browser"] --> LocalApp["localhost:3000"]
  end

  subgraph Tail["Tailscale team"]
    TailUser["Teammate browser"] --> TailApp["100.x.y.z:3000"]
    TailUser --> TailGitea["100.x.y.z:3001"]
  end

  subgraph HTTPS["HTTPS deployment"]
    PublicUser["Browser"] --> Proxy["Reverse proxy"]
    Proxy --> App["App :3000"]
    Proxy --> Gitea["Gitea :3001"]
  end
```

Recommended progression:

1. Localhost for development.
2. Tailscale for trusted team operation.
3. HTTPS reverse proxy with production auth controls for broader deployment.

The workflow server remains behind the app. Browsers interact with Next.js and Gitea.

## Boot Flow

```mermaid
flowchart TD
  Start["npm run self-host"] --> Env["Read environment"]
  Env --> Network{Tailscale mode?}
  Network -->|yes| TailIP["Read tailscale ip -4"]
  Network -->|no| LANIP["Read LAN IPv4"]
  TailIP --> URLs["Compute app and Gitea URLs"]
  LANIP --> URLs
  URLs --> Compose["Start Gitea"]
  Compose --> Runner["Start workflow server"]
  Runner --> Next["Start Next.js app"]
  Next --> Print["Print app URL and invite URL"]
```

Preview commands:

```bash
npm run self-host -- --print-config
SOLO_LEVELING_NETWORK=tailscale npm run self-host -- --print-config
```

## Environment Variables

The `SOLO_LEVELING` prefix is retained for runtime compatibility.

| Variable | Role |
| --- | --- |
| `SOLO_LEVELING_NETWORK` | `lan` or `tailscale` |
| `SOLO_LEVELING_PUBLIC_URL` | Browser URL for the web app |
| `SOLO_LEVELING_BIND_HOST` | Interface used by the web app |
| `SOLO_LEVELING_DATA_DIR` | Host data root |
| `GITEA_BASE_URL` | Server-side Gitea URL |
| `PUBLIC_GITEA_BASE_URL` | Browser-facing Gitea URL |
| `GITEA_TOKEN` | Admin/API token for Gitea operations |
| `GITEA_DEFAULT_OWNER` | Default Gitea user or org for new projects |
| `CODEX_SERVER_URL` | Next.js to workflow-server URL |
| `CODEX_USER_HOME_ROOT` | Per-user Codex profile root |
| `CODEX_WORKFLOW_RUNS_DIR` | Workflow run directory |

## Security Boundary

```mermaid
flowchart TB
  subgraph Host["Trusted host machine"]
    App["Next.js app"]
    Runner["Workflow server"]
    State[(state and workflow files)]
    Homes[(per-user Codex homes)]
    Token["Gitea token"]
  end

  subgraph Teammate["Teammate"]
    Browser["Browser session"]
    Auth["Own ChatGPT/Codex auth"]
  end

  Browser --> App
  App --> Runner
  Runner --> Homes
  Homes --> Auth
  App --> Token
```

Current operating boundary:

- Trusted teammates.
- Private network access through Tailscale or LAN.
- Per-user Codex profiles for agent execution.
- Gitea as the source of truth for repositories and pull requests.
- Public-facing workflow text sanitized by the app.

Public HTTPS deployment adds:

- Signed invite tokens.
- Server-enforced member allowlist.
- Session cookies with host/member roles.
- Workflow rate limits.
- Project access rules.
- Optional per-workflow container isolation.

## Repository Map

| Path | Role |
| --- | --- |
| `app/page.tsx` | Main workspace UI |
| `app/invite/page.tsx` | Invite entry page |
| `app/settings/page.tsx` | Settings and analytics |
| `app/settings/chatgpt/page.tsx` | Per-user Codex device login |
| `app/workflows/[id]/workflow-monitor.tsx` | Workflow monitor |
| `app/api/solo-leveling/*` | Chat, message, state, agent APIs |
| `app/api/gitea/*` | Project, user, pull request, status APIs |
| `app/api/codex/*` | Codex status and device-login APIs |
| `app/api/agent/workflows/*` | Next.js adapter to workflow server |
| `lib/solo-leveling-store.ts` | File-backed collaboration state |
| `lib/gitea.ts` | Gitea API client and URL normalization |
| `lib/codex-auth.ts` | Per-user Codex profile helpers |
| `lib/codex.ts` | Workflow server client |
| `scripts/self-host.mjs` | Host launcher |
| `scripts/invite.mjs` | Invite URL generator |
| `scripts/codex-workflow-server.mjs` | Codex workflow service |
| `compose.yaml` | Gitea service definition |

## Summary

Group Leveling separates collaboration into three durable systems: chat for coordination, Gitea for repository truth, and Codex for execution. The host owns infrastructure. Teammates own identity, agents, and ChatGPT/Codex usage. The project boundary is a Gitea repository; the coordination boundary is a chat.
