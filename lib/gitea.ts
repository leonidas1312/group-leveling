import { demoProjects, demoUsers, type GiteaUser, type Project } from "@/lib/demo-data";

type GiteaRepository = {
  id: number;
  name: string;
  full_name: string;
  clone_url: string;
  description: string | null;
  default_branch: string;
  owner?: { login: string };
  open_pr_counter?: number;
  open_issues_count?: number;
  stars_count?: number;
  html_url?: string;
  website?: string;
};

type GiteaRepositorySearch = {
  data?: GiteaRepository[];
};

type GiteaUserResponse = {
  id: number;
  login: string;
  full_name?: string;
  email?: string;
  avatar_url?: string;
};

type GiteaPullRequest = {
  number: number;
  title: string;
  state: string;
  html_url: string;
  merged?: boolean;
  mergeable?: boolean;
  head?: { ref?: string };
  base?: { ref?: string };
};

export type PullRequestSummary = {
  number: number;
  title: string;
  state: string;
  url: string;
  merged: boolean;
  mergeable?: boolean;
  head?: string;
  base?: string;
};

const baseUrl = process.env.GITEA_BASE_URL;
const token = process.env.GITEA_TOKEN;
const defaultOwner = process.env.GITEA_DEFAULT_OWNER;
const publicBaseUrl = process.env.PUBLIC_GITEA_BASE_URL || baseUrl;

export function isGiteaConfigured() {
  return Boolean(baseUrl && token);
}

