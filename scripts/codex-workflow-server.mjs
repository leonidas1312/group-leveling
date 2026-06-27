import { createServer } from "node:http";
import { access, mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { constants, existsSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

await loadLocalEnv();

const port = Number(process.env.CODEX_WORKFLOW_PORT ?? 8787);
const dataDir = process.env.SOLO_LEVELING_DATA_DIR ?? resolve(homedir(), ".solo-leveling");
const legacyRunsDir = resolve(process.cwd(), ".solo-leveling", "workflows");
const runsDir = process.env.CODEX_WORKFLOW_RUNS_DIR ?? resolve(dataDir, "workflows");
const readableRunsDirs = Array.from(new Set([runsDir, legacyRunsDir]));
const codexBin = process.env.CODEX_BIN ?? "codex";
const legacyCodexHomeRoot = resolve(process.cwd(), ".codex-users");
const codexHomeRoot = process.env.CODEX_USER_HOME_ROOT ?? (existsSync(legacyCodexHomeRoot) ? legacyCodexHomeRoot : resolve(dataDir, "codex-users"));
const runCodexExec = process.env.RUN_CODEX_EXEC === "1";

await mkdir(runsDir, { recursive: true });

const server = createServer(async (request, response) => {
  try {
    if (request.method === "GET" && request.url === "/health") {
      return json(response, 200, { ok: true, service: "group-leveling-codex-workflow-server" });
    }

    if (request.method === "GET" && request.url?.startsWith("/workflows/")) {
      const id = decodeURIComponent(request.url.split("/").at(-1) ?? "");
      return json(response, 200, await readWorkflowStatus(id));
    }

    if (request.method === "POST" && request.url === "/workflows") {
      const body = await readJson(request);
      const workflow = await createWorkflow(body);
      return json(response, 202, workflow);
    }

    return json(response, 404, { error: "Not found" });
  } catch (error) {
    return json(response, error.status ?? 500, { error: error instanceof Error ? error.message : "Unknown server error" });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Codex workflow server listening on http://localhost:${port}`);
});

async function createWorkflow(body) {
  const prompt = String(body.prompt ?? "").trim();
  const cleanTitle = prompt.replace(/@[a-z0-9][a-z0-9-]*/gi, "").trim() || "Codex workflow";
  const id = `wf-${Date.now()}`;
  const projectId = String(body.projectId ?? body.giteaProject ?? "project");
  const branch = `agent/${slug(projectId)}-${id}`;
  const runDir = join(runsDir, id);
  const initialStatus = {
    id,
    title: cleanTitle[0].toUpperCase() + cleanTitle.slice(1),
    projectId,
    status: runCodexExec ? "Queued on Codex server" : "Accepted by Codex server; execution is disabled",
    progress: runCodexExec ? 10 : 100,
    state: runCodexExec ? "queued" : "completed",
    branch,
    runDir,
  };

  await mkdir(runDir, { recursive: true });
  await writeFile(join(runDir, "request.json"), `${JSON.stringify(body, null, 2)}\n`);
  await writeWorkflowStatus(id, initialStatus);

  if (runCodexExec) {
    const user = slug(String(body.user ?? "user"));
    const codexHome = join(codexHomeRoot, user);
    await mkdir(codexHome, { recursive: true });
    if (!(await fileExists(join(codexHome, "auth.json")))) {
      throw statusError(409, `Codex login is missing for ${user}. Ask them to open Settings > ChatGPT and connect their own ChatGPT/Codex account.`);
    }

    const repoDir = join(runDir, "repo");
    await writeWorkflowStatus(id, { ...initialStatus, status: "Cloning Gitea repository", progress: 20, state: "running" });
    const clone = spawnSync("git", cloneArgs(String(body.repository ?? ""), repoDir), {
      cwd: runDir,
      encoding: "utf8",
    });
    const cloneOutput = `${clone.stdout ?? ""}${clone.stderr ?? ""}`.trim();
    await writeFile(join(runDir, "git-clone.log"), `${cloneOutput}\n`);
    if (clone.status !== 0) {
      const failed = {
        ...initialStatus,
        status: "Failed to clone repository",
        progress: 100,
        state: "failed",
        summary: `Gitea clone failed.\n\n${summarizeLog(cloneOutput)}`,
      };
      await writeWorkflowStatus(id, failed);
      return failed;
    }

    spawnSync("git", ["checkout", "-b", branch], { cwd: repoDir, encoding: "utf8" });
    await verifyWritableRepo({ id, initialStatus, repoDir });

    const codexPrompt = [
      `You are ${body.agentName ?? body.agentHandle ?? "agent"} (${body.agentHandle ?? "agent"}) for ${body.user ?? "a Group Leveling user"}.`,
      `Repository: ${body.repository ?? "unknown"}`,
      `Default branch: ${body.defaultBranch ?? "main"}`,
      `The repository has been cloned into the current working directory when clone status is zero. Clone status: ${clone.status}.`,
      body.agentInstructions ? `Agent instructions:\n${body.agentInstructions}` : "",
      `Requested task: ${prompt}`,
      "Make the requested repository changes if the task requires code or docs edits.",
      "Do not commit, push, or create a pull request. The workflow server handles that after you finish.",
      "If no file changes are needed, explain that clearly in the final response.",
    ].join("\n");

    await writeWorkflowStatus(id, { ...initialStatus, status: "Codex is running in the repository", progress: 45, state: "running" });

    const codexArgs = ["exec", "--skip-git-repo-check", "--sandbox", "workspace-write", "--cd", repoDir, "--json", codexPrompt];
    await writeFile(join(runDir, "codex-args.json"), `${JSON.stringify({ codexBin, codexArgs: codexArgs.slice(0, -1), repoDir, codexHome }, null, 2)}\n`);

    const child = spawn(codexBin, codexArgs, {
      cwd: clone.status === 0 ? repoDir : runDir,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, CODEX_HOME: codexHome },
    });
    child.stdout.pipe((await import("node:fs")).createWriteStream(join(runDir, "codex.stdout.jsonl")));
    child.stderr.pipe((await import("node:fs")).createWriteStream(join(runDir, "codex.stderr.log")));
    child.on("close", (code) => {
      void finalizeWorkflow({ id, initialStatus, runDir, repoDir, body, branch, exitCode: code });
    });
  } else {
    await writeFile(
      join(runDir, "README.txt"),
      "Workflow accepted by the local Codex workflow server. Set RUN_CODEX_EXEC=1 to execute codex exec for each workflow.\n",
    );
  }

  return await readWorkflowStatus(id);
}

async function verifyWritableRepo({ id, initialStatus, repoDir }) {
  const probePath = join(repoDir, ".solo-leveling-write-test");
  try {
    await writeFile(probePath, "ok\n");
    await unlink(probePath);
  } catch (error) {
    await writeWorkflowStatus(id, {
      ...initialStatus,
      status: "Repository clone is not writable",
      progress: 100,
      state: "failed",
      summary: error instanceof Error ? error.message : "The workflow server could not write to the cloned repository.",
    });
    throw statusError(500, "Repository clone is not writable");
  }
}

async function finalizeWorkflow({ id, initialStatus, runDir, repoDir, body, branch, exitCode }) {
  try {
    await writeWorkflowStatus(id, { ...initialStatus, status: "Codex finished; checking repository changes", progress: 75, state: "running" });
    const rawSummary = await readLastAgentMessage(join(runDir, "codex.stdout.jsonl"));
    const summary = sanitizeAgentText(rawSummary, workflowSanitizeContext({ runDir, repoDir, body, branch }));

    if (exitCode !== 0) {
      await writeWorkflowStatus(id, {
        ...initialStatus,
        status: "Codex execution failed",
        progress: 100,
        state: "failed",
        summary: summary || `codex exec exited with code ${exitCode}`,
      });
      return;
    }

    const changed = spawnSync("git", ["status", "--porcelain"], { cwd: repoDir, encoding: "utf8" }).stdout.trim();
    if (!changed) {
      await writeWorkflowStatus(id, {
        ...initialStatus,
        status: "Completed with no repository changes",
        progress: 100,
        state: "completed",
        summary: summary || "Codex completed, but no files changed.",
      });
      return;
    }

    await writeWorkflowStatus(id, { ...initialStatus, status: "Committing and pushing branch", progress: 88, state: "running", summary });
    spawnSync("git", ["config", "user.name", String(body.agentHandle ?? "group-leveling-agent")], { cwd: repoDir, encoding: "utf8" });
    spawnSync("git", ["config", "user.email", `${slug(String(body.agentHandle ?? "agent"))}@group-leveling.local`], { cwd: repoDir, encoding: "utf8" });
    spawnSync("git", ["add", "-A"], { cwd: repoDir, encoding: "utf8" });
    const commit = spawnSync("git", ["commit", "-m", initialStatus.title], { cwd: repoDir, encoding: "utf8" });
    await writeFile(join(runDir, "git-commit.log"), `${commit.stdout ?? ""}${commit.stderr ?? ""}`);
    if (commit.status !== 0) {
      await writeWorkflowStatus(id, { ...initialStatus, status: "Failed to commit changes", progress: 100, state: "failed", summary: commit.stderr || commit.stdout || summary });
      return;
    }

    const push = spawnSync("git", pushArgs(branch), { cwd: repoDir, encoding: "utf8" });
    await writeFile(join(runDir, "git-push.log"), `${push.stdout ?? ""}${push.stderr ?? ""}`);
    if (push.status !== 0) {
      await writeWorkflowStatus(id, { ...initialStatus, status: "Failed to push branch", progress: 100, state: "failed", summary: push.stderr || push.stdout || summary });
      return;
    }

    const pr = await createPullRequest({ body, branch, title: initialStatus.title, summary });
    const pullRequestUrl = normalizePublicGiteaUrl(pr.html_url);
    await writeWorkflowStatus(id, {
      ...initialStatus,
      status: "Created Gitea pull request",
      progress: 100,
      state: "completed",
      summary: summary || "Codex changed files and the workflow server opened a pull request.",
      pullRequestUrl,
      pullRequest: pr.number ? `#${pr.number}` : undefined,
    });
  } catch (error) {
    await writeWorkflowStatus(id, {
      ...initialStatus,
      status: "Workflow failed",
      progress: 100,
      state: "failed",
      summary: error instanceof Error ? error.message : "Unknown workflow failure",
    });
  }
}

async function readWorkflowStatus(id) {
  if (!id || !/^wf-[0-9]+$/.test(id)) throw statusError(404, "Workflow not found");
  try {
    const runDir = await findWorkflowRunDir(id);
    const status = JSON.parse(await readFile(join(runDir, "status.json"), "utf8"));
    const requestBody = await readWorkflowRequest(runDir);
    const context = workflowSanitizeContext({ runDir, body: requestBody, branch: status.branch });
    const codexDetails = await readCodexDetails(runDir, context);
    const publicStatus = {
      ...status,
      summary: sanitizeAgentText(status.summary, context),
      pullRequestUrl: normalizePublicGiteaUrl(status.pullRequestUrl),
    };
    delete publicStatus.runDir;
    return {
      ...publicStatus,
      artifacts: await listArtifacts(runDir),
      trace: codexDetails.trace,
      usage: codexDetails.usage,
      limits: codexDetails.limits,
    };
  } catch {
    throw statusError(404, "Workflow not found");
  }
}

async function findWorkflowRunDir(id) {
  for (const root of readableRunsDirs) {
    const runDir = join(root, id);
    if (await fileExists(join(runDir, "status.json"))) return runDir;
  }
  throw statusError(404, "Workflow not found");
}

async function readWorkflowRequest(runDir) {
  try {
    return JSON.parse(await readFile(join(runDir, "request.json"), "utf8"));
  } catch {
    return {};
  }
}

async function writeWorkflowStatus(id, status) {
  const statusPath = join(runsDir, id, "status.json");
  let previous;
  try {
    previous = JSON.parse(await readFile(statusPath, "utf8"));
  } catch {
    previous = undefined;
  }
  const previousSteps = Array.isArray(previous?.steps) ? previous.steps : [];
  const step = {
    time: new Date().toISOString(),
    status: status.status,
    progress: status.progress,
    state: status.state,
  };
  const lastStep = previousSteps.at(-1);
  const steps =
    lastStep?.status === step.status && lastStep?.progress === step.progress && lastStep?.state === step.state
      ? previousSteps
      : [...previousSteps, step];
  await writeFile(
    statusPath,
    `${JSON.stringify(
      {
        ...status,
        runDir: join(runsDir, id),
        steps,
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
  );
}

async function listArtifacts(runDir) {
  try {
    const entries = await readdir(runDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

async function readCodexDetails(runDir, context = {}) {
  const limits = [{ label: "OpenAI limits", value: "Not reported by the local Codex CLI." }];
  try {
    const lines = (await readFile(join(runDir, "codex.stdout.jsonl"), "utf8"))
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const trace = [];
    let usage;
    for (const line of lines) {
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        continue;
      }
      if (event.type === "turn.completed" && event.usage) {
        usage = {
          inputTokens: event.usage.input_tokens,
          cachedInputTokens: event.usage.cached_input_tokens,
          outputTokens: event.usage.output_tokens,
          reasoningOutputTokens: event.usage.reasoning_output_tokens,
        };
      }
      const traceEvent = toTraceEvent(event, context);
      if (traceEvent) trace.push(traceEvent);
    }
    return { trace: trace.slice(-80), usage, limits };
  } catch {
    return { trace: [], usage: undefined, limits };
  }
}

function toTraceEvent(event, context = {}) {
  if (event.type === "turn.started") {
    return { id: "turn-started", kind: "turn", title: "Codex turn started", status: "running" };
  }
  if (event.type === "turn.completed") {
    return { id: "turn-completed", kind: "turn", title: "Codex turn completed", status: "completed" };
  }
  if (event.type === "error") {
    return { id: event.id ?? `error-${Date.now()}`, kind: "error", title: "Codex error", body: sanitizeAgentText(event.message, context), status: "failed" };
  }
  const item = event.item;
  if (!item) return undefined;
  if (item.type === "agent_message") {
    return {
      id: item.id,
      kind: "agent",
      title: "Agent message",
      body: sanitizeAgentText(item.text, context),
      status: event.type === "item.completed" ? "completed" : item.status,
    };
  }
  if (item.type === "command_execution") {
    return {
      id: item.id,
      kind: "command",
      title: item.command,
      body: sanitizeAgentText(truncateTraceBody(item.aggregated_output), context),
      status: item.status,
      exitCode: item.exit_code,
    };
  }
  if (item.type === "file_change") {
    const changes = Array.isArray(item.changes)
      ? item.changes.map((change) => `${change.kind ?? "change"} ${change.path ?? ""}`.trim()).join("\n")
      : undefined;
    return {
      id: item.id,
      kind: "files",
      title: "File changes",
      body: sanitizeAgentText(changes, context),
      status: item.status,
    };
  }
  return undefined;
}

function truncateTraceBody(value) {
  if (!value) return undefined;
  const text = String(value);
  return text.length > 4000 ? `${text.slice(0, 4000)}\n... truncated ...` : text;
}

function workflowSanitizeContext({ runDir, repoDir, body = {}, branch }) {
  return {
    runDir,
    repoDir: repoDir ?? (runDir ? join(runDir, "repo") : undefined),
    giteaProject: body.giteaProject,
    branch: branch ?? body.branch,
  };
}

function sanitizeAgentText(value, context = {}) {
  if (value === undefined || value === null) return value;
  const text = String(value);
  if (!text) return text;

  const linkedText = text.replace(/\[([^\]\n]+)\]\((\/[^)\s]+)\)/g, (match, label, target) => {
    const reference = publicFileReference(target, context);
    if (reference?.url) return `[${label}](${reference.url})`;
    if (reference?.path) return `\`${reference.path}\``;
    if (isHostRuntimePath(target, context)) return `\`${label}\``;
    return match;
  });

  return linkedText.replace(/\/[^\s`'")\]]+/g, (candidate) => {
    if (candidate.startsWith("//")) return candidate;
    const { path, suffix } = splitTrailingPunctuation(candidate);
    const reference = publicFileReference(path, context);
    if (reference?.url) return `${reference.url}${suffix}`;
    if (reference?.path) return `${reference.path}${suffix}`;
    if (isHostRuntimePath(path, context)) return `[host runtime]${suffix}`;
    return candidate;
  });
}

function publicFileReference(target, context = {}) {
  const path = decodeFilePath(target);
  const repoPath = relativeRepoPath(path, context.repoDir) ?? relativeWorkflowRepoPath(path);
  if (!repoPath) return undefined;
  return {
    path: repoPath,
    url: giteaFileUrl({ giteaProject: context.giteaProject, branch: context.branch, filePath: repoPath }),
  };
}

function relativeRepoPath(path, repoDir) {
  if (!repoDir || !path.startsWith("/")) return undefined;
  const relativePath = relative(resolve(repoDir), resolve(path));
  if (!relativePath || relativePath.startsWith("..") || isAbsolute(relativePath)) return undefined;
  return toPosixPath(relativePath);
}

function relativeWorkflowRepoPath(path) {
  if (!path.startsWith("/") || !path.includes("/.solo-leveling/workflows/")) return undefined;
  const marker = "/repo/";
  const repoIndex = path.indexOf(marker);
  if (repoIndex === -1) return undefined;
  const repoPath = path.slice(repoIndex + marker.length).replace(/^\/+/, "");
  return repoPath ? toPosixPath(repoPath) : undefined;
}

function giteaFileUrl({ giteaProject, branch, filePath }) {
  const base = String(process.env.PUBLIC_GITEA_BASE_URL ?? "").replace(/\/$/, "");
  const project = String(giteaProject ?? "").replace(/^\/+|\/+$/g, "");
  const branchName = String(branch ?? "");
  if (!base || !project || !branchName || !filePath) return "";
  return `${base}/${encodeSlashPath(project)}/src/branch/${encodeSlashPath(branchName)}/${encodeSlashPath(filePath)}`;
}

function normalizePublicGiteaUrl(value) {
  if (!value) return value;
  const publicBase = String(process.env.PUBLIC_GITEA_BASE_URL ?? "").replace(/\/$/, "");
  if (!publicBase) return value;
  try {
    const url = new URL(value);
    const localBase = process.env.GITEA_BASE_URL ? new URL(process.env.GITEA_BASE_URL) : undefined;
    const isLocalHost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    const isInternalGitea = localBase ? url.origin === localBase.origin : false;
    if (!isLocalHost && !isInternalGitea) return value;
    return `${publicBase}${url.pathname}${url.search}${url.hash}`;
  } catch {
    return value;
  }
}

function isHostRuntimePath(path, context = {}) {
  if (path.includes("/.solo-leveling/workflows/") || path.includes("/.codex-users/")) return true;
  if (!context.runDir || !path.startsWith("/")) return false;
  const relativePath = relative(resolve(context.runDir), resolve(path));
  return Boolean(relativePath && !relativePath.startsWith("..") && !isAbsolute(relativePath));
}

function splitTrailingPunctuation(value) {
  const suffix = value.match(/[.,;:]+$/)?.[0] ?? "";
  return suffix ? { path: value.slice(0, -suffix.length), suffix } : { path: value, suffix: "" };
}

function decodeFilePath(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function encodeSlashPath(value) {
  return String(value)
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function toPosixPath(value) {
  return value.split(sep).join("/");
}

async function readLastAgentMessage(path) {
  try {
    const lines = (await readFile(path, "utf8")).trim().split("\n");
    for (const line of lines.reverse()) {
      const event = JSON.parse(line);
      if (event?.type === "error" && event.message) return event.message;
      if (event?.type === "turn.failed" && event.error?.message) return event.error.message;
      const text = event?.item?.type === "agent_message" ? event.item.text : undefined;
      if (text) return text;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

async function createPullRequest({ body, branch, title, summary }) {
  const [owner, repo] = String(body.giteaProject ?? "").split("/");
  if (!owner || !repo || !process.env.GITEA_BASE_URL || !process.env.GITEA_TOKEN) {
    throw new Error("Cannot create pull request: Gitea environment is incomplete.");
  }

  const response = await fetch(`${process.env.GITEA_BASE_URL.replace(/\/$/, "")}/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`, {
    method: "POST",
    headers: {
      Authorization: `token ${process.env.GITEA_TOKEN}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(body.user ? { Sudo: String(body.user) } : {}),
    },
    body: JSON.stringify({
      base: body.defaultBranch ?? "main",
      head: branch,
      title,
      body: summary || "Created by Group Leveling agent workflow.",
    }),
  });

  if (!response.ok) {
    throw new Error(`Gitea PR creation failed: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

function statusError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function fileExists(path) {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function loadLocalEnv() {
  try {
    const envText = await readFile(".env.local", "utf8");
    for (const line of envText.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator === -1) continue;
      const key = trimmed.slice(0, separator);
      const value = trimmed.slice(separator + 1);
      process.env[key] = process.env[key] ?? value;
    }
  } catch {
    // .env.local is optional for the workflow server.
  }
}

function cloneArgs(repository, repoDir) {
  if (!repository || !shouldAttachGiteaToken(repository)) return ["clone", "--depth", "1", repository, repoDir];
  return [
    "-c",
    `http.extraHeader=Authorization: token ${process.env.GITEA_TOKEN}`,
    "clone",
    "--depth",
    "1",
    repository,
    repoDir,
  ];
}

function shouldAttachGiteaToken(repository) {
  if (!process.env.GITEA_TOKEN) return false;
  try {
    const repoUrl = new URL(repository);
    const allowedHosts = new Set(["localhost", "127.0.0.1"]);
    for (const value of [process.env.GITEA_BASE_URL, process.env.PUBLIC_GITEA_BASE_URL]) {
      if (value) allowedHosts.add(new URL(value).hostname);
    }
    return allowedHosts.has(repoUrl.hostname);
  } catch {
    return false;
  }
}

function pushArgs(branch) {
  if (!process.env.GITEA_TOKEN) return ["push", "-u", "origin", branch];
  return ["-c", `http.extraHeader=Authorization: token ${process.env.GITEA_TOKEN}`, "push", "-u", "origin", branch];
}

function summarizeLog(output) {
  const trimmed = String(output ?? "").trim();
  if (!trimmed) return "Git did not return clone output.";
  return trimmed.length > 2000 ? `${trimmed.slice(0, 2000)}\n...` : trimmed;
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function json(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(`${JSON.stringify(payload)}\n`);
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "project";
}
