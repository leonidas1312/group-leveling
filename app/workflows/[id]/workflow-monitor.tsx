"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, CircleDot, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { AppLogo } from "@/components/app-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { AgentWorkflow } from "@/lib/demo-data";
import { sanitizeVisibleRuntimeText } from "@/lib/public-text";

type WorkflowResponse = {
  workflow?: AgentWorkflow;
  error?: string;
};

export default function WorkflowMonitor({ id }: { id: string }) {
  const [workflow, setWorkflow] = useState<AgentWorkflow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    try {
      const response = await fetch(`/api/agent/workflows/${encodeURIComponent(id)}`, { cache: "no-store" });
      const data = (await response.json()) as WorkflowResponse;
      if (!response.ok || !data.workflow) throw new Error(data.error ?? "Failed to load workflow");
      setWorkflow(data.workflow);
      setError(null);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Failed to load workflow");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      if (workflow?.state === "completed" || workflow?.state === "failed") return;
      void refresh();
    }, 2500);
    return () => window.clearInterval(timer);
  }, [id, workflow?.state]);

  return (
    <main className="min-h-screen bg-background px-5 py-6 text-foreground">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Button asChild variant="ghost" size="icon" className="h-9 w-9">
              <a href="/">
                <ArrowLeft className="h-4 w-4" />
              </a>
            </Button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <AppLogo className="h-5 w-5 rounded-sm" />
                <h1 className="truncate text-lg font-semibold">Workflow monitor</h1>
              </div>
              <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{id}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle compact />
            <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </Button>
          </div>
        </header>

        <Card className="border-border/60 bg-card shadow-none">
          <CardContent className="space-y-5 p-5">
            {error ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
            ) : null}

            {workflow ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{workflow.title}</div>
                    <div className="mt-1 text-sm text-muted-foreground">{workflow.status}</div>
                  </div>
                  <Badge variant="outline" className="border-border/60 bg-background/60 text-muted-foreground">
                    {workflow.state ?? "running"}
                  </Badge>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Progress</span>
                    <span>{workflow.progress}%</span>
                  </div>
                  <Progress value={workflow.progress} />
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <InfoBlock label="Project" value={workflow.projectId} />
                  <InfoBlock label="Branch" value={workflow.branch} />
                  {workflow.artifacts?.length ? <InfoBlock label="Artifacts" value={`${workflow.artifacts.length} files`} /> : null}
                </div>

                {workflow.usage ? (
                  <div className="grid gap-3 md:grid-cols-4">
                    <InfoBlock label="Input tokens" value={formatNumber(workflow.usage.inputTokens)} />
                    <InfoBlock label="Cached input" value={formatNumber(workflow.usage.cachedInputTokens)} />
                    <InfoBlock label="Output tokens" value={formatNumber(workflow.usage.outputTokens)} />
                    <InfoBlock label="Reasoning tokens" value={formatNumber(workflow.usage.reasoningOutputTokens)} />
                  </div>
                ) : null}

                {workflow.limits?.length ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    {workflow.limits.map((limit) => (
                      <InfoBlock key={limit.label} label={limit.label} value={limit.value} />
                    ))}
                  </div>
                ) : null}

                {workflow.steps?.length ? (
                  <div className="rounded-xl border border-border/60 bg-background p-4">
                    <div className="mb-3 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Agent timeline</div>
                    <div className="space-y-3">
                      {workflow.steps.map((step, index) => (
                        <div key={`${step.time}-${index}`} className="flex gap-3">
                          <CircleDot className="mt-1 h-3.5 w-3.5 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="text-sm font-medium">{step.status}</div>
                              <div className="font-mono text-xs text-muted-foreground">{new Date(step.time).toLocaleString()}</div>
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {step.state ?? "running"} · {step.progress}%
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {workflow.artifacts?.length ? (
                  <div className="rounded-xl border border-border/60 bg-background p-4">
                    <div className="mb-2 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Saved artifacts</div>
                    <div className="flex flex-wrap gap-2">
                      {workflow.artifacts.map((artifact) => (
                        <Badge key={artifact} variant="outline" className="rounded-md font-mono">
                          {artifact}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : null}

                {workflow.trace?.length ? (
                  <div className="rounded-xl border border-border/60 bg-background p-4">
                    <div className="mb-3 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Execution trace</div>
                    <div className="space-y-3">
                      {workflow.trace.map((event, index) => (
                        <div key={`${event.id}-${index}`} className="rounded-md border border-border/60 p-3">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium">{event.title}</div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {event.kind}
                                {event.status ? ` · ${event.status}` : ""}
                                {typeof event.exitCode === "number" ? ` · exit ${event.exitCode}` : ""}
                              </div>
                            </div>
                          </div>
                          {event.body ? (
                            <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-foreground/80">{sanitizeVisibleRuntimeText(event.body)}</pre>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {workflow.summary ? (
                  <div className="rounded-xl border border-border/60 bg-background p-4">
                    <div className="mb-2 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Summary</div>
                    <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap break-words text-sm leading-6 text-foreground/90">{sanitizeVisibleRuntimeText(workflow.summary)}</pre>
                  </div>
                ) : null}

                {workflow.pullRequestUrl ? (
                  <Button asChild>
                    <a href={workflow.pullRequestUrl} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-4 w-4" />
                      Open pull request
                    </a>
                  </Button>
                ) : null}
              </>
            ) : (
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                Loading workflow
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border/60 bg-background p-3">
      <div className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
      <div className="mt-1 truncate font-mono text-sm text-foreground">{value}</div>
    </div>
  );
}

function formatNumber(value?: number) {
  return typeof value === "number" ? new Intl.NumberFormat("en").format(value) : "Not reported";
}
