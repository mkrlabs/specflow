import { assertEquals, assertGreaterOrEqual } from "@std/assert";
import { fromFileUrl, relative } from "@std/path";
import { walk } from "@std/fs";

/**
 * Plugin → source-of-truth byte-identical contract.
 *
 * Each row maps a plugin asset to its bundled source. The plugin must be
 * a verbatim copy: any divergence breaks the user-visible UX guarantee
 * that `specnaut init`-scaffolded commands and the plugin-installed
 * versions behave identically. `plugin/skills/` and `plugin/agents/` are
 * excluded from `deno fmt` (see deno.json) so this contract holds
 * against rewraps.
 */
const SYNC_PAIRS: ReadonlyArray<{ plugin: string; source: string }> = [
  // Consolidated router skill (v1.0.0).
  {
    plugin: "plugin/skills/specnaut/SKILL.md",
    source: "templates/core/skills/specnaut/SKILL.md",
  },
  // 15 phase reference docs, loaded by the router on demand. The
  // phase-1 audit trio (`audit-security` #303, `audit-performance` #304,
  // `audit-accessibility` #305) shipped in v1.9.0; the phase-2 pair
  // (`audit-architecture` #321 + `audit-dependencies` #322) closes
  // Epic #320. `brainstorm`, `specify`, `clarify`, `analyze`, `checklist`,
  // `list-skills` and the `lite-heuristic` contract doc were removed in
  // #455 / #456 — the chain is `plan → tasks → implement → review → merge`
  // and `plan` absorbed the first four. `plan-audits` is a contract doc
  // `plan` loads at step 6 — not routable, synced through the same channel.
  ...[
    "plan",
    "plan-audits",
    "tasks",
    "implement",
    "review",
    "merge",
    "constitution",
    "tag-version",
    "release-version",
    "audit-security",
    "audit-performance",
    "audit-accessibility",
    "audit-architecture",
    "audit-dependencies",
    // Seven docs the list had never claimed, found by the completeness sweep
    // (monorepo#32). All seven were already byte-identical to their sources —
    // correct by luck, since nothing compared them. `auto-chain` is the
    // contract the router loads when it chains; the `epic-*` and `merge-*`
    // docs and `quality-gates` are loaded by `merge` and `implement`. Every
    // one of them is a mirror; the only reason they were absent is that
    // nobody added them.
    "auto-chain",
    "epic-commits",
    "epic-fixups",
    "epic-loop",
    "merge-close",
    "merge-squash",
    "quality-gates",
  ].map((name) => ({
    plugin: `plugin/skills/specnaut/phases/${name}.md`,
    source: `templates/core/skills/specnaut/phases/${name}.md`,
  })),
  // writing-plans skill — Specnaut's native equivalent of obra/superpowers
  // writing-plans, used for issue-driven planning where the spec-kit
  // /specnaut plan ceremony would be overkill (Epic #270, A1 #271).
  {
    plugin: "plugin/skills/writing-plans/SKILL.md",
    source: "templates/core/skills/writing-plans/SKILL.md",
  },
  // requesting-code-review skill — canonical reviewer prompt template +
  // dispatch guide for Specnaut's bundled code-reviewer agent. Foundation
  // for the two-stage review pattern used by subagent-driven-development
  // (Epic #270, A3 #273).
  {
    plugin: "plugin/skills/requesting-code-review/SKILL.md",
    source: "templates/core/skills/requesting-code-review/SKILL.md",
  },
  // using-specnaut bootstrap skill + 6 tool-mapping references — loaded
  // by the SessionStart hook (plugin/hooks/) to make the agent
  // skill-aware on every turn. Per-harness references already shipped
  // in #283; mirror covers them all for the plugin distribution
  // (Epic #270, B6 #282).
  {
    plugin: "plugin/skills/using-specnaut/SKILL.md",
    source: "templates/core/skills/using-specnaut/SKILL.md",
  },
  // subagent-driven-development — per-task two-stage review loop
  // (spec compliance then code quality) that consumes plans produced
  // by writing-plans and the canonical reviewer prompt template from
  // requesting-code-review (Epic #270, A2 #272).
  {
    plugin: "plugin/skills/subagent-driven-development/SKILL.md",
    source: "templates/core/skills/subagent-driven-development/SKILL.md",
  },
  // executing-plans — inline alternative to subagent-driven-development
  // for trivial plans where dispatch overhead exceeds the catch rate
  // (Epic #270, A4 #274).
  {
    plugin: "plugin/skills/executing-plans/SKILL.md",
    source: "templates/core/skills/executing-plans/SKILL.md",
  },
  // verification-before-completion — discipline checklist that
  // implementing agents MUST run before claiming DONE (Epic #270,
  // A5 #275).
  {
    plugin: "plugin/skills/verification-before-completion/SKILL.md",
    source: "templates/core/skills/verification-before-completion/SKILL.md",
  },
  // brainstorming — spec-discovery entry point. One question at a
  // time, propose 2-3 approaches, present design for approval, hand
  // off to writing-plans (Epic #270, A6 #276).
  {
    plugin: "plugin/skills/brainstorming/SKILL.md",
    source: "templates/core/skills/brainstorming/SKILL.md",
  },
  // Four machine-readable output-contract skills (#378). `user-invocable:
  // false` — never user-invoked; preloaded into agent context via the
  // `skills:` frontmatter to normalize the WORKFLOW STATUS / HANDOFF /
  // REVIEW SUMMARY / QA SUMMARY blocks agents emit after their prose.
  ...[
    "workflow-contract",
    "handoff-protocol",
    "review-findings-contract",
    "qa-report-contract",
    // #562: three sections split out of seats that had no duplication left to
    // reclaim. Same mechanism, same `user-invocable: false`.
    "alert-triage-contract",
    "backlog-frontmatter",
    "specnaut-facts",
    // Also found by the completeness sweep, and also already identical. #547
    // is the reason its own basename could not have caught this: every skill
    // file is named SKILL.md, so the token that identifies it is the runtime
    // path, not the name.
    "backlog-reference-contract",
  ].map((name) => ({
    plugin: `plugin/skills/${name}/SKILL.md`,
    source: `templates/core/skills/${name}/SKILL.md`,
  })),
  ...[
    "claude",
    "codex",
    "cursor",
    "opencode",
    "copilot",
  ].map((name) => ({
    plugin: `plugin/skills/using-specnaut/references/${name}-tools.md`,
    source: `templates/core/skills/using-specnaut/references/${name}-tools.md`,
  })),
  // Five per-axis audit-dispatch skills (#380). Markdown-only thin
  // dispatchers (no scripts/) — unlike the script-backed `code-audit`
  // (#379) which the plugin omits — so they mirror through the same
  // byte-identical channel. Each binds one axis to its existing expert
  // agent and returns findings inline.
  ...[
    "arch-audit",
    "sec-audit",
    "perf-audit",
    "dep-audit",
    "a11y-audit",
  ].map((name) => ({
    plugin: `plugin/skills/${name}/SKILL.md`,
    source: `templates/core/skills/${name}/SKILL.md`,
  })),
  // status-audit (#381). Markdown-only read-only skill — reads the
  // `.specnaut/logs/agents.jsonl` status ledger and reports seven session-health
  // views; pairs with `/loop 5m /status-audit` for headless supervision. Mirrors
  // through the same byte-identical channel as the other markdown-only skills.
  {
    plugin: "plugin/skills/status-audit/SKILL.md",
    source: "templates/core/skills/status-audit/SKILL.md",
  },
  // Dual-copy agents: 15 sub-agent definitions, each landing as
  // `plugin/agents/<name>.md`. Claude Code resolves agents by file
  // basename in plugin scope; no namespacing needed for invocation
  // (agents are not user-invokable like slash commands).
  // Counts: 10 original + ui-ux-designer (#198, sync-test drift fix in
  // #321) + performance-expert (#304) + accessibility-expert (#305) +
  // architect-expert (#321) + dependency-expert (#322) = 15.
  ...[
    "code-reviewer",
    "developer",
    "devops-sre",
    "product-owner",
    "qa-tester",
    "review-coordinator",
    "security-expert",
    "specnaut-guide",
    "test-reviewer",
    "workflow-manager",
    "ui-ux-designer",
    "performance-expert",
    "accessibility-expert",
    "architect-expert",
    "dependency-expert",
  ].map((name) => ({
    plugin: `plugin/agents/${name}.md`,
    source: `templates/core/agents/${name}.md`,
  })),
  // Agent-fleet README documenting the per-agent `effort` rubric (#382).
  // Ships beside the agent files at `.claude/agents/README.md`; mirrored
  // into the plugin through the same byte-identical channel.
  {
    plugin: "plugin/agents/README.md",
    source: "templates/core/agents/README.md",
  },
];

