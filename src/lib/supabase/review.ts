import "server-only";

export type ReviewGrade = "again" | "hard" | "good" | "easy";

export type ReviewState = {
  item_id: string;
  item_kind: "character" | "mistake";
  last_grade: ReviewGrade;
  repetitions: number;
  interval_days: number;
  last_reviewed_at: string;
  due_at: string;
};

export type ReviewAttempt = {
  id: number;
  item_id: string;
  item_kind: "character" | "mistake";
  grade: ReviewGrade;
  previous_interval_days: number;
  interval_days: number;
  reviewed_at: string;
  due_at: string;
};

type RecordReviewResult = {
  due_at: string;
  interval_days: number;
  repetitions: number;
};

const DEFAULT_SUPABASE_URL = "https://uhckdhdkywhsqjcquvyj.supabase.co";
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_ElvBv2EvS6jlN-Zd3P5GVA_SYV1Hztc";

function config() {
  const url = process.env.SUPABASE_URL ?? DEFAULT_SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? DEFAULT_SUPABASE_PUBLISHABLE_KEY;
  const token = process.env.STUDY_GRAPH_APP_TOKEN ?? process.env.StudyGraph_APP_TOKEN;

  if (!token) return null;
  return { url: url.replace(/\/$/, ""), key, token };
}

export function isReviewPersistenceConfigured() {
  return config() !== null;
}

async function callRpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const current = config();
  if (!current) throw new Error("Study Graph review persistence is not configured");

  const response = await fetch(`${current.url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: current.key,
      Authorization: `Bearer ${current.key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_token: current.token, ...body }),
    cache: "no-store",
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Supabase RPC ${name} failed (${response.status}): ${message}`);
  }

  return (await response.json()) as T;
}

export async function getReviewStates(): Promise<ReviewState[]> {
  return callRpc<ReviewState[]>("study_graph_review_states", {});
}

export async function getReviewHistory(limit = 50): Promise<ReviewAttempt[]> {
  const normalizedLimit = Math.max(1, Math.min(Math.trunc(limit), 100));
  return callRpc<ReviewAttempt[]>("study_graph_review_history", { p_limit: normalizedLimit });
}

export async function getDueReviewItems<T extends { id: string }>(items: T[]) {
  if (!isReviewPersistenceConfigured()) {
    return { items, persistence: "fallback" as const };
  }

  try {
    const states = await getReviewStates();
    const statesById = new Map(states.map((state) => [state.item_id, state]));
    const now = Date.now();

    return {
      items: items.filter((item) => {
        const state = statesById.get(item.id);
        if (!state) return true;
        return new Date(state.due_at).getTime() <= now;
      }),
      persistence: "supabase" as const,
    };
  } catch (error) {
    console.error("Study Graph: review schedule fetch failed", error);
    return { items, persistence: "fallback" as const };
  }
}

export async function recordReviewAttempt(input: {
  itemId: string;
  itemKind: "character" | "mistake";
  grade: ReviewGrade;
}) {
  const rows = await callRpc<RecordReviewResult[]>("study_graph_record_review", {
    p_item_id: input.itemId,
    p_item_kind: input.itemKind,
    p_grade: input.grade,
  });

  const result = rows[0];
  if (!result) throw new Error("Supabase did not return the updated review state");
  return result;
}
