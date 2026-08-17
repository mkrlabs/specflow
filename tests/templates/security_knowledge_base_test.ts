import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { CORE_BUNDLE, HARNESS_STATIC } from "../../src/templates_bundle.ts";
import type { CoreEntry } from "../../src/domain/core_bundle.ts";
import { HARNESSES } from "../../src/cli/harnesses.ts";

/**
 * Locks the offline security knowledge base into the bundle.
 *
 * The base ships as `spec-root` entries under `.specnaut/memory/security/`
 * deliberately: `.specnaut/` is the one tree every harness scaffolds at an
 * identical path, so the knowledge base needs no per-harness destination and
 * no template-overlay mechanism. If a future change moves it under a skill
 * folder, these tests should fail loudly — a skill can only ship its own
 * `SKILL.md` today, so the files would silently stop being scaffolded.
 */

const SECURITY_DIR = "memory/security/";

/** Every domain file, in the order the README's routing table presents them. */
const DOMAIN_FILES: readonly string[] = [
  "00-triage.md",
  "01-access-control.md",
  "02-authentication-and-sessions.md",
  "03-injection-and-input.md",
  "04-cryptography-and-secrets.md",
  "05-configuration-and-hardening.md",
  "06-supply-chain-and-integrity.md",
  "07-data-protection.md",
  "08-logging-and-error-handling.md",
  "09-design-and-business-logic.md",
  "10-language-footguns.md",
];

function securityEntries(): CoreEntry[] {
  return CORE_BUNDLE.filter(
    (e) => e.category === "spec-root" && (e.suffix ?? "").startsWith(SECURITY_DIR),
  );
}

function entryFor(name: string): CoreEntry {
  const entry = securityEntries().find((e) => e.suffix === `${SECURITY_DIR}${name}`);
  assert(entry, `security knowledge base is missing ${name} — add it to templates/manifest.json`);
  return entry;
}

Deno.test("security knowledge base ships a README plus every domain file", () => {
  entryFor("README.md");
  for (const name of DOMAIN_FILES) entryFor(name);
  assertEquals(
    securityEntries().length,
    DOMAIN_FILES.length + 1,
    "unexpected extra or missing file under .specnaut/memory/security/ — " +
      "update DOMAIN_FILES when the base gains or loses a domain",
  );
});

Deno.test("knowledge base ships as spec-root so all harnesses scaffold it", () => {
  // spec-root maps to `.specnaut/<suffix>` identically on every harness. This
  // is the property that makes the base harness-agnostic; assert it holds for
  // the whole registry rather than for Claude alone.
  for (const entry of securityEntries()) {
    assertEquals(entry.category, "spec-root");
    for (const harness of HARNESSES) {
      // mapBundle always layers the harness's own static files on top, so
      // assert the canonical destination is present rather than exclusive.
      const bundle = harness.mapBundle([entry], { backend: "local" } as never);
      assert(
        `.specnaut/${entry.suffix}` in bundle,
        `${harness.key} must scaffold ${entry.suffix} at the canonical .specnaut path`,
      );
    }
  }
});

Deno.test("knowledge base files are refreshed on upgrade, not skipped", () => {
  // The constitution is `skipIfExists` because users own it. The knowledge
  // base is upstream-maintained reference content: an upgrade must deliver
  // corrections, so none of these may carry the flag.
  for (const entry of securityEntries()) {
    assert(
      !entry.skipIfExists,
      `${entry.suffix} must not be skipIfExists — it would freeze at the ` +
        `version first scaffolded and never receive corrections`,
    );
  }
});

Deno.test("README routing table points at every domain file", () => {
  const readme = entryFor("README.md").content;
  for (const name of DOMAIN_FILES) {
    assertStringIncludes(
      readme,
      name,
      `README must route to ${name}, otherwise an agent has no way to find it`,
    );
  }
});

Deno.test("triage gate defines the severity rubric and finding format", () => {
  const triage = entryFor("00-triage.md").content;
  for (const severity of ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"]) {
    assertStringIncludes(triage, severity);
  }
  // The reachability gate is the whole point of the file.
  assertStringIncludes(triage, "attacker-controlled");
  assertStringIncludes(triage, "FINDING");
  // Never leak a secret value, even in a finding.
  assertStringIncludes(triage, "Never include a real secret value");
});

