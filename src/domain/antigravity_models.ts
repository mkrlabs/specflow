/**
 * Antigravity model mapping.
 *
 * Antigravity's `model:` frontmatter accepts exactly three values —
 * `inherit` (the default), `flash`, and `pro`. Specnaut agents declare a
 * capability tier in Claude's vocabulary, which was previously copied into
 * the emitted file verbatim: an agent shipped as `model: opus`, a value
 * Antigravity has no meaning for.
 *
 * The tier space is three wide and the target space is two, so the two
 * capable tiers collapse onto `pro` and the fast tier maps to `flash`. That
 * is a real loss of resolution, and it is the right loss: `pro` is what the
 * seats doing judgement work need, and inventing a middle where the harness
 * has none would only produce a value it rejects.
 *
 * **When Antigravity's model vocabulary changes, this file is the only place
 * to edit.**
 */

const TIER_TO_MODEL: Readonly<Record<string, string>> = {
  opus: "pro",
  sonnet: "pro",
  haiku: "flash",
};

/**
 * Resolves an agent's `model:` tier to an Antigravity model.
 *
 * Returns `null` for an absent, empty, `inherit`, or unrecognised tier, so
 * the emitted frontmatter omits the key and the agent inherits the session
 * model — which is Antigravity's own documented default.
 */
export function tierToAntigravityModel(tier: string | null): string | null {
  return TIER_TO_MODEL[tier?.trim().toLowerCase() ?? ""] ?? null;
}
