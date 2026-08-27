import type { BacklogBackend } from "./installed_lock.ts";

export type CoreCategory =
  | "agent"
  | "agent-memory"
  | "agent-doc"
  | "skill"
  | "phase"
  | "phase-script"
  | "spec-root"
  | "project-root"
  | "backlog-skill"
  | "backlog-doc"
  | "backlog-script"
  | "mergeable-project-root";

export type CoreEntry = {
  readonly category: CoreCategory;
  readonly name: string;
  readonly suffix: string | null;
  readonly content: string;
  readonly executable: boolean;
  /**
   * When set, the entry only applies if the chosen backlog backend matches.
   * Absent or `null` means the entry applies regardless of backend.
   */
  readonly backend?: BacklogBackend | null;
  /**
   * When `true`, the harness's `mapBundle` propagates this to the resulting
   * `TemplateFile.skipIfExists`. Used for placeholder files (`AGENTS.md`,
   * `.specnaut/memory/constitution.md`) where the user's existing content
   * is always more useful than our empty template — see #119.
   */
  readonly skipIfExists?: boolean;
  /**
   * Labels of the Specnaut-owned sections fenced inside `content`. The
   * harness's `mapBundle` propagates them to `TemplateFile.managedSection`,
   * which is what lets `upgrade` deliver those sections into a user-owned file
   * without rewriting the rest of it (#466).
   *
   * One label or several — see `managedSectionLabels` in `template.ts`, which
   * is the only place the union is resolved.
   */
  readonly managedSection?: string | readonly string[];
};

export type CoreBundle = ReadonlyArray<CoreEntry>;
