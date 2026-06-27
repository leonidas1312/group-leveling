import { NextResponse } from "next/server";
import { createPersistentAgent, deletePersistentAgent, updatePersistentAgent } from "@/lib/solo-leveling-store";
import type { AgentProfile } from "@/lib/demo-data";

const defaultAgentInstructions =
  "Talk naturally when people mention you in chat. If the message asks you to work on code, a repository, or a #project, use the project context, keep changes scoped, run relevant checks, and report what changed.";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<AgentProfile>;
    if (!body.handle || !body.name || !body.ownerUsername) {
      return NextResponse.json({ error: "handle, name and ownerUsername are required" }, { status: 400 });
    }

    const agent = await createPersistentAgent({
      handle: body.handle,
      name: body.name,
      ownerUsername: body.ownerUsername,
      role: body.role ?? "Workspace agent",
      personality: body.personality ?? "Helpful, conversational, and careful when repository work is requested.",
      instructions: body.instructions ?? defaultAgentInstructions,
      examples: body.examples ?? [],
    });

    return NextResponse.json({ agent });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create agent" },
      { status: 502 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as { id?: string; patch?: Partial<AgentProfile> };
    if (!body.id || !body.patch) {
      return NextResponse.json({ error: "id and patch are required" }, { status: 400 });
    }

    const agent = await updatePersistentAgent({
      id: body.id,
      patch: {
        name: body.patch.name,
        role: body.patch.role,
        personality: body.patch.personality,
        instructions: body.patch.instructions,
        examples: body.patch.examples,
      },
    });

    if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    return NextResponse.json({ agent });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update agent" },
      { status: 502 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as { id?: string };
    if (!body.id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const agent = await deletePersistentAgent({ id: body.id });
    if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    return NextResponse.json({ agent });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete agent" },
      { status: 502 },
    );
  }
}
