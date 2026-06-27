import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  demoAgents,
  demoChats,
  demoProjects,
  type AgentProfile,
  type ChatMessage,
  type ChatRoom,
  type GiteaUser,
  type Project,
} from "@/lib/demo-data";

export type SoloLevelingState = {
  version: 1;
  users: GiteaUser[];
  projects: Project[];
  chats: ChatRoom[];
  agents: AgentProfile[];
  updatedAt: string;
};

const dataDir = process.env.SOLO_LEVELING_DATA_DIR ?? join(homedir(), ".solo-leveling");
const legacyStatePath = join(process.cwd(), ".solo-leveling", "state.json");
const defaultStatePath = existsSync(legacyStatePath) ? legacyStatePath : join(dataDir, "state.json");
const statePath = process.env.SOLO_LEVELING_STATE_PATH ?? defaultStatePath;
const legacyAgentHandles = new Set(["agent-forgechat", "agent-reviewer", "agent-planner", "agent-custom"]);
const defaultAgentPersonality = "Helpful, conversational, and careful when repository work is requested.";
const defaultAgentInstructions =
  "Talk naturally when people mention you in chat. If the message asks you to work on code, a repository, or a #project, use the project context, keep changes scoped, run relevant checks, and report what changed.";
const legacyAgentInstructions = new Set([
  "Work on delegated repository tasks for your owner. Keep changes scoped and report verification clearly.",
  "Implement repository tasks, run available checks, and report exactly what changed.",
  "Work on delegated Group Leveling repository tasks.",
]);
const systemUsernames = new Set(
  (process.env.SOLO_LEVELING_SYSTEM_USERS ?? "forgechat")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
);

export async function readSoloLevelingState(): Promise<SoloLevelingState> {
  try {
    const state = JSON.parse(await readFile(statePath, "utf8")) as SoloLevelingState;
    return normalizeState(state);
  } catch {
    const initialState = normalizeState({
      version: 1,
      users: [],
      projects: demoProjects,
      chats: demoChats,
      agents: demoAgents,
      updatedAt: new Date().toISOString(),
    });
    await writeSoloLevelingState(initialState);
    return initialState;
  }
}

export async function writeSoloLevelingState(state: SoloLevelingState) {
  const nextState = normalizeState({ ...state, updatedAt: new Date().toISOString() });
  await mkdir(dirname(statePath), { recursive: true });
  await writeFile(statePath, `${JSON.stringify(nextState, null, 2)}\n`);
  return nextState;
}

export function visibleAuthUsers(users: GiteaUser[]) {
  return users.filter((user) => !systemUsernames.has(user.username.toLowerCase()));
}

export async function listPersistentUsers() {
  const state = await readSoloLevelingState();
  return visibleAuthUsers(state.users ?? []);
}

export async function upsertPersistentUser(input: Omit<GiteaUser, "id"> & { id?: string }) {
  const state = await readSoloLevelingState();
  const username = input.username.trim();
  if (!username) {
    throw new Error("username is required");
  }

  const user: GiteaUser = {
    id: input.id ?? `local-${username.toLowerCase()}`,
    username,
    fullName: input.fullName?.trim() || username,
    email: input.email?.trim() || undefined,
    avatarUrl: input.avatarUrl,
  };
  const users = [user, ...state.users.filter((candidate) => candidate.username.toLowerCase() !== username.toLowerCase())];
  await writeSoloLevelingState({ ...state, users });
  return user;
}

export async function syncProjectsWithStore(projects: Project[]) {
  const state = await readSoloLevelingState();
  if (!projects.length) return state.projects;

  const mergedProjects = projects.map((project) => {
    const saved = state.projects.find((candidate) => candidate.id === project.id || candidate.repo === project.repo);
    if (!saved) return { ...project, chats: [] };
    return {
      ...project,
      chats: [],
      activity: saved.activity?.length ? saved.activity : project.activity,
      files: saved.files?.length ? saved.files : project.files,
    };
  });

  const mergedState = await writeSoloLevelingState({
    ...state,
    projects: mergedProjects,
  });

  return mergedState.projects;
}

