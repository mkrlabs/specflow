import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import {
  endFence,
  extractBlock,
  mergeIntoFile,
  startFence,
  wrapInBlock,
} from "../../src/domain/merge_block.ts";

/**
 * #466 — the Markdown fence style.
 *
 * The existing `#` fence is a comment in `.gitignore` and an H1 in Markdown.
 * Dropping it into a user's `AGENTS.md` would put a stray top-level heading in
 * the middle of their document — visible, and outranking their own sections in
 * every outline view. The HTML-comment style is the one that stays invisible.
 *
 * These also pin the property the whole mechanism rests on: merging is
 * idempotent and never touches a line outside the fences.
 */

const LABEL = "chain-stops";
const BODY = "## Managed\n\nA rule the tool owns.";

Deno.test("the html fence is a markdown comment, not a heading", () => {
  assertEquals(startFence(LABEL, "html"), "<!-- --- Specnaut: chain-stops --- -->");
  assertEquals(endFence(LABEL, "html"), "<!-- --- End Specnaut: chain-stops --- -->");
  // The default is still the hash style — the .gitignore contract is untouched.
  assertEquals(startFence(LABEL), "# --- Specnaut: chain-stops ---");
});

Deno.test("a wrapped html block round-trips through extraction", () => {
  const wrapped = wrapInBlock(BODY, LABEL, "html");
  assertEquals(extractBlock(wrapped, LABEL, "html"), BODY);
  // Styles do not see each other's blocks.
  assertEquals(extractBlock(wrapped, LABEL), null);
});

Deno.test("merging into a user document appends without touching their lines", () => {
  const user = "# Our AGENTS.md\n\n## House rules\n\nWe squash on merge.\n";
  const merged = mergeIntoFile(user, BODY, LABEL, "html");

  assert(merged.startsWith(user.trimEnd()), "the user's content must remain the exact prefix");
  assertStringIncludes(merged, startFence(LABEL, "html"));
  assertStringIncludes(merged, endFence(LABEL, "html"));
  assertEquals(extractBlock(merged, LABEL, "html"), BODY);
});

Deno.test("merging twice does not duplicate the section", () => {
  const user = "# Our AGENTS.md\n\nWe squash on merge.\n";
  const once = mergeIntoFile(user, BODY, LABEL, "html");
  const twice = mergeIntoFile(once, BODY, LABEL, "html");
  assertEquals(twice, once);
  assertEquals(twice.split(startFence(LABEL, "html")).length - 1, 1);
});

Deno.test("a changed body is replaced in place, keeping what surrounds it", () => {
  const user = "# Top\n\nbefore paragraph\n";
  const once = mergeIntoFile(user, BODY, LABEL, "html");
  const withTail = `${once}\n## Added later\n\nafter paragraph\n`;

  const refreshed = mergeIntoFile(withTail, "## Managed\n\nA rule that moved.", LABEL, "html");
  assertStringIncludes(refreshed, "before paragraph");
  assertStringIncludes(refreshed, "after paragraph");
  assertStringIncludes(refreshed, "A rule that moved.");
  assert(!refreshed.includes("A rule the tool owns."), "the old body must be gone, not stacked");
  assertEquals(refreshed.split(startFence(LABEL, "html")).length - 1, 1);
});
