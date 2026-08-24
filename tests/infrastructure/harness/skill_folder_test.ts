import { assert, assertEquals, assertThrows } from "@std/assert";
import {
  ensureSkillFrontmatter,
  skillFolderName,
} from "../../../src/infrastructure/harness/skill_folder.ts";
import type { CoreEntry } from "../../../src/domain/core_bundle.ts";
import { splitFrontmatter } from "../../../src/infrastructure/harness/frontmatter.ts";
import { parse as parseYaml } from "@std/yaml";

function entry(category: CoreEntry["category"], name: string): CoreEntry {
  return { category, name, suffix: null, content: "", executable: false };
}

Deno.test("skillFolderName: skill → specnaut-<name>", () => {
  assertEquals(skillFolderName(entry("skill", "specnaut-auto")), "specnaut-auto");
});

Deno.test("skillFolderName: skill named 'specnaut' is not double-prefixed", () => {
  assertEquals(skillFolderName(entry("skill", "specnaut")), "specnaut");
});

Deno.test("skillFolderName: skill already starting with 'specnaut-' is kept as-is", () => {
  assertEquals(skillFolderName(entry("skill", "specnaut-review")), "specnaut-review");
});

Deno.test("skillFolderName: agent → specnaut-agent-<name>", () => {
  assertEquals(skillFolderName(entry("agent", "product-owner")), "specnaut-agent-product-owner");
});

Deno.test("skillFolderName: throws for spec-root and project-root", () => {
  assertThrows(
    () =>
      skillFolderName({
        category: "spec-root",
        name: "specify",
        suffix: "x",
        content: "",
        executable: false,
      }),
    Error,
    "not applicable",
  );
  assertThrows(
    () =>
      skillFolderName({
        category: "project-root",
        name: "root",
        suffix: "x",
        content: "",
        executable: false,
      }),
    Error,
    "not applicable",
  );
});

Deno.test("ensureSkillFrontmatter: synthesizes frontmatter when absent", () => {
  const out = ensureSkillFrontmatter("# body\n", "my-skill");
  assert(out.startsWith("---\n"));
  assert(out.endsWith("# body\n"));
  // Asserted through the parser, not on the emitted text: the string form of
  // this check passed for years against YAML that cannot be read.
  const fm = parsedFrontmatter(out);
  assertEquals(fm.name, "my-skill");
  assertEquals(fm.description, "Specnaut skill: my-skill");
});

Deno.test("ensureSkillFrontmatter: preserves existing name and description", () => {
  const input = "---\nname: user-choice\ndescription: User-written\n---\n\n# body\n";
  const out = ensureSkillFrontmatter(input, "default-name");
  assert(out.includes("name: user-choice"));
  assert(out.includes("description: User-written"));
  assert(!out.includes("name: default-name"));
});

/**
 * The fallback description contains `": "`. Emitted as a bare YAML scalar it is
 * a syntax error, so these assert on the *parsed object* — a string comparison
 * would pass against frontmatter no parser can read, which is exactly how the
 * defect survived.
 */
function parsedFrontmatter(emitted: string): Record<string, unknown> {
  const split = splitFrontmatter(emitted);
  assert(split, "expected the emitted SKILL.md to carry frontmatter");
  return parseYaml(split.fmBody) as Record<string, unknown>;
}

Deno.test("ensureSkillFrontmatter: frontmatter without a description → parseable YAML", () => {
  const input = "---\nname: specnaut-backlog\n---\n\n# Body\n";
  const fm = parsedFrontmatter(ensureSkillFrontmatter(input, "specnaut-backlog"));
  assertEquals(fm.name, "specnaut-backlog");
  assertEquals(fm.description, "Specnaut skill: specnaut-backlog");
});

Deno.test("ensureSkillFrontmatter: an existing description is preserved verbatim", () => {
  const input = "---\nname: specnaut-backlog\ndescription: Manage the backlog\n---\n\n# Body\n";
  const fm = parsedFrontmatter(ensureSkillFrontmatter(input, "specnaut-backlog"));
  assertEquals(fm.description, "Manage the backlog");
});

Deno.test("ensureSkillFrontmatter: body survives the injection", () => {
  const emitted = ensureSkillFrontmatter("# Body\n\ntext\n", "specnaut-backlog");
  const split = splitFrontmatter(emitted);
  assert(split, "expected frontmatter");
  assert(split.rest.includes("# Body"), "body was dropped");
  assert(split.rest.includes("text"), "body was truncated");
});
