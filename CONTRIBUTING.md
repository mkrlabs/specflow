# Contributing to Specnaut

## Agent adoption {#agent-adoption}

Every `feat: …` / `feat(scope): …` / `feat!: …` commit MUST carry an `## Agent adoption` section
**in its commit message body**. The section is the contract between the author and the release
pipeline:

1. `scripts/gen-changelog.ts` extracts the section at release time.
2. It lands in the GitHub Release body under `### Adoption guide`.
3. After `specnaut upgrade`, the `specnaut-guide` agent reads the release body and plays each
   adoption prompt one at a time in the user's project.

**In the commit, not in the PR.** Features land here with a local fast-forward — `/specnaut merge`
opens no pull request unless you pass `--pr`. While the section lived in a PR body, a locally merged
feature had nowhere for the generator to read it from, and its guide disappeared from the release
notes with no error and no warning. The commit travels with the change wherever it lands.

Write it during the squash-by-scope step of `/specnaut merge`, or add it after the fact with
`git commit --amend`. `scripts/check-adoption.ts` is the gate:

```sh
deno run --allow-run scripts/check-adoption.ts --from main --to HEAD
```

`.github/workflows/adoption_lint.yml` runs that same script on every push to `main` and on every
pull request — one rule, one implementation. It used to be re-stated in shell inside the workflow
while `gen-changelog.ts` decided the same question in TypeScript; the two definitions drifted, the
laxer one guarded the gate, and an entire major release's feature set was exempted without anyone
noticing. Do not re-derive the rule anywhere; call the script.

A PR body may still carry the section — the generator falls back to it, so release notes for
anything published before this convention changed still regenerate correctly. New work must not rely
on that path.

### Format

````markdown
## Agent adoption

<one-paragraph prose explaining what existing projects need to do>

```prompt
<one ready-to-paste prompt for an AI agent>
```
````

- Use the language `` ```prompt `` for the fenced code block — this is how the release pipeline
  finds it.
- Prose first, prompt second. Keep prose under 100 words.
- Address an AI agent in the prompt, not a human. Prefer concrete file paths and literal command
  names.

### Example: a deprecation

````markdown
## Agent adoption

`/specnaut specify "<feature>"` now chains every phase through to `review` in a single session. If
your project has agent rules or documentation pointing users at `/specnaut-auto`, update them to
`/specnaut specify`. `--manual` is the per-phase opt-out.

```prompt
Audit my project for any reference to `/specnaut-auto` in:
  - `.claude/agents/*.md`
  - `.cursor/rules/*.mdc`
  - `AGENTS.md`, `CLAUDE.md`

Replace each with `/specnaut specify "<…>"`. Add a brief note explaining
`--manual` is the per-phase opt-out. Open a PR with the changes.
```
````

### Example: a new command

````markdown
## Agent adoption

`specnaut reconcile` is a new subcommand for per-file post-upgrade reconciliation. Projects with
`.claude/agents/` or harness rules that document the upgrade flow should mention it.

```prompt
Add a short note to my project's `.claude/agents/specnaut-guide.md` (and any
equivalent agent files for other harnesses) that `specnaut reconcile --status`
lists pending post-upgrade reconciliation. Open a PR.
```
````

### When `feat:` is the wrong type

A `feat` that touches nothing under `src/`, `templates/` or `plugin/` ships no file any user
installs, and `check-adoption.ts` refuses it. Use `chore:`.

The rule exists because this gate can push in the wrong direction. A repo-internal release script
was once committed as `feat`, which made the gate demand an adoption guide, which was then written
by inventing a user-facing story — it told an agent to confirm the file "arrived with the upgrade",
and that file is not in the manifest and never arrives. **A gate that asks the wrong question gets
an answer invented to satisfy it.**

Some repo-internal changes genuinely are features.
`feat(changelog): read the
adoption guide from the commit body` touched only `scripts/` and
`.github/`, and it changed the release notes users read. For those, add a trailer:

```
Repo-internal: changes the release notes users read.
```

One line, stating why a change that ships nothing is still user-facing. It is a prompt for a
sentence, not a prohibition — but the sentence has to exist, so the claim is deliberate rather than
assumed.

### When the section is optional

`fix:`, `chore:`, `refactor:`, `docs:`, `test:`, and `ci:` commits may omit the section. If a `fix:`
changes user-visible behavior (rare), the section is recommended — `gen-changelog.ts` will surface
it.

### CI enforcement

`.github/workflows/adoption_lint.yml` runs `scripts/check-adoption.ts` over the pushed range on
every push to `main`, and over the base…head range on every pull request. It fails on `feat:` /
`feat!:` commits whose body lacks `## Agent adoption` followed by a `` ```prompt `` block, naming
every offending commit rather than only the first. The failure message points back to this section.

Run it yourself before landing anything:

```sh
deno run --allow-run scripts/check-adoption.ts --from main --to HEAD
```
