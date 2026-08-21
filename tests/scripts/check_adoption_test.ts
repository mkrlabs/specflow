import { assert, assertEquals, assertStringIncludes } from "@std/assert";
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

// --- the ships-something rule -------------------------------------------

const withPrompt = "## Agent adoption\n\nprose\n\n```prompt\ndo it\n```\n";

Deno.test("a feat that ships no user-facing file is refused", () => {
  // The real case: `scripts/check-release-commit.ts` is absent from
  // templates/manifest.json, so it reaches no user project. Typed `feat`, it
  // made this gate demand a guide, which was then written by inventing a
  // user-facing story — telling an agent to confirm the file "arrived with the
  // upgrade", which it never can.
  const offenders = findOffenders([{
    hash: "f4b3408",
    subject: "feat(release): gate the tag on the release commit actually being one",
    body: withPrompt,
    files: ["scripts/check-release-commit.ts", "tests/scripts/check_release_commit_test.ts"],
  }]);
  assertEquals(offenders.length, 1);
  assertStringIncludes(offenders[0].reason, "ships");
  assertStringIncludes(offenders[0].reason, "Repo-internal:");
});

Deno.test("the escape hatch admits a repo-internal change that is genuinely a feature", () => {
  // `feat(changelog): read the adoption guide from the commit body` touched
  // only scripts/ and .github/ and was a real feature — it changed the release
  // notes users read. A path-only rule would have rejected it, which is why
  // the rule asks for a sentence rather than forbidding the shape.
  const offenders = findOffenders([{
    hash: "88548c9",
    subject: "feat(changelog): read the adoption guide from the commit body",
    body: withPrompt + "\nRepo-internal: changes the release notes users read.\n",
    files: ["scripts/gen-changelog.ts", ".github/workflows/adoption_lint.yml"],
  }]);
  assertEquals(offenders, []);
});

Deno.test("touching any user-facing prefix needs no trailer", () => {
  for (const f of ["src/domain/x.ts", "templates/core/agents/a.md", "plugin/agents/a.md"]) {
    const offenders = findOffenders([{
      hash: "abc1234",
      subject: "feat: x",
      body: withPrompt,
      files: [f, "tests/x_test.ts"],
    }]);
    assertEquals(offenders, [], `${f} should count as user-facing`);
  }
});

Deno.test("the scope rule does not fire when no diff is available", () => {
  // `files` absent means the caller had no diff to offer; the rule must then
  // stay silent rather than assume the worst.
  const offenders = findOffenders([{ hash: "abc1234", subject: "feat: x", body: withPrompt }]);
  assertEquals(offenders, []);
});

Deno.test("a chore is never subject to the scope rule", () => {
  const offenders = findOffenders([{
    hash: "abc1234",
    subject: "chore(release): internal tooling",
    body: "",
    files: ["scripts/whatever.ts"],
  }]);
  assertEquals(offenders, []);
});
