import "server-only";

/**
 * Operational kill switch for new Kuzushiji pilot instances.
 *
 * Default is enabled to preserve the Phase 4C-4 production behavior.
 * Set STUDY_GRAPH_PILOT_ISSUANCE_ENABLED=false to stop new instance issuance
 * while keeping existing-instance attempt/retry handling available.
 */
export function isPilotIssuanceEnabled() {
  const value = process.env.STUDY_GRAPH_PILOT_ISSUANCE_ENABLED?.trim().toLowerCase();
  return !value || !["0", "false", "off", "disabled"].includes(value);
}
