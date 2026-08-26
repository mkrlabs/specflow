# Plan: a write stays inside the project it was asked to write into

**Branch**: `fix/574-writes-stay-inside-the-project` | **Date**: 2026-08-26 |
**Backlog item**:
[specnaut/specnaut-cli#574 — "writeBundle and deletePaths follow symlinks out of the project directory"](https://github.com/specnaut/specnaut-cli/issues/574)

**This is the feature's one planning document.**

> Citation by symbol, not line number.

---

## 1. Why this exists

`assertSafeDestination` (`src/domain/template.ts`) normalises the destination
**string** and rejects absolute paths and `..` segments. That is the right
pattern for a string, and it is the only containment `DenoFsWriter` performs. It
says nothing about the filesystem: `writeTextFile`, `chmod`, `mkdir -p`,
`rename` and a recursive `remove` all follow symlinks, so a destination that
stays a clean relative path the whole way can still land somewhere else
entirely.

Measured on `main` at `1868de1` — every row executed, none needing a `..`
anywhere:

| # | Shape | Result |
| :- | :---- | :----- |
| A | `.claude/` is a symlink to a directory outside the project | `writeBundle` created the file at the target |
| B | `.claude/y.md` is a symlink to a file outside (not `skipIfExists`) | `writeBundle` overwrote that file, and `chmod 0755`'d it |
| C | same directory symlink, dest in the delete set | `deletePaths` deleted the file at the target |
| D | `.specnaut/` is a symlink out, `specnaut spec pull` runs | `SpecCacheWriter.clear` **recursively deleted** at the target, destroying a file planted there, then wrote the cache outside |
| E | the repo ships `.specflow` as a symlink out | `migrateLegacyConfigDir` reported `migrated` and left `.specnaut/` a symlink pointing outside — on the first thing `init` does |
| F | a bundle dest is a symlink to a file outside | **`specnaut diff` printed that file's contents to stdout**, line for line |

A, B and C were measured before this plan was written. D, E and F came out of
the two plan-time audits, which is what those audits are for: found before any
code exists, for the price of an edit to this document.

**E is the one that changes the shape of the problem.** It is a *creation*
primitive rather than a traversal one — one shipped symlink named `.specflow`,
and `.specnaut/` becomes an out-of-project tree that seven further sinks then
write, delete and recursively remove through. **F is the one that changes the
severity**: the others destroy or create files locally, and § 1's original bound
— a hostile repo can already run code — is fair for those. It does not cover an
exfiltration primitive whose output goes to the stdout of a tool routinely read
into a coding agent's context and into CI logs.

**There is already a partial guard, and its shape is the finding.** `writeBundle`
refuses to write through a symlink — but only when the dest carries
`skipIfExists` **and** the dest **itself** is the link. That covers `AGENTS.md`
pointing at a consolidated context file, which is what it was written for. It
sees no intermediate directory, no dest without the flag, no other adapter, and
no read. A guard that reports clean about a surface it never reads is the class
this change closes, not an isolated bug — and the first version of this plan
reproduced the same shape by naming four sinks out of seventeen.

## 2. User scenarios

**P1 — a hostile layout cannot reach outside the project.** Given a repository
that ships a symlink at a scaffolded path, at any directory above one, or at
`.specflow`, when any Specnaut command writes, creates a directory, chmods,
backs up or deletes, then the operation is refused with the destination, the
resolved target and the resolved root named, and nothing outside the project is
touched.

**P2 — nothing outside the project is read, printed or copied.** Given the same
layout, when `specnaut diff` or `specnaut upgrade` renders a preserved file,
then it refuses rather than printing the contents of a file outside the project.

**P3 — a deliberate in-project symlink keeps working.** Given a project that
symlinks a scaffolded path to another location **inside** itself, when the same
commands run, then they behave exactly as they do today: the link is followed,
the real file is written, and the managed-section merge still reaches it.

**P4 — the rule stays enforced as the code grows.** Given a new module under
`src/infrastructure/` that mutates the filesystem, when the suite runs, then it
fails unless that module either consults the predicate or is excluded with a
written reason.

### Edge cases

| Case | Expected |
| :--- | :------- |
| The project directory is itself reached through a symlink (`/var` on macOS; every `makeTempDir` in this suite) | Allowed. Both sides are resolved, so the project's own path cannot fail its own check. |
| The destination does not exist yet | Its parent is resolved and the leaf appended. |
| The destination is a **dangling** symlink | **Refused.** `writeTextFile` on a dangling link creates the target, so treating "cannot resolve" as "does not exist" is itself the escape. Distinguished with `lstat`, not by catching an exception. |
| A destination whose parent does not exist either | The deepest existing ancestor is resolved and checked **before** `mkdir -p` runs. The first version of this plan had `mkdir` run first, which was the finding, not the fix. |
| The path is a **hardlink** to a file outside | Not detected, and cannot be: the escape is not in the path. Out of the threat model — git cannot ship a hardlink — and SC-001 is narrowed accordingly rather than left false. |
| Windows separators | `relative()`-based, never a string prefix — the reason `pruneEmptyParents` uses it, and the bug it already shipped once. |
| A symlink created between the check and the write | Out of scope. Deno offers no `O_NOFOLLOW`, `openat` or fd-relative write, so there is no atomic alternative to defer to. |

## 3. Requirements

**Amended after the two plan-time audits.** The first version specified a
predicate that could not refuse the plan's own reproduced escape, and named four
sinks where there are seventeen. Both are corrected here rather than in a
footnote — the audits ran before any code precisely so this edit is the whole
cost.

- **FR-001** — Every filesystem sink that builds a path from a project directory
  refuses to act when that path **resolves** outside it. The population is the
  table in § 8, not a list carried in prose. It includes `Deno.mkdir` and
  `Deno.chmod`, which the first version omitted: `mkdir -p` walks through a
  symlinked component and creates real directories on the other side, and
  `chmod` follows a leaf link exactly as `writeTextFile` does.
- **FR-002** — Containment is decided by resolving **the deepest existing
  ancestor of the path, inclusive of the path itself**, and testing
  `relative(root, resolved)` for empty / `..` / `..`-prefixed / absolute. Not a
  string prefix: that hardcodes the POSIX separator, and `/a/bc` starts with
  `/a/b`. Because `assertSafeDestination` has already excluded `..` and absolute
  segments, appending an unresolved remainder cannot re-enter the project, so
  the resolved ancestor decides the whole path.
- **FR-003** — The resolution distinguishes three states with `lstat`, never by
  catching one exception:
  1. the path does not exist → resolve its parent and append the leaf;
  2. the path exists and is a symlink → resolve the link explicitly, and refuse
     a **dangling** link rather than falling back — `writeTextFile` on a dangling
     link *creates* the target, so a fallback here is the escape;
  3. otherwise resolve the path.
  `Deno.realPath` was measured **not** to throw on a dangling link on this
  platform, so the naive "catch `NotFound`" correction never even reaches its
  fallback here — and would on another. A predicate whose behaviour depends on
  which of three CI platforms it runs on is not a predicate.
- **FR-004** — Both sides of every comparison are resolved the same way, at
  every caller. Resolving the root while leaving the candidate lexical makes
  `relative()` return a `../..` chain for every path on macOS — reproduced — and
  the check then reports "outside" for everything, or, in `pruneEmptyParents`,
  silently stops walking. That is the Windows prefix bug that function's comment
  commemorates, arriving from the opposite direction.
- **FR-005** — The predicate is **pure and shared**; the verdict is **per
  caller**. `isInside(root, target): boolean` moves to `src/domain/template.ts`,
  beside `assertSafeDestination`. `assertInsideProject` is the thin resolving
  wrapper that throws, and it is what the sinks call. `pruneEmptyParents` calls
  the boolean and returns, because it is best-effort by construction and a throw
  there would fail an upgrade whose files are already written.
- **FR-006** — The refusal names the destination, the resolved target **and the
  resolved root**. Naming the root is what makes a widened root visible the
  first time it happens instead of never.
- **FR-007** — `writeBundle` becomes two phases: phase 1 checks containment and
  creates directories, phase 2 writes content. § 9's first version claimed a
  pre-pass could not see directories created during the loop; `mkdir` **is** the
  loop's unconditional first statement, so a pre-pass that performs it sees
  exactly what the loop would. Cost, stated: cleared dests still get their
  directories before a throw, so "nothing written" becomes "no content written,
  some empty directories left" — and `pruneEmptyParents` already exists for that
  shape. It does not make the operation atomic and is not claimed to.
- **FR-008** — `migrateLegacyConfigDir` decides with `lstat` and **refuses** to
  migrate when `.specflow` or `.specnaut` is a symlink, naming the refusal. This
  is the entry point that manufactures the condition every other finding needs:
  `Deno.stat` follows links, so a symlinked `.specflow` reports as a directory,
  `Deno.rename` moves the link, and `.specnaut/` becomes a symlink out — on the
  first thing `init` and `upgrade` do.
- **FR-009** — Reads are in scope. `DenoFsReader.readText` and
  `FsStagingStore.read` apply the same rule. The chain that puts them here was
  measured with the real binary: a bundle dest symlinked to a file outside the
  project made `specnaut diff` print that file's contents to stdout. § 1's
  severity bound — a hostile repo can already run code — does not cover it,
  because this CLI's stdout is read into a coding agent's context and into CI
  logs.
- **FR-010** — A backup of a symlinked destination stops reporting a pointer as
  content. `backupExisting: false` refuses to touch the link; `backupExisting:
  true` currently renames it and records `{dest, backupPath}`, which the handler
  surfaces as "your file was backed up". It was not: the content is still at the
  target, the `.bak` is a link, and the scaffolded `.gitignore` hides it. The
  accounting is corrected; the rename itself is unchanged, because editing the
  case that pins it would make this a scope change rather than a fix (T019).
- **FR-011** — A **completeness sweep** enumerates every module under
  `src/infrastructure/` (plus the two named sinks outside it) that calls a Deno
  filesystem-mutation API, and fails when one neither consults the predicate nor
  appears in an exclusions file with a written reason. Nine modules mutate the
  filesystem today and the first version of this plan hardened two; without a
  sweep, module ten arrives not knowing the rule exists and § 1's opening
  sentence gets written a second time about this very change.
- **FR-012** — Each new assertion is observed **red** against the re-introduced
  defect, and the commit body names which defect each one witnessed. "Observed
  red" is unfalsifiable after the fact; the commit body is where this project
  already keeps that evidence.

## 4. Success criteria

- **SC-001** — A repository that ships a **symlink** — at a scaffolded path, at
  any directory above one, or at `.specflow` — cannot cause any Specnaut command
  to create, overwrite, move, chmod or delete anything outside the project
  directory. Demonstrated by shapes A, B, C, the `.specnaut` sink table and the
  migrator chain going from "escaped" to "refused".
  **Narrowed to symlinks on purpose**: a hardlink defeats every path-resolution
  check, because the escape is not in the path. Git cannot ship one, so it is
  outside this threat model — but an absolute claim here would be false, and § 9
  carries the limit.
- **SC-002** — No Specnaut command prints, copies or digests the contents of a
  file outside the project. Demonstrated by `specnaut diff` refusing the
  symlinked dest that currently makes it render one.
- **SC-003** — A project that symlinks a scaffolded path elsewhere **inside**
  itself sees no behaviour change, including the managed-section merge.
- **SC-004** — A refusal names the destination, the resolved target and the
  resolved root.
- **SC-005** — The sweep enumerates the mutating population and every member is
  either guarded or excluded with a reason. A new adapter that is neither turns
  the suite red.
- **SC-006** — The suite stays green on all three CI platforms. FR-002's
  `relative()` and FR-004's resolve-both-sides are what make that true, and both
  have a named, reproduced failure mode if dropped.

## 5. 🔒 The decision table

| The decision | Its single home | What would duplicate it |
| :----------- | :-------------- | :---------------------- |
| **How containment is decided** — resolve both sides, `relative()`, never a prefix | `isInside(root, target)` in `src/domain/template.ts` | Any inline `relative()` or `startsWith` test in any adapter; `pruneEmptyParents` keeping its own copy; `FsStagingStore.delete` keeping `parent.startsWith(stagingDir)` |
| **How a path is resolved before it is judged** — deepest existing ancestor inclusive, `lstat`-first, dangling link refused | `assertInsideProject` in `src/infrastructure/deno_fs_writer.ts` | A second resolver in another adapter; a `catch (NotFound)` used to infer that a path does not exist |
| **What a failed containment check does at a sink** — it throws | inside `assertInsideProject`; **no caller decides** | A boolean returned to sinks; an `if (!isInside(…)) continue;`; a third meaning added to `BackupReport.skippedSkipIfExists` |
| **Which sinks must ask** | the sweep in `tests/infrastructure/containment_sweep_test.ts` + its exclusions file | A module added under `src/infrastructure/` that mutates the filesystem and is in neither set; a reason written in a commit message instead of the exclusions file |
| **What the project root is** | `assertInsideProject`'s resolved root, derived once per operation from the caller's `projectDir` | Each adapter re-deriving it — `resolve()` here, `join()` there — so two of them hold different opinions about the same run |
| **Which destination strings are legal** | `assertSafeDestination` in `src/domain/template.ts`, unchanged | Teaching the filesystem check to also reject `..`; that is the string rule and it already has a home |
| **Which symlinks are refused** — only those resolving outside | `assertInsideProject`'s verdict | A blanket symlink refusal anywhere; widening the existing `skipIfExists` skip to cover in-project links |
| **What a backup of a symlinked dest reports** | the `wasSymlink` flag `backupAside`'s callers set, carried to the user as `linksMoved` | A `BackupReport` entry that describes a moved LINK as saved content; a second place deciding whether a symlink was involved |

**Row 6 was amended during implementation, and the amendment is a correction to
this table rather than to the code.** It read "one answer for both
`backupExisting` values", which FR-010's own text never said — FR-010 asks that
a backup *stop reporting a pointer as content*, and that is what shipped. The
review flagged the disagreement as a binding-table violation and it was right
that the two disagreed; it was the row that was wrong. Unifying the branches
would have required editing a case in `write_bundle_symlink_test.ts`, which pins
the pre-existing rename — and T019 makes needing to edit that file the signal
that a change has become a scope change rather than a fix. The rename stays; the
accounting is what was broken.

**Two askers, two verdicts, one predicate — and the first version got this
wrong.** It claimed "two askers, one decider". The sinks ask *may I mutate this*
and must throw; `pruneEmptyParents` asks *have I walked above my stop point* and
must return, because it is best-effort by construction. One decider for **how**
containment is decided; two for **what to do about it**. Row 1 and row 3 are that
split written down.

**Binding on the implementer.** A decision may not move out of its home without
this plan being amended first. A review finding that a decision has two homes is
a plan violation, not a style opinion.

## 6. Technical context

- Deno / TypeScript, hexagonal layering. The pure predicate lands in the
  **domain** (`src/domain/template.ts`, beside `assertSafeDestination`); the
  resolving wrapper and every call site are **infrastructure**. That split is
  what lets seven adapters outside `deno_fs_writer.ts` consult the rule without
  importing a peer adapter — the first version pinned the whole thing inside the
  writer, which would have forced either an infra→infra import or a copy.
- **The resolution algorithm, stated once.** Given `abs`: `lstat(abs)`. Absent →
  resolve `dirname(abs)` and append the leaf. A symlink → resolve the link
  against the real parent and refuse it if it dangles. Otherwise → `realPath(abs)`.
  Compare with `isInside(realPath(root), resolved)`. The first version of this
  plan stated this two incompatible ways, and the reading § 6 gave could not
  refuse the plan's own shape B.
- **Measured Deno semantics**, so the implementer does not re-derive them:
  `writeTextFile` and `chmod` follow a leaf symlink; `mkdir -p` follows a
  symlinked component and creates directories at the target; `remove`
  (non-recursive) and `rename` operate on the **link**, not the target;
  `remove` with `recursive: true` follows into the target; `realPath` does not
  throw on a dangling link here; `readDir` on a symlinked directory lists the
  target's entries; `stat` follows a link and `lstat` does not.
- Tests: `tests/infrastructure/deno_fs_writer_test.ts`,
  `deno_fs_writer_prune_test.ts`, and — named because it is the **regression
  surface** — `tests/infrastructure/write_bundle_symlink_test.ts`, whose case
  "a non-`skipIfExists` write still follows the link, as the section merge
  needs" is exactly what FR-005 and SC-003 must not break. It is the first file
  to go red on an over-correction into a blanket symlink refusal.
- `Deno.symlink` and `Deno.link` are available under `--allow-write`; the suite
  already runs `--allow-all`.

## 7. Constitution check

| Principle | Verdict | Note |
| :-------- | :------ | :--- |
| I. OSS / proprietary boundary | pass | Public half only; no private identifier involved. |
| II. Single bridge | pass | No cross-half call. |
| III. Monorepo holds no product code | pass | The change is inside `apps/specnaut-cli/`. |
| IV. Cross-cutting discipline | pass | One half, one commit, plus the pointer bump. |
| V. Merge defaults | pass | Local `--ff-only` via `scripts/land.sh cli`. |
| VI. Centralised backlog routing | pass | The card moves through the `product-owner` agent. |
| VII. Submodule autonomy | pass | Nothing in the other halves. |
| VIII. Documentation conventions | pass | No version number or date pinned in long-lived prose. |
| IX. Dogfooding | pass | Found while running the product against this workspace. |
| X. Epic status | pass | Standalone item, no children. |
| XI. Consumer agnosticism | pass | No consuming project named; the fixtures invent their own paths. |

### Complexity tracking

No violations.

## 8. Surface impact

### The sink population — this table IS the requirement, not an illustration

Seventeen sinks build a path from a project directory. The first version of this
plan named four.

| Module | Sink | Op | Guarded today |
| :----- | :--- | :-- | :------------ |
| `DenoFsWriter.writeBundle` | plain write | write | string only |
| " | `mergeBlock` / `mergeJson` | read + write | string only |
| " | `Deno.chmod` | chmod | **none** |
| " | `Deno.mkdir` recursive | mkdir | **none**, and it runs first |
| `DenoFsWriter.backupAside` | `Deno.rename` | rename | string, via caller |
| `DenoFsWriter.deletePaths` | `Deno.remove` | delete | string |
| `pruneEmptyParents` | `Deno.remove` | delete | lexical `relative()` |
| `FsStagingStore.read` / `.delete` | read / delete | **none** |
| `FsLockStore.write` | mkdir + write | write | **none** |
| `FsUpgradeMarkerStore.write` / `.delete` | mkdir + write / delete | **none** |
| `FsPreserveStore.write` | mkdir + write | write | **none** |
| `SpecCacheWriter.write` | mkdir + write ×N | write | leaf `slug()` only |
| `SpecCacheWriter.clear` | **recursive delete** | delete | leaf `slug()` only |
| `initBacklogConfigStub` (`cli/handlers/init_handler.ts`) | mkdir + write | write | **none** |
| `writeCloudConfig` (`domain/cloud/cloud_config.ts`) | mkdir + write | write | **none** |
| `migrateLegacyConfigDir` | `Deno.rename` | rename | `stat`-based, follows links |
| `DenoFsReader.readText` | read | read | **none** |

**Excluded, with reasons** — these mutate the filesystem but are not
project-scoped, and the sweep's exclusions file carries the same two lines:
`credential_store.ts` writes under the user's own config directory, and
`github_api.ts` writes beside the running binary during self-update.

### Command surfaces

| Surface | Touched? | What changes |
| :------ | :------- | :----------- |
| `specnaut init` | behaviour | Refuses a hostile layout instead of writing through it; refuses to migrate a symlinked `.specflow`. |
| `specnaut upgrade` (incl. `--force`, `--backlog`) | behaviour | Same, on write, mkdir, chmod, backup and delete. |
| `specnaut reconcile <path>` | behaviour | Same, through the writer and the staging store. |
| `specnaut diff` | behaviour | Refuses to render a dest that resolves outside, instead of printing its contents. |
| `specnaut spec pull` | behaviour | Refuses when the cache directory resolves outside, instead of recursively deleting there. |
| `FsWriter` / `FsReader` / `StagingStore` port signatures | **no** | The check lives in the adapters. |
| `assertSafeDestination` | **no** | Keeps its string checks unchanged. |

No front-end surface exists in this project, so there is no prototyping
subsection.

## 9. Risks

| Risk | Mitigation |
| :--- | :--------- |
| **Resolving one side and not the other.** Reproduced twice, in both directions: a `realPath`'d root against a lexical candidate returns a `../..` chain for every path on macOS; a lexical root against a resolved candidate is the original bug. In `pruneEmptyParents` the first shape is silent — the walk simply stops. | FR-004, and a test that asserts the prune still runs under a `makeTempDir` root. Silence is the failure mode, so the assertion must be that it *did* prune, never that it did not error. |
| **The naive dangling-symlink correction is itself an escape.** Catching `NotFound` to mean "does not exist" creates the outside file. | FR-003's three-state `lstat`, and a fixture with a dangling link. Measured that `realPath` does not throw here, which means this trap is invisible on this platform — the reason the states are distinguished explicitly rather than by exception. |
| **Over-correcting into a blanket symlink refusal** breaks the in-project consolidation the existing `skipIfExists` skip protects. | SC-003, FR-005, and `write_bundle_symlink_test.ts` named as the regression surface — it goes red first. |
| **The throw leaves empty directories.** | Stated rather than hidden (FR-007). Strictly smaller than a half-written bundle, and `pruneEmptyParents` already exists for it. |
| **Hardlinks defeat the check entirely** — the escape is not in the path, so no resolution can see it. | Out of the threat model: git cannot ship a hardlink. SC-001 is narrowed to symlinks rather than left absolute, because the absolute claim is false. |
| **TOCTOU between the check and the write.** | Out of scope, and the reasoning is restated honestly: the realistic actor is not an attacker but ordinary concurrency — an editor, a file watcher, a package manager on the same tree. Deno exposes no `O_NOFOLLOW`, no `openat` and no fd-relative write, so check-then-write is the only shape available. FR-007's ordering shrinks the window from "the whole bundle loop" to "one syscall gap". |
| **A widened root makes everything inside it "inside".** `realPath` can only move the root up a link, never down. | FR-006 prints the resolved root, and a resolved root of `/` or `$HOME` is refused. Theoretical rather than reproduced — the attacker does not choose the root in this model. |
| **Seventeen sinks now, ten modules later.** The rule is a property of a class, and a class with no membership test grows members that never learn about it. | FR-011's sweep. It is the same answer this project already uses for its plugin mirrors, and it is the only mitigation here that survives the next contributor. |
| **A new assertion that never reaches the sink it guards.** | FR-012 — each observed red against the re-introduced defect, with the defect named in the commit body. |

## 10. Architecture audit

`architect-expert`, plan-time, on `plan.md` before a line was written.
**Verdict: fail** — 1 CRITICAL, 4 HIGH, 4 MEDIUM, 3 LOW. Every finding below is
accepted; three were re-measured here before acceptance and one of those
corrections goes the seat's way harder than it argued.

**The CRITICAL is that this plan's own algorithm does not do what its success
criteria claim.**

| # | Finding | Disposition |
| :- | :------ | :---------- |
| **F-01** | **§ 6 specifies "the parent is resolved and the leaf appended, rather than resolving the dest" — which cannot refuse shape B.** For a dest that is itself a symlink out, the parent resolves in-project, the leaf is appended, `relative()` returns a clean `y.md`, and the write proceeds through the link. SC-001 claims B goes from escaped to refused; under the stated algorithm it does not. The edge-case table hints at the opposite reading, so the plan states its one decider two incompatible ways. | **ACCEPTED, and re-measured.** Ran both formulations against shape B: resolve-parent-append-leaf yields `rel="y.md"` → contained → **allowed**; resolving the deepest existing ancestor inclusive of the dest yields the victim's real path → **refused**. The seat is right, and this would have cost a full implement-and-review cycle. FR-002 now specifies deepest-existing-ancestor-inclusive, stated once. |
| **F-01b** | **`Deno.mkdir` is a sink, is absent from FR-001's enumeration, and runs before any check could fire.** With `.claude/` a symlink out, `mkdir(dirname(abs), {recursive:true})` creates directories at the target before containment has anything to resolve — the parent did not exist until `mkdir` made it. 145 of 260 `init` dests are five segments deep, so this is the common path, not an exotic one. | **ACCEPTED.** A guard blind to a sink it never reads is the finding § 1 opens with, reproduced inside § 1's own fix. `mkdir` joins FR-001, and F-01's ancestor walk refuses it for free: the deepest existing ancestor of `.claude/skills/foo/SKILL.md` is `.claude` itself. |
| **F-02** | **§ 5's home forces an adapter-to-adapter import.** FR-006 needs the predicate in `fs_staging_store.ts`; § 5 puts it inside `assertInsideProject` in `deno_fs_writer.ts`. Complying means importing a peer adapter — dragging in `mergeIntoFile` and `mergeClaudeSettings`, which staging has no business knowing — or copying the predicate, which is what § 5 exists to prevent. | **ACCEPTED.** The function fuses an I/O step with a pure predicate, and only the I/O half is infrastructure. Split: `isInside(root, target)` is pure and moves to `src/domain/template.ts`, beside `assertSafeDestination` — the two path rules end up in one file, which also answers the seat's cycle-3 question about why one lived in the domain and one did not. `assertInsideProject` stays in the adapter as the thin resolving wrapper. |
| **F-03** | **FR-004 (throw, not skip) has no decision-table row, and the codepath offers a cheaper wrong answer.** The natural insertion point sits directly below `skippedSkipIfExists.push(dest); continue;`. Once one sink skips and another throws, the rule has two homes and `BackupReport.skippedSkipIfExists` acquires a third meaning that `init`'s lock filter consumes without distinguishing. | **ACCEPTED.** Row added. `assertInsideProject` throws rather than returning a boolean, so no call site is offered the choice — a predicate returning `boolean` hands the verdict to every caller. |
| **F-04** | **`spec_cache_writer.ts` is scoped out on an argument that answers the string question, not the symlink one — and its `clear()` is a recursive delete.** § 12 item 4 cleared it because `slug()` strips every separator. True, and beside the point: § 1's whole argument is that this class needs no `..` anywhere. With `.specnaut/` a symlink out, `clear()` runs `Deno.remove(cacheDir, { recursive: true })` at the target. | **ACCEPTED, and UPGRADED to CRITICAL on measurement.** Built the layout and ran `SpecCacheWriter.write`: a file planted at the link target was **destroyed**, and the cache was then written outside the project. That is a recursive delete of user data — strictly worse than any of the three shapes § 1 measured. It comes into scope. § 12 item 4 is rewritten: the `slug()` analysis was correct about injection and silent about traversal. |
| **F-05** | **A dangling symlink defeats every `realPath` formulation**: `realPath` throws `NotFound` on a broken link, the walk falls back to the in-project parent, the check passes, and `writeTextFile` creates the target under `O_CREAT`. | **ACCEPTED as a defect, and its premise CORRECTED.** The escape is real — measured, the target outside was created. But `Deno.realPath` on a dangling link **does not throw** here; it returns the resolved target, so the ancestor walk already refuses it. The seat flagged this one as reasoned rather than measured, which is what made the correction cheap. Since the behaviour is a platform detail and this suite runs on three, FR-002 handles both: use `realPath` when it succeeds, and fall back to `readLink` resolved against the parent when it does not. |
| **F-06** | **§ 9's reason the partial write is unavoidable is false.** It says a pre-pass cannot see directories created during the loop — but `mkdir` IS the loop's unconditional first statement, so a pre-pass that performs it sees exactly what the loop would. | **ACCEPTED.** Two-phase ordering adopted: phase 1 checks and creates directories, phase 2 writes content. Cost, stated rather than hidden: cleared dests still get their directories before the throw, so "nothing written" becomes "no content written, some empty directories left" — a smaller mess, and `pruneEmptyParents` already exists for that shape. It does not make the operation atomic and is not claimed to. |
| **F-07** | **§ 6 names two test files; a third pins the behaviour most likely to break.** `tests/infrastructure/write_bundle_symlink_test.ts` holds the assertion that a non-`skipIfExists` write still follows an in-project link, which is exactly what FR-005 must not break. | **ACCEPTED.** Named in § 6 as the regression surface. It is also the file that goes red first if the implementer over-corrects into a blanket symlink refusal. |
| **F-08** | **A single fused `assertInsideProject` cannot be reused by `pruneEmptyParents` without changing its failure semantics** — the prune walk is best-effort by construction, and a throwing check would turn a stale-directory cleanup into a failed upgrade whose files are already on disk. | **ACCEPTED, and it corrects the plan's framing.** § 5 claimed "two askers, one decider". The two callers ask genuinely different questions: the sinks ask *may I mutate this* (answer: throw), the prune walk asks *have I walked above my stop point* (answer: return). One decider for **how containment is decided**, two for **what to do about it**. The F-02 split delivers exactly that. |
| **F-09** | `SEP` is a module-level constant of the writer and should travel with the predicate. | **ACCEPTED** — it moves with `isInside`. |
| **F-10** | Containment is a property of 49 distinct directories, asked 260 times per `init`. A memo keyed on `dirname` collapses it. | **RECORDED, NOT ACTED ON.** The seat did not measure the cost and neither have I. One extra resolve against 260 file writes is very likely noise, and optimising on a guess is how a correctness change acquires a cache. Written down so it is a decision rather than an oversight. |
| **F-11** | "Observed red" is unfalsifiable after the fact — FR-007 leaves no durable trace. | **ACCEPTED.** Each assertion's commit body names the defect it was witnessed against, which is where this project already records that evidence. |

**The finding behind the findings, and the one that changes the shape of the
work.** The seat counted **nine** modules under `src/infrastructure/` that mutate
the filesystem; this plan hardened two. Its cycle-2 prediction is that adapter
number ten arrives not knowing the rule exists and § 1's sentence gets written a
second time about this very change — `shotgun-surgery`, with nothing making the
population discoverable. Independently counted here and the nine agree.

That is answered structurally rather than by hardening all nine. Three carry a
caller-influenced path component or a destructive sink and are fixed:
`DenoFsWriter`, `FsStagingStore`, `SpecCacheWriter`. The other six are excluded
with a written reason each — four build fixed literal paths under `projectDir`
with no caller component, and two (`credential_store.ts`, `github_api.ts`) are
not project-scoped at all: one writes the user's own credential directory, the
other the running binary's path during self-update. **A completeness sweep
enumerates the population and fails when a module belongs to neither set**, so
adapter ten is a red test rather than a repeat of this ticket. FR-008.

**Two claims the seat checked and confirmed rather than found**, recorded
because a clean verdict is worth what it covered: `assertSafeDestination` really
is the only containment `DenoFsWriter` performs, and FR-006's unreachability
claim holds — `stagingStore.read` and `delete` have exactly one caller each,
both after `ReconcilePathUseCase`'s `no-lock-entry` return.

## 11. Security audit

`security-expert`, plan-time, same message as the architecture audit.
**Verdict: fail** — 1 CRITICAL, 4 HIGH, 3 MEDIUM, 2 LOW. Every escape it claims
was executed in a sandbox rather than reasoned, and the four that carry the
scope change were re-executed here before acceptance.

**Both seats found the same CRITICAL independently, from different directions.**
The architect found it by reading § 6 against SC-001; the security seat found it
by running the plan's own shape B against the plan's own predicate. When two
seats with different questions land on one sentence, that sentence is the
finding.

| # | Finding | Disposition |
| :- | :------ | :---------- |
| **F1** | **The specified predicate says "inside" for the plan's own reproduced escape B**, and `Deno.chmod` follows the leaf link too — so the escape is a write *and* a mode change. Also: "try `realPath(dest)`, fall back to the parent on `NotFound`" is the obvious correction and is **also wrong**, because a dangling symlink throws the same `NotFound` as an absent dest and the fallback then creates the outside file. | **ACCEPTED**, and the same CRITICAL as F-01. `lstat` first, so an existing dest and an absent one are distinguishable; resolve a symlink explicitly rather than inferring it from an exception. Measured here that `Deno.realPath` does **not** throw on a dangling link on this platform — which means the fallback is not even reached — but the suite runs on three platforms and a predicate that depends on which one is a predicate with two behaviours. Both paths are specified. |
| **F2** | **`mkdir -p` runs before the check by explicit instruction of the edge-case table**, and recursive `mkdir` walks through a symlinked component to create real directories on the other side. | **ACCEPTED** — the same HIGH as F-01b, found independently, and this seat reproduced it. The edge-case row that mandated the ordering is deleted, not softened: it was the finding. |
| **F3** | **The claimed sink set is 4; the real one is 17.** Seven `.specnaut/`-relative sinks never pass through `DenoFsWriter` at all — `FsLockStore.write`, `FsUpgradeMarkerStore.write`/`.delete`, `FsPreserveStore.write`, `SpecCacheWriter.write`/`.clear`, `initBacklogConfigStub`, `writeCloudConfig` — and all seven are reached through one symlinked `.specnaut`. Pinning the predicate inside `deno_fs_writer.ts` puts it out of reach of every one of them. | **ACCEPTED.** This is F-02's home problem with the cost made concrete, and it is the finding that re-sizes the ticket. `SpecCacheWriter.clear` was measured here: a file planted at the link target was destroyed by a recursive delete. |
| **F4** | **`migrateLegacyConfigDir` manufactures the symlinked `.specnaut/` that F3 then walks through.** `isDir` uses `Deno.stat`, which follows links, so a symlinked `.specflow` reports as a directory; `Deno.rename` moves the **link**; `.specnaut/` is now a symlink pointing outside. `init` and `upgrade` call this first, before anything else. | **ACCEPTED, and re-measured here end to end** — verdict `migrated`, `.specnaut` is a symlink to the outside directory, the outside contents untouched and now inside Specnaut's write path. Neither the ticket nor the plan mentioned this file. It is a **creation** primitive, not a traversal one: one shipped symlink, and every sink in F3 follows. |
| **F5** | **Reads are wholly unguarded and the bytes reach stdout.** `DenoFsReader.readText` is three lines with no validator of any kind. A bundle dest symlinked to a file outside the project makes `specnaut diff` render that file's contents as a unified diff. The lock amplifies it: `parseLock` validates every entry *value* and no entry *key*, and `.specnaut/installed.lock` is not in the scaffolded `.gitignore`, so a cloned repo supplies the key set. | **ACCEPTED, and re-measured here with the real binary**: a file outside the project was printed to stdout, line for line, by `specnaut diff`. This is an exfiltration primitive and it needs no `..`, no absolute path and no lock tampering. § 1's severity bound — *"a hostile repo already has other ways to run code"* — is fair for the write findings and **does not bound this one**: this CLI's stdout is routinely read into a coding agent's context and into CI logs, so "prints to the terminal" is not a local-only outcome. Reads come into scope. |
| **F6** | **FR-004's throw collides with `pruneEmptyParents`'s best-effort contract**, and — the part neither the plan nor F-08 saw — **if FR-003 makes the root `realPath`'d while the prune walk's `current` stays lexical, the predicate returns "outside" for every path on macOS and the prune silently stops running.** Reproduced. | **ACCEPTED, and this is the trap that would have shipped.** It is the Windows prefix bug that function's comment commemorates, re-entering from the opposite direction — a guard that reports clean because it never runs. FR-002 requires both sides resolved the same way, at every caller. |
| **F7** | **Hardlinks defeat any path-resolution check**: `realPath` returns the in-project path and `isSymlink` is false, so the write goes through the shared inode. SC-001's absolute wording is false. | **ACCEPTED as a limit, not fixed.** Git cannot ship a hardlink, so it is outside the stated threat model, and the seat said so rather than inflating it. SC-001 is narrowed to symlinks and § 9 carries the limit. |
| **F8** | **A backup of a symlinked dest moves the LINK and reports it as a content backup.** The `.specnaut.bak` is itself a symlink, the user's content is still at the target, restoring it restores a pointer — and the moved link is now named `*.specnaut.bak`, which the scaffolded `.gitignore` hides. | **ACCEPTED.** The asymmetry is the tell: `backupExisting: false` refuses to touch the link, `backupExisting: true` dismantles it, and the code comment justifies the second as "the caller is already safe" — safe against destroying the target, silent about destroying the link. FR-010 corrects the ACCOUNTING; the rename is unchanged (see § 12 item 6). |
| **F9** | `realPath` on the ROOT can only move it up a link, never down, so a root that resolves broader makes everything under it "inside". | **ACCEPTED as cheap insurance.** The attacker does not control the root in this threat model and the seat labelled it theoretical rather than dressing it up. Two mitigations cost nothing: refuse a resolved root of `/` or `$HOME`, and print the resolved root in the refusal so a widening is visible the first time it happens. |
| **F10** | The TOCTOU scope-out is right; the justification is not. "An attacker who already has write access" understates the actor set — an editor, a file watcher and a package manager touch the tree during a run — and the window spans the whole bundle loop rather than two syscalls, because of F2. | **ACCEPTED.** Kept out of scope; the reasoning is restated. Deno exposes no `O_NOFOLLOW`, no `openat` and no fd-relative write, so check-then-write is the only shape available and there is no cheap closure to defer. |

**The scope change, stated plainly.** The ticket named two functions. The audits
found the same defect in fifteen more sinks, in a read path that reaches stdout,
and in a migrator that creates the condition all of them need. Nothing here is a
new defect class — it is the one #574 describes, swept instead of sampled, which
is the rule this project already applies to its own guards. #574 is re-sized
S → L on that basis, with the sink table below as the population.

**§ I and § XI: pass**, checked by the seat. The plan names no private-half
identifier and no consuming project; its examples are invented. Recorded because
a clean verdict is worth what it covered.

## 12. Open questions and settled decisions

Settled here rather than escalated, per this workspace's standing instruction.
Each is a decision a wrong assumption would make visible, which is why they are
one line each rather than buried.

1. **Throw, not skip** (row 3). A skip keeps the run going, but the run is a
   bundle write: half would land and the report would not say which half. The
   function throws rather than returning a boolean, so no call site is offered
   the choice — the codepath already has a working skip idiom one line from the
   natural insertion point.
2. **The predicate goes to the domain, the resolver stays in infrastructure**
   (FR-005). Pinning both inside `deno_fs_writer.ts` would force seven other
   adapters into an infra→infra import or a copy. Putting `isInside` beside
   `assertSafeDestination` also answers the question a reader will otherwise ask
   in a year: why one path rule lives in the domain and an apparently identical
   one does not.
3. **Reads come into scope** (FR-009). The ticket and the first plan were about
   writes. The read path uses the identical mechanism, has no validator at all,
   and ends in stdout — measured. Deferring it means re-litigating the
   resolution rule, the root and the refusal policy a second time.
4. **`spec_cache_writer.ts` comes into scope**, reversing the first version's
   § 12 item 4. That entry cleared it because `slug()` strips every separator
   from the filename — true, and it answers the injection question while saying
   nothing about the prefix. `clear()` is the codebase's only recursive delete.
   The original reasoning is kept here rather than deleted: it was right about
   what it examined, and wrong about what it did not.
5. **Hardlinks are a stated limit, not a gap** (SC-001, § 9). Recorded so the
   next reader does not file it as a miss.
6. **What a backup of a symlinked dest REPORTS is corrected; the branches are
   not unified** (FR-010). An earlier draft of this plan said "unified" in two
   places and the review was right that the code disagreed with it — but it was
   the plan that was wrong. FR-010 only ever asked that a backup stop reporting
   a pointer as content, and unifying the branches would require editing the
   case in `write_bundle_symlink_test.ts` that pins the rename, which T019 makes
   the signal that a fix has become a scope change.
7. **`.specnaut/installed.lock` is repo-controlled**, and the first version of
   FR-006 asserted the opposite — that lock keys have already passed
   `assertSafeDestination`. They have, in a lock this binary wrote; a cloned
   repo ships its own, and the scaffolded `.gitignore` does not exclude it. The
   claim is corrected rather than quietly dropped, because it was load-bearing
   for calling the staging store unreachable.
8. **The sweep, not a bigger list** (FR-011). Hardening seventeen sinks by hand
   and writing them down is the same answer that produced the four-sink list
   this plan started with. The population has to be derived from the tree, or
   the next module is invisible the same way.
