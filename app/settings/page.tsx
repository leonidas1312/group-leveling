"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { AppLogo } from "@/components/app-logo";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AgentProfile, ChatMessage, ChatRoom, GiteaUser, Project } from "@/lib/demo-data";
import { sanitizeVisibleRuntimeText } from "@/lib/public-text";

type ProjectSource = "mock" | "gitea";
type WorkflowFilter = "all" | "running" | "completed" | "failed";

type CodexStatus = {
  user: string;
  codexHome: string;
  configured: boolean;
  loginCommand: string;
};

type StateResponse = {
  source?: ProjectSource;
  projects?: Project[];
  chats?: ChatRoom[];
  users?: GiteaUser[];
  agents?: AgentProfile[];
  adminUsername?: string;
  publicAppUrl?: string;
  error?: string;
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

type UserAnalytics = {
  username: string;
  fullName: string;
  role: "host" | "member";
  connected: boolean;
  agents: number;
  ownedProjects: number;
  memberChats: number;
  humanMessages: number;
  agentMessages: number;
  totalMessages: number;
  mentionsSent: number;
  mentionsReceived: number;
  workflows: number;
  running: number;
  completed: number;
  failed: number;
  failureRate: number;
  messageShare: number;
  workflowShare: number;
};

type HostAnalytics = {
  rows: UserAnalytics[];
  totalHumanMessages: number;
  totalAgentMessages: number;
  totalMessages: number;
  totalWorkflows: number;
  totalRunning: number;
  totalCompleted: number;
  totalFailed: number;
  activeUsers: number;
  connectedUsers: number;
  averageMessages: number;
  averageWorkflows: number;
  maxMessageShare: number;
  maxWorkflowShare: number;
  fairnessNotes: string[];
};

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUsername, setCurrentUsername] = useState("");
  const [source, setSource] = useState<ProjectSource>("mock");
  const [adminUsername, setAdminUsername] = useState("");
  const [publicAppUrl, setPublicAppUrl] = useState("");
  const [users, setUsers] = useState<GiteaUser[]>([]);
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [chats, setChats] = useState<ChatRoom[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [codexStatuses, setCodexStatuses] = useState<Record<string, CodexStatus>>({});
  const [workflowFilter, setWorkflowFilter] = useState<WorkflowFilter>("all");

  useEffect(() => {
    async function boot() {
      try {
        const savedProfile = window.localStorage.getItem("solo-leveling-profile") ?? "";
        setCurrentUsername(savedProfile);
        const response = await fetch("/api/solo-leveling/state", { cache: "no-store" });
        const data = (await response.json()) as StateResponse;
        if (!response.ok) throw new Error(data.error ?? "Failed to load settings");

        const nextUsers = data.users ?? [];
        const nextAgents = data.agents ?? [];
        setSource(data.source ?? "mock");
        setAdminUsername(data.adminUsername ?? nextUsers[0]?.username ?? "");
        setPublicAppUrl(data.publicAppUrl ?? "");
        setUsers(nextUsers);
        setAgents(nextAgents);
        setChats(data.chats ?? []);
        setProjects(data.projects ?? []);

        const owners = Array.from(new Set([savedProfile, ...nextAgents.map((agent) => agent.ownerUsername), ...nextUsers.map((user) => user.username)].filter(Boolean)));
        const statuses = await Promise.all(
          owners.map(async (user) => {
            const statusResponse = await fetch(`/api/codex/status?user=${encodeURIComponent(user)}`, { cache: "no-store" });
            if (!statusResponse.ok) return null;
            return [(await statusResponse.json()) as CodexStatus] as const;
          }),
        );
        setCodexStatuses(
          Object.fromEntries(statuses.flatMap((entry) => (entry ? [[entry[0].user, entry[0]]] : []))),
        );
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Failed to load settings");
      } finally {
        setLoading(false);
      }
    }

    void boot();
  }, []);

  const currentUser =
    users.find((user) => user.username === currentUsername) ??
    ({ id: currentUsername || "anonymous", username: currentUsername || "", fullName: currentUsername || "Not signed in" } satisfies GiteaUser);
  const userAgents = agents.filter((agent) => agent.ownerUsername === currentUser.username);
  const workflowRows = useMemo(() => workflowRowsFromChats(chats), [chats]);
  const filteredWorkflows = workflowRows.filter((row) => workflowFilter === "all" || row.state === workflowFilter);
  const allMessages = chats.flatMap((chat) => chat.messages);
  const userMessages = allMessages.filter((message) => message.author === currentUser.username);
  const ownedAgentMessages = allMessages.filter((message) => userAgents.some((agent) => agent.handle === message.author));
  const mentionCount = countMatches(allMessages, /@[a-z0-9][a-z0-9-]*/gi);
  const projectMentionCount = countMatches(allMessages, /#[a-z0-9_.-]+(?:\/[a-z0-9_.-]+)?/gi);
  const connectedUsers = users.filter((user) => codexStatuses[user.username]?.configured);
  const currentCodexStatus = codexStatuses[currentUser.username];
  const browserAppUrl = typeof window === "undefined" ? "" : window.location.origin;
  const inviteUrl = `${(publicAppUrl || browserAppUrl || "http://localhost:3000").replace(/\/$/, "")}/invite?host=${encodeURIComponent(adminUsername || currentUser.username || "host")}`;
  const runningCount = workflowRows.filter((row) => row.state === "running").length;
  const completedCount = workflowRows.filter((row) => row.state === "completed").length;
  const failedCount = workflowRows.filter((row) => row.state === "failed").length;
  const hostAnalytics = useMemo(
    () => buildHostAnalytics(users, agents, chats, projects, workflowRows, codexStatuses, adminUsername),
    [users, agents, chats, projects, workflowRows, codexStatuses, adminUsername],
  );

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading settings
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <a href="/" aria-label="Go home" className="shrink-0 rounded-md outline-none focus:ring-2 focus:ring-ring">
              <AppLogo className="h-9 w-9" />
            </a>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">Settings</div>
              <div className="truncate text-xs text-muted-foreground">Group Leveling analytics and account state</div>
            </div>
          </div>
        </div>
      </header>

      {error ? (
        <div className="mx-auto mt-6 max-w-6xl px-4">
          <div className="rounded-md border border-destructive/40 p-3 text-sm text-destructive-foreground">{error}</div>
        </div>
      ) : null}

      <section className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card className="border-border bg-background shadow-none">
            <CardHeader>
              <div className="flex items-center gap-3">
                <UserAvatar user={currentUser} className="h-12 w-12" />
                <div className="min-w-0">
                  <CardTitle className="truncate">{currentUser.fullName || currentUser.username || "Workspace user"}</CardTitle>
                  <CardDescription>@{currentUser.username || "not-signed-in"}</CardDescription>
                </div>
                <Badge variant="outline" className="ml-auto rounded-md">
                  {currentUser.username === adminUsername ? "host" : "member"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Users" value={users.length} />
              <Metric label="Agents" value={agents.length} />
              <Metric label="Chats" value={chats.length} />
              <Metric label="Projects" value={projects.length} />
            </CardContent>
          </Card>

          <Card className="border-border bg-background shadow-none">
            <CardHeader>
              <CardTitle className="text-base">ChatGPT / Codex</CardTitle>
              <CardDescription>{currentCodexStatus?.configured ? "Connected" : "Not connected"}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <InfoRow label="Auth profile" value={currentCodexStatus?.codexHome || "Not created"} />
              <InfoRow label="Plan" value="Managed in ChatGPT" />
              <InfoRow label="Connected users" value={String(connectedUsers.length)} />
              <Button asChild className="w-full" variant={currentCodexStatus?.configured ? "outline" : "default"}>
                <a href="/settings/chatgpt">{currentCodexStatus?.configured ? "Manage ChatGPT" : "Connect ChatGPT"}</a>
              </Button>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="overview">
          <TabsList className="grid h-auto w-full grid-cols-3 sm:grid-cols-6">
            <TabsTrigger value="overview" className="gap-1 px-2">
              <span>Overview</span>
            </TabsTrigger>
            <TabsTrigger value="host" className="gap-1 px-2">
              <span>Host</span>
            </TabsTrigger>
            <TabsTrigger value="activity" className="gap-1 px-2">
              <span>Activity</span>
            </TabsTrigger>
            <TabsTrigger value="agents" className="gap-1 px-2">
              <span>Agents</span>
            </TabsTrigger>
            <TabsTrigger value="runs" className="gap-1 px-2">
              <span>Runs</span>
            </TabsTrigger>
            <TabsTrigger value="auth" className="gap-1 px-2">
              <span>Auth</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Messages" value={allMessages.length} />
              <Metric label="Your messages" value={userMessages.length} />
              <Metric label="Owned agent messages" value={ownedAgentMessages.length} />
              <Metric label="Workflows" value={workflowRows.length} />
              <Metric label="@ mentions" value={mentionCount} />
              <Metric label="# mentions" value={projectMentionCount} />
              <Metric label="Completed runs" value={completedCount} />
              <Metric label="Failed runs" value={failedCount} />
            </div>
            <Card className="border-border bg-background shadow-none">
              <CardHeader>
                <CardTitle className="text-base">Workspace</CardTitle>
                <CardDescription>Host-visible operational information.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <InfoRow label="Directory" value={source === "gitea" ? "Gitea" : "Local"} />
                <InfoRow label="Invite URL" value={inviteUrl} />
                <InfoRow label="Public app URL" value={publicAppUrl || "Not configured"} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="host" className="space-y-4">
            <Card className="border-border bg-background shadow-none">
              <CardHeader>
                <CardTitle className="text-base">All users together</CardTitle>
                <CardDescription>Host view across human messages, agent work, Codex readiness, and workload distribution.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Metric label="Users" value={users.length} />
                  <Metric label="Connected users" value={`${hostAnalytics.connectedUsers}/${users.length || 0}`} />
                  <Metric label="Active users" value={hostAnalytics.activeUsers} />
                  <Metric label="Messages" value={hostAnalytics.totalMessages} />
                  <Metric label="Human messages" value={hostAnalytics.totalHumanMessages} />
                  <Metric label="Agent messages" value={hostAnalytics.totalAgentMessages} />
                  <Metric label="Workflows" value={hostAnalytics.totalWorkflows} />
                  <Metric label="Failed workflows" value={hostAnalytics.totalFailed} />
                  <Metric label="Avg messages/user" value={formatDecimal(hostAnalytics.averageMessages)} />
                  <Metric label="Avg workflows/user" value={formatDecimal(hostAnalytics.averageWorkflows)} />
                  <Metric label="Largest message share" value={formatPercent(hostAnalytics.maxMessageShare)} />
                  <Metric label="Largest workflow share" value={formatPercent(hostAnalytics.maxWorkflowShare)} />
                </div>
                <div className="rounded-md border border-border p-3">
                  <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Fairness notes</div>
                  <div className="space-y-2 text-sm leading-6 text-muted-foreground">
                    {hostAnalytics.fairnessNotes.map((note) => (
                      <p key={note}>{note}</p>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-3 lg:grid-cols-2">
              {hostAnalytics.rows.map((row) => (
                <Card key={row.username} className="border-border bg-background shadow-none">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <UserAvatar user={users.find((user) => user.username === row.username)} fallback={row.username} className="h-9 w-9" />
                        <div className="min-w-0">
                          <CardTitle className="truncate text-base">{row.fullName || row.username}</CardTitle>
                          <CardDescription>@{row.username} · {row.role}</CardDescription>
                        </div>
                      </div>
                      <Badge variant="outline" className="rounded-md">
                        {row.connected ? "ChatGPT connected" : "No ChatGPT"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Metric label="Messages" value={row.totalMessages} />
                      <Metric label="Workflows" value={row.workflows} />
                      <Metric label="Failure rate" value={formatPercent(row.failureRate)} />
                      <Metric label="Agents" value={row.agents} />
                      <Metric label="Projects" value={row.ownedProjects} />
                      <Metric label="Chats" value={row.memberChats} />
                    </div>
                    <div className="grid gap-2 text-sm sm:grid-cols-2">
                      <InfoRow label="Human messages" value={String(row.humanMessages)} />
                      <InfoRow label="Owned agent messages" value={String(row.agentMessages)} />
                      <InfoRow label="Mentions sent" value={String(row.mentionsSent)} />
                      <InfoRow label="Mentions received" value={String(row.mentionsReceived)} />
                      <InfoRow label="Message share" value={formatPercent(row.messageShare)} />
                      <InfoRow label="Workflow share" value={formatPercent(row.workflowShare)} />
                      <InfoRow label="Completed runs" value={String(row.completed)} />
                      <InfoRow label="Running runs" value={String(row.running)} />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="activity" className="space-y-3">
            {chats.map((chat) => {
              const projectRefs = projectRefsFromMessages(chat.messages);
              const agentHandles = agentHandlesFromMessages(chat.messages, agents);
              return (
                <Card key={chat.id} className="border-border bg-background shadow-none">
                  <CardHeader>
                    <CardTitle className="text-base">{chat.title}</CardTitle>
                    <CardDescription>{chat.messages.length} messages · {projectRefs.join(" ") || "No project tags"}</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3 sm:grid-cols-3">
                    <Metric label="Users" value={chat.members.length} />
                    <Metric label="Agents" value={agentHandles.length} />
                    <Metric label="Mentions" value={countMatches(chat.messages, /@[a-z0-9][a-z0-9-]*/gi)} />
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>

          <TabsContent value="agents" className="space-y-3">
            {agents.map((agent) => {
              const usedChats = chats.filter((chat) =>
                chat.messages.some((message) => message.author === agent.handle || message.body.includes(`@${agent.handle}`)),
              );
              const status = codexStatuses[agent.ownerUsername];
              return (
                <Card key={agent.handle} className="border-border bg-background shadow-none">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <CardTitle className="truncate text-base">@{agent.handle}</CardTitle>
                        <CardDescription>{agent.ownerUsername} · {agent.role}</CardDescription>
                      </div>
                      <Badge variant="outline" className="rounded-md">
                        {status?.configured ? "Codex ready" : "No Codex"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="grid gap-3 sm:grid-cols-3">
                    <Metric label="Chats used" value={usedChats.length} />
                    <Metric label="Messages" value={allMessages.filter((message) => message.author === agent.handle).length} />
                    <Metric label="Runs" value={workflowRows.filter((row) => row.agent === agent.handle).length} />
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>

          <TabsContent value="runs" className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {(["all", "running", "completed", "failed"] as WorkflowFilter[]).map((filter) => (
                <Button key={filter} variant={workflowFilter === filter ? "secondary" : "outline"} size="sm" onClick={() => setWorkflowFilter(filter)}>
                  {filter}
                </Button>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Metric label="Running" value={runningCount} />
              <Metric label="Completed" value={completedCount} />
              <Metric label="Failed" value={failedCount} />
            </div>
            {filteredWorkflows.length ? (
              filteredWorkflows.slice(0, 30).map((row) => (
                <Card key={`${row.chatId}-${row.messageId}`} className="border-border bg-background shadow-none">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <CardTitle className="truncate text-base">{row.id}</CardTitle>
                        <CardDescription>{row.chatTitle} · {row.agent} · {row.time}</CardDescription>
                      </div>
                      <Badge variant="outline" className="rounded-md">
                        {row.state}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{sanitizeVisibleRuntimeText(row.body)}</p>
                  </CardContent>
                </Card>
              ))
            ) : (
              <Card className="border-border bg-background shadow-none">
                <CardContent className="p-4 text-sm text-muted-foreground">No workflows match this filter.</CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="auth" className="space-y-3">
            {users.map((user) => {
              const status = codexStatuses[user.username];
              return (
                <Card key={user.username} className="border-border bg-background shadow-none">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <UserAvatar user={user} className="h-9 w-9" />
                      <div className="min-w-0">
                        <CardTitle className="truncate text-base">{user.username}</CardTitle>
                        <CardDescription>{user.email || "No email"}</CardDescription>
                      </div>
                      <Badge variant="outline" className="ml-auto rounded-md">
                        {status?.configured ? "connected" : "missing"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <InfoRow label="Codex profile" value={status?.codexHome || "Not created"} />
                    <InfoRow label="Login command" value={status?.loginCommand || "Unavailable"} />
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>
        </Tabs>
      </section>
    </main>
  );
}

function buildHostAnalytics(
  users: GiteaUser[],
  agents: AgentProfile[],
  chats: ChatRoom[],
  projects: Project[],
  workflowRows: WorkflowRow[],
  codexStatuses: Record<string, CodexStatus>,
  adminUsername: string,
): HostAnalytics {
  const allMessages = chats.flatMap((chat) => chat.messages);
  const userCount = Math.max(users.length, 1);
  const agentOwnerByHandle = new Map(agents.map((agent) => [agent.handle, agent.ownerUsername]));
  const totalHumanMessages = allMessages.filter((message) => users.some((user) => user.username === message.author)).length;
  const totalAgentMessages = allMessages.filter((message) => agentOwnerByHandle.has(message.author.replace(/^@/, ""))).length;
  const totalMessages = totalHumanMessages + totalAgentMessages;
  const totalWorkflows = workflowRows.length;
  const totalRunning = workflowRows.filter((row) => row.state === "running").length;
  const totalCompleted = workflowRows.filter((row) => row.state === "completed").length;
  const totalFailed = workflowRows.filter((row) => row.state === "failed").length;

  const rows = users.map((user) => {
    const ownedAgents = agents.filter((agent) => agent.ownerUsername === user.username);
    const ownedHandles = ownedAgents.map((agent) => agent.handle);
    const ownedHandleSet = new Set(ownedHandles);
    const authoredHumanMessages = allMessages.filter((message) => message.author === user.username);
    const authoredAgentMessages = allMessages.filter((message) => ownedHandleSet.has(message.author.replace(/^@/, "")));
    const userWorkflows = workflowRows.filter((row) => ownedHandleSet.has(row.agent.replace(/^@/, "")));
    const mentionedTargets = [user.username, ...ownedHandles];
    const mentionsReceived = allMessages.reduce((total, message) => total + countMentionsForTargets(message.body, mentionedTargets), 0);
    const memberChats = chats.filter((chat) => {
      if (chat.members.includes(user.username)) return true;
      return chat.messages.some((message) => {
        const author = message.author.replace(/^@/, "");
        return author === user.username || ownedHandleSet.has(author) || countMentionsForTargets(message.body, mentionedTargets) > 0;
      });
    }).length;
    const totalUserMessages = authoredHumanMessages.length + authoredAgentMessages.length;
    const failed = userWorkflows.filter((row) => row.state === "failed").length;

    return {
      username: user.username,
      fullName: user.fullName || user.username,
      role: user.username === adminUsername ? "host" : "member",
      connected: Boolean(codexStatuses[user.username]?.configured),
      agents: ownedAgents.length,
      ownedProjects: projects.filter((project) => project.owner === user.username).length,
      memberChats,
      humanMessages: authoredHumanMessages.length,
      agentMessages: authoredAgentMessages.length,
      totalMessages: totalUserMessages,
      mentionsSent: authoredHumanMessages.reduce((total, message) => total + (message.body.match(/@[a-z0-9][a-z0-9-]*/gi)?.length ?? 0), 0),
      mentionsReceived,
      workflows: userWorkflows.length,
      running: userWorkflows.filter((row) => row.state === "running").length,
      completed: userWorkflows.filter((row) => row.state === "completed").length,
      failed,
      failureRate: userWorkflows.length ? failed / userWorkflows.length : 0,
      messageShare: totalMessages ? totalUserMessages / totalMessages : 0,
      workflowShare: totalWorkflows ? userWorkflows.length / totalWorkflows : 0,
    } satisfies UserAnalytics;
  });

  const activeUsers = rows.filter((row) => row.totalMessages > 0 || row.workflows > 0).length;
  const maxMessageShare = rows.reduce((max, row) => Math.max(max, row.messageShare), 0);
  const maxWorkflowShare = rows.reduce((max, row) => Math.max(max, row.workflowShare), 0);
  const averageMessages = totalMessages / userCount;
  const averageWorkflows = totalWorkflows / userCount;
  const connectedUsers = rows.filter((row) => row.connected).length;

  return {
    rows,
    totalHumanMessages,
    totalAgentMessages,
    totalMessages,
    totalWorkflows,
    totalRunning,
    totalCompleted,
    totalFailed,
    activeUsers,
    connectedUsers,
    averageMessages,
    averageWorkflows,
    maxMessageShare,
    maxWorkflowShare,
    fairnessNotes: buildFairnessNotes(rows, {
      totalMessages,
      totalWorkflows,
      totalFailed,
      connectedUsers,
      userCount,
      averageMessages,
      averageWorkflows,
      maxMessageShare,
      maxWorkflowShare,
    }),
  };
}

function buildFairnessNotes(
  rows: UserAnalytics[],
  summary: {
    totalMessages: number;
    totalWorkflows: number;
    totalFailed: number;
    connectedUsers: number;
    userCount: number;
    averageMessages: number;
    averageWorkflows: number;
    maxMessageShare: number;
    maxWorkflowShare: number;
  },
) {
  if (!rows.length) return ["No users are registered yet, so fairness cannot be evaluated."];
  const mostMessages = [...rows].sort((left, right) => right.totalMessages - left.totalMessages)[0];
  const mostWorkflows = [...rows].sort((left, right) => right.workflows - left.workflows)[0];
  const disconnected = rows.filter((row) => !row.connected).map((row) => row.username);
  const notes = [
    `Average activity is ${formatDecimal(summary.averageMessages)} messages and ${formatDecimal(summary.averageWorkflows)} workflows per user.`,
    summary.totalMessages
      ? `The largest message share is ${formatPercent(summary.maxMessageShare)}${mostMessages ? ` by @${mostMessages.username}` : ""}.`
      : "No user has posted measurable message activity yet.",
    summary.totalWorkflows
      ? `The largest workflow share is ${formatPercent(summary.maxWorkflowShare)}${mostWorkflows ? ` by @${mostWorkflows.username}` : ""}.`
      : "No agent workflows have been started yet.",
    summary.totalWorkflows
      ? `Workflow failure rate is ${formatPercent(summary.totalFailed / summary.totalWorkflows)} across all users.`
      : "Workflow failure rate is not available until at least one workflow runs.",
    disconnected.length
      ? `${disconnected.length} user${disconnected.length === 1 ? "" : "s"} still need ChatGPT/Codex connection: ${disconnected.map((user) => `@${user}`).join(", ")}.`
      : "Every registered user has a connected ChatGPT/Codex profile.",
  ];
  return notes;
}

function countMentionsForTargets(body: string, targets: string[]) {
  return targets.reduce((total, target) => {
    const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const matches = body.match(new RegExp(`(^|[^a-z0-9-])@${escaped}(?![a-z0-9-])`, "gi"));
    return total + (matches?.length ?? 0);
  }, 0);
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatDecimal(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function UserAvatar({ user, fallback, className = "h-8 w-8" }: { user?: GiteaUser; fallback?: string; className?: string }) {
  const label = user?.fullName || user?.username || fallback || "";
  return (
    <Avatar className={`${className} border border-[#609926]/50 bg-[#609926]/10`}>
      {user?.avatarUrl ? (
        <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <AvatarFallback className="bg-[#609926]/20 text-[10px] font-semibold text-[#609926] dark:text-[#9ad06a]">
          {initials(label)}
        </AvatarFallback>
      )}
    </Avatar>
  );
}

function Metric({ icon, label, value }: { icon?: React.ReactNode; label: string; value: number | string }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right font-medium">{value}</span>
    </div>
  );
}

function initials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  const text = parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : value.slice(0, 2);
  return text.toUpperCase();
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
  return chats
    .flatMap((chat) =>
      chat.messages.filter(isWorkflowMessage).map((message) => ({
        id: workflowIdFromMessage(message) ?? message.id,
        messageId: message.id,
        chatId: chat.id,
        chatTitle: chat.title,
        agent: message.author,
        body: message.body,
        time: message.time,
        state: workflowStateFromMessage(message),
        projectRef: message.body.match(/#([a-z0-9_.-]+(?:\/[a-z0-9_.-]+)?)/i)?.[1],
      })),
    )
    .reverse();
}

function countMatches(messages: ChatMessage[], pattern: RegExp) {
  return messages.reduce((total, message) => total + (message.body.match(pattern)?.length ?? 0), 0);
}

function projectRefsFromMessages(messages: ChatMessage[]) {
  const refs = new Set<string>();
  for (const message of messages) {
    for (const match of message.body.matchAll(/#([a-z0-9_.-]+(?:\/[a-z0-9_.-]+)?)/gi)) {
      refs.add(`#${match[1]}`);
    }
  }
  return Array.from(refs);
}

function agentHandlesFromMessages(messages: ChatMessage[], agents: AgentProfile[]) {
  const knownAgents = new Set(agents.map((agent) => agent.handle));
  const handles = new Set<string>();
  for (const message of messages) {
    const author = message.author.replace(/^@/, "");
    if (knownAgents.has(author)) handles.add(author);
    for (const match of message.body.matchAll(/@([a-z0-9][a-z0-9-]*)/gi)) {
      if (knownAgents.has(match[1])) handles.add(match[1]);
    }
  }
  return Array.from(handles);
}
