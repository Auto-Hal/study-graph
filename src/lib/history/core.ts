import type { ExplanationRubric } from '../review/exercises/types.ts';
import type { ReviewAsset } from '../review/types.ts';
import type { ReviewGrade } from '../supabase/review.ts';
import { studyUnits } from '../review/units/catalog.ts';

export const HISTORY_PAGE_SIZE = 30;
export const historyProjects = [
  { id: 'kuzushiji', title: 'くずし字' },
  { id: 'western-art-history', title: '西洋美術史' },
  { id: 'philosophy', title: '西洋哲学史' },
  { id: 'unknown', title: '科目未確認（旧形式）' },
] as const;
export const gradeLabels: Record<ReviewGrade, string> = { again: 'もう一度', hard: '難しい', good: 'できた', easy: '即答' };
export const historyRecordIdValid = (value: string) => /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|legacy-[1-9][0-9]{0,18})$/i.test(value);
type Params = Record<string, string | string[] | undefined>;
export type HistoryQuery = { project: string; unit: string; date: string; recheck: boolean; beforeAt: string; beforeId: string };
const timestampValid = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
export function parseHistoryQuery(params: Params): HistoryQuery | null {
  const read = (key: string) => typeof params[key] === 'string' ? params[key] as string : params[key] === undefined ? '' : null;
  const project = read('project'), unit = read('unit'), date = read('date'), recheck = read('recheck'), beforeAt = read('before'), beforeId = read('beforeId');
  if ([project,unit,date,recheck,beforeAt,beforeId].some(v => v === null)) return null;
  if (project && !historyProjects.some(p => p.id === project)) return null;
  const selectedUnit = unit ? studyUnits.find(u => u.id === unit) : null;
  if (unit && (!selectedUnit || (project && selectedUnit.projectId !== project))) return null;
  if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date)) return null;
  if (recheck && recheck !== '1') return null;
  if (Boolean(beforeAt) !== Boolean(beforeId) || (beforeAt && (!timestampValid(beforeAt) || !historyRecordIdValid(beforeId!)))) return null;
  return { project: project!, unit: unit!, date: date!, recheck: recheck === '1', beforeAt: beforeAt!, beforeId: beforeId! };
}
export function historyDateRange(date: string) {
  if (!date) return { start: null, end: null };
  const start = date + 'T00:00:00+09:00';
  return { start, end: new Date(Date.parse(start) + 86400000).toISOString() };
}
export function historyHref(query: HistoryQuery) {
  const params = new URLSearchParams();
  if (query.project) params.set('project',query.project);
  if (query.unit) params.set('unit',query.unit);
  if (query.date) params.set('date',query.date);
  if (query.recheck) params.set('recheck','1');
  if (query.beforeAt && query.beforeId) { params.set('before',query.beforeAt); params.set('beforeId',query.beforeId); }
  return '/history' + (params.size ? '?' + params : '');
}
export type HistoryRecord = {
  id: string; projectId: string; unitId: string | null; acceptedAt: string; front: string; prompt: string | null;
  evaluationKind: 'explanation' | 'short-answer' | 'legacy'; gradingStatus: 'graded' | 'ungraded'; correct: boolean | null;
  selfEvaluation: ReviewGrade | null; srsApplied: boolean; srsReason: string; dueAt: string | null; currentDueAt: string | null;
  sourceUrl: string | null; needsReview: boolean; detail: null | {
    rawAnswer: string | null; answer: string | null; explanation: string | null; rubric: ExplanationRubric | null; asset: ReviewAsset | null; comparisonAssets: ReviewAsset[];
  };
};
function object(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function text(value: unknown): string | null { return typeof value === 'string' ? value : null; }
function safeUrl(value: unknown, asset = false): string | null {
  if (typeof value !== 'string') return null;
  if (asset && /^\/assets\/[a-zA-Z0-9/_.-]+$/.test(value)) return value;
  try { const url = new URL(value); return ['http:','https:'].includes(url.protocol) && !url.username && !url.password ? value : null; } catch { return null; }
}
function strings(value: unknown): value is string[] { return Array.isArray(value) && value.every(v => typeof v === 'string'); }
function decodeRubric(value: unknown): ExplanationRubric | null {
  if (!object(value)) return null;
  if (typeof value.modelAnswer !== 'string' || !strings(value.requiredPoints) || !strings(value.allowedParaphrases) || !strings(value.majorMisconceptions)) throw new Error('invalid_history_response');
  return { modelAnswer: value.modelAnswer, requiredPoints: value.requiredPoints, allowedParaphrases: value.allowedParaphrases, majorMisconceptions: value.majorMisconceptions };
}
function decodeAsset(value: unknown): ReviewAsset | null {
  if (!object(value) || !object(value.source)) return null;
  const src = safeUrl(value.src,true), sourceUrl = safeUrl(value.source.url);
  if (!src || !sourceUrl || typeof value.alt !== 'string' || typeof value.width !== 'number' || typeof value.height !== 'number' || value.width <= 0 || value.height <= 0 || !text(value.source.attribution) || !text(value.source.license)) throw new Error('invalid_history_response');
  return { type: 'image', src, alt: value.alt, width: value.width, height: value.height, presentation: 'full', sourceUrl, attribution: value.source.attribution as string, license: value.source.license as string };
}
export function decodeHistoryRecord(value: unknown): HistoryRecord {
  if (!object(value) || typeof value.record_id !== 'string' || !historyRecordIdValid(value.record_id)
    || !historyProjects.some(p => p.id === value.project_id) || !timestampValid(value.submitted_at)
    || typeof value.front !== 'string' || !['explanation','short-answer','legacy'].includes(value.evaluation_kind as string)
    || !['graded','ungraded'].includes(value.grading_status as string)
    || (value.grading_status === 'graded' ? typeof value.is_correct !== 'boolean' : value.is_correct !== null)
    || (value.self_evaluation !== null && !Object.hasOwn(gradeLabels,value.self_evaluation as string))
    || typeof value.srs_applied !== 'boolean' || typeof value.srs_reason !== 'string'
    || (value.due_at !== null && !timestampValid(value.due_at)) || (value.current_due_at !== null && !timestampValid(value.current_due_at))
    || (value.unit_id !== null && typeof value.unit_id !== 'string')) throw new Error('invalid_history_response');
  const kind = value.evaluation_kind as HistoryRecord['evaluationKind'];
  if (kind === 'explanation' && (value.grading_status !== 'ungraded' || value.is_correct !== null)) throw new Error('invalid_history_response');
  let detail: HistoryRecord['detail'] = null;
  if (value.detail !== null) {
    if (!object(value.detail)) throw new Error('invalid_history_response');
    const raw = value.detail.rawAnswer;
    const rawAnswer = typeof raw === 'string' ? raw : object(raw) && raw.type === 'text' ? text(raw.value) : null;
    const revision = value.detail.revision;
    if (kind !== 'legacy' && (!object(revision) || revision.projectId !== value.project_id || revision.front !== value.front || revision.prompt !== value.prompt || rawAnswer === null)) throw new Error('invalid_history_response');
    const explanation = object(revision) && object(revision.explanation) ? revision.explanation : null;
    const spec = object(revision) && object(revision.answerSpec) ? revision.answerSpec : null;
    const rubric = explanation ? decodeRubric(explanation.rubric) : null;
    if (kind === 'explanation' && !rubric) throw new Error('invalid_history_response');
    detail = { rawAnswer, answer: kind !== 'explanation' && spec && strings(spec.acceptedAnswers) ? spec.acceptedAnswers.join('／') : null,
      explanation: explanation ? text(explanation.summary) : null, rubric,
      asset: object(revision) && Array.isArray(revision.visualAssets) ? decodeAsset(revision.visualAssets[0]) : null,
      comparisonAssets: object(revision) && Array.isArray(revision.visualAssets) && Array.isArray(revision.stimuli)
        ? revision.stimuli.filter(s => object(s) && s.role === "secondary").map(s => {
          const asset = (revision.visualAssets as unknown[]).find(a => object(a) && a.assetId === s.assetId);
          const decoded = decodeAsset(asset); if (!decoded) throw new Error("invalid_history_response"); return decoded;
        }) : [] };
  }
  return { id: value.record_id, projectId: value.project_id as string, unitId: value.unit_id as string | null, acceptedAt: value.submitted_at,
    front: value.front, prompt: text(value.prompt), evaluationKind: kind, gradingStatus: value.grading_status as HistoryRecord['gradingStatus'],
    correct: value.is_correct as boolean | null, selfEvaluation: value.self_evaluation as ReviewGrade | null, srsApplied: value.srs_applied,
    srsReason: value.srs_reason, dueAt: value.due_at as string | null, currentDueAt: value.current_due_at as string | null,
    sourceUrl: safeUrl(value.source_url), needsReview: value.is_correct === false || ['again','hard'].includes(value.self_evaluation as string), detail };
}
export function evaluationLabel(record: HistoryRecord) {
  if (record.evaluationKind === 'explanation') return '説明・自己評価';
  if (record.gradingStatus === 'ungraded') return '自己評価のみ';
  return record.correct ? '正解' : '不正解';
}
export function scheduleLabel(record: HistoryRecord) {
  if (record.srsApplied) return '復習予定を更新';
  const labels: Record<string,string> = { 'practice-only': '追加練習として保存・復習予定は変更なし', 'grader-unavailable': '判定を確定せず保存・復習予定は変更なし', 'scope-not-eligible': '範囲外の回答として保存・復習予定は変更なし', 'revision-quarantined': '教材を確認するため復習予定は変更なし', 'revision-retired': '以前の教材の回答として保存', 'epoch-inactive': '以前の復習設定の回答として保存', 'stale-opportunity': '他の回答で更新済みのため復習予定は変更なし', 'issuance-context-missing': '復習設定を確認するため予定は変更なし' };
  return labels[record.srsReason] ?? '回答保存済み・復習予定への反映なし';
}
