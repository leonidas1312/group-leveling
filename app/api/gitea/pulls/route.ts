import { NextResponse } from "next/server";
import { getGiteaStatus, listGiteaPullRequests, mergeGiteaPullRequest } from "@/lib/gitea";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const owner = url.searchParams.get("owner") ?? undefined;
    const repo = url.searchParams.get("repo");
    const state = (url.searchParams.get("state") ?? "open") as "open" | "closed" | "all";
    if (!repo) {
      return NextResponse.json({ error: "repo is required" }, { status: 400 });
    }
    const giteaStatus = await getGiteaStatus();
    if (!giteaStatus.online) {
      return NextResponse.json({
        source: "mock",
        pullRequests: [],
        offline: true,
        error: giteaStatus.message,
      });
    }

    return NextResponse.json(await listGiteaPullRequests({ owner, repo, state }));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load Gitea pull requests" },
      { status: 502 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      owner?: string;
      repo?: string;
      index?: number;
      method?: "merge" | "squash" | "rebase" | "rebase-merge" | "fast-forward-only";
      deleteBranch?: boolean;
    };
    if (!body.repo) {
      return NextResponse.json({ error: "repo is required" }, { status: 400 });
    }
    const giteaStatus = await getGiteaStatus();
    if (!giteaStatus.online) {
      return NextResponse.json({ error: giteaStatus.message }, { status: 503 });
    }

    return NextResponse.json(
      await mergeGiteaPullRequest({
        owner: body.owner,
        repo: body.repo,
        index: body.index,
        method: body.method,
        deleteBranch: body.deleteBranch,
      }),
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to merge Gitea pull request" },
      { status: 502 },
    );
  }
}
