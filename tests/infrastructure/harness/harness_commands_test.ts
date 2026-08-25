import { assert, assertEquals } from "@std/assert";
import { HARNESSES } from "../../../src/cli/harnesses.ts";
import { harnessCommands } from "../../../src/infrastructure/harness/harness_commands.ts";
import type { KnownHarness } from "../../../src/domain/installed_lock.ts";
import { CORE_BUNDLE } from "../../../src/templates_bundle.ts";

/**
 * `init`'s "Next steps" told every user to type the Claude commands.
 *
 * On the five harnesses that namespace their skills the board is
 * `/specnaut-board`, so `/board add` — the headline command of 4.0.0 — was a
 * no-op in the one place a first-time user reads. Windsurf was wrong twice
 * over: its phases are flat sibling workflows, so `/specnaut plan` is
 * `/specnaut-plan` there.
 *
 * These do not assert the table's contents. They assert the table against the
 * destinations each harness actually emits, so a harness that changes its
 * layout takes this file red instead of silently making `init` lie.
 */

const OPTS = { backlogBackend: "local", versionScheme: "semver", specBackend: "local" } as const;

function bundleFor(key: string): string[] {
  const h = HARNESSES.find((x) => x.key === key)!;
  return Object.keys(h.mapBundle(CORE_BUNDLE, OPTS));
}

Deno.test("every harness has a command surface declared", () => {
  for (const h of HARNESSES) {
    const c = harnessCommands(h.key as KnownHarness);
    assert(c !== undefined, `${h.key} has no entry in the command table`);
  }
});

Deno.test("the declared board command matches the folder the harness emits", () => {
  for (const h of HARNESSES) {
    const dests = bundleFor(h.key);
    const c = harnessCommands(h.key as KnownHarness);
    if (c.board === null) {
      // Claimed to have no invocable surface — then it must not emit a skill
      // folder for the board either.
      assert(
        !dests.some((d) => /\/(specnaut-)?board\/SKILL\.md$/.test(d)),
        `${h.key} declares no board command but emits a board skill folder`,
      );
      continue;
    }
    const folder = c.board.replace(/^\//, "");
    assert(
      dests.some((d) => d.includes(`/${folder}/SKILL.md`) || d.includes(`/${folder}.md`)),
      `${h.key} declares ${c.board} but emits none of: ${
        dests.filter((d) => d.includes("board")).join(", ") || "<no board destination>"
      }`,
    );
  }
});

Deno.test("the declared phase form matches how the harness lays phases out", () => {
  for (const h of HARNESSES) {
    const dests = bundleFor(h.key);
    const c = harnessCommands(h.key as KnownHarness);
    if (c.board === null) continue; // no slash surface at all
    const nested = dests.some((d) => d.includes("/specnaut/phases/plan.md"));
    const flat = dests.some((d) => /\/specnaut-plan\.md$/.test(d));
    assert(nested || flat, `${h.key} emits no recognisable destination for the plan phase`);
    assertEquals(
      c.phase("plan"),
      nested ? "/specnaut plan" : "/specnaut-plan",
      `${h.key} lays phases out ${nested ? "nested" : "flat"} but declares ${c.phase("plan")}`,
    );
  }
});

Deno.test("no harness advertises the pre-4.0.0 name", () => {
  for (const h of HARNESSES) {
    const c = harnessCommands(h.key as KnownHarness);
    assert(
      c.board === null || !c.board.includes("backlog"),
      `${h.key} still advertises ${c.board}`,
    );
  }
});
