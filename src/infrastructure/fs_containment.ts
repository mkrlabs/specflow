import { basename, dirname, isAbsolute, join } from "@std/path";
import { isInside } from "../domain/template.ts";

/**
 * The filesystem half of containment (cli#574). The pure half — comparing two
 * resolved strings — is `isInside` in the domain; this module is the part that
 * needs `Deno.realPath`, and it is a module of its own rather than a function
 * inside `DenoFsWriter` for one reason: **seven other adapters have to ask the
 * same question.** `FsLockStore`, `FsUpgradeMarkerStore`, `FsPreserveStore`,
 * `SpecCacheWriter`, the backlog-config stub and the cloud-config writer all
 * build paths under a project directory and none of them has any business
 * importing the bundle writer to find out whether a path is safe.
 *
 * The plan's first decision table put this inside `deno_fs_writer.ts`. That
 * address would have forced every one of those callers into an adapter-to-
 * adapter import or a local copy of the predicate — the exact duplication the
 * table exists to prevent, arriving through the table itself.
 */

/**
 * Resolves the project directory once, so every containment question in one
 * operation is asked against the same root.
 *
 * `realPath`, not `resolve`: on macOS a temp directory sits under the `/var` →
 * `/private/var` symlink, so a lexically-resolved root compared against a
 * `realPath`'d candidate reports every path in the project as outside it.
 *
 * Refuses `/` and the user's home directory. `realPath` can only ever move a
 * root UP a link, never down, so a project reached through a link that resolves
 * to something broad would make everything under that breadth count as inside.
 * Nobody scaffolds into `/` or `$HOME` on purpose, and refusing costs nothing.
 */
export async function resolveProjectRoot(projectDir: string): Promise<string> {
  const root = await Deno.realPath(projectDir);
  const home = Deno.env.get("HOME") ?? Deno.env.get("USERPROFILE");
  if (root === "/" || root === "\\") {
    throw new Error(`refusing to operate with the filesystem root as the project: ${root}`);
  }
  if (home !== undefined && home !== "" && root === await Deno.realPath(home).catch(() => home)) {
    throw new Error(`refusing to operate with the home directory as the project: ${root}`);
  }
  return root;
}

/**
 * The path a mutation or read of `abs` would actually land on, with symlinks
 * followed as the kernel would follow them.
 *
 * Three states, distinguished with `lstat` and never by catching one exception:
 *
 *  1. **Absent** — resolve the parent and append the leaf. Nothing to follow.
 *  2. **A symlink** — resolve the link explicitly. A *dangling* link resolves
 *     to where it points rather than to nothing: `Deno.writeTextFile` on a
 *     dangling link CREATES the target, so treating "cannot resolve" as "does
 *     not exist" is itself the escape this function exists to close.
 *  3. **Anything else** — `realPath`.
 *
 * The naive version of this is "try `realPath(abs)`, fall back to the parent on
 * `NotFound`". It is wrong, and quietly: a dangling link and an absent file
 * raise the same error, so the fallback says "inside" for a link pointing
 * anywhere at all. Measured here that `Deno.realPath` does not even throw on a
 * dangling link on macOS — which means a predicate written that way behaves
 * differently on two of the three platforms this suite runs on.
 */
/**
 * The deepest ancestor of `p` that exists, resolved, with whatever remainder
 * did not exist appended back on.
 *
 * A destination normally does not exist yet — that is the point of writing it —
 * and neither may two directories above it. `Deno.realPath` throws on any of
 * that, so the walk goes up until something resolves. Appending the remainder
 * is safe because `assertSafeDestination` has already excluded `..` and
 * absolute segments upstream: an unresolved tail cannot re-enter the project
 * from outside it, nor leave it from inside.
 */
async function resolveDeepestExisting(p: string): Promise<string> {
  const missing: string[] = [];
  let cur = p;
  for (;;) {
    try {
      const real = await Deno.realPath(cur);
      return missing.length === 0 ? real : join(real, ...missing.reverse());
    } catch (err) {
      if (!(err instanceof Deno.errors.NotFound)) throw err;
    }
    const parent = dirname(cur);
    // `dirname("/") === "/"`: nothing above us resolved, so there is nothing
    // left to resolve against. Returning `p` unchanged makes the comparison
    // lexical, which for a path with no existing ancestor is the only honest
    // answer available.
    if (parent === cur) return p;
    missing.push(basename(cur));
    cur = parent;
  }
}

export async function resolveTarget(abs: string): Promise<string> {
  let info: Deno.FileInfo | null;
  try {
    info = await Deno.lstat(abs);
  } catch (err) {
    if (!(err instanceof Deno.errors.NotFound)) throw err;
    info = null;
  }

  if (info === null) return await resolveDeepestExisting(abs);

  if (info.isSymlink) {
    const link = await Deno.readLink(abs);
    const lexical = isAbsolute(link) ? link : join(dirname(abs), link);
    // Through `resolveDeepestExisting`, not `realPath` directly: a dangling
    // link must still be resolved against the real filesystem as far as it
    // goes, or its verdict is a lexical path compared against a resolved root —
    // which on macOS reports every in-project target as outside. That is the
    // resolve-one-side-only bug, arriving inside the fix for it.
    return await resolveDeepestExisting(lexical);
  }

  return await Deno.realPath(abs);
}

/**
 * Throws unless `abs` resolves inside `root`. `root` must come from
 * `resolveProjectRoot` — both sides resolved the same way, or the comparison is
 * meaningless.
 *
 * THROWS rather than returning a boolean, and that is the decision: a predicate
 * handing back `true`/`false` hands the verdict to every caller, and the
 * codepath this lands in already has a working "skip this dest and continue"
 * idiom one line from the natural insertion point. One refusal, one shape.
 *
 * The message names the destination, where it resolved to, AND the root — the
 * last one because a root that resolved wider than the user expected is
 * otherwise invisible.
 */
export async function assertInsideProject(root: string, abs: string): Promise<void> {
  const resolved = await resolveTarget(abs);
  if (isInside(root, resolved)) return;
  throw new Error(
    `refusing to touch a path that leaves the project:\n` +
      `  path:     ${abs}\n` +
      `  resolves: ${resolved}\n` +
      `  project:  ${root}\n` +
      `A symlink in the project points outside it. Specnaut will not write, ` +
      `move, delete or read through it.`,
  );
}
