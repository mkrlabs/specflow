# `scripts/smoke/` — the suite that runs the real binary

The Deno suite asserts what the bundle contains. These scripts assert what a user actually gets:
they scaffold throwaway projects under `sandbox/` with the working-tree binary and check the result.

```bash
bash scripts/smoke/run-all.sh              # the whole suite + the audit
bash scripts/smoke/run-all.sh --list       # suite membership
bash scripts/smoke/run-all.sh --only smoke-hooks.sh
bash scripts/smoke/run-all.sh --no-bundle    # skip the re-bundle — rarely right
bash scripts/smoke/audit.sh                # coverage + staleness only
```

`smoke.yml` runs `run-all.sh` on every push and pull request. `.specnaut/release/preflight.sh` runs
`audit.sh` before a release.

## The scripts

**Toolbox** (no assertions — building blocks for interactive work): `bootstrap-vite.sh` (brownfield
fixture; `--real` for a genuine pinned `create-vite` scaffold), `bootstrap-empty.sh`, `run-init.sh`,
`inspect.sh`, `compare-harnesses.sh`, `clean.sh`.

**The suite** — enumerated by `SUITE_FILES` in `_common.sh`, which `audit.sh` checks against the
scripts actually on disk. A script that exists but is not listed is a finding, not an omission.

**`audit.sh`** — the coverage gate. **`smoke-audit.sh`** — its meta-test.

## `_common.sh` owns five decisions

Path resolution, suite membership, the assertion harness, what a valid scenario name is, and what counts
as code in a smoke script. Source
it; never re-derive any of them locally. It is written for **bash 3.2**, because macOS ships that
and the interactive scenarios exist for that machine.

## Audit heuristics

`audit.sh` compares the working tree against the newest `v*.*.*` tag and reports five things. It
exits **1** on any of the first four — the table below marks which. Exit **2** means it could not
resolve a baseline (a shallow or tagless clone) and **3** that `--src-root` is not a git work tree;
neither is a findings verdict, and `.specnaut/release/preflight.sh` branches on that difference.

| Finding                    | What it means                                                                                                                              |
| :------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------- |
| **Coverage gap**           | A changed file under a mapped surface that no smoke names by basename. Fatal unless allow-listed.                                          |
| **Stale assertion**        | A smoke references a runtime path with no source counterpart under `templates/`. Fatal.                                                    |
| **Stale allowlist entry**  | An allow-listed path that no longer exists, or an entry with no written reason. Fatal.                                                     |
| **Suite-membership drift** | `SUITE_FILES` and the scripts on disk disagree. Fatal.                                                                                     |
| **Unmapped surface**       | A changed file under `templates/core/` that no glob claims. Reported and counted, **not** fatal — the defect is invisibility, not the gap. |

The surface map lives in the `SURFACES` array in `audit.sh`; each entry is
`<glob>|<smoke-script-list>|<kind>`. The stale scan walks the smoke scripts it enumerates from the
smoke directory itself — there is no second list to keep in step — extracts each
`.claude/…` / `.specnaut/…` token, and maps it back to a candidate under `templates/core/` or
`templates/harness-specific/<harness>/`. Runtime-only paths (`installed.lock`, `specs/`, `logs/`, …)
are skipped explicitly, and a path a smoke only ever asserts the **absence** of is not stale — that
is the correct assertion for a deliberately removed artefact.

### What counts as a mention

A basename found **only inside a comment does not count as coverage**. A comment resolves nothing and
asserts nothing, and a comment saying a file is deliberately uncovered would otherwise vouch for it.
The rule is about what a script *does*, not what it mentions.

`_common.sh`'s `smoke_code_lines()` is the single home for that decision, and both guards that need
it — the coverage match here and `run-all.sh`'s boundary check — ask it rather than carrying their
own expression. It tracks single and double quotes and cuts at the first **unquoted** `#` that
begins a word.

Two properties the callers depend on, and the reason the rule is not simply `sed 's/#.*$//'`:

- **It removes a suffix, never an interior span.** Every output line is a prefix of its input, so a
  fixed-string search can lose a match but never invent one. Coverage detection therefore fails
  **closed** by construction — the direction a gate must fail in.
- **Line numbering is preserved.** Lines are blanked, never dropped, so a caller reporting
  `file:line` still reports the right one.

The naive expression cuts at the *first* `#` on a line, and shell puts one inside `${var#prefix}`
and inside every `echo "═══ #180  add.sh …"` banner this suite writes. Measured over these scripts
it discards several hundred lines of real code against the genuine comments it is meant to remove.

**Known limit, stated rather than implied:** the scan resets on every line, so heredoc bodies are
not analysed. This suite embeds `.gitignore`, CSS, Markdown and Python inside heredocs, where a `#`
is not a shell comment; it is scored as one, and the damage is bounded to that line.

The audit reports; it never edits a smoke script.

## Deferring an assertion

Add the path to `coverage-allowlist.txt` **with a written reason**. An entry without one is ignored,
so the gap stays fatal. `audit.sh` reports an entry whose file has disappeared, so the file cannot
quietly become a dumping ground.

## Conventions

- Scenarios live in `sandbox/<name>/`, which is gitignored. They are wiped on every exit path.
- The scripts run `deno run --allow-all src/main.ts` — the working tree, not an installed binary.
- `--no-bundle` skips that re-bundle. It is the only flag that changes what the suite asserts
  against, which is why it is almost never the right one.
- `run-all.sh` runs `deno task bundle` first and restores the file afterwards. `specnaut init`
  scaffolds from the generated `src/templates_bundle.ts`, so a suite that skips that step asserts
  against a stale artefact and goes green on a change it never saw.
- All scripts are idempotent; re-running is always safe.
