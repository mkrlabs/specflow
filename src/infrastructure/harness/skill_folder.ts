import type { CoreEntry } from "../../domain/core_bundle.ts";
import { splitFrontmatter } from "./frontmatter.ts";

/**
 * Returns the folder name for a skill-emitting core entry, used by harnesses that
 * render commands/agents/skills as skill folders (Cursor, Codex).
 */
export function skillFolderName(entry: CoreEntry): string {
  switch (entry.category) {
    case "skill":
    case "backlog-skill":
      // Skill names that already begin with "specnaut" are emitted as-is
      // (the router itself is "specnaut"; the auto-invoke alias is
      // "specnaut-review"). Other skills (`board`, …) get the namespacing
      // prefix to avoid clashes inside a global skills registry.
      return entry.name === "specnaut" || entry.name.startsWith("specnaut-")
        ? entry.name
        : `specnaut-${entry.name}`;
    case "agent":
      return `specnaut-agent-${entry.name}`;
    default:
      throw new Error(
        `skillFolderName not applicable for category: ${entry.category}`,
      );
  }
}

/**
 * Injects `name:` and `description:` into a SKILL.md's frontmatter when missing.
 * Preserves any existing values. Used by every harness whose skill registry
 * requires these fields: Claude, Cursor, Codex, Antigravity and OpenCode.
 *
 * The fallback description is JSON-quoted because it contains `": "`, which a
 * plain YAML scalar may not. Emitting it bare produced frontmatter that every
 * parser rejects — and a registry that warns-and-skips on malformed frontmatter
 * drops the skill silently, so the guard failed more quietly than the condition
 * it guards against.
 */
function fallbackDescription(skillName: string): string {
  return JSON.stringify(`Specnaut skill: ${skillName}`);
}

export function ensureSkillFrontmatter(content: string, skillName: string): string {
  const split = splitFrontmatter(content);
  if (!split) {
    return `---\nname: ${skillName}\ndescription: ${
      fallbackDescription(skillName)
    }\n---\n\n${content}`;
  }
  const fmBody = split.fmBody;
  const rest = split.rest;
  const hasName = /^name:\s/m.test(fmBody);
  const hasDescription = /^description:\s/m.test(fmBody);
  let newFm = fmBody;
  if (!hasName) newFm = `name: ${skillName}\n${newFm}`;
  if (!hasDescription) {
    newFm = `${newFm}\ndescription: ${fallbackDescription(skillName)}`;
  }
  return `---\n${newFm}\n---\n${rest}`;
}
