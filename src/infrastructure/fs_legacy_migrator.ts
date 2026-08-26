// Legacy config-dir migration for the specflow→specnaut rebrand.
//
// Pre-rebrand projects keep their managed tree under `.specflow/`; the rebrand
// moves it to `.specnaut/`. `init` and `upgrade` call this once, up front, so an
// existing project transparently lands on the new layout. Idempotent, and it
// REFUSES to act when both dirs exist — it never merges or overwrites.

import { join } from "@std/path";
import { assertInsideProject, resolveProjectRoot } from "./fs_containment.ts";

export type LegacyMigrationResult =
  | { kind: "migrated" }
  | { kind: "already-current" }
  | { kind: "conflict" }
  | { kind: "symlinked"; path: string }
  | { kind: "nothing-to-migrate" };

// `lstat`, not `stat` (cli#574). `stat` follows a symlink, so a link pointing
// at any directory reported `isDirectory: true` — and `Deno.rename` then moved
// the LINK, leaving `.specnaut/` as a symlink pointing wherever the link
// pointed. A repository could ship one file named `.specflow` and every write
// for the rest of the run went outside the project: the lock, the marker, the
// preserve list, the spec cache and its recursive delete. Reproduced end to
// end before this was changed — the migrator reported `migrated` and the
// result was an out-of-project `.specnaut`.
//
// This runs FIRST in both `init` and `upgrade`, before anything else, which is
// what made it the cheapest possible foothold.
async function isRealDir(p: string): Promise<boolean> {
  try {
    // `stat`, which FOLLOWS a link — deliberately, and not a revert. The escape
    // is refused by `escapesProject` before this runs, so what reaches here is
    // either a real directory or a link that stays inside the project, and a
    // project that linked its config dir inside itself should keep working
    // exactly as it did. Making this `lstat` refused nothing extra; it only
    // made an in-project link INVISIBLE to the state machine, which reported
    // `nothing-to-migrate` for a project that plainly had a config dir.
    return (await Deno.stat(p)).isDirectory;
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) return false;
    throw e;
  }
}

/**
 * True when the path is a symlink that leaves the project.
 *
 * NOT "is a symlink". The first version refused any link at either name, which
 * also refused `.specnaut -> config/specnaut` entirely inside the project — a
 * layout that containment itself allows, and a blanket symlink refusal is named
 * in this feature's decision table as the thing that must not happen. Over-
 * refusing is a real cost: it breaks a project that did something reasonable,
 * and the user has no way to tell it from a bug.
 */
async function escapesProject(projectDir: string, p: string): Promise<boolean> {
  let info: Deno.FileInfo;
  try {
    info = await Deno.lstat(p);
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) return false;
    throw e;
  }
  if (!info.isSymlink) return false;
  try {
    await assertInsideProject(await resolveProjectRoot(projectDir), p);
    return false;
  } catch {
    return true;
  }
}

/** Which of the two config dirs are present. Read-only. */
export type LegacyDirState = "legacy-only" | "current-only" | "both" | "neither";

/**
 * Probe the two config dirs WITHOUT touching either. Callers that must not
 * write — `upgrade --dry-run` above all — ask this instead of calling the
 * migrator and reading its result, which is a rename that already happened.
 */
export async function inspectLegacyConfigDir(projectDir: string): Promise<LegacyDirState> {
  const hasCurrent = await isRealDir(join(projectDir, ".specnaut"));
  const hasLegacy = await isRealDir(join(projectDir, ".specflow"));
  if (hasCurrent && hasLegacy) return "both";
  if (hasCurrent) return "current-only";
  if (hasLegacy) return "legacy-only";
  return "neither";
}

/**
 * Rename a legacy `.specflow/` project dir to `.specnaut/`:
 *  - `migrated`           — renamed legacy → current
 *  - `already-current`    — only `.specnaut/` exists (no-op)
 *  - `conflict`           — BOTH exist; caller must resolve (never overwrite)
 *  - `nothing-to-migrate` — neither exists (fresh project)
 */
export async function migrateLegacyConfigDir(
  projectDir: string,
): Promise<LegacyMigrationResult> {
  // Refused, and NAMED, rather than quietly skipped. `lstat` above already
  // makes a symlinked `.specflow` invisible to the state machine, so this
  // branch changes no outcome — it changes what the user is told. A project
  // that deliberately links its config dir deserves to hear why nothing
  // happened; one that did not deserves to hear that something is wrong.
  for (const name of [".specflow", ".specnaut"]) {
    if (await escapesProject(projectDir, join(projectDir, name))) {
      return { kind: "symlinked", path: name };
    }
  }
  const state = await inspectLegacyConfigDir(projectDir);
  if (state === "both") return { kind: "conflict" };
  if (state === "current-only") return { kind: "already-current" };
  if (state === "neither") return { kind: "nothing-to-migrate" };
  await Deno.rename(join(projectDir, ".specflow"), join(projectDir, ".specnaut"));
  return { kind: "migrated" };
}
