
## User Input

```text
$ARGUMENTS
```

## Preconditions

- The feature branch must be checked out.
- All Specnaut phases must have completed successfully (plan, tasks, implement, review).
- `$ARGUMENTS` is optional and may contain, in any order:
  - a **base branch** — the first token that is not a flag. Defaults to `main`.
  - **`--pr`** — deliver through a pull request instead of merging locally. Off by default.

## The default is a local merge. `--pr` is the opt-in.

This phase lands the branch on the base branch with a local fast-forward. It does not open a pull
request, does not push a branch for review, and does not need a forge to exist. That is the default
because it is what most work actually needs, and because a merge you can perform is a merge that
cannot be left half-done in somebody else's queue.

Pass `--pr` when the project genuinely requires the round-trip — a protected base branch, a review
another human must sign off, or a CI job that only triggers on `pull_request`. The squash still runs
first (step 4), so the PR carries the same readable history; the phase then pushes the branch, opens
the PR, and stops.

**Do not infer `--pr` from the presence of a remote, a forge, or an open issue.** A project that
wanted pull requests will say so.

## Steps

1. Determine the base branch from `$ARGUMENTS` (default `main`), and whether `--pr` was passed.
2. Run `git status --porcelain` — abort if the working tree is dirty.
3. Run `git fetch origin <base>` and verify the current branch is up-to-date with `origin/<base>`
   (fast-forward or rebase first if behind).
4. **Squash by scope** — see the section below. This phase performs the squash; it does not check
   that somebody else did it, and it does not ask permission to do its own job.
5. **`--pr` only** — push the feature branch, open the pull request against `<base>`, and **stop
   here**. First run `gh pr view <n> --json closingIssuesReferences` and name any issue the
   body references but that list omits — mentioned, not closed. Report only. Then: report the PR URL and end. Nothing below this line applies, because nothing has merged
   yet. In particular the backlog item stays where it is — a PR that is open is not work that is
   done, and flipping the column now would make the board claim an outcome the repository cannot
   corroborate. Re-run `/specnaut merge` (without `--pr`) after the PR lands, or let the forge's own
   close-keyword handle it.
6. Run `git checkout <base>`.
7. Run `git merge --ff-only <feature-branch>`. If fast-forward is not possible, stop and ask the
   user whether to rebase.
8. Print the merge summary (files changed, commits merged).
9. Ask the user: "Push to origin <base>? (yes/no)" — **unless they already told you to merge**, in
   which case pushing is part of the instruction they gave and asking re-collects permission
   already granted at the most expensive moment: the very end of the chain.
10. **End on the base branch.** A merge is not finished while `HEAD` is still on the feature branch —
    landing the commits is half of it; the other half is that the person who asked is back where they
    work. Delete the merged branch (`git branch -d`, never `-D`: a refusal means the merge did not
    actually land, which is a finding, not an obstacle), then **verify with
    `git rev-parse --abbrev-ref HEAD` and quote the result in the report.** This failure is invisible
    from your side — the commits ARE on the base branch, everything looks right, and only the human
    sees the wrong branch name in their prompt.

