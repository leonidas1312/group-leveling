import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { networkInterfaces } from "node:os";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const env = readEnv(resolve(root, ".env.local"));
const host = argValue("--host") || value("SOLO_LEVELING_ADMIN_USER") || "host";
const networkMode = (value("SOLO_LEVELING_NETWORK") || "lan").toLowerCase();
const useTailscale = networkMode === "tailscale" || value("SOLO_LEVELING_USE_TAILSCALE") === "1";
const publicHost = process.env.SOLO_LEVELING_PUBLIC_HOST || (useTailscale ? requiredTailscaleIp() : env.SOLO_LEVELING_PUBLIC_HOST || lanIp());
const configuredPublicUrl =
  process.env.SOLO_LEVELING_PUBLIC_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.PUBLIC_APP_URL ||
  (useTailscale ? "" : env.SOLO_LEVELING_PUBLIC_URL || env.NEXT_PUBLIC_APP_URL || env.PUBLIC_APP_URL || "");
const publicUrl = (
  argValue("--url") ||
  configuredPublicUrl ||
  `http://${publicHost || lanIp()}:3000`
).replace(/\/$/, "");

console.log(`${publicUrl}/invite?host=${encodeURIComponent(host)}`);

function argValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return "";
  return process.argv[index + 1] || "";
}

function value(key) {
  return process.env[key] || env[key] || "";
}

function readEnv(path) {
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );
}

function lanIp() {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === "IPv4" && !address.internal) return address.address;
    }
  }
  return "localhost";
}

function requiredTailscaleIp() {
  const ip = tailscaleIp();
  if (ip) return ip;
  console.error("SOLO_LEVELING_NETWORK=tailscale was requested, but no Tailscale IPv4 address was found.");
  console.error("Install Tailscale, run `tailscale up`, then retry. You can also pass --url explicitly.");
  process.exit(1);
}

function tailscaleIp() {
  const result = spawnSync("tailscale", ["ip", "-4"], { encoding: "utf8" });
  if (result.status !== 0) return "";
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) || "";
}
