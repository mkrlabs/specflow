import { assert, assertEquals } from "@std/assert";
import { fromFileUrl } from "@std/path";
import { parse } from "@std/yaml";

/**
 * This repository is public. It holds no Actions secrets, and must not.
 *
 * Three used to live here, and all three pointed outward: write access to the
 * Homebrew tap, to the marketplace catalog, and to a plugin fork. A repository
 * publishing a release does not need write access to everything that packages
 * or lists it — the direction was backwards, and the credentials enabling it
 * sat in a repository anyone can read.
 *
 * The channels now PULL: each reads this repository's public Releases API,
 * which needs no authentication, and commits to itself with its own run-scoped
 * token. Neither side holds a credential for the other.
 *
 * A secret is easy to re-add and hard to notice — a `secrets.X` reference is
 * one line in a workflow, and nothing about it looks wrong. This test is what
 * notices.
 */

const ROOT = fromFileUrl(new URL("../../", import.meta.url));
const WORKFLOWS = `${ROOT}.github/workflows`;

async function workflowFiles(): Promise<string[]> {
  const out: string[] = [];
  for await (const e of Deno.readDir(WORKFLOWS)) {
    if (e.isFile && (e.name.endsWith(".yml") || e.name.endsWith(".yaml"))) out.push(e.name);
  }
  return out.sort();
}

Deno.test("no workflow reads a repository secret", async () => {
  const offenders: string[] = [];
  for (const name of await workflowFiles()) {
    const raw = await Deno.readTextFile(`${WORKFLOWS}/${name}`);
    // `secrets.GITHUB_TOKEN` is not a stored secret — it is the run-scoped
    // token GitHub mints for the job, and it expires with it.
    const refs = [...raw.matchAll(/secrets\.([A-Za-z_][A-Za-z0-9_]*)/g)]
      .map((m) => m[1])
      .filter((n) => n !== "GITHUB_TOKEN");
    for (const r of new Set(refs)) offenders.push(`${name}: secrets.${r}`);
  }
  assertEquals(
    offenders,
    [],
    "this repository is public and stores no secrets — invert the direction " +
      "(let the target pull from the public Releases API) instead of adding one",
  );
});

Deno.test("the release workflow pushes to no other repository", async () => {
  const raw = await Deno.readTextFile(`${WORKFLOWS}/release.yml`);
  const wf = parse(raw) as { jobs: Record<string, { steps?: { run?: string }[] }> };
  const runs = Object.values(wf.jobs)
    .flatMap((j) => j.steps ?? [])
    .map((s) => s.run ?? "")
    .join("\n");

  // The shapes that carried the old push path. `gh release`/`gh api` reads are
  // fine; cloning or pushing another repo from here is what needed a credential.
  for (const forbidden of ["gh repo clone", "git push", "sync-to-", "bump-tap-"]) {
    assert(
      !runs.includes(forbidden),
      `release.yml runs '${forbidden}' — publishing outward from a public repo ` +
        `requires a stored credential, which is the thing this removed`,
    );
  }
});

Deno.test("the release README does not tell anyone to provision one", async () => {
  const readme = await Deno.readTextFile(`${ROOT}.specnaut/release/README.md`);
  for (const dead of ["HOMEBREW_TAP_TOKEN", "MARKETPLACE_SYNC_TOKEN", "CODEX_SYNC_TOKEN"]) {
    const idx = readme.indexOf(dead);
    if (idx === -1) continue;
    // Naming a retired secret is fine — required, even, so nobody re-adds it.
    // Naming it as something to create is not.
    const context = readme.slice(Math.max(0, idx - 300), idx + 300);
    assert(
      /deleted|removed|do not re-provision|must not/i.test(context),
      `${dead} is named in the release README without saying it is retired`,
    );
  }
});
