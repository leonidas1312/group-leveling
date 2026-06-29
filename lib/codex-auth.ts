import { access, chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const codexBin = process.env.CODEX_BIN ?? "codex";
const dataDir = process.env.SOLO_LEVELING_DATA_DIR ?? join(homedir(), ".solo-leveling");
const legacyCodexHomeRoot = resolve(process.cwd(), ".codex-users");
const codexHomeRoot = process.env.CODEX_USER_HOME_ROOT ?? (existsSync(legacyCodexHomeRoot) ? legacyCodexHomeRoot : join(dataDir, "codex-users"));
const codexCredentialStoreSetting = `cli_auth_credentials_store = "file"`;
const codexChildEnvAllowlist = [
  "PATH",
  "PATHEXT",
  "SystemRoot",
  "WINDIR",
  "ComSpec",
  "TMPDIR",
  "TEMP",
  "TMP",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "LC_MESSAGES",
  "TERM",
  "COLORTERM",
  "NO_COLOR",
  "FORCE_COLOR",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "NO_PROXY",
  "http_proxy",
  "https_proxy",
  "all_proxy",
  "no_proxy",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
  "REQUESTS_CA_BUNDLE",
  "NODE_EXTRA_CA_CERTS",
  "CODEX_CA_CERTIFICATE",
  "RUST_LOG",
] as const;

export type CodexUserStatus = {
  user: string;
  codexHome: string;
  configured: boolean;
  loginCommand: string;
};

export async function getCodexUserStatus(user: string): Promise<CodexUserStatus> {
  const safeUser = slugUser(user);
  const codexHome = getCodexHome(safeUser);
  const configured = await fileExists(join(codexHome, "auth.json"));

  return {
    user: safeUser,
    codexHome,
    configured,
    loginCommand: `CODEX_HOME=${codexHome} ${codexBin} login`,
  };
}

export function getCodexBin() {
  return codexBin;
}

export function getCodexHome(user: string) {
  return join(codexHomeRoot, slugUser(user));
}

export async function prepareCodexHome(user: string) {
  const codexHome = getCodexHome(user);
  await mkdir(codexHome, { recursive: true, mode: 0o700 });
  await chmod(codexHome, 0o700).catch(() => undefined);
  await ensureFileCredentialStore(codexHome);
  return codexHome;
}

export function codexChildEnv(input: { codexHome: string; user: string }): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { NODE_ENV: process.env.NODE_ENV ?? "production" };
  for (const key of codexChildEnvAllowlist) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }

  env.CODEX_HOME = input.codexHome;
  env.CODEX_SQLITE_HOME = input.codexHome;
  env.HOME = input.codexHome;
  env.USER = input.user;
  env.LOGNAME = input.user;

  return env;
}

export function slugUser(user: string) {
  return user.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "user";
}

async function ensureFileCredentialStore(codexHome: string) {
  const configPath = join(codexHome, "config.toml");
  const current = await readFile(configPath, "utf8").catch((error: unknown) => {
    if (isNodeError(error) && error.code === "ENOENT") return "";
    throw error;
  });
  const next = withForcedFileCredentialStore(current);
  if (next !== current) {
    await writeFile(configPath, next, { mode: 0o600 });
  }
  await chmod(configPath, 0o600).catch(() => undefined);
}

function withForcedFileCredentialStore(contents: string) {
  const credentialStorePattern = /^(?!\s*#)\s*cli_auth_credentials_store\s*=.*$/m;
  if (credentialStorePattern.test(contents)) {
    return contents.replace(credentialStorePattern, codexCredentialStoreSetting);
  }
  return contents.trim() ? `${codexCredentialStoreSetting}\n\n${contents}` : `${codexCredentialStoreSetting}\n`;
}

async function fileExists(path: string) {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
