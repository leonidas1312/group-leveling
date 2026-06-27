"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AppLogo } from "@/components/app-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { sanitizeVisibleRuntimeText } from "@/lib/public-text";
import { cn } from "@/lib/utils";
import {
  demoAgents,
  demoChats,
  demoProjects,
  type AgentProfile,
  type AgentWorkflow,
  type ChatMessage,
  type ChatRoom,
  type GiteaUser,
  type Project,
} from "@/lib/demo-data";

type ProjectSource = "mock" | "gitea";
type SheetMode = "project" | "chat" | "connect" | "agent" | "members" | null;

type CodexStatus = {
  user: string;
  codexHome: string;
  configured: boolean;
  loginCommand: string;
};

type ConnectSession = {
  id: string;
  user: string;
  status: "running" | "completed" | "failed";
  output: string;
  startedAt: string;
  exitCode?: number | null;
  error?: string;
  loginCommand: string;
};

type SoloLevelingStateResponse = {
  source?: ProjectSource;
  projects?: Project[];
  chats?: ChatRoom[];
  users?: GiteaUser[];
  agents?: AgentProfile[];
  adminUsername?: string;
  publicAppUrl?: string;
  error?: string;
};

type PullRequestSummary = {
  number: number;
  title: string;
  state: string;
  url: string;
  merged: boolean;
  mergeable?: boolean;
  head?: string;
  base?: string;
};

type WorkflowRow = {
  messageId: string;
  id: string;
  chatId: string;
  chatTitle: string;
  agent: string;
  body: string;
  time: string;
  state: "running" | "completed" | "failed" | "note";
  projectRef?: string;
};

type ComposerSuggestion = {
  id: string;
  token: string;
  label: string;
  detail: string;
  kind: "agent" | "user" | "project";
};

type GiteaStatus = {
  configured: boolean;
  online: boolean;
  baseUrl: string;
  publicBaseUrl: string;
  version?: string;
  message: string;
  error?: string;
};

type NewProjectDraft = {
  name: string;
};

type NewChatDraft = {
  title: string;
};

type NewAgentDraft = {
  name: string;
  role: string;
  instructions: string;
};

type DeleteTarget =
  | { kind: "chat"; chat: ChatRoom }
  | { kind: "project"; project: Project }
  | null;

type AuthMode = "signin" | "create";

type ActionNotice = {
  id: string;
  kind: "success" | "error";
  title: string;
  body?: string;
};

const defaultAgentRole = "Workspace agent";
const defaultAgentPersonality = "Helpful, conversational, and careful when repository work is requested.";
const defaultAgentInstructions =
  "Talk naturally when people mention you in chat. If the message asks you to work on code, a repository, or a #project, use the project context, keep changes scoped, run relevant checks, and report what changed.";

function now() {
  return new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" }).format(new Date());
}

function userAgentHandle(username: string) {
  return `agent-${username.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;
}

function initials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  const text = parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : value.slice(0, 2);
  return text.toUpperCase();
}

function defaultAgentForUser(user: GiteaUser): AgentProfile {
  const handle = userAgentHandle(user.username);
  const createdAt = new Date().toISOString();
  return {
    id: handle,
    handle,
    name: `${user.fullName || user.username} Agent`,
    ownerUsername: user.username,
    role: defaultAgentRole,
    personality: defaultAgentPersonality,
    instructions: defaultAgentInstructions,
    examples: [],
    createdAt,
    updatedAt: createdAt,
  };
}

function projectBaseUrl(project: Project) {
  return project.webUrl ?? `http://localhost:3001/${project.repo}`;
}

function giteaProfileUrl(user: GiteaUser, status: GiteaStatus | null) {
  const baseUrl = (status?.publicBaseUrl || status?.baseUrl || "http://localhost:3001").replace(/\/$/, "");
  return `${baseUrl}/${encodeURIComponent(user.username)}`;
}

function workflowMonitorUrl(id: string) {
  if (typeof window === "undefined") return `/workflows/${id}`;
  return `${window.location.origin}/workflows/${id}`;
}

function agentInstructions(agent: AgentProfile) {
  return [`Role: ${agent.role}`, `Personality: ${agent.personality}`, agent.instructions].filter(Boolean).join("\n\n");
}

function mentionedAgentHandle(value: string) {
  return value.match(/@([a-z0-9][a-z0-9-]*)/i)?.[1];
}

