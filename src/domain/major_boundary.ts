/**
 * Does an upgrade from `from` to `to` cross a major-version boundary?
 *
 * `UPGRADING.md` is the only document that explains a breaking release, and
 * nothing put it in front of the person living through one: the CLI never
 * named it, and the two places that link it — the README and one published
 * release body — are not where somebody mid-upgrade is looking (#481).
 *
 * Pure, and deliberately conservative: an unparseable version on either side
 * returns `false`. A pointer that fails to print is a missed opportunity; a
 * pointer printed on every routine patch bump is noise that trains people to
 * skip the line, which costs more than it saves.
 */
const SEMVER_MAJOR = /^v?(\d+)\./;

function majorOf(version: string): number | null {
  const m = version.trim().match(SEMVER_MAJOR);
  if (m === null) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) ? n : null;
}

export function crossesMajorBoundary(from: string, to: string): boolean {
  const a = majorOf(from);
  const b = majorOf(to);
  if (a === null || b === null) return false;
  return b > a;
}

/** Where the migration guide lives, for both the repo copy and the published one. */
export const MIGRATION_GUIDE_PATH = "UPGRADING.md";
export const MIGRATION_GUIDE_URL =
  "https://github.com/specnaut/specnaut-cli/blob/main/UPGRADING.md";