export async function ensureAgentsForUsers(users: GiteaUser[]) {
  const state = await readSoloLevelingState();
  const visibleUsers = visibleAuthUsers(users);
  const visibleUsernames = new Set(visibleUsers.map((user) => user.username));
  const now = new Date().toISOString();
  const agents = state.agents
    .filter((agent) => visibleUsernames.has(agent.ownerUsername))
    .filter((agent) => !isLegacySeedAgent(agent))
    .map(ensureAgentDefaults);
  const existingHandles = new Set(agents.map((agent) => agent.handle));

  for (const user of visibleUsers) {
    const handle = userAgentHandle(user.username);
    if (existingHandles.has(handle)) continue;
    agents.push({
      id: handle,
      handle,
      name: `${user.fullName || user.username} Agent`,
      ownerUsername: user.username,
      role: "Workspace agent",
      personality: defaultAgentPersonality,
      instructions: defaultAgentInstructions,
      examples: [`@${handle} #owner/repo inspect the project and suggest the next task`],
      createdAt: now,
      updatedAt: now,
    });
  }

  const chats = state.chats.map((chat) => normalizeChat(chat, visibleUsernames));
  return (await writeSoloLevelingState({ ...state, users: visibleUsers, agents, chats })).agents;
}

export async function createPersistentChat(input: {
  title: string;
  description?: string;
  members: string[];
  agentHandles: string[];
  projectRefs: string[];
  author: string;
}) {
  const state = await readSoloLevelingState();
  const chat: ChatRoom = {
    id: `chat-${Date.now()}`,
    title: input.title.trim(),
    type: "group",
    description: input.description?.trim() || "Shared human-agent chat.",
    ownerUsername: input.author,
    members: unique([input.author, ...input.members]),
    agentHandles: [],
    projectRefs: [],
    messages: [],
  };

  await writeSoloLevelingState({ ...state, chats: [chat, ...state.chats] });
  return chat;
}

export async function updatePersistentChat(input: {
  chatId: string;
  title?: string;
  description?: string;
  members?: string[];
  agentHandles?: string[];
  projectRefs?: string[];
}) {
  const state = await readSoloLevelingState();
  let updatedChat: ChatRoom | undefined;
  const chats = state.chats.map((chat) => {
    if (chat.id !== input.chatId) return chat;
    updatedChat = {
      ...chat,
      title: input.title?.trim() || chat.title,
      description: input.description?.trim() || chat.description,
      members: input.members ? unique(input.members) : chat.members,
      agentHandles: [],
      projectRefs: [],
    };
    return updatedChat;
  });

  if (!updatedChat) return null;
  await writeSoloLevelingState({ ...state, chats });
  return updatedChat;
}

export async function leavePersistentChat(input: { chatId: string; actor: string }) {
  const state = await readSoloLevelingState();
  let updatedChat: ChatRoom | undefined;
  const chats = state.chats.map((chat) => {
    if (chat.id !== input.chatId) return chat;
    if (!chat.members.includes(input.actor)) {
      throw new Error("Only chat members can leave this chat.");
    }
    if (chat.ownerUsername === input.actor) {
      throw new Error("Chat owners can delete their chat instead of leaving it.");
    }
    const members = chat.members.filter((member) => member !== input.actor);
    updatedChat = {
      ...chat,
      members,
      ownerUsername: chat.ownerUsername,
    };
    return updatedChat;
  });

  if (!updatedChat) return null;
  const nextState = await writeSoloLevelingState({ ...state, chats });
  return nextState.chats.find((chat) => chat.id === input.chatId) ?? null;
}

