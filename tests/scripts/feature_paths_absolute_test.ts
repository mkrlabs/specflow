// `get_feature_paths()` decided whether a path was absolute by testing for a
// leading `/`. Under Git Bash on Windows — the shell these scripts run in
// there — `.specnaut/feature.json` legitimately carries `C:\Users\...`, which
// fails that test. The "normalize relative paths" rule then prepended the repo
// root, producing a location that exists nowhere and whose `basename` is the
// whole mangled string rather than the feature's directory name.
//
// Two consumers read exactly that: the contradiction guard compares the
// basename against the branch, and `setup-plan.sh` copies the plan template to
// `$FEATURE_DIR/plan.md`. The PowerShell twin never had the defect — it asks
// `[System.IO.Path]::IsPathRooted` instead of spelling the rule by hand.
//
// These assertions are on the RESOLUTION, not on filesystem effects, so they
// run identically on every platform: a Windows-shaped path is a string this
// function must handle, whoever is reading it.

import { assert, assertStringIncludes } from "@std/assert";
import { fromFileUrl, join } from "@std/path";

const COMMON = fromFileUrl(
  new URL("../../templates/core/specnaut/scripts/bash/common.sh", import.meta.url),
);

type Result = { code: number; stdout: string; stderr: string };

async function resolvePaths(dir: string): Promise<Result> {
  const { code, stdout, stderr } = await new Deno.Command("bash", {
    args: ["-c", `source ${JSON.stringify(COMMON)}; get_feature_paths`],
    cwd: dir,
    stdout: "piped",
    stderr: "piped",
  }).output();
  return {
    code,
    stdout: new TextDecoder().decode(stdout),
    stderr: new TextDecoder().decode(stderr),
  };
}

/** A git repo on branch `002-beta`, with whatever `feature.json` the case needs. */
async function withRepo(
  featureDirectory: string,
  fn: (dir: string, result: Result) => void | Promise<void>,
): Promise<void> {
  const dir = await Deno.makeTempDir({ prefix: "feature-paths-abs-" });
  try {
    const git = async (...args: string[]) => {
      await new Deno.Command("git", { args, cwd: dir, stdout: "null", stderr: "null" }).output();
    };
    await git("init", "-q");
    await git("config", "user.email", "t@example.invalid");
    await git("config", "user.name", "t");

    await Deno.mkdir(join(dir, ".specnaut", "specs", "002-beta"), { recursive: true });
    await Deno.writeTextFile(join(dir, "README.md"), "x\n");
    await git("add", "-A");
    await git("commit", "-qm", "init");
    await git("checkout", "-qb", "002-beta");

    await Deno.writeTextFile(
      join(dir, ".specnaut", "feature.json"),
      JSON.stringify({ feature_directory: featureDirectory, linked_issue: null }),
    );

    await fn(dir, await resolvePaths(dir));
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
}

Deno.test("feature paths: a drive-letter path is absolute, not relative to the repo root", async () => {
  await withRepo("C:\\Users\\x\\proj\\.specnaut\\specs\\002-beta", (dir, r) => {
    assert(
      !r.stdout.includes(`${dir}/C:`) && !r.stdout.includes(`${dir}\\C:`),
      `the repo root was prepended to a drive-letter path:\n${r.stdout}${r.stderr}`,
    );
    assertStringIncludes(r.stdout, "C:/Users/x/proj/.specnaut/specs/002-beta");
  });
});

Deno.test("feature paths: a drive-letter path keeps a usable basename", async () => {
  // This is what the contradiction guard compares against the branch. With the
  // backslashes left in place `basename` returns the entire string, the guard
  // fires on a feature.json that agrees with the branch perfectly, and every
  // caller is refused on Windows for a contradiction that does not exist.
  await withRepo("C:\\Users\\x\\proj\\.specnaut\\specs\\002-beta", (_dir, r) => {
    assert(
      r.code === 0,
      `a feature.json naming the current branch must resolve, got exit ${r.code}:\n${r.stderr}`,
    );
    assertStringIncludes(r.stdout, "IMPL_PLAN=C:/Users/x/proj/.specnaut/specs/002-beta/plan.md");
  });
});

Deno.test("feature paths: forward-slash drive paths resolve the same way", async () => {
  await withRepo("C:/Users/x/proj/.specnaut/specs/002-beta", (dir, r) => {
    assert(!r.stdout.includes(`${dir}/C:`), `the repo root was prepended:\n${r.stdout}`);
    assertStringIncludes(r.stdout, "C:/Users/x/proj/.specnaut/specs/002-beta");
  });
});

Deno.test("feature paths: a relative path is still resolved under the repo root", async () => {
  // The rule the fix must not break: a relative `feature_directory` is the
  // documented shape, and it has to keep landing inside the project.
  await withRepo(".specnaut/specs/002-beta", (_dir, r) => {
    assert(r.code === 0, `expected success, got exit ${r.code}:\n${r.stderr}`);
    assertStringIncludes(r.stdout, "/.specnaut/specs/002-beta");
    assert(
      !r.stdout.includes("FEATURE_DIR=.specnaut"),
      `a relative path was emitted unresolved:\n${r.stdout}`,
    );
  });
});

Deno.test("feature paths: a POSIX path containing a backslash is left alone", async () => {
  // A backslash is a legal filename character on POSIX. The separator rewrite
  // is scoped to drive-letter paths precisely so it cannot corrupt one.
  await withRepo("/tmp/a\\b/002-beta", (_dir, r) => {
    assertStringIncludes(r.stdout, "a\\\\b");
  });
});
