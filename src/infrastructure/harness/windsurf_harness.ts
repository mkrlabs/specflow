import type { BundleOptions, Harness } from "../../application/ports.ts";
import { HARNESS_STATIC } from "../../templates_bundle.ts";
import type { CoreBundle, CoreEntry } from "../../domain/core_bundle.ts";
import type { Bundle } from "../../domain/template.ts";
import { skillFolderName } from "./skill_folder.ts";
import { splitFrontmatter } from "./frontmatter.ts";
import { applyBackend, backlogScriptDestination } from "./backlog_filter.ts";
import { applyScheme, phaseScriptDestination } from "./scheme_filter.ts";
import { applySpecBackend } from "./spec_backend_filter.ts";
import { applySpecAutogen } from "./spec_autogen_filter.ts";

// Cascade ignores Claude-only frontmatter fields (e.g. `color:`). Strip them
// before emission so they don't eat into the 12k-char workflow cap.
function stripCascadeIgnoredFields(content: string): string {
  const split = splitFrontmatter(content);
  if (!split) return content;
  const cleaned = split.fmBody
    .split("\n")
    .filter((line) => !/^color\s*:/.test(line))
    .join("\n");
  return `---\n${cleaned}\n---\n${split.rest}`;
}

/**
 * Windsurf's per-workflow character cap. Cascade silently truncates at this
 * boundary, so we hard-fail at test time when any emitted workflow would
 * exceed it.
 *
 * Documented at https://docs.windsurf.com/windsurf/cascade/workflows
 */
export const WINDSURF_WORKFLOW_MAX_CHARS = 12_000;

function destinationFor(entry: CoreEntry): string {
  switch (entry.category) {
    case "backlog-cmd":
    case "agent":
    case "skill":
    case "backlog-skill":
      return `.windsurf/workflows/${skillFolderName(entry)}.md`;
    case "backlog-doc":
      // Windsurf is flat: the doc becomes a sibling workflow, not a child file.
      if (!entry.suffix) throw new Error(`backlog-doc needs suffix: ${entry.name}`);
      return `.windsurf/workflows/${skillFolderName({ ...entry, category: "backlog-skill" })}-${
        entry.suffix.replace(/\.md$/, "")
      }.md`;
    case "phase":
      // Windsurf is flat — no nested skill folders. Each phase doc
      // becomes a sibling workflow file the router references by name.
      if (!entry.suffix) throw new Error(`phase needs suffix: ${entry.name}`);
      return `.windsurf/workflows/specnaut-${entry.suffix.replace(/\.md$/, "")}.md`;
    case "phase-script":
      return phaseScriptDestination(entry);
    case "backlog-script":
      return backlogScriptDestination(entry);
    case "agent-memory":
      throw new Error("agent-memory entries should be filtered before destinationFor");
    case "agent-doc":
      throw new Error("agent-doc entries should be filtered before destinationFor");
    case "spec-root":
      if (!entry.suffix) throw new Error(`spec-root needs suffix`);
      return `.specnaut/${entry.suffix}`;
    case "project-root":
    case "mergeable-project-root":
      if (!entry.suffix) throw new Error(`${entry.category} needs suffix`);
      return entry.suffix;
  }
}

export class WindsurfHarness implements Harness {
  readonly key = "windsurf";
  readonly displayName = "Windsurf";

  mapBundle(core: CoreBundle, opts: BundleOptions): Bundle {
    const out: Bundle = {};
    for (const raw of core) {
      const backendApplied = applyBackend(raw, opts);
      if (backendApplied === null) continue;
      const entry = applySpecAutogen(
        applySpecBackend(applyScheme(backendApplied, opts), opts),
        opts,
      );
      // agent-memory and the agent-fleet README are Claude-only conventions;
      // other harnesses skip them.
      if (entry.category === "agent-memory" || entry.category === "agent-doc") continue;
      out[destinationFor(entry)] = {
        content: stripCascadeIgnoredFields(entry.content),
        executable: entry.executable,
        ...(entry.category === "mergeable-project-root" ? { mergeBlock: "gitignore" } : {}),
        ...(entry.skipIfExists ? { skipIfExists: true as const } : {}),
        ...(entry.managedSection ? { managedSection: entry.managedSection } : {}),
      };
    }
    // Layer the harness's own static files last, so a harness-specific file
    // wins over anything the core bundle mapped to the same destination.
    const staticFiles = HARNESS_STATIC[this.key] ?? {};
    for (const [dest, file] of Object.entries(staticFiles)) {
      out[dest] = file;
    }
    return out;
  }
}
