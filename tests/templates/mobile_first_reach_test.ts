import { assert, assertEquals } from "@std/assert";
import { CORE_BUNDLE, HARNESS_STATIC } from "../../src/templates_bundle.ts";
import { HARNESSES } from "../../src/cli/harnesses.ts";
import { extractBlock } from "../../src/domain/merge_block.ts";

/**
 * REACH, not shape (#576, FR-015).
 *
 * Every other assertion about this contract asks whether the templates have the
 * right shape — the file exists, is registered, is mirrored, is pointed at.
 * None of them can fail when the contract reaches no turn on a given harness.
 * A reviewer greps the rule set, gets one authored hit, sees the suite green,
 * and concludes the contract is live. It might not be.
 *
 * This file asks the other question: on harness X, is the contract reachable
 * from a surface that harness loads WITHOUT anyone invoking anything? That is
 * where the reported failure lives — a UI request in an ordinary turn, no
 * phase, no plan, no dispatched agent.
 *
 * There is no declared-uncovered escape hatch. Every harness must pass.
 */

const CONTRACT = "mobile-first-contract";
const UI_LABEL = "ui-defaults";

const OPTS = {
  backlogBackend: "local",
  versionScheme: "semver",
  specBackend: "local",
  specAutogen: false,
} as const;

Deno.test("every harness can reach the contract without invoking anything", () => {
  const unreached: string[] = [];

  for (const harness of HARNESSES) {
    const bundle = harness.mapBundle(CORE_BUNDLE, OPTS);
    const statics = HARNESS_STATIC[harness.key] ?? {};

    // Two kinds of always-on surface, and both count.
    //   1. The harness's own context file, where it has one — three of seven do.
    //   2. The project-root AGENTS.md `ui-defaults` fence, which every harness
    //      scaffolds and which `upgrade` grafts into EXISTING projects too,
    //      independently of skipIfExists. That second one is what makes this
    //      pass on the four harnesses with no context file of their own.
    const surfaces: Array<[string, string]> = [];
    for (const [dest, file] of Object.entries(statics)) {
      surfaces.push([`${harness.key}:${dest}`, file.content]);
    }
    const agents = bundle["AGENTS.md"];
    if (agents) {
      const fenced = extractBlock(agents.content, UI_LABEL, "html");
      // Read the FENCED body, not the whole file: a pointer sitting outside the
      // fence reaches new projects only, which is the hole this feature exists
      // to close. Asserting on the file would pass for the version that fails.
      if (fenced) surfaces.push([`${harness.key}:AGENTS.md#${UI_LABEL}`, fenced]);
    }

    if (!surfaces.some(([, content]) => content.includes(CONTRACT))) {
      unreached.push(harness.key);
    }
  }

  assertEquals(
    unreached,
    [],
    "these harnesses scaffold the contract but can never load it in an ordinary turn",
  );
});

Deno.test("the reach does not depend on the harnesses that have a context file", () => {
  // The three with their own always-on file would mask the other four. Remove
  // them from consideration and the assertion must still hold — otherwise this
  // suite is green on 3 of 7 and reporting 7.
  const WITH_CONTEXT_FILE = new Set(["claude", "codex", "cursor"]);
  const rest = HARNESSES.filter((h) => !WITH_CONTEXT_FILE.has(h.key));
  assert(rest.length > 0, "the split matched nothing — the harness keys moved");

  for (const harness of rest) {
    const agents = harness.mapBundle(CORE_BUNDLE, OPTS)["AGENTS.md"];
    assert(agents !== undefined, `${harness.key} does not scaffold AGENTS.md at all`);
    const fenced = extractBlock(agents.content, UI_LABEL, "html");
    assert(fenced !== null && fenced.length > 0, `${harness.key}: no ${UI_LABEL} block`);
    assert(
      fenced.includes(CONTRACT),
      `${harness.key} has no context file of its own, so the ${UI_LABEL} fence is its ONLY route`,
    );
  }
});
