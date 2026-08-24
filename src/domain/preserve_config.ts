import { parse as parseYaml, stringify as stringifyYaml } from "@std/yaml";

/**
 * The maintainer's project-level preserve declarations, parsed from
 * `.specnaut/preserve.yml`.
 *
 * A **preserve declaration** is deliberate intent — "this managed file is
 * mine, keep it even on a forced refresh" — and lives in its own manifest
 * (not the lock, which is a state record). See spec 011 / issue #367.
 */
export type PreserveConfig = {
  /** Project-relative, forward-slash destination paths declared preserved. */
  readonly preserved: ReadonlyArray<string>;
};

/**
 * Canonical "no declarations" value. An absent or unparseable manifest
 * degrades to this so init/upgrade stay byte-identical to today (FR-011).
 */
export const EMPTY_PRESERVE_CONFIG: PreserveConfig = { preserved: [] };

/**
 * Normalise one declared path so membership tests against the bundle's
 * destination-path form (project-relative, forward-slash) are exact:
 * trim surrounding whitespace, fold backslashes to forward slashes, and
 * strip ALL leading `./` segments (`././x` → `x`).
 */
function normalisePath(raw: string): string {
  let p = raw.trim().replaceAll("\\", "/");
  while (p.startsWith("./")) p = p.slice(2);
  return p;
}

/**
 * True when a normalised path contains a `..` segment.
 *
 * Such entries are dropped at parse time (treated as ineffective, like any
 * unknown path). Containment rationale: declared paths are only ever tested
 * for membership against bundle-derived destination keys — which are
 * project-relative and never contain `..` — and are NEVER used for I/O. A
 * `..`-bearing entry could therefore never match a managed file and is
 * harmless today, but dropping it during parse makes the project-relative
 * containment invariant explicit rather than incidental.
 */
function hasParentTraversal(p: string): boolean {
  return p === ".." || p.split("/").includes("..");
}

/**
 * Parse `.specnaut/preserve.yml` into a {@link PreserveConfig}.
 *
 * Pure and total: it NEVER throws and NEVER judges bundle membership
 * (unknown-path validation is a run-time handler concern, D7). Any
 * unparseable, empty, or structurally-wrong document degrades to
 * {@link EMPTY_PRESERVE_CONFIG} — a malformed manifest must surface a
 * warning at the handler, never abort a refresh — see
 * {@link diagnosePreserveConfig}, which is what the handler warns from.
 *
 * Entries are normalised (trim, strip leading `./`, backslash→slash),
 * with blanks dropped and duplicates removed while preserving first-seen
 * order. Non-string list entries are ignored. Entries containing a `..`
 * path segment are dropped (containment — see {@link hasParentTraversal}).
 */
/**
 * Why a `preserve.yml` yielded no declarations — or that it yielded some.
 *
 * `parsePreserveConfig` collapses every failure to `EMPTY_PRESERVE_CONFIG`,
 * which is right for a total parser and wrong as the only signal a caller
 * gets: "unparseable", "wrong top-level key" and "empty list" become
 * indistinguishable from "no manifest", and a maintainer reads the silence as
 * protection. This is the same computation, reported instead of discarded.
 */
export type PreserveManifestDiagnosis =
  | { readonly kind: "ok"; readonly preserved: readonly string[] }
  /** The file is not YAML at all. */
  | { readonly kind: "unparseable" }
  /**
   * Parsed, but there is no top-level `preserved:` mapping key. A bare
   * top-level list lands here too — this is the shape that reads as "the
   * feature does not exist".
   */
  | { readonly kind: "missing-key" }
  /** `preserved:` is present but holds no usable string entries. */
  | { readonly kind: "no-usable-entries" };

/**
 * Classify a `preserve.yml`'s contents. {@link parsePreserveConfig} is defined
 * in terms of this, so the two cannot drift into disagreeing about what a
 * given file means.
 */
export function diagnosePreserveConfig(yaml: string): PreserveManifestDiagnosis {
  let root: unknown;
  try {
    root = parseYaml(yaml);
  } catch {
    return { kind: "unparseable" };
  }
  if (root === null || typeof root !== "object" || Array.isArray(root)) {
    return { kind: "missing-key" };
  }
  const rawPreserved = (root as Record<string, unknown>).preserved;
  if (!Array.isArray(rawPreserved)) return { kind: "missing-key" };

  const seen = new Set<string>();
  const preserved: string[] = [];
  for (const entry of rawPreserved) {
    if (typeof entry !== "string") continue;
    const p = normalisePath(entry);
    if (p.length === 0 || hasParentTraversal(p) || seen.has(p)) continue;
    seen.add(p);
    preserved.push(p);
  }
  if (preserved.length === 0) return { kind: "no-usable-entries" };
  return { kind: "ok", preserved };
}

export function parsePreserveConfig(yaml: string): PreserveConfig {
  const d = diagnosePreserveConfig(yaml);
  return d.kind === "ok" ? { preserved: [...d.preserved] } : EMPTY_PRESERVE_CONFIG;
}

/**
 * Serialize a {@link PreserveConfig} to canonical YAML (single `preserved:`
 * key, trailing newline). Round-trips with {@link parsePreserveConfig} on
 * canonical input.
 */
export function serializePreserveConfig(cfg: PreserveConfig): string {
  return stringifyYaml({ preserved: [...cfg.preserved] });
}
