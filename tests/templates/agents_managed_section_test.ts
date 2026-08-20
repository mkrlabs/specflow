import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { CORE_BUNDLE } from "../../src/templates_bundle.ts";
import type { CoreEntry } from "../../src/domain/core_bundle.ts";
import { HARNESSES } from "../../src/cli/harnesses.ts";
import { endFence, extractBlock, startFence } from "../../src/domain/merge_block.ts";

/**
 * #466 — the packaging half of "deliver the two-stop section on upgrade".
 *
 * `upgrade` can only graft in a section the bundle actually fences. If a later
 * edit reflows `templates/core/root/AGENTS.md` and drops a marker — or moves the
 * rule outside them — the mechanism keeps running and delivers nothing. That is
 * the shape of failure worth guarding: not "did it crash", but "is the thing it
 * claims to carry still inside the thing it carries".
 */

const LABEL = "chain-stops";

function rootAgents(): CoreEntry {
  const e = CORE_BUNDLE.find(
    (x) => x.category === "project-root" && x.suffix === "AGENTS.md",
  );
  if (!e) throw new Error("missing root AGENTS.md entry");
  return e;
}

Deno.test("AGENTS.md stays user-owned AND declares its one managed section", () => {
  const entry = rootAgents();
  // Both halves matter: skipIfExists is why upgrade never rewrites the file,
  // managedSection is why the rule still reaches it.
  assertEquals(entry.skipIfExists, true);
  assertEquals(entry.managedSection, LABEL);
});

Deno.test("the two-stop rule is inside the fences, not merely in the file", () => {
  const { content } = rootAgents();
  const start = content.indexOf(startFence(LABEL, "html"));
  const end = content.indexOf(endFence(LABEL, "html"));
  assert(start !== -1, "start fence missing");
  assert(end > start, "end fence missing or before the start fence");

  const body = extractBlock(content, LABEL, "html");
  assert(body !== null && body.length > 0, "the fenced region must not be empty");
  // The load-bearing sentences, checked against the BODY — a file-level
  // assertion would still pass with the fences wrapped around nothing.
  assertStringIncludes(body!, "## The Specnaut chain has exactly two stops");
  assertStringIncludes(body!, "no third");
  assertStringIncludes(body!, "The end of `plan`");
  assertStringIncludes(body!, "The review verdict");
  assertStringIncludes(body!, "invoking the next phase yourself, in the same turn");
});

Deno.test("the fence is a markdown comment, so it renders as nothing", () => {
  const { content } = rootAgents();
  // A `#` fence would be an H1 outranking every section the user wrote.
  assert(!content.includes(`# --- Specnaut: ${LABEL} ---`));
  assertStringIncludes(content, `<!-- --- Specnaut: ${LABEL} --- -->`);
});

Deno.test("every harness carries the declaration through to the bundle", () => {
  for (const harness of HARNESSES) {
    const bundle = harness.mapBundle(CORE_BUNDLE, {
      backlogBackend: "local",
      versionScheme: "semver",
      specBackend: "local",
      specAutogen: false,
    });
    const file = bundle["AGENTS.md"];
    assert(file !== undefined, `${harness.key} does not scaffold AGENTS.md`);
    assertEquals(
      file.managedSection,
      LABEL,
      `${harness.key} drops managedSection — its users never get the section on upgrade`,
    );
    assertEquals(file.skipIfExists, true, `${harness.key} drops skipIfExists`);
  }
});
