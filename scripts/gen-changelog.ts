// Generates a structured Markdown changelog from conventional-commit-style
// messages between two refs. Writes to dist/release-notes.md by default —
// suitable for `softprops/action-gh-release@v2`'s `body_path` input, which
// replaces the noisy auto-generated release notes with a feature-level
// summary.
//
// Pure helpers (`classifyCommit`, `formatChangelog`) are exported for tests.

export type Category = "breaking" | "feat" | "fix" | "chore" | "skip";

export type Commit = {
  hash: string;
  subject: string;
};

export type Classified = Commit & {
  category: Category;
  cleanedSubject: string;
};

const FEATURE_PREFIXES = new Set(["feat"]);
const FIX_PREFIXES = new Set(["fix"]);
const CHORE_PREFIXES = new Set([
  "chore",
  "refactor",
  "docs",
  "test",
  "ci",
  "style",
  "perf",
  "build",
]);
const RELEASE_BUMP_RE = /^chore:\s*release\s+v\d+\.\d+\.\d+/;
const PREFIX_RE = /^(\w+)(\([^)]+\))?(!)?:\s*(.+)$/;

export function classifyCommit(commit: Commit): Classified {
  const subject = commit.subject.trim();
  if (RELEASE_BUMP_RE.test(subject)) {
    return { ...commit, category: "skip", cleanedSubject: subject };
  }
  const m = subject.match(PREFIX_RE);
  if (!m) {
    return { ...commit, category: "chore", cleanedSubject: capitalize(subject) };
  }
  const type = m[1].toLowerCase();
  const rest = collapseTrailingIssueRefs(m[4]);
  const cleanedSubject = capitalize(rest);
  // Conventional Commits marks a breaking change with `!` before the colon.
  // The `!` used to be swallowed by the prefix pattern, so a major release
  // listed its breaking changes as ordinary features — the one thing a reader
  // upgrading across a major MUST not have to infer.
  if (m[3] === "!") {
    return { ...commit, category: "breaking", cleanedSubject };
  }
  if (FEATURE_PREFIXES.has(type)) {
    return { ...commit, category: "feat", cleanedSubject };
  }
  if (FIX_PREFIXES.has(type)) {
    return { ...commit, category: "fix", cleanedSubject };
  }
  if (CHORE_PREFIXES.has(type)) {
    return { ...commit, category: "chore", cleanedSubject };
  }
  return { ...commit, category: "chore", cleanedSubject };
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// GitHub's squash-merge appends the PR number `(#pr)` to a subject whose PR
// title already carried the linked issue `(#issue)`, producing a redundant
// `... (#issue) (#pr)` tail. Collapse a run of 2+ adjacent trailing refs down
// to the last one — the PR number, matching `extractPrNumber` — so release
// notes read with a single clean link. A lone trailing `(#N)` is left as-is.
const TRAILING_DOUBLE_REF_RE = /(?:\s*\(#\d+\))+(\s\(#\d+\))\s*$/;
export function collapseTrailingIssueRefs(subject: string): string {
  return subject.replace(TRAILING_DOUBLE_REF_RE, "$1");
}

const ADOPTION_HEADER_RE = /^## Agent adoption\b/m;
const NEXT_H2_RE = /^## /m;
const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g;
const PROMPT_FENCE_RE = /^```prompt\s*$/m;

const FENCED_BLOCK_RE = /```[\s\S]*?```/g;
const INLINE_CODE_RE = /`[^`\n]*`/g;
// Private-use sentinel rather than NUL: same "cannot occur in real prose"
// property without tripping the control-character lint. Any pre-existing
// occurrence is stripped from the input first, so the index can never slip.
const SENTINEL = "\uE000";
const PLACEHOLDER_RE = /\uE000(\d+)\uE000/g;

/**
 * Strip HTML comments that are *markup*, leaving alone any that are *content*.
 *
 * The strip exists to drop the PR template's `<!-- placeholder -->` hints. But
 * an HTML comment inside a code span or fenced block is something the author is
 * deliberately showing the reader — and Specnaut's own managed-section fence is
 * literally an HTML comment, so an adoption prompt teaching users about
 * `<!-- --- Specnaut: … --- -->` had its subject matter deleted out of it,
 * leaving empty backticks and instructions to look for nothing.
 *
 * Code regions are lifted out, the remainder is stripped to a fixed point
 * (catching nested/malformed runs like `<!-- foo <!-- bar -->`), then the code
 * is put back exactly as written.
 */
function stripHtmlComments(s: string): string {
  const preserved: string[] = [];
  // Indexed placeholders, not positional ones: the two lifting passes push in
  // their own order while the placeholders sit interleaved in the document, so
  // restoring by order of appearance swaps a code span for a fenced block.
  const lift = (text: string, re: RegExp) =>
    text.replace(re, (m) => `${SENTINEL}${preserved.push(m) - 1}${SENTINEL}`);

  // Fenced blocks first: an inline-code pass would otherwise chew through the
  // backtick runs that delimit them.
  let current = lift(lift(s.replaceAll(SENTINEL, ""), FENCED_BLOCK_RE), INLINE_CODE_RE);

  let prev: string;
  do {
    prev = current;
    current = current.replace(HTML_COMMENT_RE, "");
  } while (current !== prev);

  return current.replace(PLACEHOLDER_RE, (_m, idx) => preserved[Number(idx)]);
}

/**
 * Extract the body of the `## Agent adoption` section from a PR body.
 *
 * - Returns the content between `## Agent adoption` and the next `## ` heading
 *   (or EOF), trimmed.
 * - Returns `null` when the section is absent OR when it has no ` ```prompt `
 *   fenced block (a section without a prompt is treated as "incomplete" and
 *   not included in the changelog).
 * - Strips HTML comments — the PR template ships placeholders inside `<!-- -->`
 *   that should never reach the release body.
 */
export function extractAdoption(body: string): string | null {
  const headerMatch = body.match(ADOPTION_HEADER_RE);
  if (!headerMatch) return null;
  const start = (headerMatch.index ?? 0) + headerMatch[0].length;

  const tail = body.slice(start);
  const nextH2 = tail.match(NEXT_H2_RE);
  const section = nextH2 ? tail.slice(0, nextH2.index ?? tail.length) : tail;

  const cleaned = stripHtmlComments(section).trim();
  if (!PROMPT_FENCE_RE.test(cleaned)) return null;
  return truncateAfterPrompt(cleaned);
}

/**
 * Cut the section after the closing fence of its ```prompt block.
 *
 * `CONTRIBUTING.md` defines the shape as prose first, one ```prompt block
 * second — so the block's closing fence IS the end of the guide. Without this,
 * a section that happens to be the last `## ` in the PR body swallows whatever
 * follows it, and the tooling footer every PR carries ends up printed inside
 * the published release notes as if it were adoption guidance.
 */
function truncateAfterPrompt(section: string): string {
  const open = section.match(PROMPT_FENCE_RE);
  if (!open || open.index === undefined) return section;
  const afterOpen = open.index + open[0].length;
  const close = section.slice(afterOpen).match(/^```\s*$/m);
  if (!close || close.index === undefined) return section;
  return section.slice(0, afterOpen + close.index + close[0].length).trimEnd();
}

const PR_NUMBER_RE = /\s\(#(\d+)\)\s*$/;

/**
 * Extract the trailing PR number from a commit subject formatted as
 * `... (#NNN)`. Returns `null` when no match.
 */
export function extractPrNumber(subject: string): number | null {
  const m = subject.match(PR_NUMBER_RE);
  if (!m) return null;
  return parseInt(m[1], 10);
}

/**
 * The three-way result of resolving a commit back to its PR.
 *
 * Same discipline as {@link PrBodyOutcome}, for the same reason: "this commit
 * has no PR" and "we could not ask" must never collapse into one value. That
 * collapse is what made the previous gap invisible.
 */
export type PrRefOutcome =
  | { kind: "resolved"; prNum: number }
  | { kind: "absent" }
  | { kind: "failed"; reason: string };

/**
 * Injection seam for SHA → PR resolution. The real implementation is the
 * `gh`-backed {@link resolvePrFromSha}; tests pass a fake.
 */
export type PrNumberResolver = (hash: string) => Promise<PrRefOutcome>;

const PR_SHA_CACHE = new Map<string, PrRefOutcome>();

/**
 * Resolve the PR a commit belongs to from its SHA, via
 * `gh api repos/{owner}/{repo}/commits/<sha>/pulls`.
 *
 * This exists because this repository **rebase-merges**. A squash merge stamps
 * `(#NNN)` onto the subject and {@link extractPrNumber} finds it; a rebase does
 * not, so every rebased `feat` commit looked like a commit with no PR — the
 * documented "no entry, no failure" path — and its Agent adoption section was
 * dropped without a word. CI has been rejecting `feat:` PRs that omit that
 * section while no release body has ever carried one.
 *
 * GitHub keeps the association across the rewrite, so the post-rebase SHA still
 * resolves. Cached per process, failures included.
 */
export async function resolvePrFromSha(hash: string): Promise<PrRefOutcome> {
  const cached = PR_SHA_CACHE.get(hash);
  if (cached !== undefined) return cached;
  const cmd = new Deno.Command("gh", {
    args: [
      "api",
      `repos/{owner}/{repo}/commits/${hash}/pulls`,
      "--jq",
      ".[0].number",
    ],
    stdout: "piped",
    stderr: "piped",
  });
  let outcome: PrRefOutcome;
  try {
    const out = await cmd.output();
    if (!out.success) {
      const reason = new TextDecoder().decode(out.stderr).trim() ||
        `gh api commits/${hash}/pulls exited non-zero`;
      console.warn(`gen-changelog: failed to resolve PR for ${hash} — ${reason}`);
      outcome = { kind: "failed", reason };
    } else {
      const decoded = new TextDecoder().decode(out.stdout).trim();
      const num = decoded === "" || decoded === "null" ? NaN : Number(decoded);
      outcome = Number.isInteger(num) ? { kind: "resolved", prNum: num } : { kind: "absent" };
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(`gen-changelog: cannot run gh CLI (${reason}) — PR lookup failed for ${hash}`);
    outcome = { kind: "failed", reason };
  }
  PR_SHA_CACHE.set(hash, outcome);
  return outcome;
}

/**
 * The three-way result of attempting to fetch a PR body (#363).
 *
 * Replaces the previous `""`-on-everything sentinel, which fused "this PR
 * legitimately has no adoption block" with "we could not fetch the PR at all".
 * That conflation is the root of the silent-failure bug: in CI an
 * unauthenticated `gh pr view` failed for every PR and was indistinguishable
 * from a genuine absence, so the whole Adoption guide vanished without a trace.
 *
 * - `retrieved` — `gh` returned a non-empty body; still subject to
 *   `extractAdoption` (a retrieved body with no valid block is a legitimate,
 *   quiet skip — an *adoption-content* absence, not a retrieval failure).
 * - `absent` — `gh` succeeded but returned empty / literal-`null` stdout.
 * - `failed` — the process could not run or exited non-zero; `reason` feeds the
 *   strict-mode operator report.
 *
 * Invariant: a `failed` outcome MUST NOT be coerced into `absent` (FR-004).
 */
export type PrBodyOutcome =
  | { kind: "retrieved"; body: string }
  | { kind: "absent" }
  | { kind: "failed"; reason: string };

/**
 * The injection seam for PR-body retrieval. The real implementation is the
 * `gh`-backed {@link fetchPrBody}; tests pass a fake backed by a
 * `Map<number, PrBodyOutcome>` so the assembly logic is exercised hermetically
 * (no live `gh`, no network).
 */
export type PrBodyFetcher = (prNum: number) => Promise<PrBodyOutcome>;

const PR_BODY_CACHE = new Map<number, PrBodyOutcome>();

/**
 * Fetch a PR body via `gh pr view <num> --json body --jq .body`, returning a
 * typed {@link PrBodyOutcome}. Cached per process (failures cached too, so a
 * rate-limited API is not hammered within one run; the cache resets per
 * process, so a workflow re-run retries cleanly).
 *
 * Spawn error / non-zero exit ⇒ `failed`; empty or literal-`null` stdout ⇒
 * `absent`; non-empty body ⇒ `retrieved`. A stderr warning is still emitted on
 * failure (alongside the typed outcome) — but, unlike before, the failure is no
 * longer silently collapsed into "no adoption section".
 */
export async function fetchPrBody(num: number): Promise<PrBodyOutcome> {
  const cached = PR_BODY_CACHE.get(num);
  if (cached !== undefined) return cached;
  const cmd = new Deno.Command("gh", {
    args: ["pr", "view", String(num), "--json", "body", "--jq", ".body"],
    stdout: "piped",
    stderr: "piped",
  });
  let stdout: Uint8Array;
  let stderr: Uint8Array;
  let success: boolean;
  try {
    const out = await cmd.output();
    stdout = out.stdout;
    stderr = out.stderr;
    success = out.success;
  } catch (err) {
    // `gh` binary missing or spawn failure — surfaced as a typed failure.
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(
      `gen-changelog: cannot run gh CLI (${reason}) — adoption fetch failed for #${num}`,
    );
    const outcome: PrBodyOutcome = { kind: "failed", reason };
    PR_BODY_CACHE.set(num, outcome);
    return outcome;
  }
  if (!success) {
    const reason = new TextDecoder().decode(stderr).trim() || `gh pr view #${num} exited non-zero`;
    console.warn(`gen-changelog: failed to fetch PR #${num} body — ${reason}`);
    const outcome: PrBodyOutcome = { kind: "failed", reason };
    PR_BODY_CACHE.set(num, outcome);
    return outcome;
  }
  const decoded = new TextDecoder().decode(stdout);
  // `gh --jq .body` prints the literal string `null` when the PR body is empty.
  const outcome: PrBodyOutcome = decoded.trim() === "" || decoded.trim() === "null"
    ? { kind: "absent" }
    : { kind: "retrieved", body: decoded };
  PR_BODY_CACHE.set(num, outcome);
  return outcome;
}

export type AdoptionEntry = {
  prNum: number;
  title: string;
  body: string;
};

/** Result of {@link assembleAdoptionEntries}: the guide entries plus any retrieval failures. */
export type AdoptionAssembly = {
  entries: AdoptionEntry[];
  /** `prNum` is `null` when the PR could not be resolved from the commit at all. */
  failures: { prNum: number | null; hash?: string; reason: string }[];
};

const TRAILING_PR_REF_RE = /\s\(#\d+\)\s*$/;

/**
 * Walk the `feat` commits, resolve each PR number, fetch its body via the
 * injected {@link PrBodyFetcher}, and build the Adoption guide entries —
 * keeping retrieval *failures* strictly separate from legitimate *absences*
 * (#363, FR-004). This is the unit-testable seam extracted from `main()`:
 *
 * - non-`feat` commit ⇒ no entry, no failure.
 * - `feat` with no trailing `(#NNN)` ⇒ resolved from its SHA via
 *   `resolveFromSha` (this repo rebase-merges, so the ref is never in the
 *   subject); `absent` is a quiet skip, `failed` is recorded like any other.
 * - `retrieved` ⇒ run `extractAdoption`; a valid block yields an entry, an
 *   invalid/missing block is a quiet informational skip.
 * - `absent` ⇒ quiet informational skip.
 * - `failed` ⇒ recorded in `failures` (drives strict mode); never an entry.
 *
 * Pure of process exit — the caller decides whether `failures` aborts the run.
 */
export async function assembleAdoptionEntries(
  classified: Classified[],
  fetch: PrBodyFetcher,
  resolveFromSha: PrNumberResolver = () => Promise.resolve({ kind: "absent" }),
): Promise<AdoptionAssembly> {
  const entries: AdoptionEntry[] = [];
  const failures: { prNum: number | null; hash?: string; reason: string }[] = [];

  for (const c of classified) {
    if (c.category !== "feat") continue;
    let prNum = extractPrNumber(c.subject);
    if (prNum === null) {
      // No `(#NNN)` in the subject. Under squash-merge that means "no PR";
      // under rebase-merge it means nothing at all, because the rebase never
      // wrote one. Ask the forge before concluding the commit is unattached.
      const ref = await resolveFromSha(c.hash);
      if (ref.kind === "failed") {
        failures.push({ prNum: null, hash: c.hash, reason: ref.reason });
        continue;
      }
      if (ref.kind === "absent") {
        // Under this repo's convention every feat lands through a PR, so this
        // is worth a line even though it is not a failure. A skip nobody can
        // see is how the guide stayed empty across a whole major release.
        console.warn(
          `gen-changelog: feat commit ${c.hash} resolves to no PR — skipping adoption`,
        );
        continue;
      }
      prNum = ref.prNum;
    }

    const outcome = await fetch(prNum);
    if (outcome.kind === "failed") {
      failures.push({ prNum, reason: outcome.reason });
      continue;
    }
    if (outcome.kind === "absent") {
      console.warn(
        `gen-changelog: feat commit ${c.hash} (#${prNum}) has no PR body — skipping adoption`,
      );
      continue;
    }
    const adoption = extractAdoption(outcome.body);
    if (adoption === null) {
      console.warn(
        `gen-changelog: feat commit ${c.hash} (#${prNum}) has no Agent adoption section — skipping`,
      );
      continue;
    }
    // Title = the cleaned subject without the trailing PR ref.
    const title = c.cleanedSubject.replace(TRAILING_PR_REF_RE, "");
    entries.push({ prNum, title, body: adoption });
  }

  return { entries, failures };
}

export type FormatOpts = {
  fromTag: string | null;
  toTag: string;
  repoUrl?: string;
  adoptionEntries?: AdoptionEntry[];
};

/**
 * True when `tag` is a major release — `vX.0.0` with X >= 1.
 *
 * A major with no breaking commit in range is almost always a lost marker
 * rather than a genuinely non-breaking major. That is not hypothetical: the
 * v2.0.0 marker was an EMPTY commit, and `git rebase` drops empty commits
 * silently, so a verified generator fix said nothing about whether its input
 * survived the merge. Hence {@link breakingGuardWarning}.
 */
export function isMajorTag(tag: string): boolean {
  const m = tag.match(/^v?(\d+)\.0\.0$/);
  return m !== null && Number(m[1]) >= 1;
}

/**
 * Returns the warning a major release with no breaking marker must emit, or
 * `null` when there is nothing to warn about.
 */
export function breakingGuardWarning(
  commits: Classified[],
  toTag: string,
): string | null {
  if (!isMajorTag(toTag)) return null;
  if (commits.some((c) => c.category === "breaking")) return null;
  return `${toTag} is a major release but no commit in range carries the ` +
    `Conventional Commits breaking marker (\`type(scope)!:\`). Either the ` +
    `bump is wrong, or the marker was lost — note that an empty marker commit ` +
    `is dropped by \`git rebase\`, so carry it on a commit with real content.`;
}

export function formatChangelog(commits: Classified[], opts: FormatOpts): string {
  const features = commits.filter((c) => c.category === "feat");
  const fixes = commits.filter((c) => c.category === "fix");
  const chores = commits.filter((c) => c.category === "chore");

  const sections: string[] = [];
  sections.push(`## What's changed in ${opts.toTag}`);
  const breaking = commits.filter((c) => c.category === "breaking");
  if (breaking.length > 0) {
    // First, and never inside a <details>. Someone skimming a major release
    // must hit this before anything else.
    sections.push(
      "### ⚠ Breaking changes\n\n" + breaking.map(formatBullet).join("\n"),
    );
  }

  if (commits.length === 0) {
    sections.push("_No user-facing changes since the previous release._");
  }

  if (features.length > 0) {
    sections.push("### Features\n\n" + features.map(formatBullet).join("\n"));
  }
  if (fixes.length > 0) {
    sections.push("### Bug fixes\n\n" + fixes.map(formatBullet).join("\n"));
  }
  const adoption = opts.adoptionEntries ?? [];
  if (adoption.length > 0) {
    const intro =
      "These prompts help your AI agent adopt the new features in an existing project. " +
      "Copy them into your harness, or run `@specnaut-expert review-upgrade` to be walked " +
      "through automatically.";
    const items = adoption.map((a) => `**#${a.prNum} — ${a.title}**\n\n${a.body}`).join("\n\n");
    sections.push(`### Adoption guide\n\n${intro}\n\n${items}`);
  }
  if (chores.length > 0) {
    const summary = `${chores.length} internal change${chores.length === 1 ? "" : "s"}`;
    sections.push(
      `### Internal / chores\n\n<details>\n<summary>${summary}</summary>\n\n` +
        chores.map(formatBullet).join("\n") +
        "\n\n</details>",
    );
  }
  if (opts.repoUrl && opts.fromTag) {
    sections.push(
      `**Full changelog:** ${opts.repoUrl}/compare/${opts.fromTag}...${opts.toTag}`,
    );
  }
  return sections.join("\n\n") + "\n";
}

function formatBullet(c: Classified): string {
  return `- ${c.cleanedSubject}`;
}

// ---------- I/O (only runs when invoked as main) ----------

const REPO_URL = "https://github.com/specnaut/specnaut-cli";
const DEFAULT_OUT = "dist/release-notes.md";

/**
 * Does `ref` resolve in this repository?
 *
 * Used to decide the range end. When cutting a new release the target tag does
 * not exist yet, so the range must run to `HEAD`. When regenerating the notes
 * for a tag that already shipped, `HEAD` is the wrong end — it sweeps in every
 * commit merged since. `--to` used to only *label* the output, which meant
 * `--from v1.21.0 --to v2.0.0` silently produced notes for v2.0.0 containing
 * work that was not in v2.0.0.
 */
async function refExists(ref: string): Promise<boolean> {
  try {
    const { success } = await new Deno.Command("git", {
      args: ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`],
      stdout: "null",
      stderr: "null",
    }).output();
    return success;
  } catch {
    return false;
  }
}

async function getCommits(from: string | null, to: string): Promise<Commit[]> {
  const range = from ? `${from}..${to}` : to;
  const cmd = new Deno.Command("git", {
    args: ["log", range, "--format=%h%x09%s", "--no-merges"],
    stdout: "piped",
    stderr: "piped",
  });
  const { stdout, stderr, success } = await cmd.output();
  if (!success) {
    throw new Error(`git log failed: ${new TextDecoder().decode(stderr)}`);
  }
  return new TextDecoder()
    .decode(stdout)
    .split("\n")
    .filter((l) => l.length > 0)
    .map((line) => {
      const tab = line.indexOf("\t");
      return { hash: line.slice(0, tab), subject: line.slice(tab + 1) };
    });
}

async function detectPrevTag(): Promise<string | null> {
  // Closest tag reachable from HEAD^. When the release skill runs, HEAD is
  // the just-committed bump commit and HEAD^ is the previous release.
  const cmd = new Deno.Command("git", {
    args: ["describe", "--tags", "--abbrev=0", "HEAD^"],
    stdout: "piped",
    stderr: "piped",
  });
  const { stdout, success } = await cmd.output();
  if (!success) return null;
  return new TextDecoder().decode(stdout).trim() || null;
}

async function detectCurrentTag(): Promise<string> {
  const raw = await Deno.readTextFile("deno.json");
  const parsed = JSON.parse(raw) as { version: string };
  return `v${parsed.version}`;
}

async function ensureDir(path: string): Promise<void> {
  const lastSlash = path.lastIndexOf("/");
  if (lastSlash > 0) {
    await Deno.mkdir(path.slice(0, lastSlash), { recursive: true });
  }
}

function parseFlag(args: string[], flag: string): string | null {
  const i = args.indexOf(flag);
  return i >= 0 && i < args.length - 1 ? args[i + 1] : null;
}

async function main() {
  const args = Deno.args;
  const fromArg = parseFlag(args, "--from");
  const toArg = parseFlag(args, "--to");
  const outArg = parseFlag(args, "--out");
  // CI-only parity guard: in `--strict` mode any *retrieval failure* aborts the
  // run before the body is written, so the pipeline can never publish a body
  // that is silently missing an Adoption guide the local path would produce
  // (#363, FR-005). The local preview deliberately stays non-strict (D6).
  const strict = args.includes("--strict");

  const from = fromArg ?? (await detectPrevTag());
  const to = toArg ?? (await detectCurrentTag());
  const out = outArg ?? DEFAULT_OUT;

  // Bound the range to the target tag when it already exists (regenerating a
  // published release); otherwise HEAD (cutting a new one, tag not yet made).
  const rangeEnd = await refExists(to) ? to : "HEAD";
  const commits = await getCommits(from, rangeEnd);
  const classified = commits
    .map(classifyCommit)
    .filter((c) => c.category !== "skip");

  const { entries: adoptionEntries, failures } = await assembleAdoptionEntries(
    classified,
    fetchPrBody,
    resolvePrFromSha,
  );

  if (failures.length > 0) {
    for (const f of failures) {
      console.error(`${f.prNum === null ? f.hash : `#${f.prNum}`}: ${f.reason}`);
    }
    if (strict) {
      console.error(
        `gen-changelog: ${failures.length} PR-body retrieval failure(s) under --strict — refusing to write a partial Adoption guide.`,
      );
      Deno.exit(1);
    }
  }

  const guard = breakingGuardWarning(classified, to);
  if (guard) {
    console.error(`gen-changelog: ${guard}`);
    if (strict) {
      console.error("gen-changelog: refusing to write notes for a major with no breaking marker.");
      Deno.exit(1);
    }
  }

  const md = formatChangelog(classified, {
    fromTag: from,
    toTag: to,
    repoUrl: REPO_URL,
    adoptionEntries,
  });

  await ensureDir(out);
  await Deno.writeTextFile(out, md);
  console.log(`✓ wrote ${out}`);
  console.log(`  range: ${from ?? "<root>"}..${rangeEnd} (target ${to})`);
  console.log(
    `  commits: ${classified.length} kept (${commits.length - classified.length} skipped)`,
  );
}

if (import.meta.main) await main();
