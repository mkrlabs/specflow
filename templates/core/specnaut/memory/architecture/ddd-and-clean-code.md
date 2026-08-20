> **Agents depend on this file.** The architect is required to open it before
> judging layering, a boundary, a dependency direction, or a SOLID violation.
> Moving or renaming it breaks that link in silence.

# DDD, SOLID, and layering

The vocabulary for judging *where a thing belongs*, as opposed to what shape it
has. Open this when the finding is about a boundary; open a
[smell](smells/) when it is about a unit.

Nothing here assumes a language, a framework, or a directory convention. Detect
the project's own layering from its structure before applying any of it — a
codebase that never adopted a convention cannot violate it, and saying so is a
better finding than importing one.

## Building blocks

**Entity** — identity that persists while its attributes change. Two entities
with identical fields are still different things. If identity does not matter,
you want a value object.

**Value object** — defined entirely by its contents, compared by content,
immutable. This is where a rule about a value gets a home; a value object with
no invariant is usually just a named primitive, and
[Replace Data Value with Object](refactorings/replace-data-value-with-object.md)
should not have been applied.

**Aggregate** — a cluster of objects with one entity as its root, treated as a
single unit for consistency. Outside code holds the root and nothing else. The
aggregate boundary is the transaction boundary; if two things must change
together atomically, they belong in one aggregate, and if they do not, forcing
them together makes contention where none was needed.

**Repository** — the collection-like interface through which aggregates are
retrieved and stored. It belongs to the domain as an *interface* and to the
outside as an *implementation*: that split is what keeps the domain testable.

**Domain service** — behaviour that is genuinely domain logic but belongs to no
single entity or value object. A real one is rare. A service layer that grows
whenever a rule changes is [Anemic Domain Model](smells/anemic-domain-model.md),
not a domain service.

**Domain event** — a record that something meaningful happened, named in the
past tense. It lets reactions be added without the origin knowing about them —
see [Observer](patterns/observer.md) for the mechanism and its hazards.

**Bounded context** — the scope within which a term means one thing. The same
word almost always means different things to different parts of a business, and
a model that tries to serve every meaning serves none. Types from one context
should not be imported directly into another; translate at the edge.

## SOLID, as questions rather than slogans

- **Single responsibility** — *what is this unit's one reason to change?* If the
  answer needs "and", the symptom is
  [Divergent Change](smells/divergent-change.md).
- **Open/closed** — *can a new case be added without editing existing code?* If
  every new case edits the same switch, see
  [Switch Statements](smells/switch-statements.md).
- **Liskov substitution** — *can any subtype be used wherever the supertype is
  declared, without the caller checking?* If not, see
  [Refused Bequest](smells/refused-bequest.md).
- **Interface segregation** — *is any client forced to depend on members it does
  not use?* The cure is [Extract Interface](refactorings/extract-interface.md),
  declared where it is consumed.
- **Dependency inversion** — *does the important code depend on the replaceable
  code, or the other way round?* Inverting this is the whole point of the
  layering below.

## Layering and the dependency rule

The one rule, in whatever vocabulary a project uses for it:

> **Dependencies point inward. Inner code names nothing outer.**

The names vary — domain/application/infrastructure, core/app/adapters,
entities/use-cases/interface-adapters — and the rule does not.

- The **innermost** layer holds the model and its rules. It reaches for nothing
  ambient: no clock, no filesystem, no network, no environment. Where it needs
  one, it declares an interface and receives an implementation. Breaking this is
  [Implicit Global](smells/implicit-global.md).
- The **middle** layer orchestrates use cases. It sequences domain objects and
  ports; it does not itself decide domain rules, and it does not name concrete
  adapters.
- The **outer** layer implements the ports: persistence, transport, vendors, the
  entry point. It is allowed to know the inner layers; they are not allowed to
  know it. Violations are
  [Layer Violation](smells/layer-violation.md).

**Ports and adapters.** A port is an interface owned by the layer that *needs*
the capability; an adapter is an implementation living outside. Declaring the
interface beside its implementation is the most common way this is got wrong —
the file compiles, the diagram looks right, and the dependency still points the
same direction it always did.

**The composition root** is the single place allowed to know every concrete
type and wire them together. It sits outside the layers it wires. It is exempt
from [Divergent Change](smells/divergent-change.md) — churning whenever anything
it constructs changes is its job.

## What to check before calling a boundary wrong

1. **Detect the convention.** Which layering, if any, does this project actually
   use? Read its structure; do not assume one.
2. **Find the direction.** Which way does the import point, and which way should
   it point under that convention?
3. **Ask what breaks.** A boundary finding is worth stating only if you can name
   what it prevents — a test that now needs the network, an implementation that
   can no longer be swapped, a rule that can be asked two ways and answered
   differently.
4. **Count the blast radius.** How many call sites, routes, or modules does the
   change touch? Counted, not estimated. A rule described in one sentence can
   change behaviour in two hundred places, and that number is the finding.
