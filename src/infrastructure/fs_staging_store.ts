import { relative, resolve } from "@std/path";
import { walk } from "@std/fs/walk";
import type { StagingStore } from "../application/ports.ts";
import { assertSafeDestination, isInside } from "../domain/template.ts";
import { assertInsideProject, resolveProjectRoot } from "./fs_containment.ts";

const STAGING_REL = ".specnaut/upgrade-staging";

export class FsStagingStore implements StagingStore {
  async list(projectDir: string): Promise<string[]> {
    const stagingDir = resolve(projectDir, STAGING_REL);
    try {
      const stat = await Deno.stat(stagingDir);
      if (!stat.isDirectory) return [];
    } catch (err) {
      if (err instanceof Deno.errors.NotFound) return [];
      throw err;
    }
    const out: string[] = [];
    for await (const entry of walk(stagingDir, { includeDirs: false, includeFiles: true })) {
      out.push(relative(stagingDir, entry.path).replaceAll("\\", "/"));
    }
    return out;
  }

  async read(projectDir: string, relPath: string): Promise<string | null> {
    // `relPath` arrives from `ReconcilePathUseCase` as a LOCK KEY, and the lock
    // is committed and not covered by the scaffolded `.gitignore` — a cloned
    // repository supplies it (cli#574). `resolve()` also treats an absolute
    // `relPath` as the whole path, discarding the prefix entirely, so the
    // string check is doing real work here and not merely echoing a caller.
    assertSafeDestination(relPath);
    const full = resolve(projectDir, STAGING_REL, relPath);
    await assertInsideProject(await resolveProjectRoot(projectDir), full);
    try {
      return await Deno.readTextFile(full);
    } catch (err) {
      if (err instanceof Deno.errors.NotFound) return null;
      throw err;
    }
  }

  async delete(projectDir: string, relPath: string): Promise<void> {
    assertSafeDestination(relPath);
    const full = resolve(projectDir, STAGING_REL, relPath);
    await assertInsideProject(await resolveProjectRoot(projectDir), full);
    try {
      await Deno.remove(full);
    } catch (err) {
      if (err instanceof Deno.errors.NotFound) return;
      throw err;
    }
    // Best-effort: clean up now-empty parent dirs up to the staging root.
    let parent = resolve(full, "..");
    const stagingDir = resolve(projectDir, STAGING_REL);
    // `isInside`, not `startsWith` (cli#574). The prefix test is wrong on
    // Windows for the reason `pruneEmptyParents` records, and wrong on POSIX
    // too: a sibling directory named `upgrade-staging-old` starts with
    // `upgrade-staging` while being nowhere inside it.
    while (parent !== stagingDir && isInside(stagingDir, parent)) {
      try {
        const entries = [];
        for await (const _ of Deno.readDir(parent)) entries.push(_);
        if (entries.length > 0) break;
        await Deno.remove(parent);
      } catch {
        break;
      }
      parent = resolve(parent, "..");
    }
  }

  async cleanupIfEmpty(projectDir: string): Promise<boolean> {
    const stagingDir = resolve(projectDir, STAGING_REL);
    try {
      const entries = [];
      for await (const _ of Deno.readDir(stagingDir)) entries.push(_);
      if (entries.length > 0) return false;
      await Deno.remove(stagingDir);
      return true;
    } catch (err) {
      if (err instanceof Deno.errors.NotFound) return false;
      throw err;
    }
  }
}
