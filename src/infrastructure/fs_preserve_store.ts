import { dirname, join } from "@std/path";
import {
  diagnosePreserveConfig,
  EMPTY_PRESERVE_CONFIG,
  parsePreserveConfig,
  type PreserveConfig,
  type PreserveManifestDiagnosis,
  serializePreserveConfig,
} from "../domain/preserve_config.ts";
import type { PreserveStore } from "../application/ports.ts";

/**
 * Reads / writes the project-level preserve manifest at
 * `.specnaut/preserve.yml`. Mirrors `FsLockStore`: an absent file reads as
 * `EMPTY_PRESERVE_CONFIG`, and a malformed file degrades to empty via the
 * pure `parsePreserveConfig` (which never throws) — a broken manifest must
 * surface a warning at the handler, never abort init/upgrade — see
 * {@link FsPreserveStore.diagnose}, which is what the handler warns from.
 */
export class FsPreserveStore implements PreserveStore {
  preservePath(projectDir: string): string {
    return join(projectDir, ".specnaut/preserve.yml");
  }

  async read(projectDir: string): Promise<PreserveConfig> {
    const path = this.preservePath(projectDir);
    try {
      const raw = await Deno.readTextFile(path);
      return parsePreserveConfig(raw);
    } catch (err) {
      if (err instanceof Deno.errors.NotFound) return EMPTY_PRESERVE_CONFIG;
      throw err;
    }
  }

  async diagnose(projectDir: string): Promise<PreserveManifestDiagnosis | null> {
    try {
      return diagnosePreserveConfig(await Deno.readTextFile(this.preservePath(projectDir)));
    } catch (err) {
      // Absent is the normal case and must stay silent — it is not a fault.
      if (err instanceof Deno.errors.NotFound) return null;
      throw err;
    }
  }

  async write(projectDir: string, cfg: PreserveConfig): Promise<void> {
    const path = this.preservePath(projectDir);
    await Deno.mkdir(dirname(path), { recursive: true });
    await Deno.writeTextFile(path, serializePreserveConfig(cfg));
  }
}
