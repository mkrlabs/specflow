import { assert, assertEquals } from "@std/assert";
import { CORE_BUNDLE, HARNESS_STATIC } from "../../src/templates_bundle.ts";

/**
 * The mobile-first contract (#576) — shape, wiring, and the two things the
 * contract forbids itself.
 *
 * Byte-identity with `plugin/` is NOT asserted here on purpose: it is already
 * decided by `SYNC_PAIRS` in `tests/plugin/plugin_sync_test.ts`, and a second
 * comparison would be a second decider of one rule.
 */

const CONTRACT = "mobile-first-contract";

/**
 * Markdown is hard-wrapped, so a prose assertion keyed on a sentence fails on
 * a line break that changed nothing. Collapse whitespace before matching —
 * otherwise the assertion is about the rendering, not the content, and it goes
 * red the next time someone runs a formatter.
 */
function flat(s: string): string {
  return s.replace(/\s+/g, " ");
}

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
const TUNABLE_SHAPES: ReadonlyArray<[string, RegExp]> = [
  ["absolute unit", /\b\d+(?:\.\d+)?\s*(?:px|rem|em|pt|dp|sp)\b/i],
  // Round 2: "at least 44 CSS pixels" slipped every rule — `px` sits inside
  // `pixels`, `\s*` cannot span `CSS`, and 44 is under the 3-digit floor.
  // WCAG 2.5.5's own wording is "44 by 44 CSS pixels", so this is the literal
  // an author is most likely to reach for.
  ["two-digit size", /\b\d{2}\s+(?:\w+\s+)?(?:css\s+)?(?:pixels?|points?|dp|sp)\b/i],
  ["relative unit", /\b\d+(?:\.\d+)?\s*(?:vw|vh|vmin|vmax|ch|ex|%)(?![\w-])/i],
  ["spelled-out unit", /\b\d+\s*(?:pixels?|points?|ems?|rems?)\b/i],
  // A bare integer assigned to a token IS a value: `--touch-min: 44`.
  ["token assignment", /--[a-z0-9-]+\s*[:=]\s*\d/i],
  // A bare 3-4 digit integer is a breakpoint in every design system alive.
  // Applied AFTER citations are stripped (see `withoutCitations`) rather than
  // fenced off by lookaround: the first attempt excluded a FOLLOWING dot to
  // spare "1.4.10", which also spared "768." at the end of a sentence.
  ["bare breakpoint", /(?<![\d.-])\d{3,4}(?![\d])/],
];

/** WCAG criteria and version numbers are citations, not values. Remove them
 * before looking for bare integers, so the two questions never fight. */
function withoutCitations(s: string): string {
  // Only a dotted number NOT followed by a unit is a citation. Round 2: the
  // stripper rewrote "37.5" in "37.5 em" to § and so created a miss of its own
  // — a cleaner that removes the evidence.
  return s
    .replace(/\b\d+(?:\.\d+)+\b(?!\s*(?:px|rem|em|pt|dp|sp|vw|vh|%))/gi, "§")
    .replace(/\bWCAG\s+[\d.]+/gi, "WCAG");
}

