import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const outDir = join(process.cwd(), "docs", "assets");
const font =
  "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";

const palette = {
  ink: "#101214",
  text: "#182025",
  muted: "#5d6972",
  line: "#d8dee4",
  panel: "#ffffff",
  soft: "#f6f8f9",
  dark: "#0b0d0f",
  green: "#1f8a62",
  blue: "#246bfe",
  amber: "#b46b18",
  red: "#bb3434",
};

const assets = [
  {
    name: "group-leveling-social-card",
    svg: socialCard(),
  },
  {
    name: "group-leveling-architecture",
    svg: architectureImage(),
  },
  {
    name: "group-leveling-demo-flow",
    svg: demoFlowImage(),
  },
  {
    name: "group-leveling-invite-card",
    svg: inviteCard(),
  },
];

await mkdir(outDir, { recursive: true });

for (const asset of assets) {
  const svg = cleanSvg(asset.svg);
  const svgPath = join(outDir, `${asset.name}.svg`);
  const pngPath = join(outDir, `${asset.name}.png`);
  await writeFile(svgPath, svg);
  await sharp(Buffer.from(svg)).png().toFile(pngPath);
  console.log(`Generated ${svgPath}`);
  console.log(`Generated ${pngPath}`);
}

function cleanSvg(value) {
  return `${value.replace(/[ \t]+$/gm, "").trim()}\n`;
}

function socialCard() {
  const w = 1200;
  const h = 630;
  return page(w, h, `
    ${waveBackground(w, h)}
    ${mark(84, 78, 78, palette.ink)}
    ${text("Group Leveling", 184, 130, 34, 800, palette.ink)}
    ${pill(184, 154, "private team workspace", palette.green)}
    ${text("Self-hosted team chat", 84, 270, 64, 850, palette.ink)}
    ${text("for human-agent work", 84, 342, 64, 850, palette.ink)}
    ${paragraph(
      "Invite over Tailscale. Each teammate brings ChatGPT/Codex auth. Work lands in Gitea pull requests.",
      88,
      414,
      710,
      27,
      palette.muted,
    )}
    ${featurePill(88, 540, "Tailscale private access", palette.blue)}
    ${featurePill(348, 540, "User-owned agents", palette.green)}
    ${featurePill(570, 540, "Gitea pull requests", palette.amber)}
    ${miniPanel(885, 105)}
  `);
}

function architectureImage() {
  const w = 1600;
  const h = 1000;
  const boxes = [
    box(90, 190, 300, 150, "Teammates", "Browser UI over LAN or Tailscale", palette.blue),
    box(475, 165, 360, 205, "Group Leveling", "Next.js app, chat, invite, settings", palette.ink),
    box(930, 190, 280, 155, "Gitea", "Repos, users, branches, pull requests", palette.amber),
    box(930, 455, 280, 155, "Workflow Server", "Runs Codex jobs and records trace", palette.green),
    box(475, 455, 360, 155, "File State", "Chats, agents, projects, workflows", palette.ink),
    box(1265, 455, 260, 155, "User auth homes", "Separate Codex profile per teammate", palette.blue),
    box(1265, 680, 260, 145, "ChatGPT / Codex", "User subscription and limits", palette.green),
  ];
  return page(w, h, `
    ${gridBackground(w, h)}
    ${mark(74, 58, 58, palette.ink)}
    ${text("Group Leveling Architecture", 150, 98, 44, 850, palette.ink)}
    ${text("How a self-hosted human-agent team workspace holds together", 152, 135, 22, 500, palette.muted)}
    ${arrow(390, 265, 475, 265)}
    ${arrow(835, 245, 930, 245)}
    ${arrow(835, 532, 930, 532)}
    ${arrow(1070, 455, 1070, 345)}
    ${arrow(1210, 532, 1265, 532)}
    ${arrow(1395, 610, 1395, 680)}
    ${arrow(655, 370, 655, 455)}
    ${boxes.join("")}
    ${legend(90, 850)}
  `);
}

function demoFlowImage() {
  const w = 1600;
  const h = 900;
  const steps = [
    ["1", "Host starts", "One command starts app, Gitea, and workflow runner."],
    ["2", "Invite teammate", "Share Tailscale access and the Group Leveling invite URL."],
    ["3", "Connect auth", "Each teammate connects their own ChatGPT/Codex account."],
    ["4", "Create agent", "Agent gets a name, role, and optional instructions."],
    ["5", "Chat naturally", "Mention @agents and #projects inside normal messages."],
    ["6", "Review PR", "Codex work lands in a Gitea branch and pull request."],
  ];
  return page(w, h, `
    ${waveBackground(w, h)}
    ${mark(82, 62, 56, palette.ink)}
    ${text("Team workflow", 152, 100, 46, 850, palette.ink)}
    ${text("A 30-second story for screenshots, GIFs, and launch posts", 154, 137, 22, 500, palette.muted)}
    ${steps.map((step, index) => flowStep(90 + index * 245, 230, step[0], step[1], step[2])).join("")}
    ${chatMock(116, 570)}
    ${prMock(900, 560)}
  `);
}

