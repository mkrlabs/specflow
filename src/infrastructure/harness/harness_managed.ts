import type { CoreEntry } from "../../domain/core_bundle.ts";
import { managedSectionLabels } from "../../domain/template.ts";

/**
 * The `managedSection` field for a mapped `TemplateFile`, or nothing.
 *
 * Every adapter used to spread `entry.managedSection ? {…} : {}` inline. That
 * is a SECOND resolution of the union with different semantics from
 * `managedSectionLabels`: truthiness treats `[]` as present and `""` as absent,
 * where the helper treats `[]` as none and `""` as one label. Seven adapters
 * each deciding that on their own is how two spellings of one rule drift —
 * which is the defect this contract's own decision table names.
 */
export function managedSectionField(
  entry: CoreEntry,
): { managedSection: string | readonly string[] } | Record<never, never> {
  const labels = managedSectionLabels(entry.managedSection);
  return labels.length > 0 ? { managedSection: labels } : {};
}
