import { NextResponse } from "next/server";
import { getCodexWorkflow } from "@/lib/codex";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return NextResponse.json({ workflow: await getCodexWorkflow(id) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load workflow" },
      { status: 502 },
    );
  }
}
