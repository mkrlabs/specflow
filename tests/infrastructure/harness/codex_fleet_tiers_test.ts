import { assert, assertEquals } from "@std/assert";
import { parse as parseToml } from "@std/toml";
import { CodexHarness } from "../../../src/infrastructure/harness/codex_harness.ts";
import { CORE_BUNDLE } from "../../../src/templates_bundle.ts";

/**
 * The bundled fleet must reach Codex carrying the same budget distinction it
 * carries on Claude.
 *
 * This is the regression that already happened once, silently. The harness
 * derived `model_reasoning_effort` from the `model:` tier and never read
 * `effort:`. That produced a plausible spread only while the fleet was split
 * across Sonnet and Opus; the moment every agent moved to Opus, all fifteen
 * emitted `high` and the five `xhigh` seats lost their budget on Codex with
 * no error, no warning, and nothing in the emitted TOML to hint at it.
 */

function codexAgents(): Map<string, Record<string, unknown>> {
  const mapped = new CodexHarness().mapBundle(CORE_BUNDLE, {
    backlogBackend: "local",
    versionScheme: "semver",
    specBackend: "local",
  });
  const out = new Map<string, Record<string, unknown>>();
  for (const [path, file] of Object.entries(mapped)) {
    const m = path.match(/^\.codex\/agents\/(.+)\.toml$/);
    if (m) out.set(m[1], parseToml(file.content) as Record<string, unknown>);
  }
  return out;
}

Deno.test("every bundled agent reaches Codex with both a model and an effort", () => {
  const agents = codexAgents();
  assert(agents.size > 0, "no Codex agent TOML emitted");
  const incomplete = [...agents.entries()]
    .filter(([, t]) => !t.model || !t.model_reasoning_effort)
    .map(([n]) => n);
  assertEquals(
    incomplete,
    [],
    `these agents omit a key and would silently inherit the session default: ${
      incomplete.join(", ")
    }`,
  );
});

Deno.test("the fleet does not collapse to a single reasoning effort on Codex", () => {
  const efforts = new Set(
    [...codexAgents().values()].map((t) => t.model_reasoning_effort),
  );
  assert(
    efforts.size > 1,
    `every bundled agent emitted the same effort (${[...efforts]}) — the ` +
      `budget distinction was lost in translation, which is exactly the bug ` +
      `deriving effort from the model tier used to cause`,
  );
});

Deno.test("the xhigh seats keep xhigh on Codex", () => {
  const agents = codexAgents();
  for (
    const name of ["developer", "qa-tester", "devops-sre", "architect-expert", "security-expert"]
  ) {
    const t = agents.get(name);
    assert(t, `${name} missing from the Codex bundle`);
    assertEquals(
      t.model_reasoning_effort,
      "xhigh",
      `${name} is xhigh on Claude but ${t.model_reasoning_effort} on Codex`,
    );
  }
});

Deno.test("every emitted Codex model id is one of the three GPT-5.6 tiers", () => {
  const known = new Set(["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"]);
  const unknown = [...codexAgents().entries()]
    .filter(([, t]) => !known.has(String(t.model)))
    .map(([n, t]) => `${n}=${t.model}`);
  assertEquals(unknown, [], `unknown Codex model id emitted: ${unknown.join(", ")}`);
});
