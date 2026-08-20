// The opaque unit of a specification exchanged with SpecNaut Cloud (spec 020).
//
// A step is one named markdown section of a spec — the framework phase
// (`plan`, `tasks`, …). It is deliberately opaque to the cloud: only
// `key`, `name`, `order`, and `body` cross the wire. This is the SOLE shape that
// crosses the OSS↔Cloud boundary for specs (constitution § I) — no CLI framework
// identifier, no private-half type, ever travels with it.

/**
 * One ordered, named markdown section of a specification.
 *
 * - `key`   — stable slug the cloud upserts on (e.g. `"plan"`, `"tasks"`).
 * - `name`  — human-readable tab label (e.g. `"Plan"`).
 * - `order` — 1-based display / materialisation order.
 * - `body`  — the raw markdown content.
 */
export type SpecStep = {
  readonly key: string;
  readonly name: string;
  readonly order: number;
  readonly body: string;
};
