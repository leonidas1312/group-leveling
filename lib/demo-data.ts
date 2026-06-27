export type ChatMessage = {
  id: string;
  author: string;
  body: string;
  time: string;
  kind?: "human" | "agent";
  self?: boolean;
};

export type ChatRoom = {
  id: string;
  title: string;
  type: "group" | "dm" | "war-room";
  description: string;
  ownerUsername?: string;
  members: string[];
  agentHandles?: string[];
  projectRefs?: string[];
  messages: ChatMessage[];
};

export type Project = {
  id: string;
  name: string;
  repo: string;
  cloneUrl: string;
  webUrl?: string;
  description: string;
  defaultBranch: string;
  owner: string;
  openPulls: number;
  openIssues: number;
  stars: number;
  chats: ChatRoom[];
  activity: string[];
  files: { path: string; change: string }[];
};

export type AgentWorkflow = {
  id: string;
  title: string;
  projectId: string;
  status: string;
  progress: number;
  branch: string;
  state?: "queued" | "running" | "completed" | "failed";
  summary?: string;
  pullRequestUrl?: string;
  pullRequest?: string;
  runDir?: string;
  steps?: WorkflowStep[];
  artifacts?: string[];
  trace?: WorkflowTraceEvent[];
  usage?: WorkflowUsage;
  limits?: WorkflowLimit[];
};

export type WorkflowStep = {
  time: string;
  status: string;
  progress: number;
  state?: "queued" | "running" | "completed" | "failed";
};

export type WorkflowTraceEvent = {
  id: string;
  kind: "agent" | "command" | "files" | "turn" | "error";
  title: string;
  body?: string;
  status?: string;
  exitCode?: number | null;
};

export type WorkflowUsage = {
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  reasoningOutputTokens?: number;
};

export type WorkflowLimit = {
  label: string;
  value: string;
};

export type GiteaUser = {
  id: string;
  username: string;
  fullName?: string;
  email?: string;
  avatarUrl?: string;
};

export type AgentProfile = {
  id: string;
  handle: string;
  name: string;
  ownerUsername: string;
  role: string;
  personality: string;
  instructions: string;
  examples: string[];
  createdAt: string;
  updatedAt: string;
};

export const demoUsers: GiteaUser[] = [];

export const demoAgents: AgentProfile[] = [];

export const demoChats: ChatRoom[] = [
  {
    id: "workspace-general",
    title: "Workspace general",
    type: "group",
    description: "Shared human-agent chat. Mention agents with @ and projects with #.",
    ownerUsername: undefined,
    members: [],
    agentHandles: [],
    projectRefs: [],
    messages: [],
  },
];

export const demoProjects: Project[] = [
  {
    id: "solo-leveling",
    name: "Group Leveling",
    repo: "host/solo-leveling",
    cloneUrl: "http://gitea.local/host/solo-leveling.git",
    webUrl: "http://gitea.local/host/solo-leveling",
    description: "Self-hosted coding-agent control plane for Gitea.",
    defaultBranch: "main",
    owner: "host",
    openPulls: 0,
    openIssues: 0,
    stars: 0,
    chats: [],
    activity: [],
    files: [],
  },
];

export const demoWorkflows: AgentWorkflow[] = [];
