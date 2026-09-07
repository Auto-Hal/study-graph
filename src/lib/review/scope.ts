import type { Character, KuzushijiDashboard } from "@/src/lib/notion/kuzushiji";
import type { GraphData, GraphScopeAnchor } from "@/src/lib/graph/types";

export type ScopeStatus = "eligible" | "ineligible" | "unknown";

export type ScopeReasonCode =
  | "mastery-eligible"
  | "mastery-unlearned"
  | "unsupported-status"
  | "source-unavailable"
  | "completed-lecture"
  | "incomplete-lecture"
  | "future-lecture"
  | "missing-date"
  | "invalid-date"
  | "direct-relation"
  | "no-direct-anchor";

export type ScopeDecision = {
  status: ScopeStatus;
  reasonCodes: ScopeReasonCode[];
  anchorIds: string[];
};

export type ScopeSnapshot = {
  projectId: string;
  policyVersion: "phase4b-v1";
  evaluatedAt: string;
  sourceState: "ready" | "demo" | "unavailable";
  decisions: Record<string, ScopeDecision>;
};

const eligibleKuzushijiMastery = new Set(["学習中", "読める", "即読"]);

function decision(
  status: ScopeStatus,
  reasonCodes: ScopeReasonCode[],
  anchorIds: string[] = [],
): ScopeDecision {
  return { status, reasonCodes, anchorIds };
}

export function evaluateKuzushijiCharacterScope(character: Pick<Character, "mastery">): ScopeDecision {
  const mastery = character.mastery.trim();
  if (mastery === "未学習") return decision("ineligible", ["mastery-unlearned"]);
  if (eligibleKuzushijiMastery.has(mastery)) return decision("eligible", ["mastery-eligible"]);
  return decision("unknown", ["unsupported-status"]);
}

export function buildKuzushijiScopeSnapshot(
  data: Pick<KuzushijiDashboard, "sourceState" | "characters">,
  evaluatedAt = new Date(),
): ScopeSnapshot {
  const sourceState = data.sourceState ?? "unavailable";
  const decisions = Object.fromEntries(
    data.characters.map((character) => [
      character.id,
      sourceState === "ready"
        ? evaluateKuzushijiCharacterScope(character)
        : decision("unknown", ["source-unavailable"]),
    ]),
  );
  return {
    projectId: "kuzushiji",
    policyVersion: "phase4b-v1",
    evaluatedAt: evaluatedAt.toISOString(),
    sourceState,
    decisions,
  };
}

function tokyoDate(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  return byType.get("year") + "-" + byType.get("month") + "-" + byType.get("day");
}

function parseDateOnly(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    return null;
  }
  return match[1] + "-" + match[2] + "-" + match[3];
}

function artAnchorStatus(anchor: GraphScopeAnchor, evaluatedAt: Date): {
  status: ScopeStatus;
  reason: ScopeReasonCode;
} {
  if (!anchor.date?.trim()) return { status: "unknown", reason: "missing-date" };
  const date = parseDateOnly(anchor.date);
  if (!date) return { status: "unknown", reason: "invalid-date" };
  return date <= tokyoDate(evaluatedAt)
    ? { status: "eligible", reason: "completed-lecture" }
    : { status: "ineligible", reason: "future-lecture" };
}

export function buildGraphScopeSnapshot(
  projectId: "philosophy" | "western-art-history",
  graph: Pick<GraphData, "scope" | "nodes">,
  evaluatedAt = new Date(),
): ScopeSnapshot {
  const decisions: Record<string, ScopeDecision> = {};
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const scope = graph.scope ?? { sourceState: "unavailable" as const, anchors: [] };

  for (const node of graph.nodes) {
    decisions[node.id] = decision("unknown", ["no-direct-anchor"]);
  }

  if (scope.sourceState !== "ready") {
    for (const node of graph.nodes) {
      decisions[node.id] = decision("unknown", ["source-unavailable"]);
    }
    return {
      projectId,
      policyVersion: "phase4b-v1",
      evaluatedAt: evaluatedAt.toISOString(),
      sourceState: scope.sourceState,
      decisions,
    };
  }

  const byNode = new Map<string, { status: ScopeStatus; reason: ScopeReasonCode; anchorId: string }[]>();
  for (const anchor of scope.anchors) {
    const anchorResult = projectId === "western-art-history"
      ? artAnchorStatus(anchor, evaluatedAt)
      : anchor.completion === "completed"
        ? { status: "eligible" as const, reason: "completed-lecture" as const }
        : anchor.completion === "incomplete"
          ? { status: "ineligible" as const, reason: "incomplete-lecture" as const }
          : { status: "unknown" as const, reason: "unsupported-status" as const };
    for (const relation of anchor.directRelations) {
      if (!nodeIds.has(relation.nodeId)) continue;
      const entries = byNode.get(relation.nodeId) ?? [];
      entries.push({ ...anchorResult, anchorId: anchor.id });
      byNode.set(relation.nodeId, entries);
    }
  }

  for (const [nodeId, entries] of byNode) {
    const eligible = entries.filter((entry) => entry.status === "eligible");
    const unknown = entries.filter((entry) => entry.status === "unknown");
    const status: ScopeStatus = eligible.length > 0
      ? "eligible"
      : unknown.length > 0
        ? "unknown"
        : "ineligible";
    decisions[nodeId] = decision(
      status,
      Array.from(new Set([
        ...entries.map((entry) => entry.reason),
        ...(status === "eligible" ? ["direct-relation" as const] : []),
      ])),
      entries.map((entry) => entry.anchorId),
    );
  }

  return {
    projectId,
    policyVersion: "phase4b-v1",
    evaluatedAt: evaluatedAt.toISOString(),
    sourceState: scope.sourceState,
    decisions,
  };
}

export function eligibleNodeIds(snapshot: ScopeSnapshot) {
  return new Set(
    Object.entries(snapshot.decisions)
      .filter(([, decisionValue]) => decisionValue.status === "eligible")
      .map(([nodeId]) => nodeId),
  );
}
