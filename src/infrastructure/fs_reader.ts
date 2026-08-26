import { join } from "@std/path";
import type { FsReader } from "../application/ports.ts";
import { assertSafeDestination } from "../domain/template.ts";
import { assertInsideProject, resolveProjectRoot } from "./fs_containment.ts";

export class DenoFsReader implements FsReader {
  /**
   * Reads a project-relative file, or `null` when it is not there.
   *
   * Guarded on both axes since cli#574, because before that it was guarded on
   * neither — three lines with no validator of any kind, and the only `FsReader`
   * implementation. What made that matter is where the bytes go: a bundle
   * destination symlinked to a file outside the project made `specnaut diff`
   * render that file's contents as a unified diff on stdout. Measured with the
   * real binary. The severity argument used for the write escapes — a hostile
   * repository can already run code — does not cover this one, because this
   * CLI's stdout is routinely read into a coding agent's context and into CI
   * logs, so "prints to the terminal" is not a local outcome.
   *
   * `rel` is not always a bundle destination this binary wrote: `upgrade` reads
   * every key in `.specnaut/installed.lock`, and that file is committed and not
   * covered by the scaffolded `.gitignore`, so a cloned repository supplies it.
   * The string check is therefore not redundant with the callers.
   */
  async readText(projectDir: string, rel: string): Promise<string | null> {
    assertSafeDestination(rel);
    const abs = join(projectDir, rel);
    await assertInsideProject(await resolveProjectRoot(projectDir), abs);
    try {
      return await Deno.readTextFile(abs);
    } catch (err) {
      if (err instanceof Deno.errors.NotFound) return null;
      throw err;
    }
  }
}
