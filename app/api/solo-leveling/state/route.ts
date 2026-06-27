import { NextResponse } from "next/server";
import { ensureAgentsForUsers, readSoloLevelingState, syncProjectsWithStore, visibleAuthUsers } from "@/lib/solo-leveling-store";
import { listGiteaProjects, listGiteaUsers } from "@/lib/gitea";
import { demoProjects, demoUsers } from "@/lib/demo-data";

export async function GET() {
  try {
    const [projectResult, userResult] = await Promise.all([
      listGiteaProjects().catch(() => ({ source: "mock" as const, projects: demoProjects })),
      listGiteaUsers().catch(() => ({ source: "mock" as const, users: demoUsers })),
    ]);
    const state = await readSoloLevelingState();
    const users = userResult.source === "mock" ? visibleAuthUsers(state.users ?? []) : visibleAuthUsers(userResult.users);
    const projects = await syncProjectsWithStore(projectResult.projects);
    const agents = await ensureAgentsForUsers(users);
    const nextState = await readSoloLevelingState();

    return NextResponse.json({
      source: projectResult.source,
      projects,
      chats: nextState.chats,
      users,
      agents,
      adminUsername: process.env.SOLO_LEVELING_ADMIN_USER ?? users[0]?.username ?? "",
      publicAppUrl:
        process.env.SOLO_LEVELING_PUBLIC_URL ??
        process.env.NEXT_PUBLIC_APP_URL ??
        process.env.PUBLIC_APP_URL ??
        "",
      updatedAt: nextState.updatedAt,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load Group Leveling state" },
      { status: 502 },
    );
  }
}
