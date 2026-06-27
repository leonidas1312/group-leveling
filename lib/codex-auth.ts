import { access } from "node:fs/promises";
import { constants, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const codexBin = process.env.CODEX_BIN ?? "codex";
const dataDir = process.env.SOLO_LEVELING_DATA_DIR ?? join(homedir(), ".solo-leveling");
const legacyCodexHomeRoot = resolve(process.cwd(), ".codex-users");
const codexHomeRoot = process.env.CODEX_USER_HOME_ROOT ?? (existsSync(legacyCodexHomeRoot) ? legacyCodexHomeRoot : join(dataDir, "codex-users"));

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

export function slugUser(user: string) {
  return user.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "user";
}

async function fileExists(path: string) {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}
