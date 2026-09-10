import assert from "node:assert/strict";
import test from "node:test";
import {
  adaptScopeKnowledgeSnapshot,
  decodeProjectReadSnapshot,
} from "../../projects/read-contract.ts";
import type {
  PhilosophySnapshotSource,
} from "../../notion/philosophy-snapshot-source.ts";
import type {
  WesternArtHistorySnapshotSource,
} from "../../notion/western-art-history-snapshot-source.ts";
import {
  collectStrictRelationObservations,
  type StrictNotionPage,
} from "../../notion/strict-snapshot-source.ts";
import {
  createPhilosophyScopeKnowledgeSnapshot,
  createWesternArtHistoryScopeKnowledgeSnapshot,
} from "./project-model.ts";
import type {
  PhilosophyV1Projection,
  WesternArtHistoryV1Projection,
} from "../../projects/project-projections.ts";
import {
  createScopeKnowledgeSnapshot,
  isScopeKnowledgeSnapshotHashValid,
} from "../offline/snapshot.ts";
import type { ScopeKnowledgeSnapshot } from "../offline/snapshot-content.ts";

const times = {
  sourceReadStartedAt: "2026-09-10T00:00:00.000Z",
  sourceReadCompletedAt: "2026-09-10T00:00:01.000Z",
  publishedAt: "2026-09-10T00:00:02.000Z",
};

function emptyCompleteness() {
  return { dataSources: [], relationProperties: [], unresolvedTargets: [] } as const;
}

function artProjection(overrides: Partial<WesternArtHistoryV1Projection> = {}): WesternArtHistoryV1Projection {
  return {
    lectures: [],
    artists: [],
    artworks: [],
    movements: [],
    terms: [],
    periods: [],
    culture: [],
    museums: [],
    relations: [],
    completeness: emptyCompleteness(),
    ...overrides,
  };
}

function philosophyProjection(overrides: Partial<PhilosophyV1Projection> = {}): PhilosophyV1Projection {
  return {
    lectures: [],
    philosophers: [],
    terms: [],
    problems: [],
    works: [],
    culture: [],
    periods: [],
    thoughtNotes: [],
    relations: [],
    completeness: emptyCompleteness(),
    ...overrides,
  };
}

function artSource(projection = artProjection()): WesternArtHistorySnapshotSource {
  return {
    projection,
    sourceIdentifiers: ["notion:data-source:art"],
    paginationComplete: true,
    relationCompleteness: true,
  };
}

function philosophySource(projection = philosophyProjection()): PhilosophySnapshotSource {
  return {
    projection,
    sourceIdentifiers: ["notion:data-source:philosophy"],
    paginationComplete: true,
    relationCompleteness: true,
  };
}

function relationPage(id: string): StrictNotionPage {
  return {
    object: "page",
    id,
    url: `https://notion.test/${id}`,
    properties: { Related: { id: "property-id", type: "relation", relation: [] } },
  };
}

