import { assertEquals } from "@std/assert";
import { diagnosePreserveConfig, parsePreserveConfig } from "../../src/domain/preserve_config.ts";

/**
 * A `preserve.yml` that declares nothing used to be indistinguishable from
 * having no manifest at all: same empty config, same silence. A maintainer
 * reads that silence as protection, and the files they believed were held back
 * are refreshed on the next upgrade.
 *
 * These assert on the *reason*, not on emptiness — an emptiness assertion
 * passes for all three failure shapes at once, which is exactly the conflation
 * that hid the defect.
 */

Deno.test("diagnose: a bare top-level list is missing-key, not a valid manifest", () => {
  // The shape a reader reaches for first, and the one that cost a full
  // misdiagnosis: it looks like a list of preserved paths.
  assertEquals(diagnosePreserveConfig("- a.md\n- b.md\n").kind, "missing-key");
});

Deno.test("diagnose: the wrong key name is missing-key", () => {
  // `preserve:` rather than `preserved:` — one character.
  assertEquals(diagnosePreserveConfig("preserve:\n  - a.md\n").kind, "missing-key");
});

Deno.test("diagnose: unparseable YAML is reported as such", () => {
  assertEquals(diagnosePreserveConfig("preserved: [\n  unclosed\n").kind, "unparseable");
});

Deno.test("diagnose: the right key with no usable entries is its own case", () => {
  assertEquals(diagnosePreserveConfig("preserved: []\n").kind, "no-usable-entries");
  assertEquals(diagnosePreserveConfig("preserved:\n  - 42\n  - true\n").kind, "no-usable-entries");
  // Traversal entries are dropped for containment; dropping all of them leaves
  // the same "declared something, protected nothing" state.
  assertEquals(diagnosePreserveConfig("preserved:\n  - ../escape.md\n").kind, "no-usable-entries");
});

Deno.test("diagnose: a correct manifest reports ok and its paths", () => {
  const d = diagnosePreserveConfig("preserved:\n  - a.md\n  - dir/b.md\n");
  assertEquals(d.kind, "ok");
  if (d.kind === "ok") assertEquals([...d.preserved], ["a.md", "dir/b.md"]);
});

Deno.test("the parser is derived from the diagnosis, so they cannot disagree", () => {
  // The failure this guards: a second implementation of the same rules that
  // drifts, leaving the warning and the behaviour describing different files.
  for (
    const yaml of [
      "- a.md\n",
      "preserve:\n  - a.md\n",
      "preserved: [\n",
      "preserved: []\n",
      "preserved:\n  - a.md\n",
      "preserved:\n  - ../escape.md\n  - kept.md\n",
    ]
  ) {
    const d = diagnosePreserveConfig(yaml);
    const parsed = parsePreserveConfig(yaml);
    assertEquals(
      parsed.preserved,
      d.kind === "ok" ? [...d.preserved] : [],
      `parse and diagnose disagree for ${JSON.stringify(yaml)}`,
    );
  }
});
