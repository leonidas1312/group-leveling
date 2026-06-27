import { NextResponse } from "next/server";
import { createGiteaUser, isGiteaConfigured } from "@/lib/gitea";
import { ensureAgentsForUsers, listPersistentUsers, upsertPersistentUser } from "@/lib/solo-leveling-store";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { username?: string; password?: string; email?: string; fullName?: string };
    if (!body.username || !body.password || !body.email) {
      return NextResponse.json({ error: "username, email and password are required" }, { status: 400 });
    }

    let user;
    try {
      user = isGiteaConfigured()
        ? await createGiteaUser({
            username: body.username,
            password: body.password,
            email: body.email,
            fullName: body.fullName,
          })
        : await upsertPersistentUser({
            username: body.username,
            email: body.email,
            fullName: body.fullName,
          });
    } catch (error) {
      if (!isTransportFailure(error)) throw error;
      user = await upsertPersistentUser({
        username: body.username,
        email: body.email,
        fullName: body.fullName,
      });
    }

    await upsertPersistentUser(user);
    await ensureAgentsForUsers(await listPersistentUsers());
    return NextResponse.json({ user });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gitea account creation failed" },
      { status: 502 },
    );
  }
}

function isTransportFailure(error: unknown) {
  return error instanceof Error && /fetch failed|ECONNREFUSED|ECONNRESET|ENOTFOUND/i.test(error.message);
}
