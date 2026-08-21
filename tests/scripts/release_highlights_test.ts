import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { type Classified, formatChangelog } from "../../scripts/gen-changelog.ts";

/**
 * The highlights block is the only part of the release notes a human writes.
 *
 * Everything else is derived from commit subjects, which are written one
 * change at a time and cannot know what the release is about. "Rename two
 * seats" is an accurate subject and tells a reader nothing they can act on —
 * which two, and what breaks if they do nothing, only fits at the top.
 *
 * Being author-written is also what makes it fragile: it is the one section
 * that can silently fail to appear, because nothing downstream regenerates it.
 */

const commit = (subject: string): Classified => ({
  hash: "abc1234",
  subject,
  body: "",
  category: subject.includes("!:") ? "breaking" : subject.startsWith("feat") ? "feat" : "chore",
  cleanedSubject: subject.replace(/^[a-z]+(\([^)]*\))?!?:\s*/, ""),
});

const base = { fromTag: "v1.0.0", toTag: "v2.0.0" };

Deno.test("highlights render under the title and above every generated section", () => {
  const md = formatChangelog([commit("feat!: rename two seats")], {
    ...base,
    highlights: "**Two agents are renamed.** `a11y-expert` is now `accessibility-expert`.",
  });
  const title = md.indexOf("## What's changed in v2.0.0");
  const hi = md.indexOf("### Highlights");
  const breaking = md.indexOf("### ⚠ Breaking changes");
  assert(title < hi, "highlights must follow the title");
  assert(hi < breaking, "highlights must precede even the breaking-changes section");
  assertStringIncludes(md, "accessibility-expert");
});

Deno.test("omitting highlights leaves the output byte-identical", () => {
  const commits = [commit("feat!: rename two seats"), commit("feat: add a thing")];
  const without = formatChangelog(commits, base);
  const undef = formatChangelog(commits, { ...base, highlights: undefined });
  assertEquals(without, undef);
  assertEquals(without.includes("### Highlights"), false);
});

Deno.test("a blank or whitespace-only highlights file renders no heading", () => {
  // An empty file is the shape a forgotten `>` redirect leaves behind. It must
  // not produce a "Highlights" heading with nothing under it, which reads as a
  // truncated release note rather than an absent one.
  for (const value of ["", "   ", "\n\n\t\n"]) {
    const md = formatChangelog([commit("feat: x")], { ...base, highlights: value });
    assertEquals(md.includes("### Highlights"), false, `blank value ${JSON.stringify(value)}`);
  }
});

Deno.test("highlights survive a release with no commits at all", () => {
  const md = formatChangelog([], { ...base, highlights: "**Read this.**" });
  assertStringIncludes(md, "### Highlights");
  assertStringIncludes(md, "**Read this.**");
  assertStringIncludes(md, "_No user-facing changes since the previous release._");
});
