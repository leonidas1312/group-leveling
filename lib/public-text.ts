export function sanitizeVisibleRuntimeText(value?: string) {
  return String(value ?? "")
    .replace(/\[([^\]\n]+)\]\((\/[^)]*\/\.solo-leveling\/workflows\/[^)]*\/repo\/([^)]*))\)/g, (_match, label, _path, repoPath) => `\`${repoPath || label}\``)
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1 ($2)")
    .replace(/\/[^\s`'")\]]*\/\.solo-leveling\/workflows\/[^\s`'")\]]*\/repo\/([^\s`'")\]]+)/g, "$1")
    .replace(/\/[^\s`'")\]]*\/\.solo-leveling\/workflows\/[^\s`'")\]]+/g, "[host runtime]")
    .replace(/\/[^\s`'")\]]*\/\.codex-users\/[^\s`'")\]]+/g, "[codex profile]");
}