function abs(rel: string): string {
  return fromFileUrl(new URL(`../../${rel}`, import.meta.url));
}

for (const pair of SYNC_PAIRS) {
  Deno.test(`${pair.plugin} is byte-identical to ${pair.source}`, async () => {
    const [plugin, source] = await Promise.all([
      Deno.readTextFile(abs(pair.plugin)),
      Deno.readTextFile(abs(pair.source)),
    ]);
    assertEquals(
      plugin,
      source,
      `Plugin copy of ${pair.plugin} has drifted from ${pair.source}. ` +
        `Either: (a) re-copy the source over the plugin file, ` +
        `or (b) if the divergence is intentional, drop this pair from SYNC_PAIRS and document why.`,
    );
  });
}

// ─── The completeness sweep (monorepo#32) ───────────────────────────────
//
// SYNC_PAIRS asserts that every listed pair is byte-identical. Nothing asserted
// that the list COVERS `plugin/`, so an asset added without a row was governed
// by nothing and the suite stayed green — a coverage map measuring its own
// claims rather than its tree. Measured when this landed: 65 Markdown assets,
// 56 pairs, 9 covered by nothing, eight of the nine genuine mirrors that
// happened to be byte-identical. Correct by luck, not by guard.
//
// The population is EVERY file under `plugin/`, and the reason that is not a
// glob lives in `mirror-exclusions.txt`'s header.