function inviteCard() {
  const w = 1200;
  const h = 630;
  return page(w, h, `
    ${gridBackground(w, h)}
    ${mark(84, 76, 76, palette.ink)}
    ${text("Invite trusted teammates", 184, 122, 42, 850, palette.ink)}
    ${text("Private first. Team-owned infra. User-owned AI.", 186, 158, 24, 500, palette.muted)}
    ${box(82, 248, 490, 250, "Host", "Runs Group Leveling, Gitea, workflow server, and Tailscale access.", palette.ink)}
    ${box(628, 248, 490, 250, "Member", "Joins the private network, opens the invite URL, and connects ChatGPT/Codex.", palette.green)}
    ${arrow(572, 370, 628, 370)}
    ${featurePill(86, 535, "Private network access", palette.blue)}
    ${featurePill(396, 535, "Accepted members are visible", palette.green)}
    ${featurePill(742, 535, "Each user owns their agent auth", palette.amber)}
  `);
}

function page(width, height, body) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">
  <rect width="${width}" height="${height}" fill="#f8faf9"/>
  ${body}
</svg>
`;
}

function waveBackground(width, height) {
  return `
  <path d="M0 ${height * 0.22} C ${width * 0.22} ${height * 0.05}, ${width * 0.34} ${height * 0.38}, ${width * 0.55} ${height * 0.2} S ${width * 0.85} ${height * 0.15}, ${width} ${height * 0.28}" fill="none" stroke="#dfe8e3" stroke-width="62" stroke-linecap="round"/>
  <path d="M0 ${height * 0.78} C ${width * 0.2} ${height * 0.62}, ${width * 0.34} ${height}, ${width * 0.56} ${height * 0.8} S ${width * 0.84} ${height * 0.7}, ${width} ${height * 0.86}" fill="none" stroke="#eaf0fb" stroke-width="58" stroke-linecap="round"/>
  <path d="M0 ${height * 0.6} C ${width * 0.18} ${height * 0.46}, ${width * 0.42} ${height * 0.64}, ${width * 0.58} ${height * 0.5} S ${width * 0.84} ${height * 0.44}, ${width} ${height * 0.56}" fill="none" stroke="#f2eadf" stroke-width="42" stroke-linecap="round"/>
  `;
}

function gridBackground(width, height) {
  const lines = [];
  for (let x = 0; x <= width; x += 64) {
    lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${height}" stroke="#edf1f3" stroke-width="1"/>`);
  }
  for (let y = 0; y <= height; y += 64) {
    lines.push(`<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="#edf1f3" stroke-width="1"/>`);
  }
  return `<g>${lines.join("")}</g>`;
}

function mark(x, y, size, color) {
  const scale = size / 64;
  return `
  <g transform="translate(${x} ${y}) scale(${scale})" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
    <path d="M32 6 54 19v26L32 58 10 45V19L32 6Z"/>
    <path d="M32 18 44 25v14L32 46 20 39V25L32 18Z"/>
    <path d="M32 6v12"/>
    <path d="M54 19 44 25"/>
    <path d="M54 45 44 39"/>
    <path d="M32 58V46"/>
    <path d="M10 45 20 39"/>
    <path d="M10 19 20 25"/>
    <path d="M32 18c7 4 12 8 12 14s-5 10-12 14c-7-4-12-8-12-14s5-10 12-14Z"/>
  </g>`;
}

function text(value, x, y, size, weight, fill) {
  return `<text x="${x}" y="${y}" font-family="${font}" font-size="${size}" font-weight="${weight}" fill="${fill}" letter-spacing="0">${escapeXml(value)}</text>`;
}

