import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { exists } from "@std/fs/exists";
import { fromFileUrl, join } from "@std/path";
import { sha256Hex } from "../../src/domain/sha256.ts";

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

/**
 * #517 — a stale lock entry must not disarm `skipIfExists`.
 *
 * The guard that protects a user-owned file lived inside the `lockSha ===
 * undefined` branch of the plan, so it only ever held while the file had NO
 * lock entry. Any binary that once tracked the dest — before it was declared
 * `skipIfExists`, or during a partial upgrade that got a single file in —
 * left an entry behind, and from then on the guard never fired for that
 * project again: the file fell through to `auto-update` and was replaced
 * wholesale by a plain `upgrade`. No `--force`, no "preserved" line, no
 * warning of any kind.
 *
 * The protection therefore held for fresh installs and failed for exactly the
 * long-lived ones whose AGENTS.md had accumulated content worth protecting.
 */

/** Splice an entry into installed.lock, mimicking what an older binary left. */
async function injectLockEntry(dir: string, dest: string, sha: string) {
  const lockPath = join(dir, ".specnaut/installed.lock");
  const lock = await Deno.readTextFile(lockPath);
  const marker = "entries:\n";
  const at = lock.indexOf(marker);
  assert(at !== -1, "lock must have an entries: block");
  const entry = `  ${dest}:\n    sha256: ${sha}\n` +
    `    installed_at: '2026-05-22T13:29:58.683Z'\n    templates_version: 1.11.0\n`;
  await Deno.writeTextFile(
    lockPath,
    lock.slice(0, at + marker.length) + entry + lock.slice(at + marker.length),
  );
}

Deno.test("a stale lock entry does not make a user-owned AGENTS.md writable", async () => {
  const dir = await Deno.makeTempDir({ prefix: "specnaut-stale-entry-" });
  try {
    await Deno.writeTextFile(join(dir, "AGENTS.md"), OWN);
    assertEquals((await runSpecnaut(INIT, dir)).code, 0);

    // The file is theirs and matches its (wrongly recorded) sha exactly —
    // the vanilla case, which used to plan an auto-update.
    await injectLockEntry(dir, "AGENTS.md", await sha256Hex(OWN));

    assertEquals((await runSpecnaut(["upgrade"], dir)).code, 0);

    assertStringIncludes(
      await Deno.readTextFile(join(dir, "AGENTS.md")),
      "We rebase, never merge commits.",
      "their house rules must survive an upgrade that believed it owned the file",
    );
    assert(
      !(await Deno.readTextFile(join(dir, ".specnaut/installed.lock"))).includes("AGENTS.md"),
      "the stale entry must be dropped, so the project heals without being told",
    );
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("--force does not overwrite a user-owned AGENTS.md either", async () => {
  const dir = await Deno.makeTempDir({ prefix: "specnaut-stale-force-" });
  try {
    await Deno.writeTextFile(join(dir, "AGENTS.md"), OWN);
    assertEquals((await runSpecnaut(INIT, dir)).code, 0);
    await injectLockEntry(dir, "AGENTS.md", "a-sha-from-an-older-binary");

    assertEquals((await runSpecnaut(["upgrade", "--force"], dir)).code, 0);

    assertStringIncludes(
      await Deno.readTextFile(join(dir, "AGENTS.md")),
      "We rebase, never merge commits.",
      "--force overwrites files specnaut owns; this one is the user's",
    );
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("a missing AGENTS.md is still created — the guard skips, it does not freeze", async () => {
  const dir = await Deno.makeTempDir({ prefix: "specnaut-absent-agents-" });
  try {
    assertEquals((await runSpecnaut(INIT, dir)).code, 0);
    await Deno.remove(join(dir, "AGENTS.md"));
    assertEquals((await runSpecnaut(["upgrade"], dir)).code, 0);
    assert(
      await exists(join(dir, "AGENTS.md")),
      "skipIfExists means 'skip IF it exists' — an absent one is still written",
    );
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});
