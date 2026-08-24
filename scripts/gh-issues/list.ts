// gh-issues list — enumerate inbound issues filed by users via the
// specnaut-guide bug-report protocol. Filtered by the
// `from:specnaut-guide` label so it doesn't catch maintainer-filed
// items.
//
// Usage: deno run --allow-run list.ts

const REPO = "specnaut/specnaut-cli";
// The label is named for the agent that files through it, and it MUST exist on
// the repo. GitHub drops an unknown label from an `issues/new?labels=` prefill
// without erroring, so a mismatch yields a report carrying `bug` and nothing
// else — and an inbox that reads "empty" because nothing can enter it. Both
// ends failed that way for months: the prefill named `from:specnaut-expert`,
// which was never created, while the repo carried `from:specflow-expert` from
// before the rebrand. Zero issues ever bore either. Rename this constant, the
// sibling scripts and the guide agent's prefill together, and create the label
// on the repo in the same change — a rename that stops at the string is the
// shape that produced the original silence.
const LABEL = "from:specnaut-guide";

type GhIssue = {
  number: number;
  title: string;
  createdAt: string;
  url: string;
  author?: { login: string };
};

async function ghList(): Promise<GhIssue[]> {
  const cmd = new Deno.Command("gh", {
    args: [
      "issue",
      "list",
      "--repo",
      REPO,
      "--label",
      LABEL,
      "--state",
      "open",
      "--json",
      "number,title,createdAt,url,author",
      "--limit",
      "100",
    ],
    stdout: "piped",
    stderr: "piped",
  });
  const { code, stdout, stderr } = await cmd.output();
  if (code !== 0) {
    throw new Error(`gh issue list failed: ${new TextDecoder().decode(stderr)}`);
  }
  return JSON.parse(new TextDecoder().decode(stdout)) as GhIssue[];
}

if (import.meta.main) {
  const issues = await ghList();
  if (issues.length === 0) {
    console.log("✓ inbox empty (no open issues with label `from:specnaut-guide`)");
    Deno.exit(0);
  }

  console.log(`Inbox: ${issues.length} open issue${issues.length > 1 ? "s" : ""}\n`);
  for (const i of issues) {
    const day = i.createdAt.slice(0, 10);
    const author = i.author?.login ?? "unknown";
    const titleTrim = i.title.length > 70 ? i.title.slice(0, 67) + "…" : i.title;
    console.log(`  #${String(i.number).padStart(3)} ${day} ${author.padEnd(14)} ${titleTrim}`);
  }
  console.log(`\n  ${REPO}/issues?q=is%3Aopen+label%3A${encodeURIComponent(LABEL)}`);
}
