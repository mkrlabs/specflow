# `templates/core/root/` — read this before editing `.gitignore`

`AGENTS.md` and `.gitignore` in this directory are **shipped product content**.
`specnaut init` scaffolds them into consumer projects (manifest category
`mergeable-project-root`), merging `.gitignore` into any file the user already
has. Editing them changes what every consumer receives.

`.gitignore` has a **second job that nothing about it announces**: because of
where it sits, git reads it as a live per-directory ignore rule over
`templates/core/root/` itself. That path is a mapped surface in
`scripts/smoke/audit.sh` (`templates/core/root/*` → `smoke-features.sh
smoke-all-harnesses.sh`), and the audit's untracked collection runs
`git ls-files --others --exclude-standard`, which honours this file. So a
pattern added here as an ordinary product change can silently narrow what the
coverage gate is able to see in **this** repository.

One file, two decisions, and only one of them is visible to whoever edits it.

## What is enforced

`tests/templates/shipped_gitignore_scope_test.ts` fails when this file gains a
pattern that can match a path inside the audited surface. Patterns anchored
under `.specnaut/` structurally cannot, and pass without ceremony. Anything
else needs a row in that test's acknowledgement table, stating what it costs
the audit. Today that table holds exactly one entry, `*.specnaut.bak`, which
has always had this effect.

## Two resolutions that were considered and rejected — do not re-open them

**Renaming the file to `gitignore` and writing the dot at scaffold time.** The
only option that removes the effect at its source, and disproportionate to the
exposure. The destination is derived from the source path through the
`mergeable-project-root` category and its suffix, so the rename reaches
`templates/manifest.json`, the generated `src/templates_bundle.ts`, every
harness's `mapBundle`, the per-harness init file-count assertions, the goldens,
and `audit.sh`'s own glob — shipped-scaffolding machinery, with a real risk of
altering a consumer's `.gitignore`, bought against a directory holding three
files.

**Neutralising the effect inside the auditor.** git offers no way to drop one
per-directory `.gitignore` while honouring another. `audit.sh` already
neutralises `core.excludesFile` and states the line it drew there:
`info/exclude` stays honoured because it is repo-local and deliberate, the same
class as `.gitignore`. Suppressing this one file means either moving it — which
is the option above — or reimplementing ignore resolution inside the auditor,
putting a second, divergent notion of the audited surface into the one script
whose entire value is that there is only one.

**Reopen condition.** If `templates/core/root/` grows beyond a handful of
files, or this `.gitignore` gains a pattern that is not `.specnaut/`-anchored
and cannot be removed, the rename becomes proportionate again.

This file is not in `templates/manifest.json` and is therefore never shipped;
it exists for the next person to edit this directory.
