import { assert, assertEquals } from "@std/assert";
import { HARNESSES } from "../../src/cli/harnesses.ts";
import { KNOWN_HARNESSES, parseLock, serializeLock } from "../../src/domain/installed_lock.ts";

/**
 * Ties the three places a harness has to be known to one list.
 *
 * They drifted once, silently and in the worst direction: the CLI accepted
 * `--ai antigravity` and wrote `harness: antigravity` into `installed.lock`,
 * but `KnownHarness` did not include it, so the next `specnaut upgrade`
 * crashed on its own lock file with an unhandled `Unsupported harness` error.
 * Install succeeded, `check` reported all-clear, and the project was a dead
 * end — every symptom arrived long after the decision that caused it.
 */

Deno.test("every registered harness is a known harness", () => {
  const registered = HARNESSES.map((h) => h.key).sort();
  const known = [...KNOWN_HARNESSES].sort();
  assertEquals(
    registered,
    known,
    "a harness the CLI can install but the lock cannot record is installable and not upgradable",
  );
});

Deno.test("every registered harness round-trips through the lock", () => {
  for (const h of HARNESSES) {
    const lock = serializeLock({
      version: 2,
      harness: h.key as (typeof KNOWN_HARNESSES)[number],
      backlogBackend: "local",
      versionScheme: "semver",
      specBackend: "local",
      templatesVersion: "0.0.0",
      entries: new Map(),
    });
    // The failure this guards is a throw, not a wrong value.
    const parsed = parseLock(lock);
    assertEquals(parsed.harness, h.key, `${h.key} did not survive the lock round-trip`);
  }
});

Deno.test("no harness key is registered twice", () => {
  const keys = HARNESSES.map((h) => h.key);
  assertEquals(keys.length, new Set(keys).size, "duplicate harness key in the registry");
  assert(keys.length > 0);
});
