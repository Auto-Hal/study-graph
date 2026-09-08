import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFileSync(resolve(root, relativePath), "utf8");
const currentRoute = read("app/api/snapshots/kuzushiji/current/route.ts");
const syncRoute = read("app/api/snapshots/kuzushiji/sync/route.ts");
const page = read("app/projects/kuzushiji/page.tsx");
const client = read("src/components/KuzushijiSnapshotDashboard.tsx");
const cache = read("src/lib/review/offline/snapshot-cache.ts");
const serverSnapshots = read("src/lib/supabase/snapshots.ts");
const browserHash = read("src/lib/review/offline/snapshot-browser.ts");

test("snapshot distribution routes are authenticated, server-only, and do not read Notion", () => {
  assert.match(currentRoute, /isPilotSessionRequestAuthenticated/);
  assert.match(currentRoute, /getCurrentScopeKnowledgeSnapshotModel\("kuzushiji"\)/);
  assert.doesNotMatch(currentRoute, /notion|syncKuzushiji/i);
  assert.match(currentRoute, /Cache-Control.*private, no-store/);
  assert.match(currentRoute, /ETag/);
  assert.match(currentRoute, /if-none-match/);

  assert.match(syncRoute, /pilotWriteAuthorizationFailure/);
  assert.match(syncRoute, /syncKuzushijiScopeKnowledgeSnapshot/);
  assert.match(syncRoute, /export async function POST/);
  assert.doesNotMatch(syncRoute, /getKuzushijiDashboard|demoData/);
});

test("server row mapping validates the stored semantic snapshot hash", () => {
  assert.match(serverSnapshots, /mapCurrentScopeKnowledgeSnapshotRow/);
  assert.match(serverSnapshots, /assertValidScopeKnowledgeSnapshot/);
  assert.match(serverSnapshots, /isScopeKnowledgeSnapshotHashValid/);
  assert.match(serverSnapshots, /snapshot_invalid/);
});

test("normal dashboard page uses snapshot client and has no direct Notion fallback", () => {
  assert.match(page, /KuzushijiSnapshotDashboard/);
  assert.doesNotMatch(page, /getKuzushijiDashboard|getKuzushijiReferenceData|notion\/kuzushiji/i);
  assert.match(client, /api\/snapshots\/kuzushiji\/current/);
  assert.match(client, /api\/snapshots\/kuzushiji\/sync/);
  assert.match(client, /getCachedCurrentScopeKnowledgeSnapshot/);
  assert.match(client, /今すぐ同期/);
  assert.doesNotMatch(client, /localStorage|sessionStorage/);
  assert.doesNotMatch(client, /SUPABASE_SERVICE_ROLE_KEY|NOTION_TOKEN|NOTION_API/);
  assert.doesNotMatch(browserHash, /from\s+["']node:crypto["']/);
  assert.doesNotMatch(cache, /from\s+["']node:crypto["']/);
});

test("dashboard keeps fresh-server provenance and catches manual sync rejection", () => {
  assert.match(client, /selectSnapshotForDisplay/);
  assert.match(client, /cached:\s*displayed\.source\s*===\s*["']cache["']/);
  assert.match(client, /} catch \{[\s\S]*同期できませんでした。[\s\S]*} finally \{[\s\S]*setSyncing\(false\)/);
  assert.doesNotMatch(client, /displayed\s*!==\s*result\.snapshot/);
});

test("IndexedDB cache uses immutable snapshot and pointer stores with one readwrite transaction", () => {
  assert.match(cache, /SNAPSHOT_STORE_NAME = "snapshots"/);
  assert.match(cache, /SNAPSHOT_META_STORE_NAME = "snapshot_meta"/);
  assert.match(cache, /database\.transaction\(\s*\[SNAPSHOT_STORE_NAME, SNAPSHOT_META_STORE_NAME\],\s*"readwrite"/);
  assert.match(cache, /generation/);
  assert.match(cache, /same-generation-different-hash/);
  assert.match(cache, /snapshots\.add\(candidate\)/);
  assert.doesNotMatch(cache, /snapshots\.put\(candidate\)/);
});

test("Phase 4E-3 introduces no migration", () => {
  assert.doesNotMatch(cache, /supabase\/migrations/);
});