11. **Close the linked backlog issue** (only if push happened and `feature.json.linked_issue` is set):
    1. Read `.specnaut/feature.json`. Extract `linked_issue` (`jq -r '.linked_issue // empty'`).
       If absent / null / empty, skip the rest of step 11 silently — no backlog backend wiring
       to act on.
    2. Detect the backend by checking `.specnaut/installed.lock` (`backlog_backend: <local|github|gitlab>`)
       or, equivalently, the presence of `.specnaut/backlog-config.yml` (github/gitlab) vs
       `.specnaut/backlog.md` (local).
    3. **github + gitlab only** — run `bash .specnaut/scripts/backlog/cascade-check.sh <linked_issue>`.
       Exit 11 means the parent has open sub-issues; do NOT close. Report the open children to the
       user and stop (the issue stays in `In progress` / `Ready` until the children are closed).
    4. Ask the user to confirm, naming the item per the `backlog-reference-contract`
       skill — number, title, and a resolved link, never a bare number. The user is being
       asked to authorise an action on an item they must be able to identify. On `no`, skip the
       rest of step 11 — leave the column flip to a future run or to a manual `move.sh`.
    5. On `yes`, run `bash .specnaut/scripts/backlog/move.sh <linked_issue> Done`. This is the
       mechanical column flip — `move.sh` is idempotent and the working contract permits the merge
       phase to call it directly (the PO retains exclusive ownership of the close + comment, not
       the column move).
    6. **github + gitlab only** — dispatch the `product-owner` subagent with the prompt:
       "The branch for issue #<linked_issue> just landed on `main`. The mechanical move to Done has
       already been done via `move.sh`. Please run the second half of the two-step close: post
       a close comment on the issue referencing the merged commit range `<first-sha>..<last-sha>`
       (from step 8's summary), then `gh issue close <linked_issue> --reason completed`. Confirm
       with a one-line report." This keeps the audit comment under PO ownership and surfaces the
       `docs audit` line from the PO's close-step contract.
    7. **local backend only** — `move.sh <id> Done` already flipped the frontmatter; no second
       step needed. The local backlog has no separate "issue" object beyond the file itself.

    Backward-compat: feature trees without `linked_issue` (created before this field existed)
    skip step 11 silently. A feature delivered across several branches — the last one has not
    landed yet — the user answers `no` in step 11.4 and re-runs `/specnaut merge` on the last one.

12. **Reconcile the board** (only if push happened; github + gitlab backends only).
    Run `bash .specnaut/scripts/backlog/sweep-closed.sh --passes 2` — its header
    explains the second pass. It reports; it moves nothing.

    - Collect every `DRIFTED <number>` and move them in **one** call:
      `bash .specnaut/scripts/backlog/move-batch.sh Done <n> <n> …` (github) or a
      `move.sh` per item (gitlab). A card it reports as absent from the project is
      reported and skipped — one bad card never aborts the rest, and nothing here
      may fail the merge, which has already happened.
    - For each `REOPENED <number>` line, **report it and move nothing.** `Ready` vs
      `In progress` is not guessable, and guessing wrong is worse than saying so.
    - Quote the script's **summary line** in the report, not your own count.

    Step 11 only ever sees `feature.json.linked_issue`; a `Closes #N` in a commit
    body, a web-UI close or another agent's close is invisible to it. This step asks
    the board whether it agrees with the repository, rather than asking the merge
    what it believes it closed — the second question is answerable without being
    true.

## Squash by scope — one commit per scope, never "exactly one commit"

A branch usually carries more than one kind of change, and collapsing them into a single commit
destroys the thing squashing exists to produce: **a history a human can read.**

| What is on the branch | Where it goes |
| :--- | :--- |
| The feature itself — rules, domain, service, UI, its tests | **One** commit, `<type>(<id>): <what it does>` |
| Generated artefacts the feature invalidated — bundles, codegen output, lockfiles | Its own `chore(codegen):` commit |
| Configuration, tooling, CI unrelated to the feature | Its own `chore(...)` / `ci(...)` commit |
| Documentation or agent memory written alongside | Its own `docs(...)` commit |
| A fix to a **pre-existing** defect the branch happened to expose | Its own commit, with **its own** backlog id — never the feature's |

**Every commit subject carries the backlog id of the thing it is about**, in the scope position:
`feat(412): …`, `fix(389): …`, and `chore(codegen):` where the commit belongs to no item. That id is
what makes `git log --oneline` readable against the board, and it is why a pre-existing fix must not
inherit the feature's id — that would attribute work to an item which never asked for it. The id
comes from whichever backlog backend the project uses; no backend-specific syntax is required.

### Procedure

1. `git log <base>..HEAD --oneline` — read what is actually there.
2. Group the commits by scope using the table above, and **show the grouping**.
3. `git reset --soft <base>`, then re-commit **one group at a time**, staging paths **by name**.
   Never `git add -A` — a sweep is the fastest way to pull in something the branch never had.
4. `git log <base>..HEAD --oneline` again. The result is one commit per scope, in an order that
   reads forwards: the feature first, its codegen after it, unrelated changes last.

**Do not stop between steps 2 and 3.** The grouping is shown so the user can see what happened, not
so they can approve it mid-run. Asking for the merge *is* asking for the squash. The one thing that
legitimately halts here is a file you cannot classify — name those files, say why, and ask about
**those files only**.

### Verification, which is not optional

- **`git diff <base>..HEAD` must be byte-identical to what it was before the squash.** A squash that
  changes the tree is not a squash, it is a rewrite. Capture the diff before step 3 and compare
  after step 4.
- **`git status --short` must then be empty.** If anything appears:
  - **Untracked (`??`)** — usually generated output. Decide per file: it belongs either to the
    codegen commit or to `.gitignore`. Never leave it dangling and never report success over it.
  - **Modified** — something wrote to the tree during the squash. Find out what before going
    further; an agent still holding the worktree is the usual answer, and it must be stopped first.

### The squash happens either way

Squash by scope runs on the `--pr` path too, before the branch is pushed — so the pull request
carries the same readable history the local path would have produced. Then **do not use the forge's
"Squash and merge" button**: it collapses the scopes back into the single commit this whole
procedure exists to avoid. Merge the PR with a merge or rebase strategy, or land it locally.

A repository whose base branch is **protected** cannot take the local path at all — the push is
rejected. That is precisely what `--pr` is for; it is not a reason for this phase to guess.

## Output

A structured report with: files merged, commits merged, whether the user chose to push, and — when
step 11 ran — whether the linked issue was closed (and via which backend), or skipped (and why:
no `linked_issue`, user declined, or `cascade-check` blocked the close). It must also quote
the branch `HEAD` is on after the merge, from `git rev-parse --abbrev-ref HEAD` — a merge report
that claims success without naming the branch is unverifiable.

When step 12 ran, quote `sweep-closed.sh`'s summary line verbatim and list any card it moved and
any `REOPENED` it reported. Report the summary even when nothing moved: "drifted 0" is the evidence
that the board was checked, and omitting it makes a checked board indistinguishable from a skipped
step.

On the `--pr` path the report is shorter and must say so plainly: the branch pushed, the PR URL,
and the fact that **nothing has merged and the backlog item has not moved**. A report that reads
like a completed merge when a PR is merely open is the failure this phase is most likely to produce.
