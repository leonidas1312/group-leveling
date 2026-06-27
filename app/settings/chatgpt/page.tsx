"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { AppLogo } from "@/components/app-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type CodexStatus = {
  user: string;
  codexHome: string;
  configured: boolean;
  loginCommand: string;
};

type ConnectSession = {
  id: string;
  user: string;
  status: "running" | "completed" | "failed";
  output: string;
  startedAt: string;
  exitCode?: number | null;
  error?: string;
  loginCommand: string;
};

export default function ChatGPTSettingsPage() {
  const [username, setUsername] = useState("");
  const [status, setStatus] = useState<CodexStatus | null>(null);
  const [session, setSession] = useState<ConnectSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const savedProfile = window.localStorage.getItem("solo-leveling-profile") ?? "";
    setUsername(savedProfile);
    if (!savedProfile) {
      setLoading(false);
      return;
    }
    void refreshStatus(savedProfile).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!session?.id || session.status !== "running") return;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/codex/connect?id=${encodeURIComponent(session.id)}`, { cache: "no-store" });
        const data = (await response.json()) as ConnectSession & { error?: string };
        if (!response.ok) throw new Error(data.error ?? "Failed to load ChatGPT login");
        setSession(data);
        if (data.status !== "running") void refreshStatus(data.user);
      } catch (nextError) {
        setSession((current) =>
          current
            ? {
                ...current,
                status: "failed",
                error: nextError instanceof Error ? nextError.message : "Failed to load ChatGPT login",
              }
            : current,
        );
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [session?.id, session?.status]);

  async function refreshStatus(user = username) {
    if (!user) return;
    const response = await fetch(`/api/codex/status?user=${encodeURIComponent(user)}`, { cache: "no-store" });
    const data = (await response.json()) as CodexStatus;
    if (!response.ok) throw new Error("Failed to load ChatGPT status");
    setStatus(data);
  }

  async function startConnect() {
    if (!username) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/codex/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: username }),
      });
      const data = (await response.json()) as ConnectSession & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Failed to start ChatGPT login");
      setSession(data);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to start ChatGPT login");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button asChild variant="ghost" size="icon" className="h-9 w-9">
            <a href="/settings" aria-label="Back to settings">
              <ArrowLeft className="h-4 w-4" />
            </a>
          </Button>
          <AppLogo className="h-9 w-9" />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">ChatGPT connection</div>
            <div className="truncate text-xs text-muted-foreground">Connect your own Codex identity for agents you own.</div>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-3xl space-y-4 px-4 py-6">
        <Card className="border-border bg-background shadow-none">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-lg">ChatGPT / Codex</CardTitle>
                <CardDescription>{username || "No signed-in workspace user"}</CardDescription>
              </div>
              <Badge variant="outline" className="rounded-md">
                {loading ? "loading" : status?.configured ? "connected" : "missing"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading connection state
              </div>
            ) : username ? (
              <>
                <InfoRow label="Status" value={status?.configured ? "Connected" : "Not connected"} />
                <InfoRow label="Auth profile" value={status?.codexHome || "Not created"} />
                <Button className="w-full" disabled={busy || session?.status === "running"} onClick={() => void startConnect()}>
                  {busy || session?.status === "running" ? "Starting..." : status?.configured ? "Reconnect ChatGPT" : "Connect ChatGPT"}
                </Button>
              </>
            ) : (
              <Button asChild className="w-full">
                <a href="/">Sign in first</a>
              </Button>
            )}
            {error ? <div className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">{error}</div> : null}
            {session ? <DeviceLoginOutput session={session} /> : null}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

function DeviceLoginOutput({ session }: { session: ConnectSession }) {
  const device = parseDeviceLoginOutput(session.output);
  return (
    <div className="rounded-md border border-border p-3 text-sm">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="font-medium">Device login</span>
        <Badge variant="outline" className="rounded-md">
          {session.status}
        </Badge>
      </div>
      {device.code ? (
        <div className="mb-2 rounded-md bg-secondary px-3 py-2 font-mono text-base font-semibold tracking-wide">{device.code}</div>
      ) : null}
      {device.authUrl ? (
        <Button asChild variant="outline" size="sm" className="mb-3 w-full">
          <a href={device.authUrl} target="_blank" rel="noreferrer">
            Open device login
          </a>
        </Button>
      ) : null}
      <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-md bg-secondary p-3 text-xs leading-5 text-muted-foreground">
        {session.output || session.error || session.loginCommand}
      </pre>
    </div>
  );
}

function parseDeviceLoginOutput(output?: string) {
  const text = output ?? "";
  return {
    authUrl: text.match(/https:\/\/auth\.openai\.com\/codex\/device[^\s]*/)?.[0],
    code: text.match(/\b[A-Z0-9]{4}(?:-[A-Z0-9]{4})+\b/)?.[0] ?? text.match(/\b[A-Z0-9]{8,12}\b/)?.[0],
  };
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right font-medium">{value}</span>
    </div>
  );
}
