# Architecture

Group Leveling is a self-hosted human and agent collaboration platform. The host provides the infrastructure: web app, Gitea, workflow runner, storage, and network access. Each teammate brings their own workspace profile, their own ChatGPT/Codex auth, and their own agents.

The core idea is simple:

- Humans chat in shared rooms.
- Humans mention users and agents with `@`.
- Humans mention projects with `#owner/repo`.
- Agents can talk casually in chat.
- Agents only run repository workflows when the message asks for project/code work.
- Repository work happens in Gitea pull requests, not directly in chat.

## Technology Stack

| Area | Technology | Purpose |
| --- | --- | --- |
| Web app | Next.js App Router, React, TypeScript | Main UI, API routes, settings, invite, workflow monitor |
| UI | Tailwind CSS, shadcn-style local components, lucide icons | Application shell and controls |
| Repository host | Gitea in Docker Compose | Users, repositories, pull requests, project links |
| Agent runner | Local Codex CLI through `codex exec` | Executes project work in cloned repositories |
| Workflow service | `scripts/codex-workflow-server.mjs` | Isolates long-running Codex jobs from Next.js |
| Persistence | File-backed JSON state plus Gitea data volume | Chats, users, agents, projects, workflow history |
| Private networking | Tailscale | Private team access without exposing public ports |

## High-Level System

```mermaid
flowchart LR
  Host["Host machine"] --> App["Next.js app :3000"]
  Host --> Gitea["Gitea :3001"]
  Host --> Workflow["Codex workflow server :8787"]
  Host --> Store["Host data dir ~/.solo-leveling"]

  Users["Teammates"] -->|Browser over LAN or Tailscale| App
  App -->|Gitea API| Gitea
  App -->|Workflow API| Workflow
  Workflow -->|git clone/push| Gitea
  Workflow -->|CODEX_HOME per user| Codex[Codex CLI]
  Codex -->|ChatGPT/Codex auth| OpenAI[OpenAI auth and usage]
  Store --> State["state.json"]
  Store --> Runs["workflow runs"]
  Store --> Profiles["codex-users/*"]
```

## Runtime Services

```mermaid
flowchart TB
  subgraph Browser
    UI["Workspace UI"]
    Invite["Invite page"]
    Settings["Settings and analytics"]
    Monitor["Workflow monitor"]
  end

  subgraph Next[Next.js server]
    APIState["/api/solo-leveling/state"]
    APIChats["/api/solo-leveling/chats"]
    APIAgents["/api/solo-leveling/agents"]
    APIProjects["/api/gitea/projects"]
    APICodex["/api/codex/*"]
    APIWorkflows["/api/agent/workflows"]
  end

  subgraph LocalHost[Host infrastructure]
    Store[(state.json)]
    Gitea[(Gitea)]
    Runner["Codex workflow server"]
    CodexHome[(per-user CODEX_HOME)]
  end

  UI --> APIState
  UI --> APIChats
  UI --> APIAgents
  UI --> APIProjects
  Settings --> APICodex
  Monitor --> APIWorkflows

  APIState --> Store
  APIChats --> Store
  APIAgents --> Store
  APIProjects --> Gitea
  APIWorkflows --> Runner
  APICodex --> CodexHome
  Runner --> Gitea
  Runner --> CodexHome
```

## Data Model

The app keeps a small persistent state file for collaboration data that is not owned by Gitea.

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

Primary TypeScript types live in `lib/demo-data.ts`. Persistent state is normalized through `lib/solo-leveling-store.ts`.

## How A Teammate Brings An Agent

Each teammate creates an app profile, connects their own ChatGPT/Codex identity, then creates one or more agents owned by that profile.

```mermaid
sequenceDiagram
  participant User as Teammate browser
  participant App as Next.js app
  participant CodexAPI as Codex auth API
  participant Host as Host filesystem
  participant AgentAPI as Agent API

  User->>App: Open invite URL
  App-->>User: Workspace entry screen
  User->>App: Create or sign into profile
  User->>CodexAPI: Start ChatGPT/Codex device login
  CodexAPI->>Host: Create per-user CODEX_HOME
  CodexAPI-->>User: OpenAI device auth URL and code
  User->>CodexAPI: Poll login session
  CodexAPI->>Host: Detect auth.json for this user
  User->>AgentAPI: Create agent with name, role, instructions
  AgentAPI->>Host: Store agent ownerUsername and instructions
  App-->>User: Agent appears in chat autocomplete as @agent-name
```