async function collectArtRelationEvidence(order: readonly string[]) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    const ids = url.includes("/pages/page-a/") ? ["target-a"] : ["target-b-1", "target-b-2"];
    return new Response(JSON.stringify({
      object: "list",
      type: "property_item",
      property_item: { type: "relation" },
      results: ids.map((id) => ({ object: "property_item", type: "relation", relation: { id } })),
      has_more: false,
      next_cursor: null,
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    return await collectStrictRelationObservations(
      order.map((id) => ({ page: relationPage(id), kind: "artist" })),
      [{ ownerKind: "artist", propertyName: "Related", relationKind: "artist-related", relationLabel: "Related" }],
      "token",
      "fixture",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function artist(id: string) {
  return {
    id,
    url: `https://notion.test/${id}`,
    label: id,
    lifespan: "",
    region: "",
    importance: "",
    technique: "",
    reviewText: null,
  } as const;
}

function buildArt(projection = artProjection()) {
  return createWesternArtHistoryScopeKnowledgeSnapshot({
    source: artSource(projection),
    snapshotId: "art-snapshot-1",
    generation: 1,
    ...times,
  });
}

function buildPhilosophy(projection = philosophyProjection()) {
  return createPhilosophyScopeKnowledgeSnapshot({
    source: philosophySource(projection),
    snapshotId: "philosophy-snapshot-1",
    generation: 1,
    ...times,
  });
}

test("Western Art History v1 builds a valid neutral read snapshot", () => {
  const snapshot = buildArt();
  assert.equal(snapshot.projectId, "western-art-history");
  assert.equal(snapshot.knowledgeProjectionVersion, "western-art-history-v1");
  assert.equal(snapshot.scopePolicyVersion, "not-applicable-no-objective-v1");
  assert.deepEqual(snapshot.scopeDecisions, []);
  assert.equal(isScopeKnowledgeSnapshotHashValid(snapshot), true);
  const decoded = decodeProjectReadSnapshot(adaptScopeKnowledgeSnapshot(snapshot));
  assert.equal(decoded.projectId, "western-art-history");
  assert.equal(decoded.projectionVersion, "western-art-history-v1");
});

test("Philosophy v1 builds a valid neutral read snapshot", () => {
  const snapshot = buildPhilosophy();
  assert.equal(snapshot.projectId, "philosophy");
  assert.equal(snapshot.knowledgeProjectionVersion, "philosophy-v1");
  assert.equal(snapshot.scopePolicyVersion, "not-applicable-no-objective-v1");
  assert.deepEqual(snapshot.scopeDecisions, []);
  assert.equal(isScopeKnowledgeSnapshotHashValid(snapshot), true);
  const decoded = decodeProjectReadSnapshot(adaptScopeKnowledgeSnapshot(snapshot));
  assert.equal(decoded.projectId, "philosophy");
  assert.equal(decoded.projectionVersion, "philosophy-v1");
});

test("project builders normalize source ordering before the historical content hash", () => {
  const artEntities = {
    artists: [
      { id: "artist-b", url: "https://example.test/b", label: "B", lifespan: "", region: "", importance: "", technique: "", reviewText: null },
      { id: "artist-a", url: "https://example.test/a", label: "A", lifespan: "", region: "", importance: "", technique: "", reviewText: null },
    ],
  } as const;
  const first = buildArt(artProjection({
    ...artEntities,
    completeness: {
      dataSources: [
        { sourceIdentifier: "z", itemCount: 0, paginationComplete: true },
        { sourceIdentifier: "a", itemCount: 0, paginationComplete: true },
      ],
      relationProperties: [],
      unresolvedTargets: [],
    },
  }));
  const second = buildArt(artProjection({
    artists: [...artEntities.artists].reverse(),
    completeness: {
      dataSources: [
        { sourceIdentifier: "a", itemCount: 0, paginationComplete: true },
        { sourceIdentifier: "z", itemCount: 0, paginationComplete: true },
      ],
      relationProperties: [],
      unresolvedTargets: [],
    },
  }));
  assert.equal(first.contentHash, second.contentHash);
  assert.deepEqual(first.knowledgeProjection, second.knowledgeProjection);
});

test("page-identifiable relation completeness is stable when Notion page order changes", async () => {
  const firstRead = await collectArtRelationEvidence(["page-a", "page-b"]);
  const secondRead = await collectArtRelationEvidence(["page-b", "page-a"]);
  assert.deepEqual(firstRead.evidence.map((item) => item.sourceEntityId), ["page-a", "page-b"]);
  assert.deepEqual(secondRead.evidence.map((item) => item.sourceEntityId), ["page-a", "page-b"]);
  assert.deepEqual(firstRead.evidence.map((item) => item.itemCount), [1, 2]);
  assert.deepEqual(secondRead.evidence.map((item) => item.itemCount), [1, 2]);

  const projection = (evidence: typeof firstRead.evidence) => artProjection({
    artists: [artist("page-b"), artist("page-a")],
    completeness: {
      dataSources: [],
      relationProperties: evidence,
      unresolvedTargets: [],
    },
  });
  const first = buildArt(projection(firstRead.evidence));
  const second = buildArt(projection(secondRead.evidence));
  assert.deepEqual(first.knowledgeProjection, second.knowledgeProjection);
  assert.equal(first.contentHash, second.contentHash);
  assert.equal(isScopeKnowledgeSnapshotHashValid(first), true);
  assert.equal(isScopeKnowledgeSnapshotHashValid(second), true);
});

test("version dispatch rejects a known project with another project's projection", () => {
  const art = adaptScopeKnowledgeSnapshot(buildArt());
  assert.throws(
    () => decodeProjectReadSnapshot({ ...art, projectId: "philosophy" }),
    /project philosophy cannot use western-art-history-v1/,
  );
});

test("Art and Philosophy v1 cannot acquire Scope decisions through the neutral decoder", () => {
  const art = adaptScopeKnowledgeSnapshot(buildArt());
  assert.throws(
    () => decodeProjectReadSnapshot({
      ...art,
      policyVersion: "phase4b-v1",
      subjectObservations: [{
        subjectId: "subject-a",
        status: "eligible",
        reasonCodes: ["source-ready"],
        anchorReferences: ["anchor-a"],
      }],
    }),
    /must use not-applicable-no-objective-v1/,
  );
});

test("unknown projection fields and completeness fields fail closed", () => {
  const art = buildArt();
  const projection = art.knowledgeProjection as Record<string, unknown>;
  const withUnknownProjection = createScopeKnowledgeSnapshot({
    ...art,
    contentHash: undefined,
    knowledgeProjection: { ...projection, futureItems: [] },
  } as unknown as Omit<ScopeKnowledgeSnapshot, "contentHash">);
  assert.throws(
    () => decodeProjectReadSnapshot(adaptScopeKnowledgeSnapshot(withUnknownProjection)),
    /futureItems is not supported/,
  );

  const withUnknownCompleteness = createScopeKnowledgeSnapshot({
    ...art,
    contentHash: undefined,
    knowledgeProjection: {
      ...projection,
      completeness: { ...projection.completeness as object, futureEvidence: true },
    },
  } as unknown as Omit<ScopeKnowledgeSnapshot, "contentHash">);
  assert.throws(
    () => decodeProjectReadSnapshot(adaptScopeKnowledgeSnapshot(withUnknownCompleteness)),
    /futureEvidence is not supported/,
  );
});

test("relation completeness requires a valid sourceEntityId", () => {
  const snapshot = buildArt();
  const projection = snapshot.knowledgeProjection as Record<string, unknown>;
  const baseRelation = {
    ownerKind: "artist",
    propertyName: "Related",
    relationKind: "artist-related",
    itemCount: 1,
    paginationComplete: true,
  };
  const missingSourceEntityId = createScopeKnowledgeSnapshot({
    ...snapshot,
    contentHash: undefined,
    knowledgeProjection: {
      ...projection,
      completeness: { ...projection.completeness as object, relationProperties: [baseRelation] },
    },
  } as unknown as Omit<ScopeKnowledgeSnapshot, "contentHash">);
  assert.throws(
    () => decodeProjectReadSnapshot(adaptScopeKnowledgeSnapshot(missingSourceEntityId)),
    /sourceEntityId must be a non-empty string/,
  );

  const invalidSourceEntityId = createScopeKnowledgeSnapshot({
    ...snapshot,
    contentHash: undefined,
    knowledgeProjection: {
      ...projection,
      completeness: {
        ...projection.completeness as object,
        relationProperties: [{ ...baseRelation, sourceEntityId: 42 }],
      },
    },
  } as unknown as Omit<ScopeKnowledgeSnapshot, "contentHash">);
  assert.throws(
    () => decodeProjectReadSnapshot(adaptScopeKnowledgeSnapshot(invalidSourceEntityId)),
    /sourceEntityId must be a non-empty string/,
  );
});

test("hash-covered completeness changes alter the existing content hash", () => {
  const first = buildPhilosophy();
  const second = buildPhilosophy(philosophyProjection({
    completeness: {
      dataSources: [{ sourceIdentifier: "notion:data-source:philosophy", itemCount: 1, paginationComplete: true }],
      relationProperties: [],
      unresolvedTargets: [],
    },
  }));
  assert.notEqual(first.contentHash, second.contentHash);
  assert.equal(isScopeKnowledgeSnapshotHashValid(second), true);
});
