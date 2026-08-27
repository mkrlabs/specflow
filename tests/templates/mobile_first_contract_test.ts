import { assert, assertEquals } from "@std/assert";
import { CORE_BUNDLE } from "../../src/templates_bundle.ts";

/**
 * The mobile-first contract (#576) — shape, wiring, and the two things the
 * contract forbids itself.
 *
 * Byte-identity with `plugin/` is NOT asserted here on purpose: it is already
 * decided by `SYNC_PAIRS` in `tests/plugin/plugin_sync_test.ts`, and a second
 * comparison would be a second decider of one rule.
 */

const CONTRACT = "mobile-first-contract";

function contractEntry() {
  const e = CORE_BUNDLE.find((x) => x.category === "skill" && x.name === CONTRACT);
  if (!e) {
    throw new Error(
      `${CONTRACT} is not in CORE_BUNDLE — an authored template ` +
        "that is not manifest-registered renders for nobody",
    );
  }
  return e;
}

Deno.test("the contract is registered, and it is the only place it exists", () => {
  // Presence in CORE_BUNDLE IS the registration proof: the bundle is generated
  // from templates/manifest.json, so an unregistered file cannot appear here.
  contractEntry();
  const sameName = CORE_BUNDLE.filter((x) => x.name === CONTRACT);
  assertEquals(sameName.length, 1, "one authored contract, not two");
});

Deno.test("the contract ships preloaded, not user-invocable", () => {
  const { content } = contractEntry();
  assert(/^user-invocable:\s*false\s*$/m.test(content), "user-invocable: false missing");
  assert(
    content.includes("Preloaded, not user-invocable."),
    "the marker sentence is what the description carries into every harness listing",
  );
});

/**
 * A closed set, and the right instrument for it. Constitution § XI's open set —
 * any unrelated project's name — is served by the contract carrying no examples
 * at all, not by this list. Scoped to the contract FILE: the constitution
 * template names frameworks as tuning guidance, deliberately, and this
 * assertion must not reach it.
 */
const FRAMEWORK_NAMES = [
  "tailwind",
  "bootstrap",
  "react",
  "vue.js",
  "svelte",
  "angular",
  "solidjs",
  "chakra",
  "material-ui",
  "shadcn",
  "bulma",
  "foundation css",
  "styled-components",
  "emotion",
  "sass",
  "less css",
  "flutter",
  "swiftui",
  "jetpack compose",
];

Deno.test("the contract names no framework", () => {
  const lower = contractEntry().content.toLowerCase();
  const hits = FRAMEWORK_NAMES.filter((n) => lower.includes(n));
  assertEquals(hits, [], `a framework named in the contract is a bug in the contract: ${hits}`);
});

/**
 * By NAMED TUNABLE, never by digit. A digit ban would forbid the WCAG citations
 * the rules take their authority from — 1.4.10 Reflow, 2.1 A/AA — and could
 * never go green. What must not appear is a VALUE for something the project
 * decides.
 */
const TUNABLE_SHAPES = [
  /\b\d+\s*px\b/i,
  /\b\d+\s*rem\b/i,
  /\b\d+\s*dp\b/i,
  /\b\d+\s*pt\b/i,
  /\b\d+\s*em\b/i,
  /\b\d{3,4}\s*(?:px|w)\b/i,
];

Deno.test("the contract declares no tunable value", () => {
  const { content } = contractEntry();
  const hits = TUNABLE_SHAPES.filter((re) => re.test(content)).map(String);
  assertEquals(
    hits,
    [],
    "a value here is a second decider competing with the project's own DESIGN.md",
  );
});

/**
 * Front-end vocabulary, used to DERIVE the candidate set rather than to
 * hand-list it. A positive membership list can only be wrong in one direction,
 * and the precedent's list proves it: it still carves out a phase doc deleted
 * two releases ago.
 *
 * `layout` and `component` are NOT in this vocabulary, and their absence is the
 * point. `layout` matched `product-owner` three times — on "Local Markdown
 * layout", "GitHub layout", "Specnaut Cloud layout", every one of them a
 * backlog storage layout. A word that means two things recruits false
 * candidates, and the cure for a false candidate is a tighter word, never an
 * exclusion that records a decision nobody actually took.
 */
const FE_VOCAB = /front-?end|\bUI\b|\bUX\b|markup|\bCSS\b|viewport|responsive/i;

/** Excluded on purpose, each with the reason. An empty reason is not an exclusion. */
const EXCLUSIONS = new Map<string, string>([
  [
    "accessibility-expert",
    "Excluded deliberately. Its scope is WCAG 2.1 A/AA, and the contract states " +
    "that target-size is NOT an accessibility criterion. Pointing this seat at it " +
    "would invite exactly the misattribution the contract forbids.",
  ],
  [
    "performance-expert",
    "Its two front-end mentions are about bundle size and render thrash, not about " +
    "how a layout adapts. Nothing it reviews is decided by this contract.",
  ],
]);

Deno.test("every UI-touching agent points at the contract, or is excused with a reason", () => {
  const candidates = CORE_BUNDLE
    .filter((e) => e.category === "agent" && FE_VOCAB.test(e.content))
    .map((e) => e.name);
  assert(candidates.length > 0, "the derivation matched nothing — it is broken, not clean");

  const unwired: string[] = [];
  for (const name of candidates) {
    if (EXCLUSIONS.get(name)?.trim()) continue;
    const { content } = CORE_BUNDLE.find((e) => e.category === "agent" && e.name === name)!;
    const skills = /^skills:\s*(.+)$/m.exec(content)?.[1] ?? "";
    if (!skills.split(",").map((s) => s.trim()).includes(CONTRACT)) unwired.push(name);
  }
  assertEquals(unwired, [], "UI-touching agents with no pointer and no written exclusion");
});

Deno.test("an exclusion names something that is actually a candidate", () => {
  const candidates = new Set(
    CORE_BUNDLE.filter((e) => e.category === "agent" && FE_VOCAB.test(e.content)).map((e) =>
      e.name
    ),
  );
  const stale = [...EXCLUSIONS.keys()].filter((n) => !candidates.has(n));
  assertEquals(stale, [], "an exclusion outliving its subject is how a carve-out becomes a fossil");
});

/** The rule set lives in ONE file. Every pointer references; none restates. */
const LOAD_BEARING = [
  "The narrow viewport is the base case",
  "Interactive targets meet a declared minimum touch size",
  "Input modality is not assumed",
];

Deno.test("no surface restates a rule — they point", () => {
  for (const sentence of LOAD_BEARING) {
    const where = CORE_BUNDLE.filter((e) => e.content.includes(sentence)).map((e) => e.name);
    assertEquals(
      where.length,
      1,
      `"${sentence}" appears in ${where.length} entries (${where}); it must live only in the contract`,
    );
  }
});
