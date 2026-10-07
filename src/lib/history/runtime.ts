import 'server-only';
import { getObjectiveRuntimeConfig } from '../supabase/objective-runtime.ts';
import { decodeHistoryRecord, HISTORY_PAGE_SIZE, historyDateRange, type HistoryQuery, type HistoryRecord } from './core.ts';

export type HistoryReadState = { status: 'ready'; records: HistoryRecord[]; hasMore: boolean; legacyIncluded: boolean } | { status: 'unavailable' };
export async function loadLearningHistory(query: HistoryQuery, recordId: string | null = null): Promise<HistoryReadState> {
  try {
    const config = getObjectiveRuntimeConfig();
    const token = process.env.STUDY_GRAPH_APP_TOKEN ?? process.env.StudyGraph_APP_TOKEN;
    const range = historyDateRange(query.date);
    const response = await fetch(config.url + '/rest/v1/rpc/study_graph_learning_history', {
      method: 'POST', headers: { apikey: config.serviceRoleKey, Authorization: 'Bearer ' + config.serviceRoleKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_learner_id: config.learnerId, p_legacy_token: token || null,
        p_project_id: query.project || null, p_unit_id: query.unit || null, p_start_at: range.start, p_end_at: range.end,
        p_recheck_only: query.recheck, p_before_at: query.beforeAt || null, p_before_id: query.beforeId || null,
        p_record_id: recordId, p_limit: recordId ? 1 : HISTORY_PAGE_SIZE + 1 }),
      cache: 'no-store', signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) return { status: 'unavailable' };
    const data: unknown = await response.json();
    if (!Array.isArray(data) || data.length > (recordId ? 1 : HISTORY_PAGE_SIZE + 1)) return { status: 'unavailable' };
    const records = data.map(decodeHistoryRecord);
    return { status: 'ready', records: records.slice(0,HISTORY_PAGE_SIZE), hasMore: records.length > HISTORY_PAGE_SIZE, legacyIncluded: Boolean(token) };
  } catch { return { status: 'unavailable' }; }
}
