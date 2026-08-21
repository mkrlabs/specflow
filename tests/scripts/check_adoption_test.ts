import { assert, assertEquals } from "@std/assert";
import { findOffenders } from "../../scripts/check-adoption.ts";

const GUIDE = "## Agent adoption\n\nprose\n\n```prompt\ndo the thing\n```\n";

Deno.test("a feature with no adoption section is named, with its hash", () => {
  const offenders = findOffenders([
    { hash: "aaa1", subject: "feat: add a thing", body: "just a body\n" },
  ]);
  assertEquals(offenders.length, 1);
  assertEquals(offenders[0].hash, "aaa1");
  // The reason has to distinguish the two ways to fail, or the author has to
  // guess which half of the convention they missed.
  assert(offenders[0].reason.includes("no '## Agent adoption'"));
});

Deno.test("a section with no prompt block fails, and says which half is missing", () => {
  const offenders = findOffenders([
    { hash: "bbb2", subject: "feat(x): a thing", body: "## Agent adoption\n\nprose only\n" },
  ]);
  assertEquals(offenders.length, 1);
  assert(offenders[0].reason.includes("```prompt"));
});

Deno.test("the gate accepts exactly what the release notes will print", () => {
  // Not a re-implementation of the rule: the gate calls `extractAdoption`, the
  // same function `gen-changelog.ts` uses to read the section back out. A
  // section the gate accepts but the generator rejects is a guide that passes
  // CI and then silently fails to appear — which is the whole failure class
  // this mechanism exists to close.
  assertEquals(findOffenders([{ hash: "ccc3", subject: "feat: ok", body: GUIDE }]), []);
});

Deno.test("a breaking feature is held to the same rule", () => {
  // `feat!:` is the commit in a release most likely to need a guide, and it is
  // the one an anchored `^feat:` pattern silently exempts.
  const offenders = findOffenders([
    { hash: "ddd4", subject: "feat(agents)!: rename the seats", body: "no guide here" },
  ]);
  assertEquals(offenders.length, 1);
  assertEquals(offenders[0].hash, "ddd4");
});

Deno.test("the gate does not widen past features", () => {
  // A gate that fires on `fix:` and `chore:` gets switched off within a week,
  // and then it protects nothing at all.
  assertEquals(
    findOffenders([
      { hash: "e1", subject: "fix: a bug", body: "" },
      { hash: "e2", subject: "chore: bump", body: "" },
      { hash: "e3", subject: "docs: prose", body: "" },
      { hash: "e4", subject: "refactor: tidy", body: "" },
      { hash: "e5", subject: "feature: not conventional", body: "" },
    ]),
    [],
  );
});

Deno.test("an empty range passes rather than erroring", () => {
  // "There are no features here" is the common case on a fix-only branch. A
  // gate that fails closed on it is a gate that blocks every unrelated push.
  assertEquals(findOffenders([]), []);
});

Deno.test("every offender is reported, not just the first", () => {
  // Reporting one at a time turns a three-commit branch into three CI round
  // trips, which is how a gate earns a `--no-verify` habit.
  const offenders = findOffenders([
    { hash: "f1", subject: "feat: one", body: "" },
    { hash: "f2", subject: "feat: two", body: GUIDE },
    { hash: "f3", subject: "feat!: three", body: "" },
  ]);
  assertEquals(offenders.map((o) => o.hash), ["f1", "f3"]);
});
