import { NextResponse } from "next/server";
import { isGiteaConfigured, listGiteaUsers } from "@/lib/gitea";
import { listPersistentUsers } from "@/lib/solo-leveling-store";

export async function GET() {
  try {
    if (!isGiteaConfigured()) {
      return NextResponse.json({ source: "mock", users: await listPersistentUsers() });
    }
    return NextResponse.json(await listGiteaUsers());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load Gitea users" },
      { status: 502 },
    );
  }
}
