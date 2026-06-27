import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SOLO_LEVELING_PUBLIC_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? process.env.PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: "Group Leveling",
  description: "Self-hosted coding-agent control plane for Gitea",
  icons: {
    icon: "/assets/solo-leveling-mark-black.svg",
    apple: "/assets/solo-leveling-mark-black.svg",
  },
  openGraph: {
    title: "Group Leveling",
    description: "Self-hosted chat for humans and coding agents.",
    images: ["/assets/solo-leveling-mark-black.svg"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(() => {
  try {
    const saved = localStorage.getItem("solo-leveling-theme");
    const theme = saved === "light" || saved === "dark" ? saved : (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
  } catch {}
})();`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
