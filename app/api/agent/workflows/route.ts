import { NextResponse } from "next/server";
import { startCodexWorkflow } from "@/lib/codex";
import { getGiteaStatus, giteaProjectExists } from "@/lib/gitea";
import { readSoloLevelingState } from "@/lib/solo-leveling-store";
import type { Project } from "@/lib/demo-data";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      prompt?: string;
      project?: Project;
      agentHandle?: string;
      agentName?: string;
      agentInstructions?: string;
    };
    if (!body.prompt || !body.project || !body.agentHandle) {
      return NextResponse.json({ error: "prompt, project and agentHandle are required" }, { status: 400 });
    }
    const agentHandle = body.agentHandle.replace(/^@+/, "");
    const state = await readSoloLevelingState();
    const agent = state.agents.find((candidate) => candidate.handle === agentHandle);
    if (!agent) {
      return NextResponse.json({ error: `Agent ${agentHandle} was not found.` }, { status: 404 });
    }

    const giteaStatus = await getGiteaStatus();
    if (!giteaStatus.online) {
      return NextResponse.json({ error: giteaStatus.message }, { status: 503 });
    }
    if (!(await giteaProjectExists(body.project))) {
      return NextResponse.json(
        { error: `Gitea repository ${body.project.repo} does not exist. Create or connect the project before delegating agent work.` },
        { status: 409 },
      );
    }

    const workflow = await startCodexWorkflow({
      prompt: body.prompt,
      project: body.project,
      agentHandle: agent.handle,
      agentName: agent.name,
      agentInstructions: body.agentInstructions,
      user: agent.ownerUsername,
    });
    return NextResponse.json({ workflow });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start Codex workflow" },
      { status: 502 },
    );
  }
}
