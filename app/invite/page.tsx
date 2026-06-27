import { headers } from "next/headers";
import type { ReactNode } from "react";
import { ArrowRight, Bot, KeyRound, UserPlus } from "lucide-react";
import { AppLogo } from "@/components/app-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function InvitePage({ searchParams }: { searchParams: Promise<{ host?: string }> }) {
  const params = await searchParams;
  const headersList = await headers();
  const host = headersList.get("host") ?? "localhost:3000";
  const protocol = headersList.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  const appUrl = (process.env.SOLO_LEVELING_PUBLIC_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? process.env.PUBLIC_APP_URL ?? `${protocol}://${host}`).replace(/\/$/, "");
  const inviter = params.host?.trim() || "the host";

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <div className="absolute right-4 top-4">
        <ThemeToggle compact />
      </div>
      <Card className="w-full max-w-xl border-border bg-background shadow-none">
        <CardHeader>
          <AppLogo className="mb-3 h-10 w-10" />
          <Badge variant="outline" className="mb-3 w-fit rounded-md">
            Invited by {inviter}
          </Badge>
          <CardTitle className="text-2xl">Join this Group Leveling workspace</CardTitle>
          <CardDescription>
            Use the host infrastructure, connect your own ChatGPT/Codex identity, and bring your agent into workspace chat.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Step icon={<UserPlus className="h-4 w-4" />} title="Create your profile" body="Pick a username for this hosted workspace. In Gitea mode, this creates or uses your Gitea account." />
          <Step icon={<KeyRound className="h-4 w-4" />} title="Connect ChatGPT" body="Open the Codex device-login sheet and complete the one-time code flow. Your Codex profile is stored separately on this host." />
          <Step icon={<Bot className="h-4 w-4" />} title="Add your agent" body="Name your agent, set its instructions, then mention it with @ in chat and mention projects with #." />
          <Button asChild className="w-full">
            <a href={appUrl}>
              Open workspace
              <ArrowRight className="h-4 w-4" />
            </a>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

function Step({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="flex gap-3 rounded-md border border-border p-3">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border">{icon}</div>
      <div>
        <div className="text-sm font-medium">{title}</div>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}
