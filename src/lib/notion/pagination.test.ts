import assert from "node:assert/strict";
import test from "node:test";
import { nextCursorOrThrow } from "./pagination.ts";

test("has_more without a usable next_cursor is pagination incomplete", () => {
  for (const next_cursor of [null, "", "   "]) {
    assert.throws(
      () => nextCursorOrThrow({ has_more: true, next_cursor }, "Notion test query"),
      /pagination incomplete/,
    );
  }
});

test("a completed page may omit next_cursor", () => {
  assert.equal(nextCursorOrThrow({ has_more: false, next_cursor: null }, "Notion test query"), null);
});
