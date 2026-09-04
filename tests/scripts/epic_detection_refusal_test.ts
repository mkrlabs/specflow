import { assert, assertStringIncludes } from "@std/assert";
import { fromFileUrl, join } from "@std/path";

/**
 * `create-new-feature.sh` asks `cascade-check.sh` whether a linked issue is an
 * epic with open children, and branched on `-eq 11` alone. Everything else —
 * including a gate that REFUSED to answer — fell into the else and printed
 * "no parent and no open children", a claim the run has no evidence for. The
 * branch is then created standalone when the issue may well be an epic.
 *
 * Before #583 a refused read exited 0, so the outcome was the same and the
 * caller could not have known. It can now: exit 3 means "I could not read the
 * children". A caller able to tell a refusal from an answer, and not telling,
 * is the defect the rest of this release removes — one call away from where it
 * was fixed.
 *
 * The three states are asserted against a stubbed `cascade-check.sh`, and both
 * implementations run the same scenarios: the PowerShell twin carried the same
 * `-eq 11` test, and a fix verified on one and reasoned about on the other is
 * a mistake this repository has already paid for once.
 */

const CORE = fromFileUrl(new URL("../../templates/core/specnaut/scripts/", import.meta.url));

type Runner = { name: string; script: string; run: (dir: string) => Promise<string> };

async function hasPwsh(): Promise<boolean> {
  try {
    const { code } = await new Deno.Command("pwsh", {
      args: ["-NoProfile", "-Command", "exit 0"],
      stdout: "null",
      stderr: "null",
    }).output();
    return code === 0;
  } catch {
    return false;
  }
}
const PWSH_AVAILABLE = await hasPwsh();

const RUNNERS: Runner[] = [{
  name: "bash",
  script: join(CORE, "bash", "create-new-feature.sh"),
  run: async (dir) => {
    const { stdout, stderr } = await new Deno.Command("bash", {
      args: [join(CORE, "bash", "create-new-feature.sh"), "--json", "--issue", "42", "a feature"],
      cwd: dir,
      stdout: "piped",
      stderr: "piped",
    }).output();
    return new TextDecoder().decode(stdout) + new TextDecoder().decode(stderr);
  },
}];
if (PWSH_AVAILABLE) {
  RUNNERS.push({
    name: "pwsh",
    script: join(CORE, "powershell", "create-new-feature.ps1"),
    run: async (dir) => {
      const { stdout, stderr } = await new Deno.Command("pwsh", {
        args: [
          "-NoProfile",
          "-File",
          join(CORE, "powershell", "create-new-feature.ps1"),
          "-Json",
          "-Issue",
          "42",
          "a feature",
        ],
        cwd: dir,
        stdout: "piped",
        stderr: "piped",
      }).output();
      return new TextDecoder().decode(stdout) + new TextDecoder().decode(stderr);
    },
  });
}

Deno.test("the PowerShell arm actually runs where it must", () => {
  if (Deno.env.get("CI") === "true") {
    assert(PWSH_AVAILABLE, "pwsh is absent on CI — the PowerShell scenarios did not run");
  }
});

/**
 * A project whose backlog helpers are stubs: `parent-of.sh` answers 10 ("no
 * parent"), which is the only path that consults the cascade gate, and
 * `cascade-check.sh` exits with whatever the scenario needs.
 */
async function withStubbedBacklog(
  cascadeExit: number,
  cascadeSays: string,
  fn: (out: string) => void | Promise<void>,
  runner: Runner,
): Promise<void> {
  const dir = await Deno.makeTempDir({ prefix: "epic-refusal-" });
  try {
    const git = async (...args: string[]) => {
      await new Deno.Command("git", { args, cwd: dir, stdout: "null", stderr: "null" }).output();
    };
    await git("init", "-q");
    await git("config", "user.email", "t@example.invalid");
    await git("config", "user.name", "t");

    const backlog = join(dir, ".specnaut", "scripts", "backlog");
    await Deno.mkdir(backlog, { recursive: true });
    await Deno.mkdir(join(dir, ".specnaut", "templates"), { recursive: true });
    await Deno.writeTextFile(
      join(backlog, "parent-of.sh"),
      "#!/usr/bin/env bash\nexit 10\n",
    );
    await Deno.writeTextFile(
      join(backlog, "cascade-check.sh"),
      `#!/usr/bin/env bash\n${
        cascadeSays ? `echo ${JSON.stringify(cascadeSays)} >&2` : ":"
      }\nexit ${cascadeExit}\n`,
    );
    await Deno.chmod(join(backlog, "parent-of.sh"), 0o755);
    await Deno.chmod(join(backlog, "cascade-check.sh"), 0o755);

    await Deno.writeTextFile(join(dir, "README.md"), "x\n");
    await git("add", "-A");
    await git("commit", "-qm", "init");

    await fn(await runner.run(dir));
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
}

for (const runner of RUNNERS) {
  Deno.test(`epic detection [${runner.name}]: a refusal is not "no open children"`, async () => {
    // Exit 3 — the gate could not read the sub-issues. Asserting the issue is
    // standalone here is a claim about data nobody obtained.
    await withStubbedBacklog(3, "could not read the children of #42", (out) => {
      assertStringIncludes(out, "could not answer");
      assert(
        !out.includes("has no parent and no open children"),
        `a refusal was reported as a clean standalone verdict:\n${out}`,
      );
      // And the reader is told what it costs, not just that something failed.
      assertStringIncludes(out, "epic detection did NOT run");
    }, runner);
  });
}

for (const runner of RUNNERS) {
  Deno.test(`epic detection [${runner.name}]: exit 0 still means standalone`, async () => {
    // The other half. A caller that called everything a refusal would satisfy
    // the assertion above and break every ordinary run.
    await withStubbedBacklog(0, "", (out) => {
      assertStringIncludes(out, "has no parent and no open children");
      assert(!out.includes("could not answer"), out);
    }, runner);
  });
}

for (const runner of RUNNERS) {
  Deno.test(`epic detection [${runner.name}]: exit 11 still means epic`, async () => {
    await withStubbedBacklog(11, "", (out) => {
      assertStringIncludes(out, "is an epic with open children");
      assert(!out.includes("could not answer"), out);
    }, runner);
  });
}

Deno.test("epic detection: neither implementation tests exit 11 alone", async () => {
  // The shape, not just the behaviour. `-eq 11` with a bare else is what
  // folded a refusal into a verdict, and it reads as correct.
  for (const runner of RUNNERS) {
    const src = (await Deno.readTextFile(runner.script))
      .split("\n").filter((l) => !/^\s*(#|\/\/)/.test(l)).join("\n");
    assert(
      /(case "\$_c_rc"|elseif \(\$cascadeRc -eq 0\))/.test(src),
      `${runner.name}: the cascade result is still decided by a single equality`,
    );
  }
});
