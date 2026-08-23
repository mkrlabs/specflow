import { assert, assertEquals } from "@std/assert";
import { fromFileUrl } from "@std/path";
import { parse } from "@std/yaml";

/**
 * #521 — `Create release` could publish a short asset set and still exit 0.
 *
 * `softprops/action-gh-release` defaults `fail_on_unmatched_files` to false, so
 * nine of ten files present meant it uploaded nine, created the release, and
 * marked the step green. A tag and its release are effectively immutable, so
 * the only recovery is another patch — and until that ships, every user on the
 * missing platform gets a 404 from `install.sh` and `self-update`, both of
 * which resolve assets by tag.
 *
 * The tests below also pin the three numbers that have to agree and live in
 * three different files: the compiler's target list, the workflow's upload
 * list, and postflight's `asset_count` floor. Adding a platform touches all
 * three, and nothing else would notice if it touched only two.
 */

const ROOT = fromFileUrl(new URL("../../", import.meta.url));

type Step = { name?: string; with?: Record<string, unknown> };
type Workflow = { jobs: Record<string, { steps?: Step[] }> };

async function releaseWorkflow(): Promise<Workflow> {
  return parse(
    await Deno.readTextFile(`${ROOT}.github/workflows/release.yml`),
  ) as Workflow;
}

function createReleaseStep(wf: Workflow): Step {
  const steps = Object.values(wf.jobs).flatMap((j) => j.steps ?? []);
  const step = steps.find((s) => s.name === "Create release");
  assert(step, "no 'Create release' step in release.yml — did it get renamed?");
  return step;
}

Deno.test("Create release fails rather than publishing a short asset set", async () => {
  const step = createReleaseStep(await releaseWorkflow());
  assertEquals(
    step.with?.fail_on_unmatched_files,
    true,
    "without this the action publishes whatever it found and reports success; " +
      "the release is immutable by the time postflight notices",
  );
});

Deno.test("the workflow uploads a binary and a checksum for every built target", async () => {
  const step = createReleaseStep(await releaseWorkflow());
  const files: string[] = String(step.with?.files ?? "")
    .split("\n").map((l) => l.trim()).filter(Boolean);

  const build = await Deno.readTextFile(`${ROOT}scripts/build.ts`);
  const outNames = [...build.matchAll(/outName:\s*"([^"]+)"/g)].map((m) => m[1]);
  assert(outNames.length > 0, "could not read the target list out of scripts/build.ts");

  for (const name of outNames) {
    // build.ts appends .exe for Windows; match on the stem so both shapes pass.
    const binary = files.find((f) => f.startsWith(`dist/${name}`) && !f.endsWith(".sha256"));
    assert(binary, `${name} is built but never uploaded — users of that platform get a 404`);
    assert(
      files.includes(`${binary}.sha256`),
      `${binary} is uploaded without its checksum`,
    );
  }
  assertEquals(
    files.length,
    outNames.length * 2,
    `the upload list should be exactly one binary + one checksum per target ` +
      `(${outNames.length} targets → ${outNames.length * 2} files)`,
  );
});

Deno.test("postflight's asset floor matches what the workflow uploads", async () => {
  const step = createReleaseStep(await releaseWorkflow());
  const uploaded = String(step.with?.files ?? "")
    .split("\n").map((l) => l.trim()).filter(Boolean).length;

  const postflight = await Deno.readTextFile(`${ROOT}.specnaut/release/postflight.sh`);
  const m = postflight.match(/asset_count"?\s*-ge\s*(\d+)/);
  assert(m, "postflight no longer asserts a minimum asset count");
  assertEquals(
    Number(m[1]),
    uploaded,
    "postflight is the second net; a floor below the upload count lets a short " +
      "release pass both gates",
  );
});
