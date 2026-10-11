const MAX_ATTEMPTS = 3;
const MAX_TOTAL_WAIT_MS = 10_000;

type Wait = (milliseconds: number) => Promise<void>;
const waitFor: Wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

// Only wrap Notion reads (including data_sources/query), never content mutations.
// A longer Retry-After fails closed rather than retrying before Notion permits it.
export async function readNotionWithRetry(
  request: () => Promise<Response>,
  wait: Wait = waitFor,
  random: () => number = Math.random,
): Promise<Response> {
  let waitedMs = 0;
  for (let attempt = 0; ; attempt++) {
    const response = await request();
    if (![429, 529].includes(response.status) || attempt === MAX_ATTEMPTS - 1) return response;

    if (response.status === 429) {
      const error = await response.clone().json().catch(() => null);
      if (error?.additional_data?.rate_limit_reason === "public_api_request_blocked") return response;
    }

    const header = response.headers.get("Retry-After")?.trim();
    const seconds = header !== undefined && /^\d+$/.test(header) ? Number(header) : null;
    const fallbackMs = 2 ** attempt * 1_000;
    const baseMs = seconds === null ? fallbackMs : Math.max(seconds * 1_000, attempt ? fallbackMs : 0);
    const delayMs = baseMs + Math.floor(random() * 250);
    if (!Number.isSafeInteger(delayMs) || delayMs > MAX_TOTAL_WAIT_MS - waitedMs) return response;

    await response.body?.cancel().catch(() => undefined);
    await wait(delayMs);
    waitedMs += delayMs;
  }
}
