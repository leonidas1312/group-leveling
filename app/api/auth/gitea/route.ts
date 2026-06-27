import { NextResponse } from "next/server";
import { authenticateGiteaUser, isGiteaConfigured } from "@/lib/gitea";
import { ensureAgentsForUsers, listPersistentUsers, upsertPersistentUser } from "@/lib/solo-leveling-store";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { username?: string; password?: string };
    if (!body.username || (isGiteaConfigured() && !body.password)) {
      return NextResponse.json({ error: isGiteaConfigured() ? "username and password are required" : "username is required" }, { status: 400 });
    }

    let user;
    try {
      user = isGiteaConfigured()
        ? await authenticateGiteaUser({ username: body.username, password: body.password ?? "" })
        : await upsertPersistentUser({ username: body.username, fullName: body.username });
    } catch (error) {
      if (!isTransportFailure(error)) throw error;
      user = await upsertPersistentUser({ username: body.username, fullName: body.username });
    }

    if (!isGiteaConfigured() || user.id.startsWith("local-")) {
      await ensureAgentsForUsers(await listPersistentUsers());
    }
    return NextResponse.json({ user });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gitea login failed" },
      { status: 401 },
    );
  }
}

function isTransportFailure(error: unknown) {
  return error instanceof Error && /fetch failed|ECONNREFUSED|ECONNRESET|ENOTFOUND/i.test(error.message);
}