export async function getGiteaStatus() {
  if (!baseUrl || !token) {
    return {
      configured: false,
      online: false,
      baseUrl: baseUrl ?? "",
      publicBaseUrl: publicBaseUrl ?? "",
      message: "Gitea is not configured. Set GITEA_BASE_URL and GITEA_TOKEN.",
    };
  }

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/v1/version`, {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });
    if (!response.ok) {
      return {
        configured: true,
        online: false,
        baseUrl,
        publicBaseUrl: publicBaseUrl ?? baseUrl,
        message: `Gitea responded with ${response.status} ${response.statusText}.`,
      };
    }
    const payload = (await response.json().catch(() => ({}))) as { version?: string };
    return {
      configured: true,
      online: true,
      baseUrl,
      publicBaseUrl: publicBaseUrl ?? baseUrl,
      version: payload.version,
      message: payload.version ? `Gitea ${payload.version} is online.` : "Gitea is online.",
    };
  } catch (error) {
    return {
      configured: true,
      online: false,
      baseUrl,
      publicBaseUrl: publicBaseUrl ?? baseUrl,
      message: `Gitea is offline at ${baseUrl}. Start the Gitea server before creating projects or running agents.`,
      error: error instanceof Error ? error.message : "Unknown Gitea connection error",
    };
  }
}

export async function listGiteaProjects(): Promise<{ source: "gitea" | "mock"; projects: Project[] }> {
  if (!baseUrl || !token) {
    return { source: "mock", projects: demoProjects };
  }

  const response = await giteaFetch("/api/v1/repos/search?limit=50");
  const payload = (await response.json()) as GiteaRepositorySearch;
  const repositories = payload.data ?? [];
  const projects = repositories.map((repo) => toProject(repo));
  return { source: "gitea", projects };
}

export async function listGiteaUsers(): Promise<{ source: "gitea" | "mock"; users: GiteaUser[] }> {
  if (!baseUrl || !token) {
    return { source: "mock", users: demoUsers };
  }

  const response = await giteaFetch("/api/v1/admin/users");
  const users = ((await response.json()) as GiteaUserResponse[]).map((user) => ({
    id: String(user.id),
    username: user.login,
    fullName: user.full_name || user.login,
    email: user.email,
    avatarUrl: user.avatar_url,
  }));

  return { source: "gitea", users };
}

export async function authenticateGiteaUser(input: { username: string; password: string }): Promise<GiteaUser> {
  if (!baseUrl) {
    throw new Error("Gitea is not configured");
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/v1/user`, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${input.username}:${input.password}`).toString("base64")}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Invalid Gitea username or password");
  }

  const user = (await response.json()) as GiteaUserResponse;
  return {
    id: String(user.id),
    username: user.login,
    fullName: user.full_name || user.login,
    email: user.email,
    avatarUrl: user.avatar_url,
  };
}

export async function createGiteaUser(input: { username: string; password: string; email: string; fullName?: string }): Promise<GiteaUser> {
  if (!baseUrl || !token) {
    return {
      id: `local-${Date.now()}`,
      username: input.username,
      fullName: input.fullName || input.username,
      email: input.email,
    };
  }

  const response = await giteaFetch("/api/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({
      username: input.username,
      login_name: input.username,
      full_name: input.fullName || input.username,
      email: input.email,
      password: input.password,
      must_change_password: false,
      send_notify: false,
    }),
  });

  const user = (await response.json()) as GiteaUserResponse;
  return {
    id: String(user.id),
    username: user.login,
    fullName: user.full_name || user.login,
    email: user.email,
    avatarUrl: user.avatar_url,
  };
}

export async function createGiteaProject(input: { name: string; description?: string; private?: boolean; owner?: string }) {
  if (!baseUrl || !token) {
    const safeName = slugify(input.name);
    return {
      source: "mock" as const,
      project: mockProject({
        id: `mock-${Date.now()}`,
        name: input.name,
        repo: `${input.owner || "local"}/${safeName}`,
        description: input.description,
      }),
    };
  }

  const createPath = input.owner
    ? `/api/v1/admin/users/${encodeURIComponent(input.owner)}/repos`
    : "/api/v1/user/repos";
  const response = await giteaFetch(createPath, {
    method: "POST",
    body: JSON.stringify({
      name: slugify(input.name),
      description: input.description ?? "Self-hosted coding-agent workspace.",
      private: input.private ?? false,
      auto_init: true,
      default_branch: "main",
    }),
  });

  const repo = (await response.json()) as GiteaRepository;
  return { source: "gitea" as const, project: toProject(repo) };
}

export async function updateGiteaProject(input: { owner?: string; repo: string; name?: string; description?: string }) {
  if (!baseUrl || !token) {
    return { source: "mock" as const };
  }

  const owner = input.owner || defaultOwner || input.repo.split("/")[0];
  const repoName = input.repo.includes("/") ? input.repo.split("/").at(-1) : input.repo;
  await giteaFetch(`/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName ?? input.repo)}`, {
    method: "PATCH",
    body: JSON.stringify({
      name: input.name ? slugify(input.name) : undefined,
      description: input.description,
    }),
  });

  return { source: "gitea" as const };
}

export async function deleteGiteaProject(input: { owner?: string; repo: string }) {
  if (!baseUrl || !token) {
    return { source: "mock" as const };
  }

  const owner = input.owner || defaultOwner || input.repo.split("/")[0];
  const repoName = input.repo.includes("/") ? input.repo.split("/").at(-1) : input.repo;
  await giteaFetch(`/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName ?? input.repo)}`, {
    method: "DELETE",
  });

  return { source: "gitea" as const };
}

export async function giteaProjectExists(project: Pick<Project, "owner" | "repo">) {
  if (!baseUrl || !token) return true;

  const [repoOwner, repoName] = project.repo.includes("/")
    ? (project.repo.split("/") as [string, string])
    : [project.owner || defaultOwner || "", project.repo];
  if (!repoOwner || !repoName) return false;

  const response = await fetch(
    `${baseUrl.replace(/\/$/, "")}/api/v1/repos/${encodeURIComponent(repoOwner)}/${encodeURIComponent(repoName)}`,
    {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/json",
      },
      cache: "no-store",
    },
  );

  if (response.status === 404) return false;
  if (!response.ok) {
    throw new Error(`Gitea repository check failed: ${response.status} ${response.statusText}`);
  }
  return true;
}

export async function listGiteaPullRequests(input: { owner?: string; repo: string; state?: "open" | "closed" | "all" }) {
  if (!baseUrl || !token) {
    return { source: "mock" as const, pullRequests: [] };
  }

  const { owner, repoName } = repoParts(input);
  const response = await giteaFetch(
    `/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/pulls?state=${input.state ?? "open"}&limit=20`,
  );
  const pullRequests = ((await response.json()) as GiteaPullRequest[]).map(toPullRequestSummary);
  return { source: "gitea" as const, pullRequests };
}

export async function mergeGiteaPullRequest(input: {
  owner?: string;
  repo: string;
  index?: number;
  method?: "merge" | "squash" | "rebase" | "rebase-merge" | "fast-forward-only";
  deleteBranch?: boolean;
}) {
  if (!baseUrl || !token) {
    throw new Error("Gitea is not configured");
  }

  const { owner, repoName } = repoParts(input);
  const index = input.index ?? (await newestOpenPullRequest({ owner, repo: repoName })).number;
  await giteaFetch(`/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/pulls/${index}/merge`, {
    method: "POST",
    body: JSON.stringify({
      do: input.method ?? "merge",
      delete_branch_after_merge: input.deleteBranch ?? true,
    }),
  });

  const response = await giteaFetch(`/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/pulls/${index}`);
  const pullRequest = toPullRequestSummary((await response.json()) as GiteaPullRequest);
  return { source: "gitea" as const, pullRequest };
}

async function giteaFetch(path: string, init: RequestInit = {}) {
  if (!baseUrl || !token) {
    throw new Error("Gitea is not configured");
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
      ...init,
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        ...init.headers,
      },
      cache: "no-store",
    });
  } catch (error) {
    throw new Error(`Gitea is offline at ${baseUrl}. Start the Gitea server before using this action. ${error instanceof Error ? error.message : ""}`.trim());
  }

  if (!response.ok) {
    throw new Error(`Gitea request failed: ${response.status} ${response.statusText}`);
  }

  return response;
}

async function newestOpenPullRequest(input: { owner: string; repo: string }) {
  const result = await listGiteaPullRequests({ owner: input.owner, repo: input.repo, state: "open" });
  const pullRequest = [...result.pullRequests].sort((left, right) => right.number - left.number)[0];
  if (!pullRequest) {
    throw new Error(`No open pull requests found for ${input.owner}/${input.repo}.`);
  }
  return pullRequest;
}

function toProject(repo: GiteaRepository): Project {
  const owner = repo.owner?.login ?? repo.full_name.split("/")[0] ?? "gitea";
  const name = repo.name || repo.full_name;

  return {
    id: String(repo.id),
    name,
    repo: repo.full_name,
    cloneUrl: `${baseUrl?.replace(/\/$/, "")}/${repo.full_name}.git`,
    webUrl: `${publicBaseUrl?.replace(/\/$/, "")}/${repo.full_name}`,
    description: repo.description || "Self-hosted coding-agent workspace.",
    defaultBranch: repo.default_branch || "main",
    owner,
    openPulls: repo.open_pr_counter ?? 0,
    openIssues: repo.open_issues_count ?? 0,
    stars: repo.stars_count ?? 0,
    chats: [],
    activity: [],
    files: [],
  };
}

function toPullRequestSummary(pullRequest: GiteaPullRequest): PullRequestSummary {
  return {
    number: pullRequest.number,
    title: pullRequest.title,
    state: pullRequest.state,
    url: normalizePublicGiteaUrl(pullRequest.html_url),
    merged: Boolean(pullRequest.merged),
    mergeable: pullRequest.mergeable,
    head: pullRequest.head?.ref,
    base: pullRequest.base?.ref,
  };
}

function repoParts(input: { owner?: string; repo: string }) {
  const [repoOwner, repoName] = input.repo.includes("/")
    ? (input.repo.split("/") as [string, string])
    : [input.owner || defaultOwner || "", input.repo];
  if (!repoOwner || !repoName) {
    throw new Error(`Invalid Gitea repository: ${input.repo}`);
  }
  return { owner: repoOwner, repoName };
}

function mockProject(input: { id: string; name: string; repo: string; description?: string }): Project {
  return {
    id: input.id,
    name: input.name,
    repo: input.repo,
    cloneUrl: `${internalGiteaBaseUrl()}/${input.repo}.git`,
    webUrl: `${browserGiteaBaseUrl()}/${input.repo}`,
    description: input.description || "Self-hosted coding-agent workspace.",
    defaultBranch: "main",
    owner: input.repo.split("/")[0] || "local",
    openPulls: 0,
    openIssues: 0,
    stars: 0,
    chats: [],
    activity: [],
    files: [],
  };
}

function internalGiteaBaseUrl() {
  return (baseUrl || "http://localhost:3001").replace(/\/$/, "");
}

function browserGiteaBaseUrl() {
  return (publicBaseUrl || baseUrl || "http://localhost:3001").replace(/\/$/, "");
}

function normalizePublicGiteaUrl(value: string) {
  const publicBase = publicBaseUrl?.replace(/\/$/, "");
  if (!publicBase) return value;
  try {
    const url = new URL(value);
    const internalBase = baseUrl ? new URL(baseUrl) : undefined;
    const isLocalHost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    const isInternalGitea = internalBase ? url.origin === internalBase.origin : false;
    if (!isLocalHost && !isInternalGitea) return value;
    return `${publicBase}${url.pathname}${url.search}${url.hash}`;
  } catch {
    return value;
  }
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "new-project";
}
