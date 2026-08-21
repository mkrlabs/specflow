# Bundled agents — naming and effort

Two conventions govern this directory: what an agent is **called**, and how
much reasoning budget it is **given**. Both are assigned by role class, so
that adding an agent is a lookup rather than a judgement call.

## Naming — the suffix carries meaning

An agent's suffix is not decoration. It tells you how the agent is reached
and what it is allowed to do, and the fleet is meant to stay legible when
someone reads a dispatch line without opening the agent file.

| Suffix | Meaning | Agents |
| ------ | ------- | ------ |
| `<domain>-expert` | A review lens that **also** has a standalone `/specnaut audit <domain>` phase — dual mode: per-diff review *and* whole-codebase audit | `accessibility-expert`, `architect-expert`, `dependency-expert`, `performance-expert`, `security-expert` |
| `<domain>-reviewer` | A review lens with **no** audit phase — it only ever sees a diff | `code-reviewer`, `test-reviewer` |
| `-coordinator` | Fans out the lenses of a **single** phase and aggregates what returns | `review-coordinator` |
| `-manager` | Drives a **multi-phase** delivery across several agents | `workflow-manager` |
| role noun | Does the work rather than judging it | `developer`, `qa-tester`, `devops-sre`, `product-owner`, `ui-ux-designer` |

Two rules follow, and they are the whole point of writing this down:

- **`-expert` ⇔ an audit phase exists.** The five `-expert` agents correspond
  exactly to the five `audit-*.md` phases. If you give `code-reviewer` or
  `test-reviewer` an audit phase, **rename it to `-expert` in the same
  change** — otherwise the suffix stops predicting anything and the next
  person picks one at random.
- **Agents spell the domain out; skills may abbreviate.** The agent is
  `accessibility-expert` while its skill is `a11y-audit`, and that asymmetry
  is deliberate: a skill name is *typed by a human* at a prompt, where short
  wins, whereas an agent name is *matched semantically by a model* against a
  request, where `a11y` is a far weaker signal than `accessibility`. Optimise
  each for its own reader.

`specnaut-guide` is the deliberate exception to the table — the only agent
named after the tool itself. It answers questions about Specnaut rather than
reviewing your code, so it carries neither a lens suffix nor a role noun. It
is **not** an `-expert`: giving it that suffix would imply an
`/specnaut audit specnaut` phase that does not and should not exist.

## Effort — the reasoning budget

Every bundled agent declares `model:` and `effort:` in its frontmatter.
`effort` is a reasoning-budget hint the harness reads on dispatch: a higher
tier thinks harder and costs more.

**Every bundled agent is `model: opus`.** Opus is the capable default, and a
fleet that mixes tiers mostly produces a fleet where the cheap agents are the
ones that miss things — the failure is silent, arrives as a clean report, and
costs more to discover later than the tokens it saved.

| Tier | Role class | Agents |
| ---- | ---------- | ------ |
| `high` | Everything not below — review lenses, orchestrators, the backlog owner, the design agent, the explainer | `accessibility-expert`, `dependency-expert`, `performance-expert`, `code-reviewer`, `test-reviewer`, `review-coordinator`, `workflow-manager`, `product-owner`, `ui-ux-designer`, `specnaut-guide` |
| `xhigh` | Agentic work, and the two lenses whose misses are hardest to recover from | `developer`, `qa-tester`, `devops-sre`, `architect-expert`, `security-expert` |

Tally: 10 `high` · 5 `xhigh` = 15 agents. `low` and `medium` remain valid
values for a project's own agents; **no bundled agent uses them.**

### Why `high` is the floor

The earlier rubric put review lenses at `medium` and orchestrators at `low`,
reasoning that a dispatcher does not think and a read-only pass needs less
depth than writing code. Both halves turned out to be wrong in the same way.

- **A review lens under-provisioned fails quietly.** It returns a
  well-formatted report with fewer findings, which is indistinguishable from
  clean code. There is no error, no retry, and nothing downstream notices —
  the saving is visible and the cost is not.
- **An orchestrator does reason.** `review-coordinator` decides *which*
  lenses to fire against a given diff and reconciles findings that several
  of them report differently; `workflow-manager` sequences a delivery and
  judges when a phase is actually done. Neither is a switch statement.

The compound-cost worry behind the old `low` tier is real — a coordinator
pays its own budget plus every child's — but it is an argument for fanning
out fewer lenses, not for the one agent choosing them thinking less.

### Why `architect-expert` and `security-expert` go further

These two are `xhigh` for the same reason the coding agents are: their misses
are the ones you cannot cheaply undo. A missed vulnerability ships. A missed
layering violation is load-bearing by the time anyone sees it. Both need to
hold a whole-system model in mind rather than pattern-match a diff, which is
exactly what the extra budget buys.

### How the two axes reach other harnesses

`model:` and `effort:` are Claude's vocabulary, but they describe two axes
every harness has. On Codex they translate onto its own two, in
`src/domain/codex_models.ts`:

| Specnaut | Codex |
| -------- | ----- |
| `model: opus` | `model = "gpt-5.6-sol"` |
| `model: sonnet` | `model = "gpt-5.6-terra"` |
| `model: haiku` | `model = "gpt-5.6-luna"` |
| `effort: low` / `medium` / `high` / `xhigh` | `model_reasoning_effort`, verbatim |

Specnaut's effort vocabulary is a strict subset of Codex's
(`ultra`, `max`, `xhigh`, `high`, `medium`, `low`), so that half is identity.
`ultra` and `max` are never emitted — a subagent is already the unit `ultra`
fans out over.

An unrecognised value on either axis omits that key rather than guessing, so
the subagent inherits the parent session's setting. A wrong pin fails on the
user's machine, against a model list we cannot see; inheriting cannot.

**When OpenAI renames a model, `src/domain/codex_models.ts` is the only file
to edit.** The ids live there for that reason, and a fleet-level test asserts
every emitted id is one of the three.

### Adding an agent

Pick the suffix from the naming table, then the tier from the effort table.
Default to `high`; reach for `xhigh` only for agentic work or an
irreversible-miss lens. `xhigh` requires `model: opus` — a Sonnet-pinned
agent declaring it is rejected by the harness on dispatch, which is why the
all-Opus rule above makes the tier universally available.
