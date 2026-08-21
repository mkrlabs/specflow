import { assert, assertEquals } from "@std/assert";
import { CORE_BUNDLE } from "../../src/templates_bundle.ts";

/**
 * The agent routing table in `using-specnaut/SKILL.md` is the first thing an
 * agent reads about which seats exist, on every harness. It must name exactly
 * the bundled fleet.
 *
 * Both directions have already gone wrong once. The table carried an
 * `architect` row for a seat that shipped in no installed project — it existed
 * only in the maintainer's own workspace and leaked into the template — while
 * five real seats (`architect-expert`, `performance-expert`,
 * `dependency-expert`, `accessibility-expert`, `ui-ux-designer`) were absent
 * from it entirely. Neither failure is visible at scaffold time: a phantom row
 * fails at dispatch, and a missing row simply means the seat never gets
 * dispatched at all.
 */

function bundledAgents(): Set<string> {
  return new Set(CORE_BUNDLE.filter((e) => e.category === "agent").map((e) => e.name));
}

function routingTableRows(): string[] {
  const entry = CORE_BUNDLE.find((e) => e.name === "using-specnaut");
  assert(entry, "using-specnaut SKILL.md missing from CORE_BUNDLE");
  // The agent table runs from its `| Agent | When to dispatch |` header to the
  // next blank line; other tables in the file (skills, harnesses) are ignored.
  const m = entry.content.match(/\| Agent \| When to dispatch \|\n\|[-| ]+\|\n((?:\|.*\n)+)/);
  assert(m, "could not locate the agent routing table");
  return [...m[1].matchAll(/^\| `([a-z0-9-]+)` \|/gm)].map((r) => r[1]);
}

Deno.test("every row in the routing table names a bundled agent", () => {
  const agents = bundledAgents();
  const phantom = routingTableRows().filter((n) => !agents.has(n));
  assertEquals(
    phantom,
    [],
    `routing table names ${phantom.join(", ")}, which no installed project ships — ` +
      `an unknown agent name fails at dispatch time, not at scaffold time`,
  );
});

Deno.test("every bundled agent appears in the routing table", () => {
  const listed = new Set(routingTableRows());
  const missing = [...bundledAgents()].filter((n) => !listed.has(n)).sort();
  assertEquals(
    missing,
    [],
    `bundled but unlisted: ${missing.join(", ")} — a seat absent from the table ` +
      `is a seat that never gets dispatched`,
  );
});

Deno.test("the routing table lists each agent exactly once", () => {
  const rows = routingTableRows();
  assertEquals(rows.length, new Set(rows).size, "duplicate row in the routing table");
});