Important ownership rule:

```text
agent.ownerUsername -> user's CODEX_HOME -> user's ChatGPT/Codex auth
```

The host provides compute and repositories. The teammate provides the Codex identity used by agents they own.

## Chat And Mention Flow

The chat composer treats symbols as routing hints:

- `@username` mentions a human user.
- `@agent-name` mentions an agent.
- `#owner/repo` references a Gitea project.

```mermaid
flowchart TD
  Message["User sends chat message"] --> Parse["Parse @ mentions and # project refs"]
  Parse --> Human{Mentions human?}
  Parse --> Agent{Mentions agent?}
  Parse --> Project{Mentions project or asks code work?}

  Human -->|yes| DisplayHuman["Render user mention in chat"]
  Agent -->|no| StoreOnly["Store normal chat message"]
  Agent -->|yes| WorkIntent{Repository work intent?}
  Project --> WorkIntent

  WorkIntent -->|no| LocalReply["Agent replies conversationally"]
  WorkIntent -->|yes| CheckAuth["Check owner Codex auth"]
  CheckAuth --> CheckGitea["Check Gitea/project availability"]
  CheckGitea --> StartWorkflow["Start Codex workflow"]
```

This keeps chat and projects decoupled. Creating a project does not create a chat. Creating a chat does not create a project. A chat can reference any project naturally by mentioning `#owner/repo`.

## Agent Workflow Flow

When a message asks an agent to work in a project, the app starts a workflow through the local workflow server.

```mermaid
sequenceDiagram
  participant Chat as Chat UI
  participant App as Next.js API
  participant Runner as Codex workflow server
  participant Gitea as Gitea
  participant Codex as Codex CLI
  participant State as Workflow status

  Chat->>App: POST /api/agent/workflows
  App->>Gitea: Verify repository exists
  App->>Runner: POST /workflows with prompt, repo, agent owner
  Runner->>State: Create wf-* status
  Runner->>Gitea: Clone repository
  Runner->>Codex: codex exec with user's CODEX_HOME
  Codex-->>Runner: JSONL trace and final message
  Runner->>Gitea: Commit, push branch
  Runner->>Gitea: Create pull request
  Runner->>State: Save sanitized summary and PR URL
  Chat->>App: Poll workflow status
  App->>Runner: GET /workflows/:id
  App-->>Chat: Completed/failed result message
```

The workflow server sanitizes agent output before user-facing surfaces see it:

- Host runtime paths are removed.
- Files inside cloned repos become Gitea branch file URLs when possible.
- PR URLs are normalized to `PUBLIC_GITEA_BASE_URL`.

## Deployment Modes

```mermaid
flowchart LR
  subgraph LAN[LAN mode]
    LANUser["Friend on same network"] --> LANApp["http://host-lan-ip:3000"]
    LANUser --> LANGitea["http://host-lan-ip:3001"]
  end

  subgraph Tail[Tailscale mode]
    TailUser["Shared Tailscale user"] --> TailApp["http://100.x.y.z:3000"]
    TailUser --> TailGitea["http://100.x.y.z:3001"]
  end

  subgraph Public[Public internet]
    PublicUser["Browser"] --> Proxy["HTTPS proxy or tunnel"]
    Proxy --> App["App :3000"]
    Proxy --> Gitea["Gitea :3001"]
  end
```

Recommended order:

1. Localhost for development.
2. Tailscale for private team testing.
3. HTTPS reverse proxy only when the product is ready for broader exposure.

The workflow server listens on localhost by default. Users do not talk to it directly; the Next.js app does.

## Self-Host Boot Flow