export async function deletePersistentChat(input: { chatId: string; actor?: string; adminUsername?: string }) {
  const state = await readSoloLevelingState();
  const chat = state.chats.find((candidate) => candidate.id === input.chatId);
  if (!chat) return { chats: state.chats, nextChat: undefined };
  if (input.actor && input.actor !== input.adminUsername && input.actor !== chat.ownerUsername) {
    throw new Error("Only the chat owner or host can delete this chat.");
  }
  const chats = state.chats.filter((chat) => chat.id !== input.chatId);
  const nextChats = chats.length ? chats : [emptyTeamChat()];
  const nextState = await writeSoloLevelingState({ ...state, chats: nextChats });
  return { chats: nextState.chats, nextChat: nextState.chats[0] };
}

export async function appendPersistentMessage(input: { chatId: string; message: ChatMessage }) {
  const state = await readSoloLevelingState();
  const chats = state.chats.map((chat) =>
    chat.id === input.chatId ? { ...chat, messages: [...chat.messages, input.message] } : chat,
  );
  await writeSoloLevelingState({ ...state, chats });
  return input.message;
}

export async function updatePersistentAgent(input: { id: string; patch: Partial<Pick<AgentProfile, "name" | "role" | "personality" | "instructions" | "examples">> }) {
  const state = await readSoloLevelingState();
  const patch = compactAgentPatch(input.patch);
  const agents = state.agents.map((agent) =>
    agent.id === input.id || agent.handle === input.id
      ? {
          ...agent,
          ...patch,
          examples: Array.isArray(patch.examples) ? patch.examples.filter(Boolean) : agent.examples,
          updatedAt: new Date().toISOString(),
        }
      : agent,
  );
  const nextState = await writeSoloLevelingState({ ...state, agents });
  return nextState.agents.find((agent) => agent.id === input.id || agent.handle === input.id);
}

export async function createPersistentAgent(input: Omit<AgentProfile, "id" | "createdAt" | "updatedAt">) {
  const state = await readSoloLevelingState();
  const handle = input.handle.startsWith("agent-") ? input.handle : userAgentHandle(input.handle);
  if (state.agents.some((agent) => agent.handle === handle)) {
    throw new Error(`Agent @${handle} already exists.`);
  }
  const now = new Date().toISOString();
  const agent: AgentProfile = {
    ...input,
    id: handle,
    handle,
    examples: input.examples.filter(Boolean),
    createdAt: now,
    updatedAt: now,
  };
  await writeSoloLevelingState({ ...state, agents: [...state.agents, agent] });
  return agent;
}

export async function deletePersistentAgent(input: { id: string }) {
  const state = await readSoloLevelingState();
  const agent = state.agents.find((candidate) => candidate.id === input.id || candidate.handle === input.id);
  if (!agent) return null;

  const agents = state.agents.filter((candidate) => candidate.id !== agent.id && candidate.handle !== agent.handle);
  await writeSoloLevelingState({ ...state, agents });
  return agent;
}

export async function upsertPersistentProject(project: Project) {
  const state = await readSoloLevelingState();
  const existing = state.projects.find((candidate) => candidate.id === project.id || candidate.repo === project.repo);
  const nextProject = existing
    ? { ...project, chats: [], activity: existing.activity, files: existing.files }
    : { ...project, chats: [] };
  const projects = existing
    ? state.projects.map((candidate) => (candidate.id === existing.id ? nextProject : candidate))
    : [nextProject, ...state.projects];
  await writeSoloLevelingState({ ...state, projects });
  return nextProject;
}

export async function updatePersistentProjectMetadata(input: { owner?: string; repo: string; name?: string; description?: string }) {
  const state = await readSoloLevelingState();
  const projects = state.projects.map((project) => {
    const matchesRepo = project.repo === input.repo || project.repo === `${input.owner}/${input.repo}`;
    if (!matchesRepo) return project;
    return {
      ...project,
      name: input.name ?? project.name,
      description: input.description ?? project.description,
    };
  });
  await writeSoloLevelingState({ ...state, projects });
}

