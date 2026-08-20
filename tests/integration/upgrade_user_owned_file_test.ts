import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { exists } from "@std/fs/exists";
import { fromFileUrl, join } from "@std/path";

const MAIN = fromFileUrl(new URL("../../src/main.ts", import.meta.url));

/**
 * #466 — an upgrade must not ADOPT a user-owned `skipIfExists` file.
 *
 * Found while building the managed-section path. `init` deliberately leaves a
 * pre-existing `AGENTS.md` out of `installed.lock` (#119/#163) — it is the
 * user's, not ours. But the lock rewrite at the end of `upgrade` walked every
 * bundle path and recorded the BUNDLE's sha for anything missing an entry,
 * including a file it had just decided not to write.
 *
 * The consequence arrived one run later: their file now disagreed with "its"
 * lock sha, so every subsequent upgrade reported it as customized and printed a
 * full diff — and `--force`, whose whole job is to overwrite customized files,
 * would replace their working agreements with the template.
 */

async function runSpecnaut(args: string[], cwd: string) {
  const { code, stdout, stderr } = await new Deno.Command("deno", {
    args: ["run", "--allow-read", "--allow-write", "--allow-run", "--allow-env", MAIN, ...args],
    cwd,
    stdout: "piped",
    stderr: "piped",
  }).output();
  return {
    code,
    stdout: new TextDecoder().decode(stdout),
    stderr: new TextDecoder().decode(stderr),
  };
}

const INIT = ["init", "--here", "--no-git", "--ai", "claude", "--backlog", "local"];
const OWN = "# AGENTS.md\n\n## House rules\n\nWe rebase, never merge commits.\n";

Deno.test("upgrade never records a pre-existing AGENTS.md in the lock", async () => {
  const dir = await Deno.makeTempDir({ prefix: "specnaut-user-owned-" });
  try {
    await Deno.writeTextFile(join(dir, "AGENTS.md"), OWN);
    assertEquals((await runSpecnaut(INIT, dir)).code, 0);

    const lockPath = join(dir, ".specnaut/installed.lock");
    assert(
      !(await Deno.readTextFile(lockPath)).includes("AGENTS.md"),
      "init must leave a pre-existing AGENTS.md out of the lock",
    );

    assertEquals((await runSpecnaut(["upgrade"], dir)).code, 0);
    assert(
      !(await Deno.readTextFile(lockPath)).includes("AGENTS.md"),
      "upgrade must not adopt it either — the lock is the list of files we own",
    );
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("upgrade --force does not overwrite a user-owned AGENTS.md", async () => {
  const dir = await Deno.makeTempDir({ prefix: "specnaut-user-owned-force-" });
  try {
    const agents = join(dir, "AGENTS.md");
    await Deno.writeTextFile(agents, OWN);
    assertEquals((await runSpecnaut(INIT, dir)).code, 0);
    assertEquals((await runSpecnaut(["upgrade"], dir)).code, 0);

    const forced = await runSpecnaut(["upgrade", "--force"], dir);
    assertEquals(forced.code, 0, `forced upgrade failed: ${forced.stderr}`);

    const after = await Deno.readTextFile(agents);
    assert(
      after.startsWith(OWN.trimEnd()),
      "--force must not replace working agreements it never owned",
    );
    assertStringIncludes(after, "We rebase, never merge commits.");
    assertEquals(
      await exists(`${agents}.specnaut.bak`),
      false,
      "a backup here would mean the file was overwritten",
    );
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});