Deno.test("the contract declares no tunable value", () => {
  const content = withoutCitations(contractEntry().content);
  const hits = TUNABLE_SHAPES
    .filter(([, re]) => re.test(content))
    .map(([name, re]) => `${name}: ${re.exec(content)?.[0]}`);
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

/**
 * Agents that carry the pointer WITHOUT matching the derivation. Recorded so
 * the pointer is a decision on the record rather than a silent extra: the
 * derivation reads content, and this seat's only UI vocabulary is the pointer
 * line itself, so it can never match by construction.
 */
const POINTED_BY_DECISION = new Map<string, string>([
  [
    "code-reviewer",
    "Reviews whatever the developer wrote, UI included — the seat where a " +
    "fixed-width layout is caught after the fact. Its own text carries no UI " +
    "vocabulary, so the content derivation cannot reach it.",
  ],
]);

Deno.test("an agent pointed outside the derivation says why", () => {
  const candidates = new Set(
    CORE_BUNDLE.filter((e) => e.category === "agent" && FE_VOCAB.test(e.content)).map((e) =>
      e.name
    ),
  );
  const undocumented = CORE_BUNDLE
    .filter((e) => e.category === "agent" && !candidates.has(e.name))
    .filter((e) => (/^skills:\s*(.+)$/m.exec(e.content)?.[1] ?? "").includes(CONTRACT))
    .map((e) => e.name)
    .filter((n) => !POINTED_BY_DECISION.get(n)?.trim());
  assertEquals(undocumented, [], "pointed at the contract with no written reason");
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

/**
 * The rule set lives in ONE file, and every rule is swept — not three of eight
 * sampled by hand. Round 2 found rule 5 restated near-verbatim in
 * `ui-ux-designer.md` two lines above that file's own "never restate it here",
 * on a surface the sweep already read: the surface was covered, the instrument
 * was too weak.
 *
 * Derived from the contract's own numbered list, so a ninth rule is swept on
 * the day it is written rather than the day someone remembers to add it here.
 */
function loadBearing(content: string): string[] {
  // Bounded at the NEXT heading. Unbounded, it ran on into the numbered list
  // under "Where the values live" and returned ten rules for eight.
  const from = content.indexOf("## What mobile-first obliges");
  const next = content.indexOf("\n## ", from + 1);
  const section = content.slice(from, next === -1 ? undefined : next);
  const out: string[] = [];
  for (const m of section.matchAll(/^\d+\.\s+\*\*(.+?)\*\*/gms)) {
    out.push(m[1].replace(/\s+/g, " ").trim());
  }
  return out;
}

Deno.test("no surface restates a rule — they point", () => {
  // `length === 1` was not enough: it stays green when a rule MOVES out of the
  // contract into an agent, since the count is still one. Assert the location.
  // And sweep HARNESS_STATIC as well as CORE_BUNDLE — a rule pasted into an
  // always-on context file is the restatement with the widest blast radius,
  // and the count-only version was blind to that whole tree.
  const statics = Object.entries(HARNESS_STATIC).flatMap(([h, files]) =>
    Object.entries(files).map(([dest, f]) => [`${h}:${dest}`, f.content] as const)
  );
  const rules = loadBearing(contractEntry().content);
  assertEquals(
    rules.length,
    8,
    "the derivation does not match the contract's rule count — it is broken, not clean " +
      `(got ${rules.length}: ${rules.map((r) => r.slice(0, 24)).join(" / ")})`,
  );
  for (const sentence of rules) {
    // Whitespace-normalised on BOTH sides: a rule restated with a different
    // line wrap is still a restatement, and exact-substring matching is what
    // let rule 5's paraphrase through in round 2.
    const core = CORE_BUNDLE.filter((e) => flat(e.content).includes(sentence)).map((e) => e.name);
    const inStatics = statics.filter(([, c]) => flat(c).includes(sentence)).map(([k]) => k);
    assertEquals(
      [...core, ...inStatics],
      [CONTRACT],
      `"${sentence}" must appear in the contract and nowhere else`,
    );
  }
});

/**
 * FR-013 — no examples. This is what plan § 7 rests the constitution § XI
 * verdict on, and it was enforced by a comment until the review said so.
 *
 * § XI protects an OPEN set — any unrelated project's name, vendor or host —
 * which no deny-list can close over. What CAN be closed over is the shape a
 * leak takes: an identifier that points outward. A contract with no URL, no
 * domain, no handle and no address has nowhere to carry one.
 */
const OUTWARD_SHAPES: ReadonlyArray<[string, RegExp]> = [
  ["url", /https?:\/\//i],
  ["bare domain", /\b[a-z0-9-]+\.(?:com|io|dev|net|org|app|ai|co)\b/i],
  ["handle", /(?:^|\s)@[a-z0-9][a-z0-9-]{2,}/i],
  ["email", /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i],
];

Deno.test("the contract carries no outward-pointing identifier", () => {
  const { content } = contractEntry();
  const hits = OUTWARD_SHAPES
    .filter(([, re]) => re.test(content))
    .map(([name, re]) => `${name}: ${re.exec(content)?.[0]?.trim()}`);
  assertEquals(hits, [], "an example naming something real is a § XI incident, not a typo");
});

/** FR-005 — the opt-out is only real if the contract says what counts as one. */
Deno.test("the contract states the literal declaration form AND the fail-safe", () => {
  const { content } = contractEntry();
  assert(
    flat(content).includes("## Target surface"),
    "the contract must show the exact heading a project writes",
  );
  assert(
    /not matching that form is treated as absent/i.test(flat(content)),
    "without this sentence, ambiguity fails OPEN and a project loses the default silently",
  );
  assert(
    /\.specnaut\/memory\/constitution\.md/.test(content),
    "the contract must name the file the declaration goes in",
  );
});

/** FR-014 — the scope-limiting sentence. A partial mitigation, but it is free. */
Deno.test("the contract limits its own authority", () => {
  assert(
    /confers no authority/i.test(flat(contractEntry().content)),
    "an always-on instruction file must say what it does NOT authorise",
  );
});

/** FR-006 — BOTH constitution files carry the section, or the opt-out's named
 * home has nowhere to declare under. The seed is the one a project actually
 * receives at init; the template is what `/specnaut constitution` fills. */
Deno.test("both constitution files carry Front-end patterns and the pointer", () => {
  // Both constitution files ship as category `spec-root`, name `specify` —
  // indistinguishable by name, so they are told apart by content. Filtering on
  // the category first matters: the `constitution` PHASE doc also mentions
  // `[PRINCIPLE_1_NAME]` as prose, and a name-free search finds it instead.
  const specRoot = CORE_BUNDLE.filter((e) => e.category === "spec-root");
  const files = [
    ["seed", specRoot.find((e) => e.content.includes("# Project Constitution"))],
    ["template", specRoot.find((e) => e.content.includes("[PRINCIPLE_1_NAME]"))],
  ] as const;
  for (const [which, entry] of files) {
    assert(entry, `the ${which} constitution is not in CORE_BUNDLE`);
    const flatText = flat(entry!.content);
    assert(
      flatText.includes("## Front-end patterns"),
      `the ${which} constitution has no Front-end patterns section`,
    );
    assert(
      flatText.includes(CONTRACT),
      `the ${which} constitution's Front-end patterns does not point at the contract`,
    );
  }
});

/** FR-009 — plan.md promises this assertion by name. Round 2: regressing the
 * `40px` literal across all three copies consistently left 1605 tests green,
 * because only the plugin byte-identity guard noticed, and a consistent edit
 * satisfies it. Assert the absence where it matters instead. */
Deno.test("no interactive primitive decides its own touch size", () => {
  const designer = CORE_BUNDLE.find((e) => e.category === "agent" && e.name === "ui-ux-designer");
  assert(designer, "ui-ux-designer is not in CORE_BUNDLE");
  const lines = designer!.content.split("\n")
    .filter((l) => /min[- ]height|min[- ]width|hit area|touch/i.test(l))
    .filter((l) => /\b\d+\s*(?:px|rem|dp|pt)\b/i.test(l));
  assertEquals(
    lines.map((l) => l.trim()),
    [],
    "a literal size on a touch affordance is a second decider — the value lives in DESIGN.md tokens",
  );
});