function paragraph(value, x, y, width, size, fill) {
  const words = value.split(" ");
  const lines = [];
  let line = "";
  const maxChars = Math.floor(width / (size * 0.52));
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return `<text x="${x}" y="${y}" font-family="${font}" font-size="${size}" font-weight="450" fill="${fill}" letter-spacing="0">${lines
    .map((item, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : size * 1.35}">${escapeXml(item)}</tspan>`)
    .join("")}</text>`;
}

function pill(x, y, label, color) {
  return `
  <g>
    <rect x="${x}" y="${y}" width="${label.length * 12 + 34}" height="36" rx="18" fill="${color}" opacity="0.12"/>
    <circle cx="${x + 20}" cy="${y + 18}" r="5" fill="${color}"/>
    ${text(label, x + 34, y + 24, 15, 750, color)}
  </g>`;
}

function featurePill(x, y, label, color) {
  return `
  <g>
    <rect x="${x}" y="${y}" width="${label.length * 10 + 42}" height="44" rx="8" fill="#ffffff" stroke="#dce3e7"/>
    <rect x="${x + 14}" y="${y + 14}" width="16" height="16" rx="4" fill="${color}"/>
    ${text(label, x + 42, y + 29, 16, 720, palette.text)}
  </g>`;
}

function miniPanel(x, y) {
  return `
  <g>
    <rect x="${x}" y="${y}" width="240" height="330" rx="16" fill="#ffffff" stroke="#d8dee4"/>
    ${text("team chat", x + 26, y + 48, 22, 800, palette.ink)}
    ${messageLine(x + 26, y + 84, "@agent-lina", "update #web-app")}
    ${messageLine(x + 26, y + 142, "@agent-lina", "started workflow")}
    ${messageLine(x + 26, y + 200, "gitea", "pull request ready")}
    <rect x="${x + 26}" y="${y + 260}" width="188" height="40" rx="8" fill="${palette.ink}"/>
    ${text("Open PR", x + 88, y + 286, 16, 800, "#ffffff")}
  </g>`;
}

function messageLine(x, y, name, body) {
  return `
  <g>
    <rect x="${x}" y="${y}" width="188" height="42" rx="8" fill="#f5f7f8"/>
    ${text(name, x + 14, y + 17, 13, 800, palette.green)}
    ${text(body, x + 14, y + 33, 13, 500, palette.muted)}
  </g>`;
}

function box(x, y, width, height, title, body, color) {
  return `
  <g>
    <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="14" fill="${palette.panel}" stroke="${palette.line}" stroke-width="2"/>
    <rect x="${x + 24}" y="${y + 26}" width="24" height="24" rx="6" fill="${color}"/>
    ${text(title, x + 62, y + 48, 25, 850, palette.ink)}
    ${paragraph(body, x + 28, y + 92, width - 56, 19, palette.muted)}
  </g>`;
}

function arrow(x1, y1, x2, y2) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const arrowLength = 12;
  const left = `${x2 - arrowLength * Math.cos(angle - Math.PI / 6)},${y2 - arrowLength * Math.sin(angle - Math.PI / 6)}`;
  const right = `${x2 - arrowLength * Math.cos(angle + Math.PI / 6)},${y2 - arrowLength * Math.sin(angle + Math.PI / 6)}`;
  return `
  <g stroke="${palette.ink}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none">
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>
    <path d="M${left} L${x2},${y2} L${right}"/>
  </g>`;
}

function legend(x, y) {
  return `
  <g>
    <rect x="${x}" y="${y}" width="1420" height="92" rx="14" fill="#ffffff" stroke="${palette.line}"/>
    ${featurePill(x + 28, y + 24, "Chat coordinates work", palette.blue)}
    ${featurePill(x + 340, y + 24, "Gitea owns repos and PRs", palette.amber)}
    ${featurePill(x + 704, y + 24, "Codex runs with user auth", palette.green)}
    ${featurePill(x + 1080, y + 24, "Tailscale protects access", palette.ink)}
  </g>`;
}

function flowStep(x, y, number, title, body) {
  return `
  <g>
    <circle cx="${x + 36}" cy="${y + 36}" r="34" fill="${palette.ink}"/>
    ${text(number, x + 26, y + 48, 30, 850, "#ffffff")}
    ${text(title, x, y + 100, 25, 850, palette.ink)}
    ${paragraph(body, x, y + 132, 180, 16, palette.muted)}
  </g>`;
}

function chatMock(x, y) {
  return `
  <g>
    <rect x="${x}" y="${y}" width="640" height="240" rx="16" fill="#ffffff" stroke="${palette.line}" stroke-width="2"/>
    ${text("Workspace chat", x + 28, y + 42, 24, 850, palette.ink)}
    ${text("lina", x + 28, y + 86, 15, 800, palette.muted)}
    ${text("@agent-lina update the docs in #team/app", x + 28, y + 118, 28, 750, palette.ink)}
    ${text("@agent-lina", x + 28, y + 166, 15, 800, palette.green)}
    ${text("Run started. Branch: agent/docs-flow", x + 28, y + 197, 22, 600, palette.muted)}
  </g>`;
}

function prMock(x, y) {
  return `
  <g>
    <rect x="${x}" y="${y}" width="560" height="240" rx="16" fill="#ffffff" stroke="${palette.line}" stroke-width="2"/>
    ${text("Gitea pull request", x + 28, y + 42, 24, 850, palette.ink)}
    ${featurePill(x + 28, y + 72, "agent/docs-flow", palette.green)}
    ${text("Update docs and add setup notes", x + 28, y + 146, 30, 800, palette.ink)}
    ${text("Review, comment, and merge in Git.", x + 28, y + 188, 22, 550, palette.muted)}
  </g>`;
}

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