export async function deletePersistentProject(input: { owner?: string; repo: string }) {
  const state = await readSoloLevelingState();
  const projects = state.projects.filter((project) => project.repo !== input.repo && project.repo !== `${input.owner}/${input.repo}`);
  await writeSoloLevelingState({ ...state, projects: projects.length ? projects : demoProjects });
}

function normalizeState(state: SoloLevelingState): SoloLevelingState {
  const projects = (state.projects ?? []).filter((project) => !isLegacyDemoProject(project));
  const migratedChats = mergeChats([
    ...((state as Partial<SoloLevelingState>).chats ?? []),
    ...projects.flatMap((project) => project.chats ?? []),
  ]);
  const users = visibleAuthUsers(state.users ?? []);
  const availableUsernames = new Set(users.map((user) => user.username));
  const agents = (state.agents?.length ? state.agents : demoAgents)
    .map(normalizeAgent)
    .filter((agent) => !isLegacySeedAgent(agent))
    .filter((agent) => availableUsernames.has(agent.ownerUsername))
    .map(ensureAgentDefaults);

  return {
    version: 1,
    users,
    projects: (projects.length ? projects : demoProjects).map(normalizeProject),
    chats: (migratedChats.length ? migratedChats : demoChats).map((chat) => normalizeChat(chat, availableUsernames)),
    agents,
    updatedAt: state.updatedAt ?? new Date().toISOString(),
  };
}

function isLegacyDemoProject(project: Project) {
  return project.id === "atlas-crm" || project.id === "payments-core";
}

function normalizeProject(project: Project): Project {
  return {
    ...project,
    cloneUrl: normalizeStoredGiteaUrl(project.cloneUrl, "clone"),
    webUrl: project.webUrl ? normalizeStoredGiteaUrl(project.webUrl, "web") : project.webUrl,
    description: normalizeProjectDescription(project.description),
    activity: project.activity?.filter((item) => !/from Group Leveling|from Gitea/i.test(item)) ?? [],
    files: project.files ?? [],
    chats: [],
  };
}

function normalizeChat(chat: ChatRoom, availableUsernames?: Set<string>): ChatRoom {
  const members = ensureChatMembers(chat.members ?? [], availableUsernames);
  const ownerUsername = chat.ownerUsername && (!availableUsernames?.size || availableUsernames.has(chat.ownerUsername))
    ? chat.ownerUsername
    : members[0];
  return {
    ...chat,
    title: normalizeChatTitle(chat.title),
    description: normalizeChatDescription(chat.description),
    ownerUsername,
    members,
    agentHandles: [],
    projectRefs: [],
    messages: (chat.messages ?? []).filter((message) => !isBoilerplateMessage(message)),
  };
}

function normalizeProjectDescription(description: string) {
  if (/^Created from .+ agent workflow\.$/.test(description) || /^Gitea repository connected to .+\.$/.test(description)) {
    return "Self-hosted coding-agent workspace.";
  }
  return description;
}

function normalizeChatDescription(description: string) {
  if (/^Team chat with \d+ users? and \d+ agents?\.$/.test(description)) {
    return "Shared human-agent chat.";
  }
  if (/^Workflow log for/i.test(description)) {
    return "Shared human-agent chat.";
  }
  if (/^Shared agent-human chat for/i.test(description)) {
    return "Shared human-agent chat.";
  }
  return description;
}

function normalizeChatTitle(title: string) {
  return title.replace(/\bruns\b/i, "chat");
}

function isBoilerplateMessage(message: ChatMessage) {
  const body = message.body.trim();
  return (
    (message.author === "Codex" && /^Repository .+ is connected\./.test(body)) ||
    (message.author === "Codex" && /^Project .+ is ready\./.test(body)) ||
    (message.author === "System" && /\bcreated this chat for\b/.test(body))
  );
}