const EXCLUSIONS_FILE = "tests/plugin/mirror-exclusions.txt";

/**
 * Repo-relative POSIX path. `relative()` answers in the HOST's separator, so on
 * Windows it returns `plugin\\README.md` while every literal in `SYNC_PAIRS`
 * and in the exclusion list is `/`-separated — which made all 69 assets fall
 * through as uncovered and turned `cross-smoke (windows-latest)` red on `main`
 * while ubuntu, macos and lint-test all passed. The three green legs are why it
 * was invisible locally.
 */
function posix(rel: string): string {
  return rel.replaceAll("\\", "/");
}

/** One exclusion entry: a path, and the written reason that makes it one. */
function readExclusions(text?: string): Map<string, string> {
  const out = new Map<string, string>();
  const raw = text ?? Deno.readTextFileSync(abs(EXCLUSIONS_FILE));
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const m = trimmed.match(/^(\S+)\s+(.*)$/);
    // An entry with no written reason is NOT an entry. Deliberately dropped
    // rather than reported here: the sweep below then names the file as
    // uncovered, which is the right verdict and the right message. This is the
    // same refusal `scripts/smoke/coverage-allowlist.txt` applies.
    if (!m || m[2].trim() === "") continue;
    out.set(m[1], m[2].trim());
  }
  return out;
}

