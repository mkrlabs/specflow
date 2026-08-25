import type { KnownHarness } from "../../domain/installed_lock.ts";

/**
 * What a user actually types, per harness.
 *
 * `init`'s "Next steps" hardcoded the Claude surface — `/specnaut plan`,
 * `/board add` — and printed it under every harness. On the five that namespace
 * their skills the board is `/specnaut-board`, so the first thing a new user
 * was told to type did nothing; on Windsurf the phases are flat workflows, so
 * `/specnaut plan` was wrong too. It is the headline command of the release,
 * named wrong in the one place a first-time user reads.
 *
 * The shapes are not a preference. They fall out of where each harness's
 * `destinationFor` puts a phase and a `backlog-skill`:
 *
 *   - phases nested under the router's own folder → the router takes the phase
 *     as an argument, `/specnaut plan`
 *   - phases emitted as sibling files (Windsurf) → each is its own command,
 *     `/specnaut-plan`
 *   - Copilot writes `.github/instructions/*.instructions.md`, which the agent
 *     applies by context rather than by invocation — there is no command to
 *     name, and inventing one would be worse than saying so.
 *
 * `harness_commands_test.ts` cross-checks every row against the destinations
 * the harness really emits, so this table cannot drift from the code it
 * describes without a red test.
 */
export interface HarnessCommands {
  /** How a router phase is invoked, e.g. `/specnaut plan`. */
  readonly phase: (name: string) => string;
  /** How the board skill is invoked, or `null` when the harness has no slash commands. */
  readonly board: string | null;
}

const NESTED_PHASES = (name: string) => `/specnaut ${name}`;
const FLAT_PHASES = (name: string) => `/specnaut-${name}`;

const TABLE: Record<KnownHarness, HarnessCommands> = {
  // Claude emits skill names verbatim — no `specnaut-` prefix.
  claude: { phase: NESTED_PHASES, board: "/board" },
  cursor: { phase: NESTED_PHASES, board: "/specnaut-board" },
  codex: { phase: NESTED_PHASES, board: "/specnaut-board" },
  opencode: { phase: NESTED_PHASES, board: "/specnaut-board" },
  antigravity: { phase: NESTED_PHASES, board: "/specnaut-board" },
  windsurf: { phase: FLAT_PHASES, board: "/specnaut-board" },
  copilot: { phase: () => "", board: null },
};

export function harnessCommands(harness: KnownHarness): HarnessCommands {
  return TABLE[harness];
}
