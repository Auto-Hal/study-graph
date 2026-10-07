import { randomUUID } from 'node:crypto';
import { createScopeKnowledgeSnapshot } from '../../src/lib/review/offline/snapshot.ts';
import { adaptScopeKnowledgeSnapshot, decodeProjectReadSnapshot } from '../../src/lib/projects/read-contract.ts';
import { KUZUSHIJI_V2_SOURCE_IDENTIFIERS } from '../../src/lib/projects/project-projections.ts';

export const learnerId = '11111111-1111-4111-8111-111111111111';
export const projects = [
  { id: 'kuzushiji', answer: 'あ', subject: '3ccd2793-4134-815f-95f0-cc64dcdb86c7' },
  { id: 'philosophy', answer: '水', subject: '3bdd2793-4134-819f-811b-e90baae5becc' },
  { id: 'western-art-history', answer: 'クロムレック', subject: '3c5d2793-4134-8155-9d48-cb8a71d01f66' },
];
const rich = (value) => [{ plain_text: value, text: { content: value } }];
const title = (value) => ({ type: 'title', title: rich(value) });
const text = (value) => ({ type: 'rich_text', rich_text: rich(value) });
const relation = (id) => ({ type: 'relation', relation: [{ id }], has_more: false });
const page = (id, properties) => ({ object: 'page', id, url: 'https://notion.example/' + id, properties });
const rows = new Map([
  ['1da45577-aa7d-44e1-a304-9e33e5feb9e2', []],
  ['4a9814ba-7c44-47ec-8c46-e5d558a62085', [page(projects[0].subject, {
    文字: title('あ'), 読み: text('あ'), 字母: text('安'),
    分類: { select: { name: '変体仮名' } }, 習得状態: { select: { name: '学習中' } },
    重要度: { select: { name: 'A' } }, 誤読回数: { number: 0 },
  })]],
  ['12c37554-c7fa-424f-9590-f2f756bf284a', []],
  ['3b0d2793-4134-80d7-8954-000b3aa060ba', [page('3bdd2793-4134-8105-904b-d47a4f0f6f52', {
    講義タイトル: title('E2E 哲学史 第1回'), 回: { number: 1 },
    状態: { status: { name: '受講済' } }, 哲学者辞典: relation(projects[1].subject),
  })]],
  ['3b0d2793-4134-80df-b566-000b80f95459', [page(projects[1].subject, { 哲学者名: title('タレス') })]],
  ['3b1d2793-4134-80a1-bb5f-000bf3dd62b7', [page('3c5d2793-4134-816b-8acb-d847d0e539e6', {
    講義名: title('E2E 美術史 第2回'), 回数: { number: 2 },
    実施日: { date: { start: '2026-01-01' } }, 用語: relation(projects[2].subject),
  })]],
  ['3b1d2793-4134-80e1-b185-000bd0cddaf9', [page(projects[2].subject, { 用語: title('クロムレック') })]],
]);
export function notionResponse(path) {
  const match = /^\/notion\/v1\/data_sources\/([a-f0-9-]+)\/query$/.exec(path);
  if (!match) throw new Error('Unsupported Notion fixture request: ' + path);
  return { object: 'list', results: rows.get(match[1]) ?? [], has_more: false, next_cursor: null };
}

// These display snapshots do not authorize issuance. The real app performs its
// separate fresh Scope read against the Notion fixture above when answering.
export function displaySnapshots() {
  const now = new Date().toISOString();
  const completeness = { dataSources: [], relationProperties: [], unresolvedTargets: [] };
  const character = { id: projects[0].subject, url: 'https://notion.example/' + projects[0].subject,
    glyph: 'あ', reading: 'あ', mother: '安', category: '変体仮名', mastery: '学習中',
    importance: 'A', errorCount: 0, lastReviewedAt: null };
  const projections = {
    kuzushiji: { lectures: [], characters: [character], mistakes: [], sources: [], expressions: [], reviewQueue: [], relations: [], completeness: {
      ...completeness, dataSources: KUZUSHIJI_V2_SOURCE_IDENTIFIERS.map((sourceIdentifier, i) => ({ sourceIdentifier, itemCount: i === 1 ? 1 : 0, paginationComplete: true })),
    } },
    philosophy: { lectures: [], philosophers: [], terms: [], problems: [], works: [], culture: [], periods: [], thoughtNotes: [], relations: [], completeness },
    'western-art-history': { lectures: [], artists: [], artworks: [], movements: [], terms: [], periods: [], culture: [], museums: [], relations: [], completeness },
  };
  return projects.map(({ id }) => {
    const snapshot = createScopeKnowledgeSnapshot({
      snapshotId: randomUUID(), projectId: id, generation: 1,
      sourceReadStartedAt: now, sourceReadCompletedAt: now, publishedAt: now,
      validUntil: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      scopePolicyVersion: id === 'kuzushiji' ? 'phase4b-v1' : 'not-applicable-no-objective-v1',
      knowledgeProjectionVersion: id + (id === 'kuzushiji' ? '-v2' : '-v1'),
      sourceEvidence: { sourceIdentifiers: id === 'kuzushiji' ? [...KUZUSHIJI_V2_SOURCE_IDENTIFIERS] : ['e2e:display'], paginationComplete: true, relationCompleteness: true },
      scopeDecisions: [], knowledgeProjection: projections[id],
    });
    decodeProjectReadSnapshot(adaptScopeKnowledgeSnapshot(snapshot));
    return snapshot;
  });
}