function normalizeAgent(agent: AgentProfile): AgentProfile {
  return {
    ...agent,
    id: agent.id || agent.handle,
    handle: agent.handle.replace(/^@/, ""),
    name: agent.name || agent.handle.replace(/^@/, ""),
    ownerUsername: agent.ownerUsername || "local",
    role: agent.role || "Workspace agent",
    personality: upgradeAgentPersonality(agent.personality),
    instructions: upgradeAgentInstructions(agent.instructions),
    examples: agent.examples ?? [],
    createdAt: agent.createdAt ?? new Date().toISOString(),
    updatedAt: agent.updatedAt ?? new Date().toISOString(),
  };
}

function emptyTeamChat(): ChatRoom {
  return {
    id: `chat-${Date.now()}`,
    title: "Workspace general",
    type: "group",
    description: "Shared human-agent chat.",
    ownerUsername: undefined,
    members: [],
    agentHandles: [],
    projectRefs: [],
    messages: [],
  };
}

function userAgentHandle(username: string) {
  return `agent-${username.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;
}

function mergeChats(chats: ChatRoom[]) {
  const byId = new Map<string, ChatRoom>();
  for (const chat of chats) {
    if (!chat?.id) continue;
    const existing = byId.get(chat.id);
    byId.set(chat.id, existing ? mergeChat(existing, chat) : chat);
  }
  return Array.from(byId.values());
}

function mergeChat(left: ChatRoom, right: ChatRoom): ChatRoom {
  const messages = [...left.messages, ...right.messages];
  const seenMessages = new Set<string>();
  return {
    ...left,
    ...right,
    ownerUsername: right.ownerUsername ?? left.ownerUsername ?? left.members?.[0] ?? right.members?.[0],
    members: unique([...(left.members ?? []), ...(right.members ?? [])]),
    agentHandles: [],
    projectRefs: [],
    messages: messages.filter((message) => {
      if (seenMessages.has(message.id)) return false;
      seenMessages.add(message.id);
      return true;
    }),
  };
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function ensureChatMembers(members: string[], availableUsernames?: Set<string>) {
  const uniqueMembers = unique(members);
  if (!availableUsernames?.size) return uniqueMembers;
  return uniqueMembers.filter((member) => availableUsernames.has(member));
}

function normalizeStoredGiteaUrl(value: string, kind: "clone" | "web") {
  if (!/^https?:\/\/gitea\.local(\/|$)/i.test(value)) return value;
  const base = kind === "clone" ? process.env.GITEA_BASE_URL : process.env.PUBLIC_GITEA_BASE_URL || process.env.GITEA_BASE_URL;
  if (!base) return value;
  return value.replace(/^https?:\/\/gitea\.local/i, base.replace(/\/$/, ""));
}

function compactAgentPatch(patch: Partial<Pick<AgentProfile, "name" | "role" | "personality" | "instructions" | "examples">>) {
  return Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) as Partial<
    Pick<AgentProfile, "name" | "role" | "personality" | "instructions" | "examples">
  >;
}

function ensureAgentDefaults(agent: AgentProfile): AgentProfile {
  return normalizeAgent(agent);
}

function upgradeAgentPersonality(value?: string) {
  if (!value || value === "Helpful, concise, and careful with code changes." || value === "Pragmatic, concise, and careful with repository changes.") {
    return defaultAgentPersonality;
  }
  return value;
}

function upgradeAgentInstructions(value?: string) {
  if (!value || legacyAgentInstructions.has(value)) return defaultAgentInstructions;
  return value;
}

function isLegacySeedAgent(agent: AgentProfile) {
  const handle = agent.handle.replace(/^@/, "").toLowerCase();
  return (
    legacyAgentHandles.has(handle) ||
    agent.ownerUsername?.toLowerCase() === "forgechat" ||
    agent.examples?.some((example) => /#forgechat\//i.test(example)) ||
    /forgechat/i.test(agent.name)
  );
}
