import { stringify as stringifyToml } from "@std/toml";
import type { BundleOptions, Harness } from "../../application/ports.ts";
import type { CoreBundle, CoreEntry } from "../../domain/core_bundle.ts";
import type { Bundle } from "../../domain/template.ts";
import { HARNESS_STATIC } from "../../templates_bundle.ts";
import { ensureSkillFrontmatter, skillFolderName } from "./skill_folder.ts";
import { frontmatterField, splitFrontmatter } from "./frontmatter.ts";
import { effortToCodexReasoning, tierToCodexModel } from "../../domain/codex_models.ts";
import { applyBackend, backlogScriptDestination } from "./backlog_filter.ts";
import { applyScheme, phaseScriptDestination } from "./scheme_filter.ts";
import { applySpecBackend } from "./spec_backend_filter.ts";
import { applySpecAutogen } from "./spec_autogen_filter.ts";

function parseAgentFrontmatter(
  content: string,
): { description: string; model: string | null; effort: string | null; body: string } {
  const split = splitFrontmatter(content);
  if (!split) return { description: "", model: null, effort: null, body: content };
  return {
    description: frontmatterField(split.fmBody, "description") ?? "",
    model: frontmatterField(split.fmBody, "model"),
    effort: frontmatterField(split.fmBody, "effort"),
    body: split.rest.replace(/^\n+/, ""),
  };
}

function toCodexSubagentToml(entry: CoreEntry): string {
  const { description, model, effort, body } = parseAgentFrontmatter(entry.content);
  const codexModel = tierToCodexModel(model);
  const reasoning = effortToCodexReasoning(effort);
  return stringifyToml({
    name: entry.name,
    description: description || `Specnaut ${entry.name} agent`,
    ...(codexModel ? { model: codexModel } : {}),
    ...(reasoning ? { model_reasoning_effort: reasoning } : {}),
    developer_instructions: body,
  });
}

export class CodexHarness implements Harness {
  readonly key = "codex";
  readonly displayName = "Codex CLI";

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
      switch (entry.category) {
        case "agent":
          out[`.codex/agents/${entry.name}.toml`] = {
            content: toCodexSubagentToml(entry),
            executable: false,
          };
          break;
        case "skill":
        case "backlog-skill": {
          const name = skillFolderName(entry);
          out[`.agents/skills/${name}/SKILL.md`] = {
            content: ensureSkillFrontmatter(entry.content, name),
            executable: entry.executable,
          };
          break;
        }
        case "backlog-doc": {
          if (!entry.suffix) throw new Error(`backlog-doc needs suffix: ${entry.name}`);
          const name = skillFolderName({ ...entry, category: "backlog-skill" });
          out[`.agents/skills/${name}/${entry.suffix}`] = {
            content: entry.content,
            executable: entry.executable,
          };
          break;
        }
        case "phase": {
          if (!entry.suffix) throw new Error(`phase needs suffix: ${entry.name}`);
          out[`.agents/skills/specnaut/phases/${entry.suffix}`] = {
            content: entry.content,
            executable: entry.executable,
          };
          break;
        }
        case "phase-script":
          out[phaseScriptDestination(entry)] = {
            content: entry.content,
            executable: entry.executable,
          };
          break;
        case "backlog-script":
          out[backlogScriptDestination(entry)] = {
            content: entry.content,
            executable: entry.executable,
          };
          break;
        case "spec-root":
          if (!entry.suffix) throw new Error(`spec-root needs suffix`);
          out[`.specnaut/${entry.suffix}`] = {
            content: entry.content,
            executable: entry.executable,
            ...(entry.skipIfExists ? { skipIfExists: true as const } : {}),
            ...(entry.managedSection ? { managedSection: entry.managedSection } : {}),
          };
          break;
        case "project-root":
          if (!entry.suffix) throw new Error(`project-root needs suffix`);
          out[entry.suffix] = {
            content: entry.content,
            executable: entry.executable,
            ...(entry.skipIfExists ? { skipIfExists: true as const } : {}),
            ...(entry.managedSection ? { managedSection: entry.managedSection } : {}),
          };
          break;
        case "mergeable-project-root":
          if (!entry.suffix) throw new Error(`mergeable-project-root needs suffix`);
          out[entry.suffix] = {
            content: entry.content,
            executable: entry.executable,
            mergeBlock: "gitignore",
          };
          break;
      }
    }
    const staticFiles = HARNESS_STATIC[this.key] ?? {};
    for (const [dest, file] of Object.entries(staticFiles)) {
      out[dest] = file;
    }
    return out;
  }
}
