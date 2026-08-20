> **Agents depend on this file.** The architect is required to open it — and to
> read "When NOT to reach for it" — before prescribing this pattern. Moving or
> renaming it breaks that link in silence.

# Interpreter

**Family:** Behavioral

## Intent

Represent a small language as an object tree and evaluate it by walking the tree.

## The smell it cures

Ad-hoc string parsing and evaluation scattered through a codebase, usually with a [Switch Statement](../smells/switch-statements.md) per operator.

## Shape

One type per grammar rule, each able to evaluate itself against a context.
Composition of those types is the parsed expression.

## Why it earns its keep

The grammar becomes explicit and each rule is testable alone; adding a rule is a new type.

## When NOT to reach for it

The language is more than trivial. Beyond a handful of rules a parser generator or an existing library beats a hand-built tree, and performance degrades quickly. Reaching for this when a configuration format would do is over-engineering of the most expensive kind.
