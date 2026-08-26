// `templates/core/root/.gitignore` does two jobs; this pins the second (#568).
//
// Job one is visible: it is shipped product content, scaffolded into consumer
// projects by `specnaut init` and merged into whatever the user already has.
//
// Job two is not visible from the file at all. Because of where it sits, git
// reads it as a live per-directory ignore rule over `templates/core/root/`,
// which is a mapped surface in `scripts/smoke/audit.sh`. The audit collects
// untracked files with `git ls-files --others --exclude-standard`, which
// honours it. So a pattern added here as an ordinary product change can
// silently narrow what the coverage gate is able to see in THIS repository —
// one file, two decisions, and only one of them visible to whoever edits it.
//
// The reasoning, and the two resolutions that were rejected, live in
// `templates/core/root/README.md`, beside the file rather than only here.

import { assert, assertEquals } from "@std/assert";
import { fromFileUrl, join } from "@std/path";

const ROOT = fromFileUrl(new URL("../../", import.meta.url));
const SHIPPED_REL = "templates/core/root/.gitignore";

/**
 * Patterns that CAN match inside the audited surface and are accepted anyway.
 *
 * A row here is a deliberate, costed exception: it says what the audit stops
 * being able to see. Adding a pattern to the shipped file without adding a row
 * fails this test — which is the whole point, because the cost is invisible
 * from the file itself.
 */
const ACKNOWLEDGED = new Map<string, string>([
  [
    "*.specnaut.bak",
    "the backup suffix this CLI writes. It has always had this effect, and a " +
    "`.specnaut.bak` file appearing untracked under templates/core/root/ would " +
    "be a stray artefact of a local run rather than a surface the audit should " +
    "report. Removing it from the shipped file would leave consumers offering " +
    "their own upgrade backups for staging, which is the worse trade.",
  ],
]);

/** Non-comment, non-blank lines of the shipped file, in order. */
function patternsOf(text: string): string[] {
  return text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0 && !l.startsWith("#"));
}

/**
 * A pattern anchored under `.specnaut/` cannot narrow the audit: nothing under
 * `templates/core/root/` is a scaffolded project, so no `.specnaut/` directory
 * exists or could exist there. It is inert by construction rather than by
 * anybody remembering to keep it inert.
 */
function isSpecnautAnchored(pattern: string): boolean {
  return pattern.startsWith(".specnaut/");
}

async function checkIgnore(paths: string[]): Promise<string> {
  const { stdout } = await new Deno.Command("git", {
    args: ["check-ignore", "-v", "--no-index", ...paths],
    cwd: ROOT,
    stdout: "piped",
    stderr: "null",
  }).output();
  return new TextDecoder().decode(stdout);
}

Deno.test("shipped .gitignore: no unacknowledged pattern can narrow the audited surface", async () => {
  const text = await Deno.readTextFile(join(ROOT, SHIPPED_REL));
  const offenders = patternsOf(text).filter((p) => !isSpecnautAnchored(p) && !ACKNOWLEDGED.has(p));
  assert(
    offenders.length === 0,
    `${SHIPPED_REL} carries ${
      offenders.map((p) => `\`${p}\``).join(", ")
    } — pattern(s) that are neither anchored under \`.specnaut/\` nor ` +
      `acknowledged in this test.\n\n` +
      `That file is read by git as a live ignore rule over \`templates/core/root/\`, ` +
      `a surface \`scripts/smoke/audit.sh\` maps. A pattern that can match there ` +
      `removes files from what the coverage gate can see, and nothing about the ` +
      `shipped file says so.\n\n` +
      `If the pattern is genuinely needed for consumers, add a row to ACKNOWLEDGED ` +
      `stating what the audit stops being able to see. If it is not, remove it. ` +
      `See templates/core/root/README.md.`,
  );
});

Deno.test("shipped .gitignore: the second job it is guarded for actually exists", async () => {
  // Without this, the guard above and the note beside the file could both go
  // on describing a mechanism that had quietly stopped applying — and a rule
  // enforced against nothing reads exactly like a rule that is working.
  const text = await Deno.readTextFile(join(ROOT, SHIPPED_REL));
  const bak = patternsOf(text).find((p) => p === "*.specnaut.bak");
  assert(bak !== undefined, "the acknowledged pattern is gone — prune its ACKNOWLEDGED row");

  const candidate = "templates/core/root/probe.specnaut.bak";
  const out = await checkIgnore([candidate]);
  assert(
    out.includes(SHIPPED_REL),
    `git no longer attributes \`${candidate}\` to ${SHIPPED_REL}. Either the ` +
      `per-directory rule stopped applying — in which case this ticket's premise ` +
      `is gone and the guard should go with it — or the file moved. Got: ${JSON.stringify(out)}`,
  );
});

Deno.test("shipped .gitignore: the maintainer note is never shipped to a consumer", async () => {
  // AC 4, in the form that survives a later reopening: the fix must not have
  // changed one byte of what `specnaut init` writes. The note lives in the
  // scaffold source directory, so the thing to prove is that the manifest —
  // which enumerates sources rather than globbing the directory — does not
  // carry it, and neither does the generated bundle.
  const manifest = await Deno.readTextFile(join(ROOT, "templates/manifest.json"));
  assertEquals(
    manifest.includes("core/root/README.md"),
    false,
    "templates/manifest.json lists core/root/README.md — the maintainer note " +
      "would be scaffolded into every consumer project. Remove the entry.",
  );
  const bundle = await Deno.readTextFile(join(ROOT, "src/templates_bundle.ts"));
  assertEquals(
    bundle.includes("core/root/README.md"),
    false,
    "src/templates_bundle.ts carries core/root/README.md — the note reached the binary.",
  );
});
