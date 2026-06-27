import { cn } from "@/lib/utils";

export function AppLogo({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center rounded-md border border-border bg-background", className)}>
      <img src="/assets/solo-leveling-mark-black.svg" alt="Group Leveling" className="h-[72%] w-[72%] dark:hidden" />
      <img src="/assets/solo-leveling-mark-white.svg" alt="Group Leveling" className="hidden h-[72%] w-[72%] dark:block" />
    </span>
  );
}
