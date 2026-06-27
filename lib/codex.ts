import type { AgentWorkflow, Project } from "@/lib/demo-data";

type WorkflowInput = {
  prompt: string;
  project: Project;
  agentHandle?: string;
  agentName?: string;
  agentInstructions?: string;
  user?: string;
};

const codexServerUrl = process.env.CODEX_SERVER_URL;

export async function startCodexWorkflow({ prompt, project, agentHandle, agentName, agentInstructions, user }: WorkflowInput): Promise<AgentWorkflow> {
  if (!codexServerUrl) {
    throw new Error("Codex server is not configured. Set CODEX_SERVER_URL in .env.local.");
  }

  const serverUrl = codexServerUrl.replace(/\/$/, "");
  const response = await fetch(`${serverUrl}/workflows`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      repository: project.cloneUrl,
      defaultBranch: project.defaultBranch,
      giteaProject: project.repo,
      projectId: project.id,
      agentHandle,
      agentName,
      agentInstructions,
      user,
    }),
  }).catch((error: unknown) => {
    if (error instanceof Error && /fetch failed|ECONNREFUSED|ECONNRESET|ENOTFOUND/i.test(error.message)) {
      throw new Error(`Codex workflow server is not reachable at ${serverUrl}. Start it with npm run codex-server:exec or npm run self-host.`);
    }
    throw error;
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Codex server request failed: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as AgentWorkflow;
}

export async function getCodexWorkflow(id: string): Promise<AgentWorkflow> {
  if (!codexServerUrl) {
    throw new Error("Codex server is not configured. Set CODEX_SERVER_URL in .env.local.");
  }

  const serverUrl = codexServerUrl.replace(/\/$/, "");
  const response = await fetch(`${serverUrl}/workflows/${encodeURIComponent(id)}`, {
    cache: "no-store",
  }).catch((error: unknown) => {
    if (error instanceof Error && /fetch failed|ECONNREFUSED|ECONNRESET|ENOTFOUND/i.test(error.message)) {
      throw new Error(`Codex workflow server is not reachable at ${serverUrl}. Start it with npm run codex-server:exec or npm run self-host.`);
    }
    throw error;
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Codex server request failed: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as AgentWorkflow;
}
