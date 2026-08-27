import { assert, assertEquals } from "@std/assert";
import { extractBlock, mergeIntoFile, startFence } from "../../src/domain/merge_block.ts";

/**
 * The four fence states a graft can meet (#575, FR-032).
 *
 * Three of these were already safe and are here as the regression fence around
 * the fix — a guard tested only on the case it repairs cannot tell you it left
 * the other three alone.
 *
 * The fourth is the defect. `locateBlock` used to take the FIRST start fence and
 * the first end after it, so an orphan start sitting above a real block opened
 * the span at the orphan and closed it at the real end — and the replace deleted
 * every line the user had written in between. Not to end-of-file: the tail after
 * the real end fence survived, which is exactly why it read as a well-behaved
 * replace rather than as data loss. `AGENTS.md` is written with
 * `backupExisting: false`, and the trigger is an HTML comment that renders as
 * nothing.
 */

const LABEL = "response-style";
const S = startFence(LABEL, "html");

/** Markers only the user's own content carries. */
const USER = ["USER-A", "USER-B", "USER-C", "USER-TAIL"] as const;

function lost(before: string, after: string): string[] {
  return USER.filter((m) => before.includes(m) && !after.includes(m));
}

function countStarts(s: string): number {
  return s.split(S).length - 1;
}

/**
 * Every state is asserted on three axes, because each one alone is passable by a
 * wrong implementation: nothing of the user's is lost, the body is the new one
 * (so the merge actually happened), and a second identical merge changes
 * nothing (so the repair is not "append another block every upgrade").
 */
function check(name: string, before: string, expectStarts: number): void {
  const after = mergeIntoFile(before, "NEW BODY", LABEL, "html");
  assertEquals(lost(before, after), [], `${name}: user content was deleted`);
  assertEquals(extractBlock(after, LABEL, "html"), "NEW BODY", `${name}: body not written`);
  assertEquals(
    mergeIntoFile(after, "NEW BODY", LABEL, "html"),
    after,
    `${name}: not idempotent — a second upgrade changes the file again`,
  );
  assertEquals(countStarts(after), expectStarts, `${name}: unexpected number of start fences`);
}

Deno.test("an orphan START alone appends a complete block and keeps everything", () => {
  check(
    "orphan start alone",
    `# AGENTS.md\n\n${S}\n\n## Mine\nUSER-A\nUSER-B\n`,
    2, // the orphan, plus the block that was appended below it
  );
});

Deno.test("an orphan END alone appends a complete block and keeps everything", () => {
  check(
    "orphan end alone",
    `# AGENTS.md\n\n<!-- --- End Specnaut: ${LABEL} --- -->\n\n## Mine\nUSER-A\n`,
    1,
  );
});

Deno.test("a well-formed block is refreshed in place", () => {
  check(
    "well formed",
    `# AGENTS.md\n\n## Mine\nUSER-A\n\n${S}\nold body\n` +
      `<!-- --- End Specnaut: ${LABEL} --- -->\n\n## Tail\nUSER-TAIL\n`,
    1,
  );
});

Deno.test("an orphan START above a complete block does not swallow what lies between", () => {
  // THE defect. Before the fix this deleted USER-A, USER-B, USER-C and the
  // heading above them, reported one `refreshed` line, and left the tail intact.
  const before = `# AGENTS.md\n\n${S}\n\n## My own section\nUSER-A\nUSER-B\nUSER-C\n\n` +
    `${S}\nold body\n<!-- --- End Specnaut: ${LABEL} --- -->\n\n## Tail\nUSER-TAIL\n`;
  check("orphan above a block", before, 2);
  // Named individually: the aggregate assertion above passes if the span is
  // merely narrower, and the whole point is that it covers none of these.
  const after = mergeIntoFile(before, "NEW BODY", LABEL, "html");
  for (const marker of ["## My own section", "USER-A", "USER-B", "USER-C"]) {
    assert(after.includes(marker), `${marker} was inside the replaced span`);
  }
});

Deno.test("the guard does not fire on a label that merely shares a prefix", () => {
  // `ui-defaults` and `ui-defaults-extra` would collide under a sloppier match,
  // and AGENTS.md carries three labels whose spans sit in one file.
  const other = startFence("ui-defaults", "html");
  const before =
    `# AGENTS.md\n\n${other}\nui body\n<!-- --- End Specnaut: ui-defaults --- -->\n\n` +
    `## Mine\nUSER-A\n\n${S}\nold\n<!-- --- End Specnaut: ${LABEL} --- -->\n`;
  const after = mergeIntoFile(before, "NEW BODY", LABEL, "html");
  assertEquals(lost(before, after), []);
  assertEquals(extractBlock(after, "ui-defaults", "html"), "ui body", "a neighbour was disturbed");
  assertEquals(extractBlock(after, LABEL, "html"), "NEW BODY");
});