Deno.test("every file under plugin/ is either mirrored or excluded with a reason", async () => {
  const root = abs("plugin");
  const exclusions = readExclusions();
  const paired = new Set(SYNC_PAIRS.map((p) => p.plugin));

  const assets: string[] = [];
  for await (
    // followSymlinks stays false — the default. `deno task test` runs with an
    // unscoped --allow-read, so the runtime adds no second boundary and the
    // walk's own configuration is the only one. Each path is checked to resolve
    // INSIDE the root before it is reported: resolve then verify containment,
    // never strip "..".
    const entry of walk(root, { includeDirs: false, followSymlinks: false })
  ) {
    // Containment against the WALK root, not the repository root. Checking the
    // latter was unsatisfiable in principle — a walk yields lexical descendants
    // of its own root, which are trivially inside the repo — so the guard read
    // as a live safeguard while being unable to fire. Against `plugin/` it can:
    // that is what a symlink out of the tree would produce if `followSymlinks`
    // were ever turned on.
    const fromWalkRoot = posix(relative(root, entry.path));
    if (fromWalkRoot.startsWith("..") || fromWalkRoot.startsWith("/")) {
      throw new Error(
        `plugin walk escaped plugin/: ${entry.path}. ` +
          `followSymlinks must stay false.`,
      );
    }
    assets.push(posix(relative(abs(""), entry.path)));
  }

  // The floor. A walk that resolves the wrong root, or yields nothing, would
  // otherwise report zero uncovered and pass — reporting coverage that does not
  // exist, which is the class this sweep exists to close. The bound is derived
  // from SYNC_PAIRS' own length, so it cannot go stale: there cannot be fewer
  // assets on disk than there are pairs claiming to point at them.
  // The floor bounds the POPULATION, not just a zero-length walk. Against
  // SYNC_PAIRS.length alone it had 8 files of slack — enough that re-scoping the
  // walk to `exts: [".md"]` (the scoping FR-001 forbids, and the one the plan's
  // security audit reversed the decision on) left 65 assets, 64 paired, 1
  // Markdown exclusion, zero uncovered, and the whole suite green. That is the
  // requirement enforced by prose and by no assertion.
  //
  // Every asset is either paired or excluded, so the two counts sum to the
  // population and the floor is exact. A file added with its pair raises both;
  // a file re-scoped OUT of the walk lowers only the left-hand side.
  assertGreaterOrEqual(
    assets.length,
    SYNC_PAIRS.length + exclusions.size,
    `The plugin walk found ${assets.length} asset(s), but ${SYNC_PAIRS.length} ` +
      `pair(s) + ${exclusions.size} exclusion(s) claim ${SYNC_PAIRS.length + exclusions.size}. ` +
      `Something narrowed the walk — a failed enumeration, or a file-type scope ` +
      `that FR-001 forbids. Either way it is not a clean tree.`,
  );

  const uncovered = assets
    .filter((a) => !paired.has(a) && !exclusions.has(a))
    .sort();

  assertEquals(
    uncovered,
    [],
    `${uncovered.length} plugin asset(s) are governed by nothing — neither a ` +
      `SYNC_PAIRS row nor an entry in ${EXCLUSIONS_FILE}:\n` +
      uncovered.map((u) => `  - ${u}`).join("\n") +
      `\n\nAdd a pair if the file mirrors one under templates/core/, or an ` +
      `exclusion WITH A WRITTEN REASON if it does not. An entry carrying no ` +
      `reason is not an entry and will not clear this.`,
  );
});

Deno.test("an exclusion entry with no written reason grants nothing", () => {
  // FR-002 had no witness on this half. The reader drops a reason-less entry
  // and the comment claimed the sweep then names the file as uncovered — true,
  // and asserted by nothing. The two bash readers of the same rule REPORT it
  // and are fatal, so the three spellings already disagreed on behaviour, which
  // is precisely what the plan's §9 says the duplication costs.
  //
  // Synthetic input, so this cannot go quiet the day the real list happens to
  // hold no such entry.
  const parsed = readExclusions(
    [
      "# a comment",
      "plugin/with-reason.md  a fact about the file",
      "plugin/no-reason.md",
      "plugin/whitespace-only.md   ",
    ].join("\n"),
  );
  assertEquals([...parsed.keys()], ["plugin/with-reason.md"]);
  assertEquals(parsed.get("plugin/with-reason.md"), "a fact about the file");
});

Deno.test("no exclusion entry excuses a file that no longer exists", () => {
  // `scripts/smoke/audit.sh` scans its allow-list for this and treats it as
  // fatal; `scripts/check-scaffold-drift.sh` in the monorepo never had the scan
  // and its absence went unnoticed for as long as the list happened to be
  // clean. This is the third reader of that rule and it is not going to be the
  // second copy that loses it.
  const stale = [...readExclusions().keys()]
    .filter((path) => {
      try {
        Deno.statSync(abs(path));
        return false;
      } catch {
        return true;
      }
    })
    .sort();
  assertEquals(
    stale,
    [],
    `${stale.length} exclusion entr(y/ies) name a file that no longer exists:\n` +
      stale.map((s) => `  - ${s}`).join("\n") +
      `\n\nPrune them. An entry that excuses nothing while looking like it ` +
      `does is exactly what this sweep exists to remove.`,
  );
});

Deno.test(
  "plugin/.claude-plugin/plugin.json declares name 'specnaut-plugin'",
  async () => {
    const manifest = JSON.parse(
      await Deno.readTextFile(abs("plugin/.claude-plugin/plugin.json")),
    );
    assertEquals(manifest.name, "specnaut-plugin");
    assertEquals(typeof manifest.description, "string");
    assertEquals(typeof manifest.version, "string");
  },
);
