import { assert, assertStringIncludes } from "@std/assert";
import { fromFileUrl, join } from "@std/path";

const MAIN = fromFileUrl(new URL("../../../src/main.ts", import.meta.url));

async function specnaut(args: string[], cwd: string) {
  const { code, stdout, stderr } = await new Deno.Command("deno", {
    args: ["run", "-A", MAIN, ...args],
    cwd,
    stdout: "piped",
    stderr: "piped",
  }).output();
  return {
    code,
    out: new TextDecoder().decode(stdout) + new TextDecoder().decode(stderr),
  };
}

async function sandbox(): Promise<string> {
  const dir = await Deno.makeTempDir({ prefix: "specnaut-stale-" });
  await new Deno.Command("git", { args: ["init", "-q", "."], cwd: dir }).output();
  await Deno.writeTextFile(join(dir, "package.json"), "{}");
  const r = await specnaut(["init", "--here", "--ai", "claude", "--backlog", "local"], dir);
  assert(r.code === 0, `init failed:\n${r.out}`);
  return dir;
}

/**
 * Puts one tracked file into the state the report exists for: diverged from its
 * recorded baseline, and behind an upstream that has since moved.
 *
 * Both halves are forged deliberately. Editing the file alone only makes it
 * "customized" — which is correct and unremarkable. Ageing the lock entry alone
 * changes nothing, because a fresh install's recorded SHA still matches the
 * bundle. It takes both for an update to have been published and missed, and
 * that pairing is exactly what the report has to detect.
 *
 * @returns the doctored path.
 */
async function freeze(dir: string, opts: { upstreamMoved: boolean }): Promise<string> {
  const lockPath = join(dir, ".specnaut", "installed.lock");
  const lock = await Deno.readTextFile(lockPath);

  const target = [...lock.matchAll(/^ {2}(\.claude\/agents\/[^\s:]+\.md):$/gm)]
    .map((m) => m[1])[0];
  assert(target, "expected the lock to track at least one agent file");

  // Diverge on disk, or the plan short-circuits on `diskSha === newSha`.
  const file = join(dir, target);
  await Deno.writeTextFile(file, (await Deno.readTextFile(file)) + "\n<!-- local note -->\n");

  const block = new RegExp(
    `(^ {2}${target.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}:\\n` +
      `    sha256: )([0-9a-f]+)(\\n    installed_at: '[^']+'\\n    templates_version: )(\\S+)`,
    "m",
  );
  assert(block.test(lock), `could not locate the lock entry for ${target}`);
  await Deno.writeTextFile(
    lockPath,
    lock.replace(
      block,
      // A recorded SHA that matches neither disk nor bundle is what "upstream
      // published something since this file was last written" looks like.
      // Hex with letters, not all-digits: YAML reads an unquoted `000…0` as the
      // integer 0, and the lock parser rejects it for not being a string.
      (_m, head, sha, mid) => `${head}${opts.upstreamMoved ? "f".repeat(64) : sha}${mid}1.12.0`,
    ),
  );
  return target;
}

Deno.test("a file that missed a published update is named, dated, and made actionable", async () => {
  const dir = await sandbox();
  try {
    const target = await freeze(dir, { upstreamMoved: true });
    const { out } = await specnaut(["upgrade", "--dry-run"], dir);

    assertStringIncludes(out, "customized, and behind");
    assertStringIncludes(out, target);
    // The version that last wrote it — the whole point of reading the frozen
    // field rather than repairing it.
    assertStringIncludes(out, "last written by v1.12.0");
    // ...and the fact that this is not a one-off skip.
    assertStringIncludes(out, "every upgrade since has skipped it");
    // A command the reader can paste, for this path, not a generic trailer.
    assertStringIncludes(out, `specnaut reconcile ${target} --accept-upstream`);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("the run does not present as an unqualified success", async () => {
  const dir = await sandbox();
  try {
    await freeze(dir, { upstreamMoved: true });
    const { out } = await specnaut(["upgrade"], dir);
    // The green tick is the line people actually read. It stays — but it can no
    // longer be the last word when an update was published and left unapplied.
    assertStringIncludes(out, "✓ upgraded to templates");
    assertStringIncludes(out, "did not receive");
    assertStringIncludes(out, "Nothing will deliver");
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("a customization with nothing published against it stays quiet", async () => {
  const dir = await sandbox();
  try {
    const target = await freeze(dir, { upstreamMoved: false });
    const { out } = await specnaut(["upgrade", "--dry-run"], dir);

    // Still preserved, still reported — just not as a missed update, because
    // none was missed. Warning here would fire on every long-lived local edit
    // and teach the reader to skip the section that matters.
    assertStringIncludes(out, "customized locally (not touched)");
    assertStringIncludes(out, target);
    assert(
      !out.includes("customized, and behind"),
      "upstream never moved for this path; there is nothing behind to report",
    );
    assert(
      !out.includes("did not receive"),
      "the outcome line must stay clean when nothing was missed",
    );
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("files that froze together are reported together", async () => {
  // Files rarely drift one at a time. A repo-wide rename or a bulk sed strands
  // a whole set at the same version on the same day, and seeing them share a
  // freeze point names the event that caused it. A flat list repeating the same
  // date on every line hides exactly that.
  const dir = await sandbox();
  try {
    const lockPath = join(dir, ".specnaut", "installed.lock");
    let lock = await Deno.readTextFile(lockPath);
    const targets = [...lock.matchAll(/^ {2}(\.claude\/agents\/[^\s:]+\.md):$/gm)]
      .map((m) => m[1]).slice(0, 3);
    assert(targets.length === 3, "need three tracked agent files");

    // Two froze in one event, the third in a later one.
    const freezes: [string, string][] = [
      ["1.12.0", "2026-05-26"],
      ["1.12.0", "2026-05-26"],
      ["1.18.2", "2026-07-02"],
    ];
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      const f = join(dir, t);
      await Deno.writeTextFile(f, (await Deno.readTextFile(f)) + "\n<!-- local -->\n");
      const [version, day] = freezes[i];
      lock = lock.replace(
        new RegExp(
          `(^ {2}${t.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}:\\n    sha256: )[0-9a-f]+` +
            `(\\n    installed_at: ')[^']+('\\n    templates_version: )\\S+`,
          "m",
        ),
        (_m, head, mid, tail) => `${head}${"f".repeat(64)}${mid}${day}T09:00:00Z${tail}${version}`,
      );
    }
    await Deno.writeTextFile(lockPath, lock);

    const { out } = await specnaut(["upgrade", "--dry-run"], dir);
    assertStringIncludes(out, "last written by v1.12.0 on 2026-05-26");
    assertStringIncludes(out, "skipped these 2");
    assertStringIncludes(out, "last written by v1.18.2 on 2026-07-02");
    // Singular for the lone file — a report that says "these 1" reads as a bug
    // and costs the reader trust in everything around it.
    assertStringIncludes(out, "skipped it:");
    assertStringIncludes(out, "All 3 at once: specnaut upgrade --reset-baseline");
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});
