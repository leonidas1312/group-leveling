import { spawn, type ChildProcess } from "node:child_process";
import { NextResponse } from "next/server";
import { codexChildEnv, getCodexBin, prepareCodexHome, slugUser } from "@/lib/codex-auth";

type PublicSession = {
  id: string;
  user: string;
  status: "running" | "completed" | "failed";
  output: string;
  startedAt: string;
  exitCode?: number | null;
  error?: string;
  loginCommand: string;
};

type InternalSession = PublicSession & {
  child?: ChildProcess;
};

const sessions = new Map<string, InternalSession>();
const userSessions = new Map<string, string>();

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { user?: string };
    if (!body.user) {
      return NextResponse.json({ error: "user is required" }, { status: 400 });
    }

    const user = slugUser(body.user);
    const existingId = userSessions.get(user);
    const existing = existingId ? sessions.get(existingId) : undefined;
    if (existing?.status === "running") {
      return NextResponse.json(publicSession(existing));
    }

    const codexHome = await prepareCodexHome(user);

    const id = `connect-${user}-${Date.now()}`;
    const session: InternalSession = {
      id,
      user,
      status: "running",
      output: "",
      startedAt: new Date().toISOString(),
      loginCommand: "Managed by Group Leveling device login",
    };

    sessions.set(id, session);
    userSessions.set(user, id);

    const child = spawn(getCodexBin(), ["login", "--device-auth"], {
      cwd: process.cwd(),
      env: codexChildEnv({ codexHome, user }),
      stdio: ["ignore", "pipe", "pipe"],
    });
    session.child = child;

    child.stdout.on("data", (chunk) => appendOutput(session, chunk.toString()));
    child.stderr.on("data", (chunk) => appendOutput(session, chunk.toString()));
    child.on("error", (error) => {
      session.status = "failed";
      session.error = error.message;
      appendOutput(session, error.message);
    });
    child.on("close", (code) => {
      session.status = code === 0 ? "completed" : "failed";
      session.exitCode = code;
      session.child = undefined;
    });

    return NextResponse.json(publicSession(session));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start ChatGPT login" },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const session = sessions.get(id);
  if (!session) {
    return NextResponse.json({ error: "Login session was not found" }, { status: 404 });
  }

  return NextResponse.json(publicSession(session));
}

function appendOutput(session: InternalSession, value: string) {
  session.output = `${session.output}${stripAnsi(value)}`.slice(-10000);
}

function stripAnsi(value: string) {
  return value.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
}

function publicSession(session: InternalSession): PublicSession {
  const { child: _child, ...rest } = session;
  return rest;
}
