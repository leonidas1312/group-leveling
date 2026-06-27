const baseUrl = (
  process.env.GROUP_LEVELING_BASE_URL ||
  process.env.SOLO_LEVELING_PUBLIC_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "http://127.0.0.1:3000"
).replace(/\/$/, "");

const suffix = String(Date.now()).slice(-8);
const password = `GroupLeveling${suffix}!`;
const teammates = [
  {
    username: `gl_alex_${suffix}`,
    fullName: "Alex Smoke",
    email: `alex-${suffix}@example.test`,
  },
  {
    username: `gl_mira_${suffix}`,
    fullName: "Mira Smoke",
    email: `mira-${suffix}@example.test`,
  },
];

const createdUsernames = [];

try {
  const initialState = await getJson("/api/solo-leveling/state");
  const adminUsername = initialState.adminUsername || initialState.users?.[0]?.username;
  if (!adminUsername) {
    throw new Error("No host/admin user is available in the running app.");
  }

  for (const teammate of teammates) {
    const result = await postJson("/api/auth/gitea/register", { ...teammate, password });
    assert(result.user?.username === teammate.username, `created ${teammate.username}`);
    createdUsernames.push(teammate.username);
  }

  const stateAfterUsers = await getJson("/api/solo-leveling/state");
  for (const teammate of teammates) {
    assert(
      stateAfterUsers.users?.some((user) => user.username === teammate.username),
      `${teammate.username} is visible as an accepted member`,
    );
    assert(
      stateAfterUsers.agents?.some((agent) => agent.ownerUsername === teammate.username),
      `${teammate.username} has an owned agent profile`,
    );
  }

  const chatResult = await postJson("/api/solo-leveling/chats", {
    title: `Offline team smoke ${suffix}`,
    members: teammates.map((teammate) => teammate.username),
    author: adminUsername,
  });
  const chat = chatResult.chat;
  assert(chat?.id, "created shared chat");
  assert(chat.members.includes(adminUsername), "chat includes host");
  assert(chat.members.includes(teammates[0].username), "chat includes first teammate");
  assert(chat.members.includes(teammates[1].username), "chat includes second teammate");

  await postJson("/api/solo-leveling/messages", {
    chatId: chat.id,
    message: {
      id: `smoke-${suffix}-1`,
      author: teammates[0].username,
      body: "Offline smoke message without an agent mention.",
      time: "now",
      kind: "human",
    },
  });

  const deniedDelete = await requestJson("/api/solo-leveling/chats", {
    method: "DELETE",
    body: {
      chatId: chat.id,
      actor: teammates[0].username,
      adminUsername,
    },
    expected: 403,
  });
  assert(/Only the chat owner or host/i.test(deniedDelete.error ?? ""), "non-owner cannot delete host chat");

  const leaveResult = await patchJson("/api/solo-leveling/chats", {
    chatId: chat.id,
    action: "leave",
    actor: teammates[1].username,
  });
  assert(!leaveResult.chat.members.includes(teammates[1].username), "member can leave shared chat");

  const statusA = await getJson(`/api/codex/status?user=${encodeURIComponent(teammates[0].username)}`);
  const statusB = await getJson(`/api/codex/status?user=${encodeURIComponent(teammates[1].username)}`);
  assert(statusA.user !== statusB.user, "Codex status is scoped to distinct users");
  assert(statusA.configured === false && statusB.configured === false, "new teammates do not inherit host Codex auth");

  await requestJson("/api/solo-leveling/chats", {
    method: "DELETE",
    body: {
      chatId: chat.id,
      actor: adminUsername,
      adminUsername,
    },
    expected: 200,
  });
  assert(true, "host can delete the smoke chat");

  await cleanupUsers();
  await getJson("/api/solo-leveling/state");

  console.log(`Offline team smoke passed against ${baseUrl}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  await cleanupUsers().catch(() => {});
  process.exitCode = 1;
}

async function cleanupUsers() {
  const env = await readDotEnv();
  const status = await getJson("/api/gitea/status").catch(() => ({}));
  const giteaBaseUrl = (
    status.baseUrl ||
    status.publicBaseUrl ||
    env.GITEA_BASE_URL ||
    env.PUBLIC_GITEA_BASE_URL ||
    ""
  ).replace(/\/$/, "");
  const token = env.GITEA_TOKEN;
  if (!giteaBaseUrl || !token || !createdUsernames.length) return;

  for (const username of createdUsernames) {
    await fetch(`${giteaBaseUrl}/api/v1/admin/users/${encodeURIComponent(username)}`, {
      method: "DELETE",
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/json",
      },
    }).catch(() => {});
  }
}

async function readDotEnv() {
  const { readFile } = await import("node:fs/promises");
  const env = {};
  try {
    const text = await readFile(".env.local", "utf8");
    for (const line of text.split(/\r?\n/)) {
      if (!line || line.trim().startsWith("#") || !line.includes("=")) continue;
      const [key, ...rest] = line.split("=");
      env[key.trim()] = rest.join("=").trim();
    }
  } catch {}
  return env;
}

async function getJson(path) {
  return requestJson(path, { method: "GET", expected: 200 });
}

async function postJson(path, body) {
  return requestJson(path, { method: "POST", body, expected: 200 });
}

async function patchJson(path, body) {
  return requestJson(path, { method: "PATCH", body, expected: 200 });
}

async function requestJson(path, options) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method,
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (response.status !== options.expected) {
    throw new Error(`${options.method} ${path} expected ${options.expected}, got ${response.status}: ${JSON.stringify(payload)}`);
  }
  return payload;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Smoke failed: ${message}`);
  }
  console.log(`ok - ${message}`);
}
