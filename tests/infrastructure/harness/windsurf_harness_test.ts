import { assert, assertEquals } from "@std/assert";
import { WindsurfHarness } from "../../../src/infrastructure/harness/windsurf_harness.ts";
import type { CoreBundle } from "../../../src/domain/core_bundle.ts";
import { CORE_BUNDLE } from "../../../src/templates_bundle.ts";
import { everyBundleOption } from "../../../src/application/ports.ts";
import {
  WINDSURF_WORKFLOW_MAX_CHARS,
  workflowLength,
} from "../../../src/infrastructure/harness/windsurf_harness.ts";

const SAMPLE: CoreBundle = [
  {
    category: "skill",
    name: "specnaut",
    suffix: null,
    content: "---\nname: specnaut\ndescription: Specnaut router\n---\n\n# Body\n",
    executable: false,
  },
  {
    category: "phase",
    name: "specify",
    suffix: "specify.md",
    content: "# Specify phase\n",
    executable: false,
  },
  {
    category: "skill",
    name: "specnaut-auto",
    suffix: null,
    content: "---\ndescription: Auto-chain dispatcher\n---\n\n# body\n",
    executable: false,
  },
  {
    category: "agent",
    name: "product-owner",
    suffix: null,
    content: "---\nname: product-owner\ndescription: Product Owner role\n---\n\nYou are the PO.\n",
    executable: false,
  },
  {
    category: "spec-root",
    name: "specify",
    suffix: "memory/constitution.md",
    content: "# const\n",
    executable: false,
  },
  {
    category: "project-root",
    name: "root",
    suffix: "AGENTS.md",
    content: "# AGENTS\n",
    executable: false,
  },
];

Deno.test("WindsurfHarness.key and displayName", () => {
  const h = new WindsurfHarness();
  assertEquals(h.key, "windsurf");
  assertEquals(h.displayName, "Windsurf");
});

Deno.test("WindsurfHarness maps router skill to .windsurf/workflows/specnaut.md", () => {
  const h = new WindsurfHarness();
  const mapped = h.mapBundle(SAMPLE, {
    backlogBackend: "local",
    versionScheme: "semver",
    specBackend: "local",
  });
  assert(".windsurf/workflows/specnaut.md" in mapped);
});

Deno.test("WindsurfHarness maps phase docs to sibling specnaut-<phase>.md files", () => {
  const h = new WindsurfHarness();
  const mapped = h.mapBundle(SAMPLE, {
    backlogBackend: "local",
    versionScheme: "semver",
    specBackend: "local",
  });
  assert(".windsurf/workflows/specnaut-specify.md" in mapped);
});

Deno.test("WindsurfHarness maps skill to .windsurf/workflows/specnaut-<name>.md", () => {
  const h = new WindsurfHarness();
  const mapped = h.mapBundle(SAMPLE, {
    backlogBackend: "local",
    versionScheme: "semver",
    specBackend: "local",
  });
  assert(".windsurf/workflows/specnaut-auto.md" in mapped);
});

Deno.test("WindsurfHarness maps agents to .windsurf/workflows/specnaut-agent-<name>.md", () => {
  const h = new WindsurfHarness();
  const mapped = h.mapBundle(SAMPLE, {
    backlogBackend: "local",
    versionScheme: "semver",
    specBackend: "local",
  });
  assert(".windsurf/workflows/specnaut-agent-product-owner.md" in mapped);
});

Deno.test("WindsurfHarness maps spec-root to .specnaut/<suffix> and project-root to <suffix>", () => {
  const h = new WindsurfHarness();
  const mapped = h.mapBundle(SAMPLE, {
    backlogBackend: "local",
    versionScheme: "semver",
    specBackend: "local",
  });
  assert(".specnaut/memory/constitution.md" in mapped);
  assert("AGENTS.md" in mapped);
});

Deno.test("WindsurfHarness emits content byte-identical to entry.content (no frontmatter rewrite)", () => {
  const h = new WindsurfHarness();
  const mapped = h.mapBundle(SAMPLE, {
    backlogBackend: "local",
    versionScheme: "semver",
    specBackend: "local",
  });
  const router = mapped[".windsurf/workflows/specnaut.md"];
  assertEquals(router.content, SAMPLE[0].content);
  const phase = mapped[".windsurf/workflows/specnaut-specify.md"];
  assertEquals(phase.content, SAMPLE[1].content);
});

Deno.test("WindsurfHarness emits no Claude/Cursor/Codex artefacts", () => {
  const h = new WindsurfHarness();
  const mapped = h.mapBundle(SAMPLE, {
    backlogBackend: "local",
    versionScheme: "semver",
    specBackend: "local",
  });
  const keys = Object.keys(mapped);
  assert(!keys.some((k) => k.startsWith(".claude/")), "no .claude/");
  assert(!keys.some((k) => k.startsWith(".cursor/")), "no .cursor/");
  assert(!keys.some((k) => k.startsWith(".agents/")), "no .agents/");
  assert(!keys.some((k) => k.startsWith(".codex/")), "no .codex/");
  assert(!keys.includes("CLAUDE.md"), "no CLAUDE.md");
});

Deno.test("WindsurfHarness emits no workflow exceeding the Cascade cap", () => {
  // #539 settled the UNIT: characters, the unit the vendor's limit uses.
  // #562 settled the SET. This loop used to spell its own axes — backlog
  // backend and version scheme — and pin `specBackend: "local"`. It never
  // mentioned `specAutogen` at all, because that field is optional and a
  // caller who omits it compiles. So it measured 16 of 32 combinations and
  // reported itself green while `specnaut-board.md` emitted at 12,539
  // characters, 539 past the cap, on github + cloud + autogen.
  //
  // A loop spells the axes it happens to remember. `everyBundleOption()` is
  // derived from `BundleOptions` itself, so it cannot forget one: a new field
  // fails to compile rather than silently narrowing what this measures.
  //
  // Reporting the three measures on failure is deliberate: the gap between
  // them is what made the pre-#539 reading ambiguous.
  const h = new WindsurfHarness();
  for (const opts of everyBundleOption()) {
    const mapped = h.mapBundle(CORE_BUNDLE, opts);
    for (const [path, file] of Object.entries(mapped)) {
      if (!path.startsWith(".windsurf/workflows/")) continue;
      const chars = workflowLength(file.content);
      assert(
        chars <= WINDSURF_WORKFLOW_MAX_CHARS,
        `${path} exceeds ${WINDSURF_WORKFLOW_MAX_CHARS} characters: ${chars} ` +
          `(${new TextEncoder().encode(file.content).length} bytes, ` +
          `${file.content.length} UTF-16 units) on ` +
          `backlog=${opts.backlogBackend} scheme=${opts.versionScheme} ` +
          `spec=${opts.specBackend} autogen=${opts.specAutogen}`,
      );
    }
  }
});

Deno.test("workflowLength counts characters, not UTF-16 code units", () => {
  // The distinction only shows on astral-plane characters, which is exactly
  // when a length assertion quietly starts measuring something else.
  assertEquals(workflowLength("abc"), 3);
  assertEquals("👋".length, 2);
  assertEquals(workflowLength("👋"), 1);
  // A BMP non-ASCII character costs one character and three bytes — the axis
  // that put four workflows over the limit when read as bytes.
  assertEquals(workflowLength("—"), 1);
  assertEquals(new TextEncoder().encode("—").length, 3);
});
