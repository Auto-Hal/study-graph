type PaginationPayload = {
  has_more?: boolean;
  next_cursor?: string | null;
};

/**
 * Notion's `has_more` flag is authoritative. A missing cursor means that the
 * result set cannot be proven complete, so callers must fail closed.
 */
export function nextCursorOrThrow(payload: PaginationPayload, source: string): string | null {
  if (!payload.has_more) return null;

  const cursor = typeof payload.next_cursor === "string" ? payload.next_cursor.trim() : "";
  if (!cursor) {
    throw new Error(`${source} pagination incomplete: has_more=true but next_cursor is missing`);
  }
  return cursor;
}
