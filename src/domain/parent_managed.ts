/**
 * Pure domain predicates for parent-managed detection.
 *
 * A *parent-managed* target is a sub-repo nested inside a providing Specnaut
 * workspace (an ancestor that owns the centralised skills/agents and declares
 * the target as a workspace member). In that state the toolkit (`.specnaut/`)
 * is still provisioned, but the agentic files (`.claude/skills|agents|commands`)
 * are inherited from the parent rather than written locally — any local copy is
 * the drift the centralised workspace deliberately eliminated.
 *
 * These functions are pure: all filesystem facts are passed in as arguments so
 * the domain layer never touches `Deno.*`.
 */

/**
 * Final detection decision for one target.
 *
 * The standalone override always wins over a positive detection (FR-008): a
 * user must be able to opt out of a coincidental directory layout without
 * surprise. Otherwise the target is parent-managed iff a providing ancestor
 * was found.
 *
 * @param providingAncestor canonical path of the first providing ancestor, or
 *   `null` when none exists.
 * @param standaloneOverride whether a `standalone.yml` marker forces the
 *   full standalone provisioning path.
 */
export function isParentManaged(
  providingAncestor: string | null,
  standaloneOverride: boolean,
): boolean {
  if (standaloneOverride) return false;
  return providingAncestor !== null;
}

/**
 * Whether a harness-mapped destination path is an *agentic* file — the set
 * suppressed for a parent-managed target.
 *
 * Operates on the already-harness-mapped destination string (not `CoreCategory`)
 * because the destination is the stable, harness-resolved truth: the same core
 * category maps to different paths under different harnesses. The predicate
 * never depends on repo identity (FR-010/FR-011).
 *
 * The prefix set is **claude-harness-only by design for this feature**: the
 * whole centralisation effort that motivates parent-managed detection is scoped
 * to `.claude/` (skills/agents/commands inherited from the providing
 * workspace). It does NOT match equivalent paths under other harnesses
 * (`.cursor/`, `.codex/`, `.opencode/`, …) — those are out of scope here and a
 * future reader should not assume they are suppressed. Within `.claude/`,
 * notably `.claude/settings.json`, `.claude/CLAUDE.md`, `AGENTS.md`,
 * `.gitignore`, and every `.specnaut/**` path are NOT agentic and are always
 * provisioned.
 */
export function isAgenticPath(dest: string): boolean {
  return dest.startsWith(".claude/skills/") ||
    dest.startsWith(".claude/agents/") ||
    dest.startsWith(".claude/commands/");
}

/**
 * Marker a child writes to declare that its enclosing Specnaut workspace
 * manages its agentic files.
 *
 * Detection originally had exactly one positive signal — membership of the
 * parent's `deno.json` `workspace[]` — which quietly made "is a Deno workspace
 * member" the definition of "inherits agentic files from the parent". A
 * sub-repo on a different toolchain, kept out of that array precisely because
 * including it breaks its own build, had no way to say so: there was a negative
 * opt-out marker and no positive opt-in (#476).
 *
 * This is the missing counterpart to `standalone.yml`, in the same place and
 * with the same shape. It does NOT bypass the ancestor check — a providing
 * ancestor must still exist, or suppressing `.claude/` would leave the child
 * with no agentic files at all and nothing providing them.
 */
export const PARENT_MANAGED_MARKER = "parent-managed.yml";

/**
 * Prunes agentic rows from a lock's entry map for a parent-managed target.
 *
 * Suppressing future writes is not enough. The metadata-only correction path
 * rewrites `entries` verbatim, so rows recorded before the flip survive it —
 * and the resurrection simply moves from "planned adds" to phantom rows that
 * describe files the workspace deliberately does not own.
 */
export function pruneAgenticEntries<T>(
  entries: ReadonlyMap<string, T>,
): Map<string, T> {
  return new Map([...entries].filter(([dest]) => !isAgenticPath(dest)));
}
