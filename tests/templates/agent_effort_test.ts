import { assert, assertEquals } from "@std/assert";
import { CORE_BUNDLE } from "../../src/templates_bundle.ts";
import type { CoreEntry } from "../../src/domain/core_bundle.ts";

/**
 * Locks the per-agent `model` + `effort` tuning rubric.
 *
 * Every bundled agent must carry exactly one `effort:` ∈ {low, medium, high,
 * xhigh}, no Sonnet-pinned agent may carry `xhigh` (the model-compatibility
 * invariant — `xhigh` is Opus-only), every bundled agent is pinned to Opus,
 * and each agent's value must match the authoritative assignment below.
 *
 * The authority is `templates/core/agents/README.md`, not the frozen
 * `016-agent-effort-rubric` spec contract: spec dirs record a decision as it
 * was taken, and this rubric has since been retuned (all-Opus, `high` floor).
 */

const VALID_EFFORTS = ["low", "medium", "high", "xhigh"] as const;
type Effort = (typeof VALID_EFFORTS)[number];

/**
 * Authoritative agent → effort assignment, mirroring the tier table in
 * `templates/core/agents/README.md`. 10 high · 5 xhigh = 15.
 */
const EFFORT_MAP: Record<string, Effort> = {
  "review-coordinator": "high",
  "workflow-manager": "high",
  "accessibility-expert": "high",
  "dependency-expert": "high",
  "performance-expert": "high",
  "code-reviewer": "high",
  "test-reviewer": "high",
  "specnaut-guide": "high",
  "product-owner": "high",
  "ui-ux-designer": "high",
  "architect-expert": "xhigh",
  "security-expert": "xhigh",
  "developer": "xhigh",
  "qa-tester": "xhigh",
  "devops-sre": "xhigh",
};

function agentEntries(): CoreEntry[] {
  return CORE_BUNDLE.filter((e) => e.category === "agent");
}

/** Extracts the leading YAML frontmatter block from a bundled markdown file. */
function frontmatter(content: string): string {
  const m = content.match(/^---\n([\s\S]*?)\n---/);
  assert(m, "expected a leading YAML frontmatter block");
  return m[1];
}

/** Reads a single scalar frontmatter field (e.g. `effort:` / `model:`). */
function scalarField(frontmatterBody: string, field: string): string | undefined {
  const line = frontmatterBody
    .split("\n")
    .find((l) => new RegExp(`^${field}:\\s`).test(l));
  return line?.replace(new RegExp(`^${field}:\\s*`), "").trim();
}

// SC-001: every bundled agent has exactly one valid `effort:`.
for (const entry of agentEntries()) {
  Deno.test(`agent "${entry.name}" declares exactly one valid effort`, () => {
    const fm = frontmatter(entry.content);
    const matches = fm.split("\n").filter((l) => /^effort:\s/.test(l));
    assertEquals(
      matches.length,
      1,
      `agent "${entry.name}" must declare exactly one \`effort:\` line`,
    );
    const value = scalarField(fm, "effort");
    assert(
      value !== undefined && (VALID_EFFORTS as readonly string[]).includes(value),
      `agent "${entry.name}" effort "${value}" not in {${VALID_EFFORTS.join(", ")}}`,
    );
  });
}

// SC-002: no Sonnet-pinned agent carries `xhigh` (xhigh is Opus-only).
for (const entry of agentEntries()) {
  Deno.test(`agent "${entry.name}" respects xhigh⇒Opus`, () => {
    const fm = frontmatter(entry.content);
    const effort = scalarField(fm, "effort");
    const model = scalarField(fm, "model");
    if (effort === "xhigh") {
      assertEquals(
        model,
        "opus",
        `agent "${entry.name}" has effort: xhigh but model: ${model} — xhigh is Opus-only`,
      );
    }
  });
}

// The bundled value matches the authoritative README.md assignment.
for (const [name, expected] of Object.entries(EFFORT_MAP)) {
  Deno.test(`agent "${name}" effort matches the README rubric (${expected})`, () => {
    const entry = agentEntries().find((e) => e.name === name);
    assert(entry, `agent "${name}" missing from CORE_BUNDLE`);
    const value = scalarField(frontmatter(entry.content), "effort");
    assertEquals(value, expected, `agent "${name}" effort drifted from the contract`);
  });
}

// The contract covers exactly the bundled fleet — no agent unclassified,
// no stale entry in the map (guards against a future agent added without an
// effort assignment, per the spec's edge case).
Deno.test("the effort rubric covers exactly the bundled agent fleet", () => {
  const bundled = agentEntries().map((e) => e.name).sort();
  const mapped = Object.keys(EFFORT_MAP).sort();
  assertEquals(bundled, mapped);
});

// Every bundled agent is pinned to Opus. This is what makes `xhigh` available
// fleet-wide, and it is the invariant a future "pin this one to Sonnet to save
// tokens" change must trip over — an under-provisioned review lens fails by
// returning fewer findings, which is indistinguishable from clean code.
for (const entry of agentEntries()) {
  Deno.test(`agent "${entry.name}" is pinned to Opus`, () => {
    const model = scalarField(frontmatter(entry.content), "model");
    assertEquals(
      model,
      "opus",
      `agent "${entry.name}" is model: ${model} — every bundled agent must be Opus`,
    );
  });
}
