/**
 * Codex model + reasoning-effort mapping.
 *
 * Specnaut agents declare two frontmatter fields: `model:` — a *capability
 * tier* borrowed from Claude's names — and `effort:` — a reasoning budget.
 * Codex subagent TOML accepts the same two axes (`model`, and
 * `model_reasoning_effort`), so both map across rather than one standing in
 * for the other.
 *
 * They used to collapse: the harness derived `model_reasoning_effort` from
 * the *model* tier and never read `effort:` at all. That worked only while
 * the fleet happened to spread across Sonnet and Opus. When every bundled
 * agent moved to Opus the mapping went degenerate — all fifteen emitted
 * `high`, and the five `xhigh` seats lost their budget on Codex with nothing
 * to report it.
 *
 * **When OpenAI renames these models, this file is the only place to edit.**
 * That is why the ids live here and not inline in the harness.
 */

/** Capability tier → Codex model id. */
const TIER_TO_MODEL: Readonly<Record<string, string>> = {
  opus: "gpt-5.6-sol", // deepest: complex, open-ended, high-value work
  sonnet: "gpt-5.6-terra", // the everyday all-rounder
  haiku: "gpt-5.6-luna", // clear, repeatable, high-volume tasks
};

/**
 * Reasoning efforts Codex accepts. Specnaut's own vocabulary
 * — {low, medium, high, xhigh} — is a strict subset, so the mapping is
 * identity; `ultra` and `max` are Codex-only and never emitted, because a
 * subagent is already the unit `ultra` fans out over.
 */
const CODEX_EFFORTS: ReadonlySet<string> = new Set([
  "low",
  "medium",
  "high",
  "xhigh",
]);

/**
 * Resolves an agent's `model:` tier to a Codex model id.
 *
 * Returns `null` for an absent, empty, `inherit`, or unrecognised tier, so
 * the emitted TOML omits the key and the subagent inherits the parent Codex
 * session's model. Guessing would be worse than inheriting: a wrong pin fails
 * at dispatch, on the user's machine, against a model list we cannot see.
 */
export function tierToCodexModel(tier: string | null): string | null {
  return TIER_TO_MODEL[tier?.trim().toLowerCase() ?? ""] ?? null;
}

/**
 * Resolves an agent's `effort:` to a Codex `model_reasoning_effort`.
 *
 * Identity over the shared vocabulary; `null` for anything else, on the same
 * inherit-rather-than-guess reasoning as above.
 */
export function effortToCodexReasoning(effort: string | null): string | null {
  const v = effort?.trim().toLowerCase() ?? "";
  return CODEX_EFFORTS.has(v) ? v : null;
}
