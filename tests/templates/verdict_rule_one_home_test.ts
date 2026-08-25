import { assert } from "@std/assert";
import { CORE_BUNDLE } from "../../src/templates_bundle.ts";

/**
 * #565 — the verdict rule has one home, and seats may not spell a second.
 *
 * `review-findings-contract` defines `REVIEW_VERDICT: pass` as requiring
 * `CRITICAL_COUNT == 0` AND `HIGH_COUNT == 0` AND
 * `SEATS_REPORTED == SEATS_EXPECTED`. Two seats restated that rule and dropped
 * the third clause — so a seat that could not review, emitting all-zero counts,
 * read as clean against its own file. The gate verdict comes from the
 * coordinator, whose arithmetic still counted correctly, so the weakening was
 * contained; it was one coordinator edit away from not being.
 *
 * This is a SWEEP, not two cases. The population is derived from the bundle's
 * own `skills:` frontmatter, so a ninth seat added tomorrow is covered the day
 * it lands — the fix that holds is never the one that names the files that were
 * wrong today.
 *
 * `review-coordinator` is the single deliberate exception, and it has to earn
 * it in writing: its block annotates every field with aggregation semantics the
 * contract does not carry.
 */

function frontmatter(content: string): string {
  const m = content.match(/^---\n([\s\S]*?)\n---/);
  return m ? m[1] : "";
}

const SEATS = CORE_BUNDLE
  .filter((e) => e.category === "agent")
  .filter((e) => /^skills:.*review-findings-contract/m.test(frontmatter(e.content)))
  .map((e) => ({ name: e.name, content: e.content }));

const EXEMPT = new Set(["review-coordinator"]);

Deno.test("the seat population is derived, and is not empty", () => {
  // Without this the sweep below passes over nothing — the failure mode every
  // guard in this repository keeps rediscovering.
  assert(SEATS.length >= 8, `only ${SEATS.length} seats preload the contract`);
});

for (const seat of SEATS) {
  Deno.test(`seat "${seat.name}" does not spell its own pass rule`, () => {
    const flat = seat.content.replace(/\s+/g, " ");
    const states = /`?REVIEW_VERDICT: ?`?pass`? only when/.test(flat);
    if (EXEMPT.has(seat.name)) {
      // The exemption is not "this file may drift". It must still carry the
      // clause IN ITS PASS RULE, and it must say why it restates at all.
      //
      // Scoping to the rule is load-bearing, and was found the hard way: the
      // first version searched the whole file, so the justification paragraph
      // — which names the clause in prose — satisfied the assertion on its
      // own. Deleting the clause from the actual rule left the guard green.
      // An assertion answering a question adjacent to the one asked is the
      // same defect this whole ticket removes.
      const rule = flat.match(/`?REVIEW_VERDICT: ?`?pass`? only when[\s\S]{0,320}/)?.[0] ?? "";
      assert(rule.length > 0, `${seat.name} is exempt but states no pass rule at all`);
      assert(
        rule.includes("SEATS_REPORTED < SEATS_EXPECTED") ||
          rule.includes("SEATS_REPORTED == SEATS_EXPECTED") ||
          rule.includes("every required seat reported"),
        `${seat.name} is exempt from the no-restatement rule but its PASS RULE dropped ` +
          `the seats clause. Naming the clause elsewhere in the file does not count — ` +
          `the rule is what a reader follows.`,
      );
      assert(
        flat.includes("restated here on purpose"),
        `${seat.name} restates the block without the written justification #565 requires`,
      );
      return;
    }
    assert(
      !states,
      `${seat.name} states its own pass rule. The rule's home is ` +
        `review-findings-contract; a second spelling drifts from it one clause ` +
        `at a time, which is exactly how the SEATS_REPORTED clause was lost.`,
    );
  });
}
