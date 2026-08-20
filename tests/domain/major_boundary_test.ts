import { assertEquals } from "@std/assert";
import { crossesMajorBoundary } from "../../src/domain/major_boundary.ts";

/**
 * #481 — the pointer to `UPGRADING.md` must fire on a breaking upgrade and
 * stay quiet on every other one.
 *
 * Both halves are load-bearing. A pointer that never prints leaves the user
 * where they already were; a pointer on every patch bump trains them to skip
 * the line, so it is not there when it matters.
 */

Deno.test("crossing a major fires", () => {
  assertEquals(crossesMajorBoundary("1.21.0", "2.0.1"), true);
  assertEquals(crossesMajorBoundary("1.0.0", "3.0.0"), true);
  assertEquals(crossesMajorBoundary("v1.21.0", "v2.0.0"), true, "a leading v must not defeat it");
});

Deno.test("staying within a major stays quiet", () => {
  assertEquals(crossesMajorBoundary("2.0.0", "2.0.1"), false);
  assertEquals(crossesMajorBoundary("2.0.1", "2.4.0"), false);
  assertEquals(crossesMajorBoundary("1.2.3", "1.99.0"), false);
});

Deno.test("a downgrade is not a crossing", () => {
  // Reinstalling an older binary should not lecture the user about migrating.
  assertEquals(crossesMajorBoundary("2.0.0", "1.21.0"), false);
});

Deno.test("an unparseable version is silence, not a guess", () => {
  assertEquals(crossesMajorBoundary("", "2.0.0"), false);
  assertEquals(crossesMajorBoundary("1.0.0", "not-a-version"), false);
  assertEquals(crossesMajorBoundary("main", "2.0.0"), false);
});