```mermaid
flowchart TD
  Start["npm run self-host"] --> Env["Read .env.local and process env"]
  Env --> Network{SOLO_LEVELING_NETWORK=tailscale?}
  Network -->|yes| Tailscale["tailscale ip -4"]
  Network -->|no| LAN["Detect LAN IPv4"]
  Tailscale --> URLs["Compute app and Gitea public URLs"]
  LAN --> URLs
  URLs --> Compose["docker compose up -d gitea"]
  Compose --> Runner["npm run codex-server:exec"]
  Runner --> Next["npm run dev"]
  Next --> Print["Print public URL and invite URL"]
```

Useful preview command:

```bash
npm run self-host -- --print-config
SOLO_LEVELING_NETWORK=tailscale npm run self-host -- --print-config
```

## Important Environment Variables

| Variable | Purpose |
| --- | --- |
| `SOLO_LEVELING_NETWORK` | `lan` or `tailscale` |
| `SOLO_LEVELING_PUBLIC_URL` | Browser URL for the web app |
| `SOLO_LEVELING_BIND_HOST` | Interface the web app binds to |
| `SOLO_LEVELING_DATA_DIR` | Host data root, defaults to `~/.solo-leveling` |
| `GITEA_BASE_URL` | Internal URL used by server-side API calls and git clone |
| `PUBLIC_GITEA_BASE_URL` | Browser URL used in links sent to users |
| `GITEA_TOKEN` | Admin/API token for Gitea operations |
| `GITEA_DEFAULT_OWNER` | Default Gitea user/org for new projects |
| `CODEX_SERVER_URL` | Next.js to workflow-server URL |
| `CODEX_USER_HOME_ROOT` | Optional override for per-user Codex profiles |
| `CODEX_WORKFLOW_RUNS_DIR` | Optional override for workflow run directories |

## Security Boundaries

```mermaid
flowchart TB
  subgraph TrustedHost[Trusted host machine]
    App["Next.js app"]
    Runner["Workflow server"]
    State[(state and workflow files)]
    Homes[(per-user Codex homes)]
    Token["Gitea token"]
  end

  subgraph Teammate[Teammate]
    Browser["Browser session"]
    ChatGPT["Own ChatGPT/Codex auth"]
  end

  Browser --> App
  App --> Runner
  Runner --> Homes
  Homes --> ChatGPT
  App --> Token
```

What the app currently protects:

- Public responses do not expose host workflow paths.
- Each user's agent runs with that user's `CODEX_HOME`.
- Gitea browser URLs are normalized to public/Tailscale URLs.
- Project and chat objects are decoupled.

What still needs hardening before public internet exposure:

- Signed, expiring, one-use invite tokens.
- Explicit accepted-member allowlist enforced server-side.
- Strong session/auth cookies instead of local profile selection.
- Rate limits for workflow starts and account creation.
- Permission model for project access and agent execution.
- Optional container sandboxing per workflow.

## Repository Map

| Path | Role |
| --- | --- |
| `app/page.tsx` | Main chat/workspace UI |
| `app/invite/page.tsx` | Invite landing page |
| `app/settings/page.tsx` | Analytics/settings overview |
| `app/settings/chatgpt/page.tsx` | Per-user Codex device login |
| `app/workflows/[id]/workflow-monitor.tsx` | Workflow status monitor |
| `app/api/solo-leveling/*` | Chat, message, state, agent APIs |
| `app/api/gitea/*` | Project, user, PR, status APIs |
| `app/api/codex/*` | Codex status and device-login APIs |
| `app/api/agent/workflows/*` | Next.js adapter to workflow server |
| `lib/solo-leveling-store.ts` | File-backed app state and normalization |
| `lib/gitea.ts` | Gitea API client and URL normalization |
| `lib/codex-auth.ts` | Per-user Codex profile helpers |
| `lib/codex.ts` | Workflow server client |
| `scripts/self-host.mjs` | One-command host launcher |
| `scripts/invite.mjs` | Invite URL generator |
| `scripts/codex-workflow-server.mjs` | Long-running Codex workflow service |
| `compose.yaml` | Gitea service definition |

## Current Product Shape

Group Leveling is currently a self-hosted team workspace for trusted users. The host owns infrastructure. Teammates own identities and agents. Gitea owns repositories and pull requests. Codex does work through the correct user's ChatGPT/Codex auth. Chat is the coordination layer, not the project boundary.
