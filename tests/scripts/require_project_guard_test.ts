// The `require_project` guard on the github backlog backend (#569).
//
// The defect it exists for: `.specnaut/backlog-config.yml` carries two
// independent addressing keys — `repo:` and `project_number:` — and the read
// paths (`list.sh`, `view.sh`) use only the first. So a wrong project number
// leaves every visible command working while every project WRITE is dead, and
// the failure only surfaces as a resolution error deep inside a mutation.
//
// These tests run the scripts from the FLATTENED runtime destination
// (`.specnaut/scripts/backlog/`), not from the source tree: `_config.sh`
// resolves `ROOT` as three levels up from its own directory, which is the
// project root from that destination and nowhere else. Running them in place
// would exit 2 on a missing config and pass for the wrong reason.
//
// `gh` is stubbed rather than mocked at the shell level, because the guard's
// contract is about what it does with `gh`'s exit codes.

import { assert, assertEquals } from "@std/assert";
import { fromFileUrl } from "@std/path";
import { join } from "@std/path";

const SRC = fromFileUrl(
  new URL("../../templates/core/skills/board/scripts/github/", import.meta.url),
);

/** A `gh` that authenticates, refuses to resolve any project, and lists 1 and 7. */
const GH_NON_RESOLVING = `#!/usr/bin/env bash
case "$1 $2" in
  "auth status") exit 0 ;;
  "project view") exit 1 ;;
  "project list") echo '[{"number":1},{"number":7}]'; exit 0 ;;
esac
exit 0
`;

/** A `gh` that resolves the project fine — the positive control. */
const GH_RESOLVING = `#!/usr/bin/env bash
case "$1 $2" in
  "auth status") exit 0 ;;
  "project view") echo '{"id":"PVT_x"}'; exit 0 ;;
  "project list") echo '[{"number":1},{"number":7}]'; exit 0 ;;
esac
exit 0
`;

interface Box {
  dir: string;
  binDir: string;
  script: (name: string) => string;
}

async function box(ghStub: string | null): Promise<Box> {
  const dir = await Deno.makeTempDir({ prefix: "require-project-" });
  const backlog = join(dir, ".specnaut/scripts/backlog");
  await Deno.mkdir(backlog, { recursive: true });
  for await (const entry of Deno.readDir(SRC)) {
    if (!entry.isFile) continue;
    await Deno.copyFile(join(SRC, entry.name), join(backlog, entry.name));
    await Deno.chmod(join(backlog, entry.name), 0o755);
  }
  await Deno.writeTextFile(
    join(dir, ".specnaut/backlog-config.yml"),
    'repo: "myorg/myproject"\nproject_number: "42"\n',
  );
  const binDir = join(dir, "bin");
  await Deno.mkdir(binDir);
  if (ghStub !== null) {
    await Deno.writeTextFile(join(binDir, "gh"), ghStub);
    await Deno.chmod(join(binDir, "gh"), 0o755);
  }
  return { dir, binDir, script: (n) => join(backlog, n) };
}

async function run(
  b: Box,
  script: string,
  args: string[],
): Promise<{ code: number; stderr: string }> {
  // PATH is the stub dir plus a minimal system prefix, so `gh` resolves to the
  // stub (or to nothing at all) while `sed`/`tr` stay available.
  const { code, stderr } = await new Deno.Command("bash", {
    args: [b.script(script), ...args],
    cwd: b.dir,
    env: { PATH: `${b.binDir}:/usr/bin:/bin` },
    clearEnv: true,
    stdout: "piped",
    stderr: "piped",
  }).output();
  return { code, stderr: new TextDecoder().decode(stderr) };
}

const GUARDED = ["move.sh", "add.sh", "set-field.sh", "detect-fields.sh"];

for (const script of GUARDED) {
  Deno.test(`require_project: ${script} exits 2 when the project does not resolve`, async () => {
    const b = await box(GH_NON_RESOLVING);
    try {
      const { code, stderr } = await run(b, script, ["1", "Done"]);
      assertEquals(
        code,
        2,
        `${script} must exit 2 on a non-resolving project, got ${code}. stderr: ${stderr}`,
      );
      assert(
        stderr.includes("project #42 does not resolve"),
        `${script} must name the configured number, got: ${JSON.stringify(stderr)}`,
      );
      assert(
        stderr.includes("myorg"),
        `${script} must name the owner it failed for, got: ${JSON.stringify(stderr)}`,
      );
      // The whole reason the guard prints anything: the message has to be
      // actionable without a second command.
      assert(
        stderr.includes("projects that exist for") && /\b1\b/.test(stderr) &&
          /\b7\b/.test(stderr),
        `${script} must list the project numbers that DO exist, got: ${JSON.stringify(stderr)}`,
      );
      assert(
        stderr.includes("backlog-config.yml"),
        `${script} must name the file to edit, got: ${JSON.stringify(stderr)}`,
      );
    } finally {
      await Deno.remove(b.dir, { recursive: true });
    }
  });
}

Deno.test("require_project: a resolving project is not the guard's business", async () => {
  // The positive control. Without it, a guard that exited 2 unconditionally
  // would satisfy every assertion above.
  const b = await box(GH_RESOLVING);
  try {
    const { stderr } = await run(b, "move.sh", ["1", "Done"]);
    assert(
      !stderr.includes("does not resolve"),
      `the guard must stay quiet on a resolving project, got: ${JSON.stringify(stderr)}`,
    );
  } finally {
    await Deno.remove(b.dir, { recursive: true });
  }
});

Deno.test("require_project: a missing gh is not a config error", async () => {
  // Skipping when the tool is absent is the guard's stated contract: the
  // callers report a missing `gh` themselves, and turning that into
  // "your project number is wrong" would send the user to fix the wrong file.
  const b = await box(null);
  try {
    const { stderr } = await run(b, "move.sh", ["1", "Done"]);
    assert(
      !stderr.includes("does not resolve"),
      `a missing gh must not become a config error, got: ${JSON.stringify(stderr)}`,
    );
  } finally {
    await Deno.remove(b.dir, { recursive: true });
  }
});

Deno.test("require_project: an unauthenticated gh is not a config error", async () => {
  const b = await box(`#!/usr/bin/env bash\n[ "$1 $2" = "auth status" ] && exit 1\nexit 1\n`);
  try {
    const { stderr } = await run(b, "move.sh", ["1", "Done"]);
    assert(
      !stderr.includes("does not resolve"),
      `an unauthenticated gh must not become a config error, got: ${JSON.stringify(stderr)}`,
    );
  } finally {
    await Deno.remove(b.dir, { recursive: true });
  }
});
