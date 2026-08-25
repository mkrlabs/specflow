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

## `_common.sh` owns four decisions

Path resolution, suite membership, the assertion harness, and what a valid scenario name is. Source
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
`<glob>|<smoke-script-list>|<kind>`. The stale scan walks every file in `SCAN_FILES`, extracts each
`.claude/…` / `.specnaut/…` token, and maps it back to a candidate under `templates/core/` or
`templates/harness-specific/<harness>/`. Runtime-only paths (`installed.lock`, `specs/`, `logs/`, …)
are skipped explicitly, and a path a smoke only ever asserts the **absence** of is not stale — that
is the correct assertion for a deliberately removed artefact.

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
