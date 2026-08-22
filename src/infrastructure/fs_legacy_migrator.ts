// Legacy config-dir migration for the specflow→specnaut rebrand.
//
// Pre-rebrand projects keep their managed tree under `.specflow/`; the rebrand
// moves it to `.specnaut/`. `init` and `upgrade` call this once, up front, so an
// existing project transparently lands on the new layout. Idempotent, and it
// REFUSES to act when both dirs exist — it never merges or overwrites.

import { join } from "@std/path";

export type LegacyMigrationResult =
  | { kind: "migrated" }
  | { kind: "already-current" }
  | { kind: "conflict" }
  | { kind: "nothing-to-migrate" };

async function isDir(p: string): Promise<boolean> {
  try {
    return (await Deno.stat(p)).isDirectory;
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) return false;
    throw e;
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
  const hasCurrent = await isDir(join(projectDir, ".specnaut"));
  const hasLegacy = await isDir(join(projectDir, ".specflow"));
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
  const state = await inspectLegacyConfigDir(projectDir);
  if (state === "both") return { kind: "conflict" };
  if (state === "current-only") return { kind: "already-current" };
  if (state === "neither") return { kind: "nothing-to-migrate" };
  await Deno.rename(join(projectDir, ".specflow"), join(projectDir, ".specnaut"));
  return { kind: "migrated" };
}
