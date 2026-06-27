import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, networkInterfaces } from "node:os";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const envPath = resolve(root, ".env.local");
const env = readEnv(envPath);
const networkMode = (value("SOLO_LEVELING_NETWORK") || "lan").toLowerCase();
const useTailscale = networkMode === "tailscale" || value("SOLO_LEVELING_USE_TAILSCALE") === "1";
const publicHost = process.env.SOLO_LEVELING_PUBLIC_HOST || (useTailscale ? requiredTailscaleIp() : env.SOLO_LEVELING_PUBLIC_HOST || lanIp());
const publicUrl =
  process.env.SOLO_LEVELING_PUBLIC_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.PUBLIC_APP_URL ||
  (useTailscale ? `http://${publicHost}:3000` : env.SOLO_LEVELING_PUBLIC_URL || env.NEXT_PUBLIC_APP_URL || env.PUBLIC_APP_URL || `http://${publicHost}:3000`);
const publicGiteaUrl = process.env.PUBLIC_GITEA_BASE_URL || (useTailscale ? `http://${publicHost}:3001` : env.PUBLIC_GITEA_BASE_URL || `http://${new URL(publicUrl).hostname}:3001`);
const dataDir = value("SOLO_LEVELING_DATA_DIR") || resolve(homedir(), ".solo-leveling");
const bindHost = process.env.SOLO_LEVELING_BIND_HOST || (useTailscale ? publicHost : env.SOLO_LEVELING_BIND_HOST || "0.0.0.0");
const giteaBaseUrl = process.env.GITEA_BASE_URL || (useTailscale ? publicGiteaUrl : env.GITEA_BASE_URL || "http://localhost:3001");

const runtimeEnv = {
  SOLO_LEVELING_NETWORK: useTailscale ? "tailscale" : networkMode,
  SOLO_LEVELING_PUBLIC_URL: publicUrl,
  NEXT_PUBLIC_APP_URL: publicUrl,
  SOLO_LEVELING_DATA_DIR: dataDir,
  SOLO_LEVELING_BIND_HOST: bindHost,
  GITEA_BASE_URL: giteaBaseUrl,
  PUBLIC_GITEA_BASE_URL: publicGiteaUrl,
  CODEX_SERVER_URL: value("CODEX_SERVER_URL") || "http://localhost:8787",
};

if (hasArg("--print-config")) {
  console.log(JSON.stringify({ publicUrl, publicGiteaUrl, dataDir, bindHost, giteaBaseUrl, network: runtimeEnv.SOLO_LEVELING_NETWORK }, null, 2));
  process.exit(0);
}

ensureEnv(runtimeEnv);

console.log(`Group Leveling public URL: ${publicUrl}`);
console.log(`Group Leveling network: ${useTailscale ? "tailscale" : networkMode}`);
console.log(`Group Leveling bind host: ${bindHost}`);
console.log(`Gitea public URL: ${publicGiteaUrl}`);
console.log(`Group Leveling host data: ${dataDir}`);
console.log(`Invite URL: ${publicUrl.replace(/\/$/, "")}/invite?host=${encodeURIComponent(value("SOLO_LEVELING_ADMIN_USER") || "host")}`);
console.log("");

const children = [];
run("docker", ["compose", "up", "-d", "gitea"], {
  wait: true,
  env: {
    ...runtimeEnv,
    PUBLIC_GITEA_BASE_URL: publicGiteaUrl.replace(/\/$/, ""),
    GITEA_HTTP_BIND: bindHost,
    GITEA_DOMAIN: new URL(publicGiteaUrl).hostname,
    GITEA_SSH_DOMAIN: new URL(publicGiteaUrl).hostname,
  },
})
  .then(() => {
    children.push(run("npm", ["run", "codex-server:exec"], { env: { ...runtimeEnv, RUN_CODEX_EXEC: "1" } }));
    children.push(run("npm", ["run", "dev"], { env: runtimeEnv }));
  })
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    for (const child of children) child.kill(signal);
    process.exit(0);
  });
}

function value(key) {
  return process.env[key] || env[key] || "";
}

function hasArg(name) {
  return process.argv.includes(name);
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

function ensureEnv(defaults) {
  const next = { ...env };
  let changed = false;
  for (const [key, defaultValue] of Object.entries(defaults)) {
    if (next[key] || process.env[key] || !defaultValue) continue;
    next[key] = defaultValue;
    changed = true;
  }
  if (!changed) return;
  const body = Object.entries(next)
    .map(([key, entryValue]) => `${key}=${entryValue}`)
    .join("\n");
  writeFileSync(envPath, `${body}\n`);
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
  console.error("Install Tailscale, run `tailscale up`, then retry. You can also set SOLO_LEVELING_PUBLIC_HOST manually.");
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

function run(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ...options.env },
  });

  if (!options.wait) return child;

  return new Promise((resolvePromise, reject) => {
    child.on("exit", (code) => {
      if (code === 0) resolvePromise(child);
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
    child.on("error", reject);
  });
}