Deno.test("every domain file carries the five-section shape", () => {
  for (const name of DOMAIN_FILES) {
    if (name === "00-triage.md" || name === "10-language-footguns.md") continue;
    const body = entryFor(name).content;
    assertStringIncludes(body, "Attack surface", `${name} must state its attack surface`);
    assertStringIncludes(body, "## Where to look", `${name} must give search signatures`);
    assertStringIncludes(body, "## Failure modes", `${name} must catalogue failure modes`);
    assertStringIncludes(body, "## Secure patterns", `${name} must show secure patterns`);
    assertStringIncludes(body, "## Review checklist", `${name} must end with a checklist`);
  }
});

Deno.test("security-auditor is required to load the knowledge base first", () => {
  const agent = CORE_BUNDLE.find(
    (e) => e.category === "agent" && e.name === "security-auditor",
  );
  assert(agent, "security-auditor agent missing from the bundle");
  assertStringIncludes(agent.content, ".specnaut/memory/security/");
  assertStringIncludes(agent.content, "00-triage.md");
  // Degrades cleanly when installed as a standalone plugin, where the
  // `.specnaut/` tree was never scaffolded.
  assertStringIncludes(agent.content, "does not exist");
  // The absolute rule survives every rewording of this agent.
  assertStringIncludes(agent.content, "never emit a secret value");
});

Deno.test("sec-audit and audit-security dispatch prompts name the knowledge base", () => {
  const skill = CORE_BUNDLE.find((e) => e.category === "skill" && e.name === "sec-audit");
  assert(skill, "sec-audit skill missing from the bundle");
  assertStringIncludes(skill.content, ".specnaut/memory/security/00-triage.md");

  const phase = CORE_BUNDLE.find((e) => e.category === "phase" && e.name === "audit-security");
  assert(phase, "audit-security phase missing from the bundle");
  assertStringIncludes(phase.content, ".specnaut/memory/security/");
});

Deno.test("Claude gets the security-guidance plugin extension points", () => {
  // `.claude/claude-security-guidance.md` and `.claude/security-patterns.yaml`
  // are the documented extension points of the official security-guidance
  // plugin. They are Claude-only: no other harness defines an equivalent slot.
  const claude = HARNESS_STATIC["claude"] ?? {};
  assert(
    ".claude/claude-security-guidance.md" in claude,
    "Claude must scaffold the plugin's Markdown guidance file",
  );
  assert(
    ".claude/security-patterns.yaml" in claude,
    "Claude must scaffold the plugin's per-edit pattern file",
  );

  for (const [key, files] of Object.entries(HARNESS_STATIC)) {
    if (key === "claude") continue;
    for (const dest of Object.keys(files)) {
      assert(
        !dest.includes("security-guidance") && !dest.includes("security-patterns"),
        `${key} must not receive Claude's security plugin files (${dest})`,
      );
    }
  }
});

Deno.test("guidance file stays under the plugin's 8KB context cap", () => {
  const guidance = HARNESS_STATIC["claude"]?.[".claude/claude-security-guidance.md"];
  assert(guidance, "guidance file missing from the Claude static bundle");
  const bytes = new TextEncoder().encode(guidance.content).length;
  assert(
    bytes < 8 * 1024,
    `guidance file is ${bytes} bytes; the plugin caps combined guidance at 8KB ` +
      `across user, project, and local scopes, so the scaffolded file must leave ` +
      `room for the user's own rules`,
  );
});

Deno.test("guidance file routes to the knowledge base rather than duplicating it", () => {
  const guidance = HARNESS_STATIC["claude"]?.[".claude/claude-security-guidance.md"];
  assert(guidance);
  assertStringIncludes(guidance.content, ".specnaut/memory/security/");
  for (const name of DOMAIN_FILES) {
    if (name === "00-triage.md") continue;
    assertStringIncludes(
      guidance.content,
      name,
      `guidance routing table must mention ${name}`,
    );
  }
});
