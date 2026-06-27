import { NextResponse } from "next/server";
import { getCodexUserStatus } from "@/lib/codex-auth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const user = url.searchParams.get("user");

  if (!user) {
    return NextResponse.json({ error: "user is required" }, { status: 400 });
  }

  const status = await getCodexUserStatus(user);
  return NextResponse.json({
    ...status,
    codexHome: status.configured ? "Per-user host profile" : "Not created",
    loginCommand: "Managed by Group Leveling device login",
  });
}