function mentionedProjectRef(value: string) {
  return value.match(/#([a-z0-9_.-]+(?:\/[a-z0-9_.-]+)?)/i)?.[1];
}

function projectMention(project: Project) {
  return `#${project.repo}`;
}

function normalizeProjectRef(value: string) {
  return value.replace(/^#/, "").toLowerCase();
}

function projectMatchesRef(project: Project, ref: string) {
  const normalized = normalizeProjectRef(ref);
  const repo = project.repo.toLowerCase();
  return repo === normalized || repo.endsWith(`/${normalized}`) || slugValue(project.name) === slugValue(normalized);
}

function mentionTrigger(value: string, cursor: number) {
  const prefix = value.slice(0, cursor);
  const match = prefix.match(/(^|\s)([@#])([a-z0-9_.\/-]*)$/i);
  if (!match) return null;
  const tokenStart = prefix.length - match[2].length - match[3].length;
  return {
    symbol: match[2] as "@" | "#",
    query: match[3].toLowerCase(),
    start: tokenStart,
    end: cursor,
  };
}

function composerSuggestions(trigger: ReturnType<typeof mentionTrigger>, users: GiteaUser[], agents: AgentProfile[], projects: Project[]): ComposerSuggestion[] {
  if (!trigger) return [];
  const query = trigger.query;
  const matches = (value: string) => value.toLowerCase().includes(query);

  if (trigger.symbol === "#") {
    return projects
      .filter((project) => !query || matches(project.repo) || matches(project.name))
      .slice(0, 8)
      .map((project) => ({
        id: `project-${project.id}`,
        token: projectMention(project),
        label: project.name,
        detail: project.description || project.repo,
        kind: "project" as const,
      }));
  }

  const userSuggestions = users
    .filter((user) => !query || matches(user.username) || matches(user.fullName || ""))
    .slice(0, 6)
    .map((user) => ({
      id: `user-${user.username}`,
      token: `@${user.username}`,
      label: user.fullName || user.username,
      detail: "user",
      kind: "user" as const,
    }));

  const agentSuggestions = agents
    .filter((agent) => !query || matches(agent.handle) || matches(agent.name) || matches(agent.ownerUsername))
    .slice(0, 6)
    .map((agent) => ({
      id: `agent-${agent.handle}`,
      token: agentMention(agent),
      label: agent.name,
      detail: `${agent.ownerUsername} · ${agent.role}`,
      kind: "agent" as const,
    }));

  return [...userSuggestions, ...agentSuggestions].slice(0, 8);
}

function slugValue(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function agentMention(agent: AgentProfile) {
  return `@${agent.handle}`;
}

function parseDeviceLoginOutput(output?: string) {
  const text = output ?? "";
  return {
    authUrl: text.match(/https:\/\/auth\.openai\.com\/codex\/device[^\s]*/)?.[0],
    code: text.match(/\b[A-Z0-9]{4}(?:-[A-Z0-9]{4})+\b/)?.[0] ?? text.match(/\b[A-Z0-9]{8,12}\b/)?.[0],
  };
}

function isWorkflowMessage(message: ChatMessage) {
  return message.id.startsWith("wf-") || message.id.startsWith("pr-") || message.kind === "agent";
}

function isStartedMessage(message: ChatMessage) {
  return message.id.endsWith("-started");
}

function workflowIdFromMessage(message: ChatMessage) {
  return message.id.match(/wf-[0-9]+/)?.[0] ?? message.body.match(/\/workflows\/(wf-[0-9]+)/)?.[1];
}

function workflowStateFromMessage(message: ChatMessage): WorkflowRow["state"] {
  if (/^Completed:/i.test(message.body) || /^Merged /i.test(message.body)) return "completed";
  if (/^Failed:/i.test(message.body) || /failed/i.test(message.body)) return "failed";
  if (isStartedMessage(message)) return "running";
  return "note";
}

function workflowRowsFromChats(chats: ChatRoom[]): WorkflowRow[] {
  const rows = chats.flatMap((chat) =>
    chat.messages.filter(isWorkflowMessage).map((message) => ({
      id: workflowIdFromMessage(message) ?? message.id,
      messageId: message.id,
      chatId: chat.id,
      chatTitle: chat.title,
      agent: message.author,
      body: message.body,
      time: message.time,
      state: workflowStateFromMessage(message),
      projectRef: mentionedProjectRef(message.body),
    })),
  );
  return rows.reverse();
}

function pendingWorkflowStartsFromMessages(messages: ChatMessage[]) {
  const finishedWorkflowIds = new Set(
    messages
      .filter((message) => message.id.endsWith("-result") || /^Completed:|^Failed:/i.test(message.body))
      .map(workflowIdFromMessage)
      .filter(Boolean),
  );
  const pending = new Map<string, { workflowId: string; agentHandle: string }>();

  for (const message of messages) {
    if (!isStartedMessage(message)) continue;
    const workflowId = workflowIdFromMessage(message);
    if (!workflowId || finishedWorkflowIds.has(workflowId) || pending.has(workflowId)) continue;
    pending.set(workflowId, { workflowId, agentHandle: message.author });
  }

  return Array.from(pending.values());
}

function workflowResultMessage(workflow: AgentWorkflow, agentHandle: string): ChatMessage {
  const result = workflow.state === "completed" ? "Completed" : "Failed";
  const pullRequest = workflow.pullRequestUrl ? `\nPull request: ${workflow.pullRequestUrl}` : "";
  return {
    id: `${workflow.id}-result`,
    author: agentHandle,
    body: `${result}: ${workflow.status}\n${workflow.summary ?? "No summary returned."}${pullRequest}\nMonitor: ${workflowMonitorUrl(workflow.id)}`,
    time: now(),
    kind: "agent",
  };
}

function renderBody(body: string, self = false) {
  return sanitizeVisibleRuntimeText(body).split(/(https?:\/\/[^\s<]+|\/workflows\/wf-[0-9]+|@[a-z0-9][a-z0-9-]*|#[a-z0-9_.-]+(?:\/[a-z0-9_.-]+)?)/gi).map((part, index) => {
    if (/^(https?:\/\/[^\s<]+|\/workflows\/wf-[0-9]+)$/i.test(part)) {
      return (
        <a
          key={`${part}-${index}`}
          href={part}
          target={part.startsWith("http") ? "_blank" : undefined}
          rel={part.startsWith("http") ? "noreferrer" : undefined}
          className="font-medium text-foreground underline underline-offset-4"
        >
          {part}
        </a>
      );
    }
    if (/^@[a-z0-9][a-z0-9-]*$/i.test(part)) {
      return (
        <span key={`${part}-${index}`} className="inline-flex rounded-sm bg-sky-500/20 px-1.5 py-0.5 font-medium text-sky-700 ring-1 ring-sky-500/25 dark:text-sky-200">
          {part}
        </span>
      );
    }
    if (/^#[a-z0-9_.-]+(?:\/[a-z0-9_.-]+)?$/i.test(part)) {
      return (
        <span key={`${part}-${index}`} className="inline-flex rounded-sm bg-emerald-500/20 px-1.5 py-0.5 font-medium text-emerald-700 ring-1 ring-emerald-500/25 dark:text-emerald-200">
          {part}
        </span>
      );
    }
    return part;
  });
}

async function parseJsonResponse<T>(response: Response, fallbackError: string): Promise<T> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${fallbackError}: ${response.status} ${response.statusText}`);
  }
}

export default function Home() {
  const [projects, setProjects] = useState<Project[]>(demoProjects);
  const [chats, setChats] = useState<ChatRoom[]>(demoChats);
  const [users, setUsers] = useState<GiteaUser[]>([]);
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [source, setSource] = useState<ProjectSource>("mock");
  const [adminUsername, setAdminUsername] = useState("");
  const [publicAppUrl, setPublicAppUrl] = useState("");
  const [authReady, setAuthReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("create");
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [registerName, setRegisterName] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [currentUsername, setCurrentUsername] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState(demoProjects[0].id);
  const [selectedChatId, setSelectedChatId] = useState(demoChats[0].id);
  const [selectedAgentHandle, setSelectedAgentHandle] = useState("");
  const [task, setTask] = useState("");
  const [taskBusy, setTaskBusy] = useState(false);
  const [codexStatuses, setCodexStatuses] = useState<Record<string, CodexStatus>>({});
  const [giteaStatus, setGiteaStatus] = useState<GiteaStatus | null>(null);
  const [connectSession, setConnectSession] = useState<ConnectSession | null>(null);
  const [connectBusy, setConnectBusy] = useState(false);
  const [sheetMode, setSheetMode] = useState<SheetMode>(null);
  const [detailAgentHandle, setDetailAgentHandle] = useState<string | null>(null);
  const [newProject, setNewProject] = useState<NewProjectDraft>({ name: "" });
  const [newChat, setNewChat] = useState<NewChatDraft>({ title: "" });
  const [newAgent, setNewAgent] = useState<NewAgentDraft>({
    name: "",
    role: defaultAgentRole,
    instructions: "",
  });
  const [agentBusy, setAgentBusy] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);
  const [chatDeleteBusy, setChatDeleteBusy] = useState<string | null>(null);
  const [chatLeaveBusy, setChatLeaveBusy] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [actionNotices, setActionNotices] = useState<ActionNotice[]>([]);
  const [projectBusy, setProjectBusy] = useState(false);
  const [projectDeleteBusy, setProjectDeleteBusy] = useState<string | null>(null);
  const [pullRequests, setPullRequests] = useState<PullRequestSummary[]>([]);
  const [pullsBusy, setPullsBusy] = useState(false);
  const [mergeBusy, setMergeBusy] = useState<number | null>(null);
  const taskRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      const savedProfile = window.localStorage.getItem("solo-leveling-profile");
      const signedIn = window.localStorage.getItem("solo-leveling-auth") === "signed-in";
      try {
        const next = await refreshState(savedProfile ?? undefined);
        await refreshGiteaStatus();
        const canRestore = Boolean(signedIn && savedProfile && next.users.some((user) => user.username === savedProfile));
        if (canRestore && savedProfile) {
          setCurrentUsername(savedProfile);
          setLoginUsername(savedProfile);
        } else {
          window.localStorage.removeItem("solo-leveling-auth");
          window.localStorage.removeItem("solo-leveling-profile");
          if (savedProfile) setLoginUsername(savedProfile);
        }
        setIsAuthenticated(canRestore);
      } catch (error) {
        setAuthError(error instanceof Error ? error.message : "Failed to load state");
      } finally {
        if (!cancelled) setAuthReady(true);
      }
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    window.localStorage.setItem("solo-leveling-profile", currentUsername);
    void refreshCodexStatus(currentUsername);
  }, [currentUsername, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    for (const user of users) {
      void refreshCodexStatus(user.username);
    }
  }, [users, isAuthenticated]);

  useEffect(() => {
    if (!connectSession?.id || connectSession.status !== "running") return;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/codex/connect?id=${encodeURIComponent(connectSession.id)}`, { cache: "no-store" });
        const data = (await response.json()) as ConnectSession & { error?: string };
        if (!response.ok) throw new Error(data.error ?? "Failed to load Codex login");
        setConnectSession(data);
        if (data.status !== "running") void refreshCodexStatus(data.user);
      } catch (error) {
        setConnectSession((current) =>
          current
            ? {
                ...current,
                status: "failed",
                error: error instanceof Error ? error.message : "Failed to load Codex login",
              }
            : current,
        );
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [connectSession?.id, connectSession?.status]);

  const selectedChat = useMemo(
    () => chats.find((chat) => chat.id === selectedChatId) ?? chats[0] ?? demoChats[0],
    [chats, selectedChatId],
  );

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? projects[0] ?? demoProjects[0],
    [projects, selectedProjectId],
  );

  const currentUser =
    users.find((user) => user.username === currentUsername) ??
    users[0] ??
    ({ id: currentUsername || "pending", username: currentUsername || "", fullName: currentUsername || "" } satisfies GiteaUser);
  const currentUserAgent = currentUser ? agents.find((agent) => agent.ownerUsername === currentUser.username) ?? defaultAgentForUser(currentUser) : undefined;
  const activeAgent =
    agents.find((agent) => agent.handle === selectedAgentHandle) ??
    currentUserAgent ??
    agents[0];
  const currentCodexStatus = currentUser?.username ? codexStatuses[currentUser.username] : undefined;
  const activeAgentCodexStatus = activeAgent ? codexStatuses[activeAgent.ownerUsername] : undefined;
  const detailAgent = detailAgentHandle ? agents.find((agent) => agent.handle === detailAgentHandle) : undefined;
  const giteaOnline = Boolean(giteaStatus?.online);
  const isAdmin = Boolean(currentUser?.username && (adminUsername ? currentUser.username === adminUsername : users[0]?.username === currentUser.username));
  const visibleChats = useMemo(
    () => chats.filter((chat) => isAdmin || !chat.members?.length || chat.members.includes(currentUser.username)),
    [chats, currentUser.username, isAdmin],
  );
  const appUrl = publicAppUrl || (typeof window === "undefined" ? "" : window.location.origin);
  const inviteUrl = `${appUrl || ""}/invite?host=${encodeURIComponent(adminUsername || currentUser?.username || "admin")}`;
  const profileUrl = currentUser.username ? giteaProfileUrl(currentUser, giteaStatus) : undefined;
  const connectedMembers = users.filter((user) => codexStatuses[user.username]?.configured);
  const visibleMessages = selectedChat?.messages ?? [];
  const taskRuns = visibleMessages.filter(isWorkflowMessage);
  const lastRun = [...taskRuns].reverse().find((message) => !isStartedMessage(message));
  const activeRun = [...taskRuns].reverse().find((message) => isStartedMessage(message));
  const pendingWorkflowStarts = useMemo(() => pendingWorkflowStartsFromMessages(visibleMessages), [visibleMessages]);

  useEffect(() => {
    if (!isAuthenticated || !selectedChat?.id || !pendingWorkflowStarts.length) return;
    let cancelled = false;

    async function syncWorkflowResults() {
      for (const pending of pendingWorkflowStarts) {
        try {
          const response = await fetch(`/api/agent/workflows/${encodeURIComponent(pending.workflowId)}`, { cache: "no-store" });
          const data = (await response.json()) as { workflow?: AgentWorkflow; error?: string };
          if (!response.ok || !data.workflow) continue;
          if (data.workflow.state !== "completed" && data.workflow.state !== "failed") continue;
          if (cancelled) return;
          addMessage(selectedChat.id, workflowResultMessage(data.workflow, pending.agentHandle));
        } catch {
          // Keep this quiet; the visible workflow monitor still shows detailed errors.
        }
      }
    }

    void syncWorkflowResults();
    const timer = window.setInterval(() => void syncWorkflowResults(), 10000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [isAuthenticated, pendingWorkflowStarts, selectedChat?.id]);

  async function refreshState(preferredUser = currentUsername) {
    const response = await fetch("/api/solo-leveling/state", { cache: "no-store" });
    const data = await parseJsonResponse<SoloLevelingStateResponse>(response, "Failed to load state");
    if (!response.ok) throw new Error(data.error ?? "Failed to load state");

    const nextProjects = data.projects?.length ? data.projects : demoProjects;
    const nextChats = data.chats?.length ? data.chats : demoChats;
    const nextUsers = data.users ?? [];
    const nextAgents = data.agents ?? [];
    const nextUser = nextUsers.find((user) => user.username === preferredUser)?.username ?? nextUsers[0]?.username ?? "";
    const nextChat = nextChats.find((chat) => chat.id === selectedChatId) ?? nextChats[0] ?? demoChats[0];
    const nextProject = nextProjects.find((project) => project.id === selectedProjectId) ?? nextProjects[0] ?? demoProjects[0];
    const nextSelectedAgent = nextAgents.find((agent) => agent.handle === selectedAgentHandle)?.handle ?? nextAgents.find((agent) => agent.ownerUsername === nextUser)?.handle ?? nextAgents[0]?.handle ?? "";

    setProjects(nextProjects);
    setChats(nextChats);
    setUsers(nextUsers);
    setAgents(nextAgents);
    setSource(data.source ?? "mock");
    setAdminUsername(data.adminUsername ?? nextUsers[0]?.username ?? "");
    setPublicAppUrl(data.publicAppUrl?.replace(/\/$/, "") ?? "");
    setCurrentUsername((current) => (nextUsers.some((user) => user.username === current) ? current : nextUser));
    setLoginUsername((current) => current || "");
    setSelectedProjectId(nextProject.id);
    setSelectedChatId((current) => (nextChats.some((chat) => chat.id === current) ? current : nextChat.id));
    setSelectedAgentHandle((current) => (nextAgents.some((agent) => agent.handle === current) ? current : nextSelectedAgent));
    return { users: nextUsers, agents: nextAgents, projects: nextProjects, chats: nextChats, adminUsername: data.adminUsername ?? nextUsers[0]?.username ?? "" };
  }

  async function refreshCodexStatus(username: string) {
    try {
      const response = await fetch(`/api/codex/status?user=${encodeURIComponent(username)}`, { cache: "no-store" });
      const data = (await response.json()) as CodexStatus;
      setCodexStatuses((current) => ({ ...current, [username]: data }));
    } catch {
      setCodexStatuses((current) => {
        const next = { ...current };
        delete next[username];
        return next;
      });
    }
  }

  async function refreshGiteaStatus() {
    try {
      const response = await fetch("/api/gitea/status", { cache: "no-store" });
      const data = (await response.json()) as GiteaStatus;
      setGiteaStatus(data);
      return data;
    } catch {
      const offline = {
        configured: false,
        online: false,
        baseUrl: "",
        publicBaseUrl: "",
        message: "Could not load Gitea status.",
      };
      setGiteaStatus(offline);
      return offline;
    }
  }

  async function refreshPullRequests(project = selectedProject) {
    if (giteaStatus && !giteaStatus.online) {
      setPullRequests([]);
      return;
    }
    setPullsBusy(true);
    try {
      const response = await fetch(
        `/api/gitea/pulls?owner=${encodeURIComponent(project.owner)}&repo=${encodeURIComponent(project.repo)}&state=open`,
        { cache: "no-store" },
      );
      const data = (await response.json()) as { pullRequests?: PullRequestSummary[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Failed to load pull requests");
      setPullRequests(data.pullRequests ?? []);
    } catch {
      setPullRequests([]);
    } finally {
      setPullsBusy(false);
    }
  }

  function selectChat(chat: ChatRoom) {
    setSelectedChatId(chat.id);
  }

  function resolveMentionedAgent(value: string) {
    const mention = mentionedAgentHandle(value);
    if (!mention) return undefined;
    return agents.find((agent) => agent.handle.toLowerCase() === mention.toLowerCase());
  }

  function resolveMentionedProject(value: string) {
    const reference = mentionedProjectRef(value);
    if (!reference) return undefined;
    return projects.find((project) => projectMatchesRef(project, reference));
  }

  function shouldRunAgentWorkflow(value: string) {
    if (mentionedProjectRef(value)) return true;
    return /\b(fix|implement|build|create|update|change|refactor|debug|test|run|review|merge|pull request|pr|branch|repo|repository|codebase|file|commit|deploy|issue|bug|feature|work on|work in)\b/i.test(value);
  }

  function agentConversationReply(agent: AgentProfile) {
    const projectHint = selectedProject?.repo ? ` Mention ${projectMention(selectedProject)} when you want me to work in the current workspace.` : "";
    return `I'm ${agent.name}. We can talk in this chat, and I will only start repository work when you ask for code/project work or mention a #project.${projectHint}`;
  }

  function login(username: string) {
    window.localStorage.setItem("solo-leveling-auth", "signed-in");
    window.localStorage.setItem("solo-leveling-profile", username);
    setCurrentUsername(username);
    setLoginUsername(username);
    setIsAuthenticated(true);
    void refreshState(username);
    void refreshCodexStatus(username);
  }

  async function signIn() {
    setAuthError(null);
    const username = loginUsername.trim();
    if (!username) return;

    try {
      const response = await fetch("/api/auth/gitea", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password: loginPassword }),
      });
      const data = await parseJsonResponse<{ user?: GiteaUser; error?: string }>(response, "Gitea login failed");
      if (!response.ok || !data.user) throw new Error(data.error ?? "Gitea login failed");
      login(data.user.username);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Gitea login failed");
    }
  }

  async function createAccount() {
    setAuthError(null);
    const username = loginUsername.trim();
    const email = registerEmail.trim();
    if (!username || !email || !registerPassword) return;

    try {
      const response = await fetch("/api/auth/gitea/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          email,
          password: registerPassword,
          fullName: registerName.trim() || username,
        }),
      });
      const data = await parseJsonResponse<{ user?: GiteaUser; error?: string }>(response, "Gitea account creation failed");
      if (!response.ok || !data.user) throw new Error(data.error ?? "Gitea account creation failed");
      login(data.user.username);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Gitea account creation failed");
    }
  }

  function logout() {
    window.localStorage.removeItem("solo-leveling-auth");
    window.localStorage.removeItem("solo-leveling-profile");
    setIsAuthenticated(false);
    setTask("");
    setConnectSession(null);
  }

  async function copyInviteLink() {
    try {
      await window.navigator.clipboard.writeText(inviteUrl);
      setCopiedInvite(true);
      window.setTimeout(() => setCopiedInvite(false), 1600);
    } catch {
      setCopiedInvite(false);
    }
  }

  function persistMessage(chatId: string, message: ChatMessage) {
    void fetch("/api/solo-leveling/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId, message }),
    });
  }

  function addMessage(chatId: string, message: ChatMessage, persist = true) {
    const alreadyExists = chats.some((chat) => chat.id === chatId && chat.messages.some((existing) => existing.id === message.id));
    setChats((current) =>
      current.map((chat) => {
        if (chat.id !== chatId) return chat;
        if (chat.messages.some((existing) => existing.id === message.id)) return chat;
        return { ...chat, messages: [...chat.messages, message] };
      }),
    );
    if (persist && !alreadyExists) persistMessage(chatId, message);
  }

  function pushActionNotice(input: Omit<ActionNotice, "id">) {
    const id = `notice-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setActionNotices((current) => [{ id, ...input }, ...current].slice(0, 4));
    window.setTimeout(() => {
      setActionNotices((current) => current.filter((notice) => notice.id !== id));
    }, 4200);
  }

  async function createChat() {
    const title = newChat.title.trim();
    if (!title || !currentUser.username) return;
    setChatBusy(true);
    try {
      const response = await fetch("/api/solo-leveling/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: "Shared human-agent chat.",
          members: [currentUser.username],
          agentHandles: [],
          projectRefs: [],
          author: currentUser.username,
        }),
      });
      const data = (await response.json()) as { chat?: ChatRoom; error?: string };
      if (!response.ok || !data.chat) throw new Error(data.error ?? "Failed to create chat");
      setChats((current) => [data.chat!, ...current.filter((chat) => chat.id !== data.chat!.id)]);
      setSelectedChatId(data.chat.id);
      setNewChat({ title: "" });
      setSheetMode(null);
      pushActionNotice({ kind: "success", title: "Chat created", body: title });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create chat";
      pushActionNotice({ kind: "error", title: "Chat not created", body: message });
      addMessage(selectedChat.id, {
        id: `chat-error-${Date.now()}`,
        author: activeAgent?.handle ?? "system",
        body: message,
        time: now(),
        kind: "agent",
      });
    } finally {
      setChatBusy(false);
    }
  }

  async function deleteChat(chat: ChatRoom) {
    if (!chat.id) return;
    setChatDeleteBusy(chat.id);
    try {
      const response = await fetch("/api/solo-leveling/chats", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: chat.id, actor: currentUser.username, adminUsername }),
      });
      const data = (await response.json()) as { chats?: ChatRoom[]; nextChat?: ChatRoom; error?: string };
      if (!response.ok || !data.nextChat) throw new Error(data.error ?? "Failed to delete chat");
      const nextChats = data.chats?.length ? data.chats : [data.nextChat];
      setChats(nextChats);
      setSelectedChatId(data.nextChat.id);
    } catch (error) {
      addMessage(selectedChat.id, {
        id: `chat-delete-error-${Date.now()}`,
        author: "system",
        body: error instanceof Error ? error.message : "Failed to delete chat",
        time: now(),
        kind: "agent",
      });
    } finally {
      setChatDeleteBusy(null);
    }
  }

  async function leaveChat(chat: ChatRoom) {
    if (!chat.id || !currentUser.username) return;
    const confirmed = window.confirm(`Leave ${chat.title}?`);
    if (!confirmed) return;
    setChatLeaveBusy(chat.id);
    try {
      const response = await fetch("/api/solo-leveling/chats", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: chat.id, action: "leave", actor: currentUser.username }),
      });
      const data = (await response.json()) as { chat?: ChatRoom; error?: string };
      if (!response.ok || !data.chat) throw new Error(data.error ?? "Failed to leave chat");

      const nextChats = chats.map((candidate) => (candidate.id === data.chat!.id ? data.chat! : candidate));
      const nextVisibleChats = nextChats.filter((candidate) => isAdmin || !candidate.members?.length || candidate.members.includes(currentUser.username));
      setChats(nextChats);
      if (selectedChat.id === chat.id) {
        setSelectedChatId(nextVisibleChats[0]?.id ?? nextChats[0]?.id ?? "");
      }
    } catch (error) {
      addMessage(selectedChat.id, {
        id: `chat-leave-error-${Date.now()}`,
        author: "system",
        body: error instanceof Error ? error.message : "Failed to leave chat",
        time: now(),
        kind: "agent",
      });
    } finally {
      setChatLeaveBusy(null);
    }
  }

  async function inviteUserToChat(username: string) {
    if (!username || !selectedChat?.id) return;
    const members = Array.from(new Set([...(selectedChat.members ?? []), currentUser.username, username].filter(Boolean)));
    try {
      const response = await fetch("/api/solo-leveling/chats", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: selectedChat.id, members }),
      });
      const data = (await response.json()) as { chat?: ChatRoom; error?: string };
      if (!response.ok || !data.chat) throw new Error(data.error ?? "Failed to invite user");
      setChats((current) => current.map((chat) => (chat.id === data.chat!.id ? data.chat! : chat)));
    } catch (error) {
      addMessage(selectedChat.id, {
        id: `chat-invite-error-${Date.now()}`,
        author: "system",
        body: error instanceof Error ? error.message : "Failed to invite user",
        time: now(),
        kind: "agent",
      });
    }
  }

  async function createProject() {
    const name = newProject.name.trim();
    if (!name || !currentUser.username) return;
    setProjectBusy(true);
    try {
      const status = await refreshGiteaStatus();
      if (!status.online) throw new Error(status.message);
      const response = await fetch("/api/gitea/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          private: true,
          owner: currentUser.username,
        }),
      });
      const data = (await response.json()) as { project?: Project; source?: ProjectSource; error?: string };
      if (!response.ok || !data.project) throw new Error(data.error ?? "Failed to create project");

      const project = { ...data.project, chats: [] };
      setProjects((current) => [project, ...current.filter((candidate) => candidate.id !== project.id && candidate.repo !== project.repo)]);
      setSelectedProjectId(project.id);
      setSource(data.source ?? source);
      setNewProject({ name: "" });
      setSheetMode(null);
      pushActionNotice({ kind: "success", title: "Project created", body: project.name });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create project";
      pushActionNotice({ kind: "error", title: "Project not created", body: message });
      addMessage(selectedChat.id, {
        id: `project-error-${Date.now()}`,
        author: activeAgent?.handle ?? "agent",
        body: message,
        time: now(),
        kind: "agent",
      });
    } finally {
      setProjectBusy(false);
    }
  }

  async function deleteProject(project: Project) {
    if (!project || !currentUser.username) return;
    setProjectDeleteBusy(project.id);
    try {
      const response = await fetch("/api/gitea/projects", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner: project.owner, repo: project.repo }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Failed to delete project");

      const nextProjects = projects.filter((candidate) => candidate.id !== project.id && candidate.repo !== project.repo);
      const fallbackProject = nextProjects[0] ?? demoProjects[0];
      setProjects(nextProjects.length ? nextProjects : [fallbackProject]);
      setSelectedProjectId((current) => (current === project.id ? fallbackProject.id : current));
      await refreshState(currentUser.username);
    } catch (error) {
      addMessage(selectedChat.id, {
        id: `project-delete-error-${Date.now()}`,
        author: activeAgent?.handle ?? "agent",
        body: error instanceof Error ? error.message : "Failed to delete project",
        time: now(),
        kind: "agent",
      });
    } finally {
      setProjectDeleteBusy(null);
    }
  }

  async function confirmDeleteTarget() {
    const target = deleteTarget;
    setDeleteTarget(null);
    if (!target) return;
    if (target.kind === "chat") {
      await deleteChat(target.chat);
      return;
    }
    await deleteProject(target.project);
  }

  async function createAgent() {
    if (!currentUser.username) return;
    const name = newAgent.name.trim();
    if (!name) return;
    const handle = `agent-${slugValue(name) || slugValue(currentUser.username)}`.replace(/^@/, "");
    setAgentBusy(true);
    try {
      const response = await fetch("/api/solo-leveling/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handle,
          name,
          ownerUsername: currentUser.username,
          role: newAgent.role.trim() || defaultAgentRole,
          instructions: newAgent.instructions.trim() || defaultAgentInstructions,
          personality: defaultAgentPersonality,
          examples: [],
        }),
      });
      const data = (await response.json()) as { agent?: AgentProfile; error?: string };
      if (!response.ok || !data.agent) throw new Error(data.error ?? "Failed to create agent");
      setAgents((current) => [data.agent!, ...current.filter((agent) => agent.handle !== data.agent!.handle)]);
      setSelectedAgentHandle(data.agent.handle);
      setNewAgent({
        name: "",
        role: defaultAgentRole,
        instructions: "",
      });
      setSheetMode(null);
      pushActionNotice({ kind: "success", title: "Agent added", body: `@${data.agent.handle}` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create agent";
      setAuthError(message);
      pushActionNotice({ kind: "error", title: "Agent not added", body: message });
    } finally {
      setAgentBusy(false);
    }
  }

  async function startCodexConnect() {
    const user = currentUser.username;
    if (!user) return;
    setConnectBusy(true);
    try {
      const response = await fetch("/api/codex/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user }),
      });
      const data = (await response.json()) as ConnectSession & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Failed to start Codex login");
      setConnectSession(data);
    } catch (error) {
      setConnectSession({
        id: `connect-error-${Date.now()}`,
        user,
        status: "failed",
        output: "",
        startedAt: new Date().toISOString(),
        loginCommand: currentCodexStatus?.loginCommand ? `${currentCodexStatus.loginCommand} --device-auth` : "",
        error: error instanceof Error ? error.message : "Failed to start Codex login",
      });
    } finally {
      setConnectBusy(false);
    }
  }

  async function runTask() {
    const prompt = task.trim();
    const targetChat = selectedChat;
    if (!prompt || !targetChat) return;

    const targetAgent = resolveMentionedAgent(prompt);
    if (!targetAgent) {
      const userMessage: ChatMessage = { id: `msg-${Date.now()}`, author: currentUser.username, body: prompt, time: now(), self: true };
      addMessage(targetChat.id, userMessage);
      setTask("");
      return;
    }

    if (!shouldRunAgentWorkflow(prompt)) {
      const timestamp = Date.now();
      addMessage(targetChat.id, { id: `msg-${timestamp}`, author: currentUser.username, body: prompt, time: now(), self: true });
      addMessage(targetChat.id, {
        id: `agent-chat-${timestamp}`,
        author: targetAgent.handle,
        body: agentConversationReply(targetAgent),
        time: now(),
        kind: "agent",
      });
      setTask("");
      return;
    }

    const targetProject = resolveMentionedProject(prompt) ?? selectedProject;
    const targetCodexStatus = targetAgent ? codexStatuses[targetAgent.ownerUsername] : undefined;
    if (targetProject.id !== selectedProject.id) {
      setSelectedProjectId(targetProject.id);
    }
    if (!targetCodexStatus?.configured) {
      if (targetAgent.ownerUsername !== currentUser.username) {
        const userMessage: ChatMessage = { id: `msg-${Date.now()}`, author: currentUser.username, body: prompt, time: now(), self: true };
        addMessage(targetChat.id, userMessage);
        addMessage(targetChat.id, {
          id: `codex-missing-${Date.now()}`,
          author: targetAgent.handle,
          body: `@${targetAgent.handle} belongs to ${targetAgent.ownerUsername}, but that user has not connected ChatGPT/Codex on this host yet.`,
          time: now(),
          kind: "agent",
        });
        setTask("");
        return;
      }
      window.location.href = "/settings/chatgpt";
      return;
    }
    const status = await refreshGiteaStatus();
    if (!status.online) {
      const userMessage: ChatMessage = { id: `msg-${Date.now()}`, author: currentUser.username, body: prompt, time: now(), self: true };
      addMessage(targetChat.id, userMessage);
      addMessage(targetChat.id, {
        id: `gitea-offline-${Date.now()}`,
        author: targetAgent.handle,
        body: `${status.message}\n\nI can join the chat, but I cannot clone repositories, create projects, push branches, or open pull requests until Gitea is reachable.`,
        time: now(),
        kind: "agent",
      });
      setTask("");
      return;
    }

    setTask("");
    setTaskBusy(true);
    const userMessage: ChatMessage = { id: `msg-${Date.now()}`, author: currentUser.username, body: prompt, time: now(), self: true };
    addMessage(targetChat.id, userMessage);

    try {
      const response = await fetch("/api/agent/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          project: targetProject,
          agentHandle: targetAgent.handle,
          agentName: targetAgent.name,
          agentInstructions: agentInstructions(targetAgent),
          user: targetAgent.ownerUsername,
        }),
      });
      const data = (await response.json()) as { workflow?: AgentWorkflow; error?: string };
      if (!response.ok || !data.workflow) throw new Error(data.error ?? "Failed to start workflow");

      const workflow = data.workflow;
      addMessage(targetChat.id, {
        id: `${workflow.id}-started`,
        author: targetAgent.handle,
        body: `Run started for ${projectMention(targetProject)}.\nBranch: ${workflow.branch}\nMonitor: ${workflowMonitorUrl(workflow.id)}`,
        time: now(),
        kind: "agent",
      });
      pollWorkflow(workflow.id, targetChat.id, targetAgent.handle);
    } catch (error) {
      addMessage(targetChat.id, {
        id: `run-error-${Date.now()}`,
        author: targetAgent.handle,
        body: error instanceof Error ? error.message : "Failed to start workflow",
        time: now(),
        kind: "agent",
      });
    } finally {
      setTaskBusy(false);
    }
  }

  function pollWorkflow(workflowId: string, chatId: string, agentHandle: string) {
    let attempts = 0;
    const timer = window.setInterval(async () => {
      attempts += 1;
      try {
        const response = await fetch(`/api/agent/workflows/${encodeURIComponent(workflowId)}`, { cache: "no-store" });
        const data = (await response.json()) as { workflow?: AgentWorkflow; error?: string };
        if (!response.ok || !data.workflow) throw new Error(data.error ?? "Failed to load workflow");

        const workflow = data.workflow;
        if (workflow.state === "completed" || workflow.state === "failed" || attempts > 240) {
          window.clearInterval(timer);
          addMessage(chatId, workflowResultMessage(workflow, agentHandle));
          void refreshState(currentUser.username);
        }
      } catch (error) {
        if (attempts > 8) {
          window.clearInterval(timer);
          addMessage(chatId, {
            id: `${workflowId}-poll-error`,
            author: agentHandle,
            body: error instanceof Error ? error.message : "Workflow polling failed.",
            time: now(),
            kind: "agent",
          });
        }
      }
    }, 2500);
  }

  async function mergePullRequest(pullRequest: PullRequestSummary) {
    setMergeBusy(pullRequest.number);
    try {
      const response = await fetch("/api/gitea/pulls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner: selectedProject.owner,
          repo: selectedProject.repo,
          index: pullRequest.number,
          method: "merge",
          deleteBranch: true,
        }),
      });
      const data = (await response.json()) as { pullRequest?: PullRequestSummary; error?: string };
      if (!response.ok || !data.pullRequest) throw new Error(data.error ?? "Failed to merge pull request");

      addMessage(selectedChat.id, {
        id: `pr-merged-${Date.now()}`,
        author: activeAgent?.handle ?? "agent",
        body: `Merged pull request #${data.pullRequest.number} into ${data.pullRequest.base ?? selectedProject.defaultBranch}.\nPull request: ${data.pullRequest.url}`,
        time: now(),
        kind: "agent",
      });
      await refreshState(currentUser.username);
      await refreshPullRequests(selectedProject);
    } catch (error) {
      addMessage(selectedChat.id, {
        id: `pr-error-${Date.now()}`,
        author: activeAgent?.handle ?? "agent",
        body: error instanceof Error ? error.message : "Failed to merge pull request",
        time: now(),
        kind: "agent",
      });
    } finally {
      setMergeBusy(null);
    }
  }

  if (!authReady) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading
        </div>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <HeroPage
        source={source}
        mode={authMode}
        username={loginUsername}
        password={loginPassword}
        registerName={registerName}
        registerEmail={registerEmail}
        registerPassword={registerPassword}
        error={authError}
        onModeChange={setAuthMode}
        onUsernameChange={setLoginUsername}
        onPasswordChange={setLoginPassword}
        onRegisterNameChange={setRegisterName}
        onRegisterEmailChange={setRegisterEmail}
        onRegisterPasswordChange={setRegisterPassword}
        onSignIn={() => void signIn()}
        onCreate={() => void createAccount()}
      />
    );
  }

  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground lg:h-screen lg:min-h-0 lg:overflow-hidden">
      <AppTopBar
        currentUser={currentUser}
        selectedProject={selectedProject}
        copiedInvite={copiedInvite}
        codexReady={Boolean(currentCodexStatus?.configured)}
        profileUrl={profileUrl}
        users={users}
        connectedMembers={connectedMembers}
        adminUsername={adminUsername}
        onInvite={() => void copyInviteLink()}
        onAddAgent={() => setSheetMode("agent")}
        onMembers={() => setSheetMode("members")}
        onLogout={logout}
      />
      <ActionNoticeStack notices={actionNotices} />

      <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[300px_minmax(0,1fr)_320px]">
      <aside className="grid max-h-[72vh] min-h-[420px] grid-rows-[minmax(0,1fr)_minmax(0,1fr)] border-b border-border lg:h-full lg:max-h-none lg:min-h-0 lg:border-b-0 lg:border-r">
        <section className="flex min-h-0 flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Chats</div>
            <Button variant="ghost" size="sm" onClick={() => setSheetMode("chat")}>
              <Plus className="h-4 w-4" />
              New chat
            </Button>
          </div>

          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-1 p-2">
              {visibleChats.map((chat) => {
                const canDeleteChat = isAdmin || chat.ownerUsername === currentUser.username;
                const canLeaveChat = !canDeleteChat && chat.members.includes(currentUser.username);
                return (
                  <div
                    key={chat.id}
                    className={cn(
                      "flex items-center gap-1 rounded-md border border-transparent transition hover:bg-secondary",
                      selectedChat.id === chat.id && "border-border bg-secondary",
                    )}
                  >
                    <button type="button" onClick={() => selectChat(chat)} className="flex min-w-0 flex-1 flex-col px-3 py-3 text-left">
                      <span className="block min-w-0 truncate text-sm font-medium">{chat.title}</span>
                      <span className="block min-w-0 truncate text-xs text-muted-foreground">
                        {chat.ownerUsername === currentUser.username ? "Owner" : `Owner: ${chat.ownerUsername ?? "team"}`}
                      </span>
                    </button>
                    {canDeleteChat ? (
                      <Button
                        variant="destructive"
                        size="icon"
                        className="mr-1 h-7 w-7 shrink-0"
                        disabled={chatDeleteBusy === chat.id}
                        aria-label={`Delete ${chat.title}`}
                        onClick={() => setDeleteTarget({ kind: "chat", chat })}
                      >
                        {chatDeleteBusy === chat.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </Button>
                    ) : canLeaveChat ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mr-1 h-8 shrink-0 px-2 text-xs"
                        disabled={chatLeaveBusy === chat.id}
                        onClick={() => void leaveChat(chat)}
                      >
                        {chatLeaveBusy === chat.id ? "Leaving" : "Leave"}
                      </Button>
                    ) : null}
                  </div>
                );
              })}
              {!visibleChats.length ? (
                <div className="rounded-md border border-border p-3 text-sm text-muted-foreground">No chats shared with you yet.</div>
              ) : null}
            </div>
          </ScrollArea>
        </section>

        <section className="flex min-h-0 flex-col border-t border-border">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Projects</div>
            <Button variant="ghost" size="sm" onClick={() => setSheetMode("project")}>
              <Plus className="h-4 w-4" />
              New project
            </Button>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-1 p-2">
              {projects.map((project) => (
                <div
                  key={project.id}
                  className={cn(
                    "flex items-center gap-2 rounded-md border border-transparent px-2 py-2 transition hover:bg-secondary",
                    selectedProject.id === project.id && "border-border bg-secondary",
                  )}
                >
                  <a
                    href={projectBaseUrl(project)}
                    target="_blank"
                    rel="noreferrer"
                    className="min-w-0 flex-1"
                    onClick={() => setSelectedProjectId(project.id)}
                  >
                    <span className="block truncate text-sm font-medium">{project.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">Workspace: {project.name}</span>
                  </a>
                  <Button
                    variant="destructive"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    disabled={projectDeleteBusy === project.id}
                    aria-label={`Delete ${project.name}`}
                    onClick={() => setDeleteTarget({ kind: "project", project })}
                  >
                    {projectDeleteBusy === project.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              ))}
              {!projects.length ? (
                <div className="rounded-md border border-border p-3 text-sm text-muted-foreground">No projects yet.</div>
              ) : null}
            </div>
          </ScrollArea>
        </section>
      </aside>

      <section className="flex min-h-0 flex-col">
        <header className="flex min-h-14 shrink-0 items-center border-b border-border px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold">{selectedChat?.title ?? "Workspace chat"}</h1>
          </div>
        </header>

        {!giteaOnline ? (
          <div className="border-b border-border px-5 py-3 text-sm leading-6 text-muted-foreground">
            <span className="font-medium text-foreground">Gitea is offline. </span>
            {giteaStatus?.message ?? "Start Gitea before creating projects or running agents."}
          </div>
        ) : null}

        <ChatMessages messages={visibleMessages} currentUsername={currentUser.username} />

        <TaskComposer
          value={task}
          disabled={taskBusy}
          busy={taskBusy}
          users={users}
          agents={agents}
          projects={projects}
          textareaRef={taskRef}
          onChange={setTask}
          onRun={() => void runTask()}
        />
      </section>

      <aside className="flex min-h-0 flex-col border-t border-border lg:border-l lg:border-t-0">
        <TeamPanel
          users={users}
          agents={agents}
          selectedChat={selectedChat}
          codexStatuses={codexStatuses}
          selectedAgentHandle={activeAgent?.handle ?? ""}
          currentUsername={currentUser.username}
          onAgentSelect={(handle) => {
            setSelectedAgentHandle(handle);
            setDetailAgentHandle(handle);
          }}
          onInviteUser={(username) => void inviteUserToChat(username)}
        />
      </aside>
      </div>

      <Sheet open={sheetMode === "chat"} onOpenChange={(open) => setSheetMode(open ? "chat" : null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>New chat</SheetTitle>
            <SheetDescription>Create a conversation, then mention @ users, @ agents, and # projects in messages.</SheetDescription>
          </SheetHeader>
          <form
            className="mt-6 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!newChat.title.trim() || chatBusy) return;
              void createChat();
            }}
          >
            <Field label="Name">
              <Input value={newChat.title} onChange={(event) => setNewChat((current) => ({ ...current, title: event.target.value }))} placeholder="Release planning" />
            </Field>
            <Button type="submit" className="w-full" disabled={!newChat.title.trim() || chatBusy}>
              {chatBusy ? "Starting..." : "Start chat"}
            </Button>
          </form>
        </SheetContent>
      </Sheet>

      <Sheet open={sheetMode === "project"} onOpenChange={(open) => setSheetMode(open ? "project" : null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>New project</SheetTitle>
            <SheetDescription>{giteaOnline ? `Create a repository under ${currentUser.username}.` : "Gitea is offline. Start the Gitea server before creating a repository."}</SheetDescription>
          </SheetHeader>
          <form
            className="mt-6 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!newProject.name.trim() || projectBusy || !giteaOnline) return;
              void createProject();
            }}
          >
            <Field label="Name">
              <Input value={newProject.name} onChange={(event) => setNewProject({ name: event.target.value })} placeholder="web-dashboard" />
            </Field>
            <Button type="submit" className="w-full" disabled={!newProject.name.trim() || projectBusy || !giteaOnline}>
              {projectBusy ? "Creating..." : "Create repository"}
            </Button>
          </form>
        </SheetContent>
      </Sheet>

      <Sheet open={sheetMode === "connect"} onOpenChange={(open) => setSheetMode(open ? "connect" : null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>ChatGPT / Codex identity</SheetTitle>
            <SheetDescription>{currentUser.username}</SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <Card className="border-border bg-background shadow-none">
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <div className="text-sm font-medium">Status</div>
                  <div className="text-xs text-muted-foreground">{currentCodexStatus?.configured ? "Connected" : "Not connected"}</div>
                </div>
                <Badge variant="outline" className="rounded-md">
                  {currentCodexStatus?.configured ? "ready" : "required"}
                </Badge>
              </CardContent>
            </Card>
            <Button className="w-full" disabled={connectBusy || connectSession?.status === "running"} onClick={() => void startCodexConnect()}>
              {connectBusy || connectSession?.status === "running" ? "Starting..." : "Start device login"}
            </Button>
            {connectSession ? <DeviceLoginOutput session={connectSession} /> : null}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={sheetMode === "members"} onOpenChange={(open) => setSheetMode(open ? "members" : null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Connected members</SheetTitle>
            <SheetDescription>{connectedMembers.length} of {users.length} users have ChatGPT/Codex connected on this host.</SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <div className="space-y-2">
              {users.map((user) => {
                const connected = Boolean(codexStatuses[user.username]?.configured);
                const host = user.username === adminUsername;
                return (
                  <div key={user.username} className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <UserAvatar user={user} />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{user.username}</div>
                        <div className="truncate text-xs text-muted-foreground">{host ? "Host" : "Accepted member"}</div>
                      </div>
                    </div>
                    <Badge variant={connected ? "secondary" : "outline"} className="shrink-0 rounded-md">
                      {connected ? "ChatGPT connected" : "Needs ChatGPT"}
                    </Badge>
                  </div>
                );
              })}
              {!users.length ? (
                <div className="rounded-md border border-border p-3 text-sm text-muted-foreground">No accepted workspace members yet.</div>
              ) : null}
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
              <div>
                <div className="text-sm font-medium">Unverified users</div>
                <div className="text-xs text-muted-foreground">No users outside the workspace user list are present in app state.</div>
              </div>
              <Badge variant="outline" className="rounded-md">0</Badge>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={sheetMode === "agent"} onOpenChange={(open) => setSheetMode(open ? "agent" : null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Bring an agent</SheetTitle>
            <SheetDescription>The agent runs through {currentUser.username}&apos;s connected ChatGPT/Codex identity.</SheetDescription>
          </SheetHeader>
          <form
            className="mt-6 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (agentBusy || !newAgent.name.trim()) return;
              void createAgent();
            }}
          >
            <Field label="Name">
              <Input value={newAgent.name} onChange={(event) => setNewAgent((current) => ({ ...current, name: event.target.value }))} placeholder={`${currentUser.username} Agent`} />
            </Field>
            <Field label="Role">
              <Input value={newAgent.role} onChange={(event) => setNewAgent((current) => ({ ...current, role: event.target.value }))} />
            </Field>
            <Field label="Instructions">
              <Textarea
                value={newAgent.instructions}
                onChange={(event) => setNewAgent((current) => ({ ...current, instructions: event.target.value }))}
                className="min-h-[120px]"
              />
            </Field>
            <Button type="submit" className="w-full" disabled={agentBusy || !newAgent.name.trim()}>
              {agentBusy ? "Adding..." : "Add agent"}
            </Button>
          </form>
        </SheetContent>
      </Sheet>

      <Sheet open={Boolean(detailAgent)} onOpenChange={(open) => !open && setDetailAgentHandle(null)}>
        <SheetContent>
          {detailAgent ? (
            <>
              <SheetHeader>
                <SheetTitle>{agentMention(detailAgent)}</SheetTitle>
                <SheetDescription>{detailAgent.name}</SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-4">
                <div className="flex items-center gap-3 rounded-md border border-border p-3">
                  <Avatar className="h-10 w-10 border border-border">
                    <AvatarFallback className="text-xs">{initials(detailAgent.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{detailAgent.role}</div>
                    <div className="truncate text-xs text-muted-foreground">{detailAgent.ownerUsername}</div>
                  </div>
                  <Badge variant="outline" className="ml-auto rounded-md">
                    {codexStatuses[detailAgent.ownerUsername]?.configured ? "ready" : "connect"}
                  </Badge>
                </div>
                <InfoRow label="Handle" value={agentMention(detailAgent)} />
                <InfoRow label="Owner" value={detailAgent.ownerUsername} />
                <InfoRow label="Updated" value={new Date(detailAgent.updatedAt).toLocaleString()} />
                <div className="rounded-md border border-border p-3">
                  <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Personality</div>
                  <div className="mt-2 whitespace-pre-wrap text-sm leading-6">{detailAgent.personality}</div>
                </div>
                <div className="rounded-md border border-border p-3">
                  <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Instructions</div>
                  <div className="mt-2 whitespace-pre-wrap text-sm leading-6">{detailAgent.instructions}</div>
                </div>
                {detailAgent.examples.length ? (
                  <div className="rounded-md border border-border p-3">
                    <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Examples</div>
                    <div className="mt-2 space-y-2">
                      {detailAgent.examples.map((example) => (
                        <div key={example} className="rounded-md bg-secondary px-3 py-2 font-mono text-xs">
                          {example}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {deleteTarget?.kind === "chat" ? deleteTarget.chat.title : deleteTarget?.project.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.kind === "chat"
                ? "This removes the chat for every member. Users who do not own the chat can leave it instead."
                : "This removes the repository from Gitea. Chats that referenced it stay in the workspace."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void confirmDeleteTarget()}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function UserAvatar({ user, fallback, className = "h-8 w-8" }: { user?: GiteaUser; fallback?: string; className?: string }) {
  const label = user?.fullName || user?.username || fallback || "";
  return (
    <Avatar className={cn("border border-[#609926]/50 bg-[#609926]/10", className)}>
      {user?.avatarUrl ? (
        <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <AvatarFallback className="bg-[#609926]/20 text-[10px] font-semibold text-[#9ad06a]">{initials(label)}</AvatarFallback>
      )}
    </Avatar>
  );
}

function OpenAIStatusIcon() {
  return (
    <>
      <img src="/assets/openai-mark-black.svg" alt="" className="h-4 w-4 shrink-0 dark:hidden" />
      <img src="/assets/openai-mark-white.svg" alt="" className="hidden h-4 w-4 shrink-0 dark:block" />
    </>
  );
}

function ActionNoticeStack({ notices }: { notices: ActionNotice[] }) {
  if (!notices.length) return null;
  return (
    <div className="fixed right-4 top-16 z-50 flex w-[min(320px,calc(100vw-2rem))] flex-col gap-2">
      {notices.map((notice) => (
        <div
          key={notice.id}
          className={cn(
            "rounded-md border px-3 py-2 text-xs shadow-lg backdrop-blur",
            notice.kind === "success"
              ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-800 dark:text-emerald-100"
              : "border-destructive/40 bg-destructive/15 text-destructive dark:text-destructive-foreground",
          )}
        >
          <div className="font-semibold">{notice.title}</div>
          {notice.body ? <div className="mt-0.5 truncate opacity-85">{notice.body}</div> : null}
        </div>
      ))}
    </div>
  );
}

function AppTopBar({
  currentUser,
  selectedProject,
  copiedInvite,
  codexReady,
  profileUrl,
  users,
  connectedMembers,
  adminUsername,
  onInvite,
  onAddAgent,
  onMembers,
  onLogout,
}: {
  currentUser: GiteaUser;
  selectedProject?: Project;
  copiedInvite: boolean;
  codexReady: boolean;
  profileUrl?: string;
  users: GiteaUser[];
  connectedMembers: GiteaUser[];
  adminUsername: string;
  onInvite: () => void;
  onAddAgent: () => void;
  onMembers: () => void;
  onLogout: () => void;
}) {
  const memberRole = currentUser.username === adminUsername ? "Host" : "Member";

  return (
    <div className="shrink-0 border-b border-border bg-background">
      <div className="flex min-h-14 flex-col gap-3 px-3 py-3 lg:flex-row lg:items-center lg:justify-between lg:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <AppLogo className="h-9 w-9 shrink-0" />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">Group Leveling</div>
            <div className="truncate text-xs text-muted-foreground">
              Workspace: {selectedProject?.name ?? "No project"}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <Button variant="outline" size="sm" onClick={onInvite}>
            <span>{copiedInvite ? "Invite URL copied" : "Copy invite URL"}</span>
          </Button>
          <Button variant="outline" size="sm" onClick={onAddAgent}>
            <Plus className="h-4 w-4" />
            <span>New agent</span>
          </Button>
          <Button variant="outline" size="sm" onClick={onMembers}>
            <Users className="h-4 w-4" />
            <span>{connectedMembers.length}/{users.length} members</span>
          </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="flex h-9 w-9 items-center justify-center rounded-md border border-border outline-none transition hover:bg-secondary focus:ring-2 focus:ring-ring">
                <UserAvatar user={currentUser} className="h-6 w-6" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {profileUrl ? (
                <DropdownMenuItem asChild>
                  <a href={profileUrl} target="_blank" rel="noreferrer">
                    Profile
                  </a>
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem asChild>
                <a href="/settings">
                  Settings
                </a>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <div className="space-y-2 px-3 py-2">
                <div className="flex items-center gap-2 text-sm">
                  <OpenAIStatusIcon />
                  <span>{codexReady ? "Connected via ChatGPT" : "ChatGPT not connected"}</span>
                </div>
                {!codexReady ? (
                  <Button asChild size="sm" className="w-full">
                    <a href="/settings/chatgpt">Connect ChatGPT</a>
                  </Button>
                ) : null}
              </div>
              <DropdownMenuSeparator />
              <div className="px-2 py-1">
                <ThemeToggle />
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-muted-foreground">
                {memberRole}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onLogout}>
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}

function HeroPage({
  source,
  mode,
  username,
  password,
  registerName,
  registerEmail,
  registerPassword,
  error,
  onModeChange,
  onUsernameChange,
  onPasswordChange,
  onRegisterNameChange,
  onRegisterEmailChange,
  onRegisterPasswordChange,
  onSignIn,
  onCreate,
}: {
  source: ProjectSource;
  mode: AuthMode;
  username: string;
  password: string;
  registerName: string;
  registerEmail: string;
  registerPassword: string;
  error: string | null;
  onModeChange: (mode: AuthMode) => void;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onRegisterNameChange: (value: string) => void;
  onRegisterEmailChange: (value: string) => void;
  onRegisterPasswordChange: (value: string) => void;
  onSignIn: () => void;
  onCreate: () => void;
}) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-6 text-foreground">
      <div className="hero-wave-field" />
      <div className="absolute right-4 top-4 z-20">
        <ThemeToggle compact />
      </div>
      <Card className="relative z-10 w-full max-w-md border-border bg-background/90 shadow-2xl backdrop-blur">
        <CardHeader>
          <div className="mb-3 flex items-center gap-3">
            <AppLogo className="h-10 w-10" />
            <div>
              <CardTitle className="text-xl">Group Leveling</CardTitle>
              <CardDescription>Sign in or create a workspace profile.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 rounded-md border border-border p-1">
            <Button variant={mode === "signin" ? "secondary" : "ghost"} size="sm" onClick={() => onModeChange("signin")}>
              Sign in
            </Button>
            <Button variant={mode === "create" ? "secondary" : "ghost"} size="sm" onClick={() => onModeChange("create")}>
              Create
            </Button>
          </div>

          <Field label="Username">
            <Input value={username} onChange={(event) => onUsernameChange(event.target.value)} />
          </Field>

          {mode === "signin" ? (
            <Field label="Password">
              <Input type="password" value={password} onChange={(event) => onPasswordChange(event.target.value)} />
            </Field>
          ) : (
            <>
              <Field label="Display name">
                <Input value={registerName} onChange={(event) => onRegisterNameChange(event.target.value)} />
              </Field>
              <Field label="Email">
                <Input type="email" value={registerEmail} onChange={(event) => onRegisterEmailChange(event.target.value)} />
              </Field>
              <Field label="Password">
                <Input type="password" value={registerPassword} onChange={(event) => onRegisterPasswordChange(event.target.value)} />
              </Field>
            </>
          )}

          {error ? <div className="rounded-md border border-destructive/40 p-3 text-sm text-destructive-foreground">{error}</div> : null}

          <Button
            className="w-full"
            onClick={mode === "signin" ? onSignIn : onCreate}
            disabled={!username.trim() || (mode === "signin" && source === "gitea" && !password) || (mode === "create" && (!registerEmail.trim() || !registerPassword))}
          >
            {mode === "signin" ? "Enter workspace" : "Create profile"}
          </Button>
          <div className="rounded-md border border-border p-3 text-xs leading-5 text-muted-foreground">
            Enter at your own risk.
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

function TaskComposer({
  value,
  disabled,
  busy,
  users,
  agents,
  projects,
  textareaRef,
  onChange,
  onRun,
}: {
  value: string;
  disabled: boolean;
  busy: boolean;
  users: GiteaUser[];
  agents: AgentProfile[];
  projects: Project[];
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onChange: (value: string) => void;
  onRun: () => void;
}) {
  const [cursor, setCursor] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const trigger = mentionTrigger(value, cursor);
  const suggestions = useMemo(() => composerSuggestions(trigger, users, agents, projects), [trigger, users, agents, projects]);
  const showSuggestions = Boolean(trigger && suggestions.length);

  useEffect(() => {
    setActiveIndex(0);
  }, [trigger?.symbol, trigger?.query]);

  useEffect(() => {
    resizeTextarea(textareaRef.current);
  }, [textareaRef, value]);

  function updateCursor(target: HTMLTextAreaElement | null) {
    if (!target) return;
    setCursor(target.selectionStart ?? 0);
  }

  function resizeTextarea(target: HTMLTextAreaElement | null) {
    if (!target) return;
    target.style.height = "auto";
    target.style.height = `${Math.min(Math.max(target.scrollHeight, 74), 220)}px`;
  }

  function applySuggestion(suggestion: ComposerSuggestion) {
    const activeTrigger = mentionTrigger(value, textareaRef.current?.selectionStart ?? cursor) ?? trigger;
    if (!activeTrigger) return;
    const before = value.slice(0, activeTrigger.start);
    const after = value.slice(activeTrigger.end);
    const nextValue = `${before}${suggestion.token} ${after}`;
    const nextCursor = before.length + suggestion.token.length + 1;
    onChange(nextValue);
    setActiveIndex(0);
    setCursor(nextCursor);
    window.setTimeout(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCursor, nextCursor);
    }, 0);
  }

  return (
    <div className="border-t border-border bg-background p-4">
      <div className="mx-auto w-full max-w-4xl">
        <div className="relative">
          <Textarea
            ref={textareaRef}
            value={value}
            spellCheck={false}
            autoCorrect="off"
            onChange={(event) => {
              onChange(event.target.value);
              updateCursor(event.target);
              resizeTextarea(event.target);
            }}
            onClick={(event) => updateCursor(event.currentTarget)}
            onFocus={(event) => updateCursor(event.currentTarget)}
            onKeyUp={(event) => updateCursor(event.currentTarget)}
            placeholder="Message @person, @agent, or #project"
            className="min-h-[74px] max-h-[220px] resize-none overflow-y-auto bg-background/70 leading-6 text-foreground caret-foreground placeholder:text-muted-foreground"
            onKeyDown={(event) => {
              const activeTrigger = mentionTrigger(value, event.currentTarget.selectionStart ?? cursor);
              const activeSuggestions = activeTrigger ? composerSuggestions(activeTrigger, users, agents, projects) : [];
              if (showSuggestions && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
                event.preventDefault();
                setActiveIndex((current) => {
                  const direction = event.key === "ArrowDown" ? 1 : -1;
                  return (current + direction + suggestions.length) % suggestions.length;
                });
                return;
              }
              if (showSuggestions && event.key === "Tab") {
                event.preventDefault();
                const suggestion = activeSuggestions[activeIndex] ?? activeSuggestions[0] ?? suggestions[activeIndex] ?? suggestions[0];
                if (suggestion) applySuggestion(suggestion);
                return;
              }
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (activeTrigger) {
                  if (activeSuggestions.length || showSuggestions) {
                    const suggestion = activeSuggestions[activeIndex] ?? activeSuggestions[0] ?? suggestions[activeIndex] ?? suggestions[0];
                    if (suggestion) applySuggestion(suggestion);
                  }
                  return;
                }
                onRun();
              }
            }}
          />
          {showSuggestions ? (
            <div className="absolute bottom-full left-0 z-50 mb-2 w-full max-w-md overflow-hidden rounded-md border border-border bg-background shadow-2xl ring-1 ring-border">
              {suggestions.map((suggestion, index) => (
                <button
                  key={suggestion.id}
                  type="button"
                  className={cn("flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-secondary", index === activeIndex && "bg-secondary")}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    applySuggestion(suggestion);
                  }}
                >
                  <span className="min-w-0">
                    <span className={cn("block truncate font-mono", suggestion.kind === "project" ? "text-emerald-700 dark:text-emerald-300" : suggestion.kind === "agent" ? "text-sky-700 dark:text-sky-300" : "text-amber-700 dark:text-amber-300")}>
                      {suggestion.token}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">{suggestion.detail}</span>
                  </span>
                  <Badge variant="outline" className="rounded-md">
                    {suggestion.kind}
                  </Badge>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="mt-3 flex justify-end">
          <Button onClick={onRun} disabled={!value.trim() || disabled}>
            {busy ? "Sending..." : "Send"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function TeamPanel({
  users,
  agents,
  selectedChat,
  codexStatuses,
  selectedAgentHandle,
  currentUsername,
  onAgentSelect,
  onInviteUser,
}: {
  users: GiteaUser[];
  agents: AgentProfile[];
  selectedChat?: ChatRoom;
  codexStatuses: Record<string, CodexStatus>;
  selectedAgentHandle: string;
  currentUsername: string;
  onAgentSelect: (handle: string) => void;
  onInviteUser: (username: string) => void;
}) {
  const mentionedHandles = new Set<string>();
  const mentionedUsers = new Set<string>();
  for (const message of selectedChat?.messages ?? []) {
    const author = message.author.replace(/^@/, "");
    if (agents.some((agent) => agent.handle === author)) mentionedHandles.add(author);
    if (users.some((user) => user.username === author)) mentionedUsers.add(author);
    for (const mention of message.body.matchAll(/@([a-z0-9][a-z0-9-]*)/gi)) {
      const handle = mention[1];
      if (agents.some((agent) => agent.handle === handle)) mentionedHandles.add(handle);
      if (users.some((user) => user.username === handle)) mentionedUsers.add(handle);
    }
  }
  for (const member of selectedChat?.members ?? []) mentionedUsers.add(member);

  const chatUsers = users.filter((user) => mentionedUsers.has(user.username));
  const chatAgents = agents.filter((agent) => mentionedHandles.has(agent.handle));
  const memberSet = new Set(selectedChat?.members ?? []);
  const inviteOptions = users.filter((user) => user.username !== currentUsername && !memberSet.has(user.username));

  return (
    <div className="space-y-4 p-4">
      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="text-sm font-semibold">Users</div>
          {inviteOptions.length ? (
            <select
              value=""
              onChange={(event) => {
                if (!event.target.value) return;
                onInviteUser(event.target.value);
                event.currentTarget.value = "";
              }}
              className="h-8 max-w-36 rounded-md border border-input bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Invite</option>
              {inviteOptions.map((user) => (
                <option key={user.username} value={user.username}>
                  {user.username}
                </option>
              ))}
            </select>
          ) : null}
        </div>
        <div className="space-y-2">
          {chatUsers.length ? (
            chatUsers.map((user) => (
              <div key={user.username} className="flex items-center justify-between gap-3 rounded-md border border-border p-2">
                <div className="flex min-w-0 items-center gap-2">
                  <UserAvatar user={user} className="h-6 w-6" />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{user.username}</div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-md border border-border p-3 text-sm text-muted-foreground">No users in this chat yet.</div>
          )}
        </div>
      </div>

      <div>
        <div className="mb-3 text-sm font-semibold">Agents</div>
        <div className="space-y-2">
          {chatAgents.length ? (
            chatAgents.map((agent) => (
              <button
                key={agent.handle}
                type="button"
                onClick={() => onAgentSelect(agent.handle)}
                className={cn(
                  "w-full rounded-md border border-border p-3 text-left transition hover:bg-secondary",
                  selectedAgentHandle === agent.handle && "bg-secondary",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">@{agent.handle}</div>
                    <div className="truncate text-xs text-muted-foreground">{agent.ownerUsername} · {agent.role}</div>
                  </div>
                  <Badge variant="outline" className="rounded-md">
                    {codexStatuses[agent.ownerUsername]?.configured ? "ready" : "connect"}
                  </Badge>
                </div>
              </button>
            ))
          ) : (
            <div className="rounded-md border border-border p-3 text-sm text-muted-foreground">No agents in this chat yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function ChatMessages({
  messages,
  currentUsername,
}: {
  messages: ChatMessage[];
  currentUsername: string;
}) {
  if (!messages.length) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <div className="rounded-md border border-border px-4 py-3 text-sm text-muted-foreground">No messages yet.</div>
      </div>
    );
  }

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 p-5">
        {messages.map((message) => {
          const self = message.self || message.author === currentUsername;
          const displayAuthor = self ? currentUsername : message.author;
          return (
            <div key={message.id} className={cn("flex items-start gap-3", self && "justify-end")}>
              <div className="min-w-0 max-w-[82%]">
                <div className={cn("mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground", self && "justify-end")}>
                  <AuthorLabel name={displayAuthor} />
                  <span>{message.time}</span>
                </div>
                <div
                  className={cn(
                    "whitespace-pre-wrap break-words rounded-md border border-border px-3 py-2 text-sm leading-6",
                    self ? "bg-secondary/80 text-foreground" : "bg-background text-foreground",
                  )}
                >
                  {renderBody(message.body, self)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}

function AuthorLabel({ name }: { name: string }) {
  const normalized = name.replace(/^@/, "");
  if (normalized.startsWith("agent-")) {
    return (
      <span className="inline-flex rounded-sm bg-sky-500/20 px-1.5 py-0.5 font-medium text-sky-700 ring-1 ring-sky-500/25 dark:text-sky-200">
        @{normalized}
      </span>
    );
  }
  return <span className="font-medium text-foreground">{name}</span>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate font-medium">{value}</span>
    </div>
  );
}

function DeviceLoginOutput({ session }: { session: ConnectSession }) {
  const output = session.error || session.output || "Starting device login...";
  const device = parseDeviceLoginOutput(session.output);

  return (
    <div className="space-y-3 rounded-md border border-border p-3 text-sm">
      {device.code ? (
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Device code</div>
          <div className="mt-1 break-all font-mono text-lg font-semibold">{device.code}</div>
        </div>
      ) : null}
      {device.authUrl ? (
        <Button asChild variant="outline" className="w-full">
          <a href={device.authUrl} target="_blank" rel="noreferrer">
            Open login
          </a>
        </Button>
      ) : null}
      <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md bg-secondary p-3 font-mono text-xs text-muted-foreground">{output}</pre>
    </div>
  );
}
