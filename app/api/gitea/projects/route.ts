import { NextResponse } from "next/server";
import { deletePersistentProject, updatePersistentProjectMetadata, upsertPersistentProject } from "@/lib/solo-leveling-store";
import { createGiteaProject, deleteGiteaProject, getGiteaStatus, listGiteaProjects, updateGiteaProject } from "@/lib/gitea";

export async function GET() {
  try {
    return NextResponse.json(await listGiteaProjects());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load Gitea projects" },
      { status: 502 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { name?: string; description?: string; private?: boolean; owner?: string };
    if (!body.name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    const giteaStatus = await getGiteaStatus();
    if (!giteaStatus.online) {
      return NextResponse.json({ error: giteaStatus.message }, { status: 503 });
    }

    const result = await createGiteaProject({ name: body.name, description: body.description, private: body.private, owner: body.owner });
    await upsertPersistentProject(result.project);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create Gitea project" },
      { status: 502 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as { owner?: string; repo?: string; name?: string; description?: string };
    if (!body.repo) {
      return NextResponse.json({ error: "repo is required" }, { status: 400 });
    }

    const result = await updateGiteaProject({ owner: body.owner, repo: body.repo, name: body.name, description: body.description });
    await updatePersistentProjectMetadata({ owner: body.owner, repo: body.repo, name: body.name, description: body.description });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update Gitea project" },
      { status: 502 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as { owner?: string; repo?: string };
    if (!body.repo) {
      return NextResponse.json({ error: "repo is required" }, { status: 400 });
    }

    const result = await deleteGiteaProject({ owner: body.owner, repo: body.repo });
    await deletePersistentProject({ owner: body.owner, repo: body.repo });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete Gitea project" },
      { status: 502 },
    );
  }
}
